// Targeted re-mastering for sound clips whose initial R2 upload bypassed
// the loudnorm pipeline. The R2-migration commit (f6efdf6) shipped 39
// clips on tank + upcoming heroes that landed at ~-30 dBFS RMS while the
// loudnorm'd majority lives near -13 dBFS — 15-20 dB quieter, effectively
// inaudible on phone speakers even at full volume. Reported by multiple
// users on days the daily seed landed on one of those clips.
//
// Identification rule: clips in data/sound-clips.json whose audioUrl
// lacks the `?v=<hash>` cache-buster correspond 1:1 to the un-normalized
// batch. Every clip processed by scripts/build-sound-clips.mjs has a
// hash; these 39 went straight to R2 without going through that script.
//
// For each affected clip we download the current R2 file via the public
// custom domain, run the same `loudnorm=I=-13:TP=-1.5:LRA=7:linear=false`
// filter the rest of the catalog was mastered with, upload back to R2
// keyed at the same path (cache invalidation rides on the new ?v= hash,
// not the key), and update data/sound-clips.json in place.
//
// One extra mp3 generation compared to running this from the original
// source zips — but the original zips live on the Windows dev machine,
// so when production breaks on a Mac dev session, this script is the
// expedient fix.
//
// Usage:
//   node scripts/fix-quiet-sound-clips.mjs           # full run
//   node scripts/fix-quiet-sound-clips.mjs --dry-run # download + normalize locally, skip R2 upload + manifest write
//   node scripts/fix-quiet-sound-clips.mjs --only=sigma/gravitic-flux  # one clip only

import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import ffmpegPath from "ffmpeg-static";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..");
const SOUNDS_DIR = resolve(REPO, "public", "sounds");
const MANIFEST_PATH = resolve(REPO, "data", "sound-clips.json");
const MEDIA = "https://media.playowdle.com";
const BUCKET = process.env.CLOUDFLARE_R2_BUCKET ?? "dailydles";
const FILTER = "loudnorm=I=-13:TP=-1.5:LRA=7:linear=false";
const CACHE_CONTROL = "public, max-age=86400, s-maxage=31536000, immutable";

const DRY_RUN = process.argv.includes("--dry-run");
const ONLY = process.argv.find((a) => a.startsWith("--only="))?.slice("--only=".length) ?? null;

function run(cmd, args, opts = {}) {
  return new Promise((res, rej) => {
    const proc = spawn(cmd, args, {
      stdio: opts.stdio ?? ["ignore", "pipe", "pipe"],
      ...opts,
    });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (d) => (stdout += d));
    proc.stderr?.on("data", (d) => (stderr += d));
    proc.on("exit", (code) => {
      if (code === 0) res({ stdout, stderr });
      else rej(new Error(`${cmd} exit ${code}\n${stderr.slice(-1000)}`));
    });
    proc.on("error", rej);
  });
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, buf);
  return buf.length;
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

async function uploadToR2(localPath, key, contentType) {
  await run("npx", [
    "wrangler", "r2", "object", "put",
    `${BUCKET}/${key}`,
    "--file", localPath,
    "--remote",
    "--content-type", contentType,
    "--cache-control", CACHE_CONTROL,
  ], {
    env: { ...process.env, NPM_CONFIG_CACHE: "/tmp/owdle-npm-cache" },
    cwd: REPO,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

// Strip ?v=<hash> off a stored audioUrl/videoUrl to recover the bare key.
function bareKey(url) {
  return url.split("?")[0];
}

async function main() {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  const toFix = [];
  for (const [hero, clips] of Object.entries(manifest)) {
    for (const clip of clips) {
      if (clip.audioUrl.includes("?v=")) continue;
      if (ONLY && `${hero}/${clip.slug}` !== ONLY) continue;
      toFix.push({ hero, clip });
    }
  }
  console.log(`Found ${toFix.length} clip(s) to fix${DRY_RUN ? " (DRY RUN)" : ""}`);
  if (toFix.length === 0) return;

  const summary = [];
  let i = 0;
  for (const { hero, clip } of toFix) {
    const slug = clip.slug;
    const heroDir = resolve(SOUNDS_DIR, hero);
    const mp3Local = resolve(heroDir, `${slug}.mp3`);
    const mp4Local = resolve(heroDir, `${slug}.mp4`);
    const mp3Tmp = mp3Local + ".tmp.mp3";
    const mp4Tmp = mp4Local + ".tmp.mp4";

    console.log(`\n[${++i}/${toFix.length}] ${hero}/${slug}`);
    await download(`${MEDIA}${clip.audioUrl}`, mp3Local);
    if (clip.videoUrl) await download(`${MEDIA}${clip.videoUrl}`, mp4Local);
    const beforeLufs = await measureLufs(mp3Local);

    await loudnormMp3(mp3Local, mp3Tmp);
    await rename(mp3Tmp, mp3Local);
    if (clip.videoUrl) {
      await loudnormMp4(mp4Local, mp4Tmp);
      await rename(mp4Tmp, mp4Local);
    }
    const afterLufs = await measureLufs(mp3Local);
    const mp3Hash = await contentHash(mp3Local);
    const mp4Hash = clip.videoUrl ? await contentHash(mp4Local) : null;

    console.log(`  LUFS: ${beforeLufs?.toFixed(1)} → ${afterLufs?.toFixed(1)}`);
    console.log(`  hash: mp3=${mp3Hash}${mp4Hash ? ` mp4=${mp4Hash}` : ""}`);

    if (!DRY_RUN) {
      const audioKey = bareKey(clip.audioUrl).replace(/^\//, "");
      console.log(`  ↑ ${audioKey}`);
      await uploadToR2(mp3Local, audioKey, "audio/mpeg");
      if (clip.videoUrl) {
        const videoKey = bareKey(clip.videoUrl).replace(/^\//, "");
        console.log(`  ↑ ${videoKey}`);
        await uploadToR2(mp4Local, videoKey, "video/mp4");
      }
      clip.audioUrl = `${bareKey(clip.audioUrl)}?v=${mp3Hash}`;
      if (clip.videoUrl) clip.videoUrl = `${bareKey(clip.videoUrl)}?v=${mp4Hash}`;
    }
    summary.push({ hero, slug, beforeLufs, afterLufs, mp3Hash, mp4Hash });
  }

  if (!DRY_RUN) {
    await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
    console.log(`\nManifest updated: ${MANIFEST_PATH}`);
  } else {
    console.log("\nDRY RUN — no uploads, manifest untouched.");
  }

  console.log("\nSummary:");
  for (const s of summary) {
    console.log(`  ${s.hero}/${s.slug}  ${s.beforeLufs?.toFixed(1)} → ${s.afterLufs?.toFixed(1)} LUFS`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
