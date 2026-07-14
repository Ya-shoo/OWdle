// Loudness re-mastering for the Melee clips already live on R2.
//
// Every melee clip shipped WITHOUT going through a loudnorm pass —
// build-melee-clips.mjs only re-encoded oversized video and probed
// duration, it never touched levels. Melee hits are mastered extremely
// quiet in-game, so the raw captures landed at roughly -28 to -43 LUFS
// (integrated), while the Sound-mode catalog sits at -13 LUFS. That's
// 15-30 dB quieter — effectively inaudible on a phone speaker even at
// max volume, which is exactly what users reported ("melee is always too
// quiet"). The client-side volume boost can't rescue it: playback rides
// an HTMLAudioElement / <video> whose `volume` clamps to [0, 1] (see
// components/WaveformPlayer.tsx + MeleeGame.tsx), so a boost can only
// reach the clip's native level, never exceed it.
//
// Fix: download each clip from the public media domain, run the same
// `loudnorm` engine the Sound catalog was mastered with
// (scripts/normalize-sounds.mjs) at a hotter -11 LUFS target (see FILTER
// below for why melee runs hotter than sound), re-upload to R2 at the
// same key, and bump the ?v=<hash> cache-buster in
// data/melee-clips.json so the CDN edge serves the new bytes. Both the
// .mp3 (guessing phase) and the .mp4 reveal share the same quiet source,
// so both are normalized. There is enormous headroom (true peaks sit at
// -14 to -29 dBFS pre-fix), so nothing clips.
//
// Auth mirrors scripts/sync-to-r2.mjs: the wrangler OAuth token from
// ~/.wrangler/config/default.toml + the Cloudflare REST API (auto-
// refreshing the access token when expired). No CLOUDFLARE_API_TOKEN or
// S3 keys required.
//
// Usage:
//   node scripts/fix-quiet-melee-clips.mjs                     # full run: normalize + upload + manifest
//   node scripts/fix-quiet-melee-clips.mjs --dry-run           # download + normalize + measure, no upload/manifest
//   node scripts/fix-quiet-melee-clips.mjs --dry-run --audio-only  # fast check: mp3s only, no video download
//   node scripts/fix-quiet-melee-clips.mjs --only=reinhardt,mercy  # a subset of heroes

import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import ffmpegPath from "ffmpeg-static";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..");
const MELEE_DIR = resolve(REPO, "public", "melee");
const MANIFEST_PATH = resolve(REPO, "data", "melee-clips.json");
const MEDIA = "https://media.playowdle.com";
const BUCKET = process.env.CLOUDFLARE_R2_BUCKET ?? "dailydles";
// Same loudnorm engine as scripts/normalize-sounds.mjs, but a HOTTER
// integrated target than the Sound catalog's -13. A melee clip is a brief
// percussive hit surrounded by quiet ambient, so its integrated loudness
// reads low for a given perceived level — it needs a hotter target to
// feel as loud as the sustained voice/ability clips. The true-peak
// ceiling (-1.5 dBTP) still caps the impact, so nothing clips; on the
// sharpest hits the peak ceiling binds before the target and the clip
// lands a little under -11, which is fine (that impact is already maxed).
const FILTER = "loudnorm=I=-11:TP=-1.5:LRA=7:linear=false";
const CACHE_CONTROL = "public, max-age=86400, s-maxage=31536000, immutable";
const CONCURRENCY = 5;

const DRY_RUN = process.argv.includes("--dry-run");
const AUDIO_ONLY = process.argv.includes("--audio-only");
const ONLY =
  process.argv
    .find((a) => a.startsWith("--only="))
    ?.slice("--only=".length)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) ?? null;

// ── ffmpeg helpers ────────────────────────────────────────────────────
function run(cmd, args) {
  return new Promise((res, rej) => {
    const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (d) => (stdout += d));
    proc.stderr?.on("data", (d) => (stderr += d));
    proc.on("exit", (code) =>
      code === 0
        ? res({ stdout, stderr })
        : rej(new Error(`${cmd} exit ${code}\n${stderr.slice(-800)}`)),
    );
    proc.on("error", rej);
  });
}

async function loudnormMp3(inp, out) {
  await run(ffmpegPath, [
    "-y", "-hide_banner", "-loglevel", "error", "-i", inp,
    "-af", FILTER, "-ar", "48000",
    "-c:a", "libmp3lame", "-q:a", "2",
    out,
  ]);
}

async function loudnormMp4(inp, out) {
  await run(ffmpegPath, [
    "-y", "-hide_banner", "-loglevel", "error", "-i", inp,
    "-c:v", "copy",
    "-af", FILTER, "-ar", "48000",
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart",
    out,
  ]);
}

async function measureLufs(path) {
  const { stderr } = await run(ffmpegPath, [
    "-hide_banner", "-i", path,
    "-af", "ebur128=peak=true",
    "-f", "null", "-",
  ]);
  const m = stderr.match(/Integrated loudness:[\s\S]*?I:\s*(-?[\d.]+|-?inf)/);
  return m ? parseFloat(m[1]) : null;
}

async function contentHash(path) {
  const buf = await readFile(path);
  return createHash("sha256").update(buf).digest("hex").slice(0, 8);
}

// Strip ?v=<hash> off a stored URL to recover the bare R2 key.
function bareKey(url) {
  return url.split("?")[0];
}

// ── Cloudflare auth (wrangler OAuth token + REST) — mirrors sync-to-r2.mjs ─
const WRANGLER_CLIENT_ID = "54d11594-84e4-41aa-b438-e81b8fa78ee7";
const TOKEN_ENDPOINT = "https://dash.cloudflare.com/oauth2/token";
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

async function refreshOAuthToken(refreshToken) {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: WRANGLER_CLIENT_ID,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`token refresh failed (HTTP ${res.status}): ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function updateWranglerConfig(path, newToken, newRefresh, expiresIn) {
  const text = await readFile(path, "utf-8");
  const expiry = new Date(Date.now() + expiresIn * 1000).toISOString();
  const updated = text
    .replace(/(oauth_token\s*=\s*)"[^"]+"/, `$1"${newToken}"`)
    .replace(/(expiration_time\s*=\s*)"[^"]+"/, `$1"${expiry}"`)
    .replace(/(refresh_token\s*=\s*)"[^"]+"/, `$1"${newRefresh}"`);
  await writeFile(path, updated);
}

async function findWranglerToken() {
  const candidates = [
    process.env.WRANGLER_CONFIG && resolve(process.env.WRANGLER_CONFIG),
    join(homedir(), ".wrangler", "config", "default.toml"),
    join(homedir(), "AppData", "Roaming", "xdg.config", ".wrangler", "config", "default.toml"),
    join(homedir(), "Library", "Preferences", ".wrangler", "config", "default.toml"),
  ].filter(Boolean);

  for (const path of candidates) {
    let text;
    try {
      text = await readFile(path, "utf-8");
    } catch {
      continue;
    }
    const m = text.match(/oauth_token\s*=\s*"([^"]+)"/);
    if (!m) continue;
    let token = m[1];
    const expiryMatch = text.match(/expiration_time\s*=\s*"([^"]+)"/);
    const refreshMatch = text.match(/refresh_token\s*=\s*"([^"]+)"/);
    if (expiryMatch && refreshMatch) {
      const expiry = new Date(expiryMatch[1]);
      if (expiry.getTime() - Date.now() < EXPIRY_BUFFER_MS) {
        console.log("auth: access token expired, refreshing…");
        const res = await refreshOAuthToken(refreshMatch[1]);
        token = res.access_token;
        await updateWranglerConfig(path, res.access_token, res.refresh_token, res.expires_in);
        console.log("auth: token refreshed ✓");
      }
    }
    return { token, path };
  }
  return null;
}

// Transient Cloudflare edge errors (521/522/500/502/503) are common and
// retryable — a single blip shouldn't sink a 50-file upload run.
async function fetchWithRetry(url, init, { attempts = 4, label = "" } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, init);
      if (res.status >= 500 && res.status < 600 && i < attempts - 1) {
        lastErr = new Error(`HTTP ${res.status}`);
      } else {
        return res;
      }
    } catch (e) {
      lastErr = e;
      if (i >= attempts - 1) throw e;
    }
    const wait = 1000 * (i + 1) + Math.random() * 500;
    console.log(`  retry ${label} (${lastErr.message}) in ${Math.round(wait)}ms…`);
    await new Promise((r) => setTimeout(r, wait));
  }
  throw lastErr;
}

async function detectAccountId(token) {
  if (process.env.CLOUDFLARE_ACCOUNT_ID) return process.env.CLOUDFLARE_ACCOUNT_ID;
  const res = await fetchWithRetry("https://api.cloudflare.com/client/v4/accounts", {
    headers: { Authorization: `Bearer ${token}` },
  }, { label: "list-accounts" });
  if (!res.ok) throw new Error(`Could not list accounts (HTTP ${res.status})`);
  const data = await res.json();
  const accounts = data?.result;
  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new Error("No accounts visible to this token");
  }
  return accounts[0].id;
}

async function putObject(accountId, token, key, localPath, contentType) {
  const body = await readFile(localPath);
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${BUCKET}/objects/${encodeURI(key)}`;
  const res = await fetchWithRetry(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": contentType,
      "Cache-Control": CACHE_CONTROL,
    },
    body,
  }, { label: key });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PUT ${key}: HTTP ${res.status} ${text.slice(0, 200)}`);
  }
}

async function download(url, dest) {
  const res = await fetchWithRetry(url, {}, { label: `GET ${url.split("/").pop()}` });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, buf);
  return buf.length;
}

// Bounded worker pool preserving input order in the results array.
async function pool(items, n, fn) {
  const results = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        try {
          results[idx] = await fn(items[idx], idx);
        } catch (e) {
          results[idx] = { hero: items[idx].hero, error: e.message };
        }
      }
    }),
  );
  return results;
}

async function main() {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  let heroes = Object.keys(manifest);
  if (ONLY) heroes = heroes.filter((h) => ONLY.includes(h));
  if (heroes.length === 0) {
    console.error(ONLY ? `No manifest heroes matched --only=${ONLY.join(",")}` : "Manifest is empty.");
    process.exit(1);
  }

  console.log(
    `Melee loudness fix — ${heroes.length} hero(es)${DRY_RUN ? " · DRY RUN" : ""}${AUDIO_ONLY ? " · audio-only" : ""}`,
  );
  console.log(`Filter: ${FILTER}\n`);

  // Auth is only needed for a real upload.
  let accountId = null;
  let token = null;
  if (!DRY_RUN) {
    const found = await findWranglerToken();
    if (!found) {
      console.error("Could not find wrangler OAuth token. Run `npx wrangler login` first.");
      process.exit(1);
    }
    token = found.token;
    console.log(`auth: wrangler OAuth from ${found.path}`);
    accountId = await detectAccountId(token);
    console.log(`account: ${accountId}\nbucket:  ${BUCKET}\n`);
  }

  const items = heroes.map((hero) => ({ hero, clip: manifest[hero] }));
  let done = 0;
  const results = await pool(items, CONCURRENCY, async ({ hero, clip }) => {
    const mp3Local = resolve(MELEE_DIR, `${hero}.mp3`);
    const mp4Local = resolve(MELEE_DIR, `${hero}.mp4`);
    const mp3Tmp = `${mp3Local}.norm.mp3`;
    const mp4Tmp = `${mp4Local}.norm.mp4`;
    const doVideo = !AUDIO_ONLY && !!clip.videoUrl;

    await download(`${MEDIA}${clip.audioUrl}`, mp3Local);
    if (doVideo) await download(`${MEDIA}${clip.videoUrl}`, mp4Local);

    const before = await measureLufs(mp3Local);
    await loudnormMp3(mp3Local, mp3Tmp);
    await rename(mp3Tmp, mp3Local);
    if (doVideo) {
      await loudnormMp4(mp4Local, mp4Tmp);
      await rename(mp4Tmp, mp4Local);
    }
    const after = await measureLufs(mp3Local);

    const mp3Hash = await contentHash(mp3Local);
    const mp4Hash = doVideo ? await contentHash(mp4Local) : null;

    if (!DRY_RUN) {
      const audioKey = bareKey(clip.audioUrl).replace(/^\//, "");
      await putObject(accountId, token, audioKey, mp3Local, "audio/mpeg");
      if (doVideo) {
        const videoKey = bareKey(clip.videoUrl).replace(/^\//, "");
        await putObject(accountId, token, videoKey, mp4Local, "video/mp4");
      }
    }

    done++;
    const tag = before == null ? "?" : before.toFixed(1);
    const tag2 = after == null ? "?" : after.toFixed(1);
    console.log(
      `[${done}/${items.length}] ${hero.padEnd(14)} ${tag} → ${tag2} LUFS${doVideo ? " (+mp4)" : ""}${DRY_RUN ? "" : "  ↑ uploaded"}`,
    );
    return { hero, before, after, mp3Hash, mp4Hash, doVideo };
  });

  const ok = results.filter((r) => r && !r.error);
  const errs = results.filter((r) => r && r.error);

  // Bump manifest cache-busters for everything that uploaded cleanly.
  if (!DRY_RUN) {
    for (const r of ok) {
      const clip = manifest[r.hero];
      clip.audioUrl = `${bareKey(clip.audioUrl)}?v=${r.mp3Hash}`;
      if (r.doVideo && r.mp4Hash) clip.videoUrl = `${bareKey(clip.videoUrl)}?v=${r.mp4Hash}`;
    }
    await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
    console.log(`\nManifest updated: ${MANIFEST_PATH}`);
  } else {
    console.log("\nDRY RUN — no uploads, manifest untouched.");
  }

  const afterVals = ok.map((r) => r.after).filter((v) => v != null && Number.isFinite(v));
  if (afterVals.length) {
    afterVals.sort((a, b) => a - b);
    const mean = afterVals.reduce((s, v) => s + v, 0) / afterVals.length;
    console.log(
      `\nPost-norm LUFS across ${afterVals.length} clip(s): min=${afterVals[0].toFixed(1)} max=${afterVals[afterVals.length - 1].toFixed(1)} mean=${mean.toFixed(1)} (target -11)`,
    );
  }
  console.log(`Done — ${ok.length} normalized, ${errs.length} error(s).`);
  if (errs.length) {
    for (const e of errs) console.log(`  ✗ ${e.hero}: ${e.error}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("\n✗ fix failed:", e);
  process.exit(1);
});
