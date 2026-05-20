// Sync local media (public/sounds, public/maps) to a Cloudflare R2
// bucket using Wrangler's stored OAuth token + the Cloudflare REST API.
//
// Why not the S3-compatible API? That requires a dedicated R2 API
// token (Access Key ID + Secret) created in the dashboard. The REST
// API accepts the wrangler OAuth token directly — one-step setup
// (just `wrangler login`).
//
// Inputs:
//   CLOUDFLARE_R2_BUCKET           — bucket name (default "dailydles")
//   CLOUDFLARE_ACCOUNT_ID          — account ID (auto-detected from wrangler)
//
// Token: read from wrangler's config at
//   ~/.wrangler/config/default.toml   (or platform equivalent)
//
// Behavior:
//   - Walks public/sounds and public/maps
//   - HEAD each key; skip if R2 has it at the same size
//   - PUT new/changed files at 8× concurrency
//   - Sets Cache-Control for CDN-friendly serving
//
// Run from repo root:
//   node scripts/sync-to-r2.mjs
//   node scripts/sync-to-r2.mjs --force      (skip the HEAD check)

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import mime from "mime";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const SYNC_DIRS = ["public/sounds", "public/maps"];
const CONCURRENCY = 8;
const CACHE_CONTROL = "public, max-age=86400, s-maxage=31536000, immutable";
const FORCE = process.argv.includes("--force");

const BUCKET = process.env.CLOUDFLARE_R2_BUCKET ?? "dailydles";

// Locate the wrangler config across the platforms it ships configs to.
// Order: explicit env var → standard XDG path → Windows AppData path.
async function findWranglerToken() {
  const candidates = [
    process.env.WRANGLER_CONFIG && resolve(process.env.WRANGLER_CONFIG),
    join(homedir(), ".wrangler", "config", "default.toml"),
    join(
      homedir(),
      "AppData",
      "Roaming",
      "xdg.config",
      ".wrangler",
      "config",
      "default.toml",
    ),
    // macOS fallback
    join(
      homedir(),
      "Library",
      "Preferences",
      ".wrangler",
      "config",
      "default.toml",
    ),
  ].filter(Boolean);

  for (const path of candidates) {
    try {
      const text = await readFile(path, "utf-8");
      const m = text.match(/oauth_token\s*=\s*"([^"]+)"/);
      if (m) return { token: m[1], path };
    } catch {
      // try next
    }
  }
  return null;
}

// Auto-detect account ID via the REST API (using the token we just
// found). Avoids requiring an env var for something we can introspect.
async function detectAccountId(token) {
  if (process.env.CLOUDFLARE_ACCOUNT_ID) {
    return process.env.CLOUDFLARE_ACCOUNT_ID;
  }
  const res = await fetch("https://api.cloudflare.com/client/v4/accounts", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Could not list accounts (HTTP ${res.status})`);
  }
  const data = await res.json();
  const accounts = data?.result;
  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new Error("No accounts visible to this token");
  }
  return accounts[0].id;
}

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (e) {
    if (e.code === "ENOENT") return;
    throw e;
  }
  for (const ent of entries) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) {
      yield* walk(full);
    } else if (ent.isFile()) {
      yield full;
    }
  }
}

function apiBase(accountId) {
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${BUCKET}/objects`;
}

async function headObject(accountId, token, key) {
  // The R2 REST API doesn't support HEAD on objects — use GET with
  // Range: bytes=0-0 to get headers cheaply (only 1 byte of body).
  const res = await fetch(`${apiBase(accountId)}/${encodeURI(key)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Range: "bytes=0-0",
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`HEAD-via-GET ${key}: HTTP ${res.status}`);
  }
  // Content-Range header on a Range request is "bytes 0-0/<total>".
  const contentRange = res.headers.get("content-range");
  if (contentRange) {
    const m = contentRange.match(/\/(\d+)$/);
    if (m) return { size: Number(m[1]) };
  }
  return { size: undefined };
}

async function putObject(accountId, token, key, body, contentType) {
  const res = await fetch(`${apiBase(accountId)}/${encodeURI(key)}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": contentType,
      "Cache-Control": CACHE_CONTROL,
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PUT ${key}: HTTP ${res.status} ${text.slice(0, 200)}`);
  }
}

async function runPool(jobs, n, onProgress) {
  let i = 0;
  let done = 0;
  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  let bytesUploaded = 0;
  const total = jobs.length;
  async function worker() {
    while (true) {
      const idx = i++;
      if (idx >= total) return;
      const job = jobs[idx];
      try {
        const result = await job();
        if (result.skipped) {
          skipped++;
        } else {
          uploaded++;
          bytesUploaded += result.size ?? 0;
        }
      } catch (e) {
        failed++;
        console.error(`  ✗ ${job.label}: ${e.message ?? e}`);
      } finally {
        done++;
        onProgress?.({ done, total, uploaded, skipped, failed });
      }
    }
  }
  await Promise.all(Array.from({ length: n }, worker));
  return { uploaded, skipped, failed, bytesUploaded };
}

function formatBytes(n) {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)}GB`;
}

async function main() {
  const found = await findWranglerToken();
  if (!found) {
    console.error(
      "Could not find wrangler OAuth token. Run `npx wrangler login` first.",
    );
    process.exit(1);
  }
  const token = found.token;
  console.log(`auth: wrangler OAuth from ${found.path}`);

  const accountId = await detectAccountId(token);
  console.log(`account: ${accountId}`);
  console.log(`bucket:  ${BUCKET}`);
  if (FORCE) console.log("mode:    --force (skip HEAD, re-upload everything)");

  const allFiles = [];
  for (const d of SYNC_DIRS) {
    const abs = join(REPO_ROOT, d);
    for await (const f of walk(abs)) {
      const rel = relative(REPO_ROOT, f).replace(/^public[\\/]/, "");
      const s = await stat(f);
      allFiles.push({ localPath: f, relPath: rel, size: s.size });
    }
  }
  const totalBytes = allFiles.reduce((n, f) => n + f.size, 0);
  console.log(
    `scanned ${allFiles.length} files (${formatBytes(totalBytes)} total)`,
  );

  const jobs = allFiles.map(({ localPath, relPath, size }) => {
    const key = relPath.split(sep).join("/");
    const fn = async () => {
      if (!FORCE) {
        const existing = await headObject(accountId, token, key);
        if (existing && existing.size === size) {
          return { skipped: true };
        }
      }
      const data = await readFile(localPath);
      const contentType =
        mime.getType(localPath) ?? "application/octet-stream";
      await putObject(accountId, token, key, data, contentType);
      return { skipped: false, size };
    };
    fn.label = relPath;
    return fn;
  });

  let lastReport = 0;
  const result = await runPool(jobs, CONCURRENCY, ({ done, total, uploaded, skipped, failed }) => {
    const now = Date.now();
    if (now - lastReport > 500 || done === total) {
      lastReport = now;
      process.stdout.write(
        `\r  progress ${done}/${total} · ${uploaded} uploaded · ${skipped} skipped · ${failed} failed   `,
      );
    }
  });
  process.stdout.write("\n");

  console.log("");
  console.log(
    `done: ${result.uploaded} uploaded (${formatBytes(result.bytesUploaded)}), ${result.skipped} skipped, ${result.failed} failed`,
  );
  if (result.failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("\n✗ sync failed:", e);
  process.exit(1);
});
