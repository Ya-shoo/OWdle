// Mirrors the remote portraits + ability icons referenced by data/heroes.json
// to public/portraits/ and public/abilities/<hero>/. Same self-hosting goal
// as the splash images: the site keeps rendering even when Blizzard's CDNs
// (d15f34w2p8l1cc.cloudfront.net, blz-contentstack-assets.akamaized.net) are
// unreachable, and bonus-round tiles paint instantly because everything is
// served same-origin under the existing 1d/7d cache headers.
//
// Usage:
//   node scripts/fetch-hero-assets.mjs           # fetch missing, leave heroes.json untouched
//   node scripts/fetch-hero-assets.mjs --rewrite # also rewrite heroes.json to local paths
//   node scripts/fetch-hero-assets.mjs --force   # re-download even if local file exists
//
// Idempotent: re-running with no flags is a no-op once everything is mirrored.

import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve, extname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const HEROES_JSON = resolve(ROOT, "data", "heroes.json");
const PORTRAITS_DIR = resolve(ROOT, "public", "portraits");
const ABILITIES_DIR = resolve(ROOT, "public", "abilities");

// Hostnames we mirror. Anything already on a local path (starts with /)
// is left alone.
const REMOTE_HOSTS = [
  "d15f34w2p8l1cc.cloudfront.net",
  "blz-contentstack-assets.akamaized.net",
];

const args = new Set(process.argv.slice(2));
const REWRITE = args.has("--rewrite");
const FORCE = args.has("--force");

// Match lib/daily.ts:abilityNameToSlug — must stay in sync so the runtime
// finds the file we wrote.
function slugify(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isRemote(url) {
  if (!url || typeof url !== "string") return false;
  if (url.startsWith("/")) return false;
  try {
    const u = new URL(url);
    return REMOTE_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}

function pickExt(url) {
  // CloudFront/Akamai URLs end in .png/.jpg etc; default to .png if missing.
  const e = extname(new URL(url).pathname).toLowerCase();
  return e || ".png";
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function downloadTo(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(destPath, buf);
  return buf.length;
}

// Bounded-concurrency runner: don't slam the CDN with 300 simultaneous
// requests. 8 is plenty fast and well under any sane rate limit.
async function runPool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(lanes);
  return results;
}

async function main() {
  const heroes = JSON.parse(await readFile(HEROES_JSON, "utf8"));

  await mkdir(PORTRAITS_DIR, { recursive: true });
  await mkdir(ABILITIES_DIR, { recursive: true });

  // Build the full job list before downloading so we can report a plan
  // and dedupe duplicate URLs (e.g. shared icons across hero variants).
  const jobs = [];
  const portraitMap = new Map(); // remoteUrl -> localPath
  const iconMap = new Map(); // `${heroKey}::${slug}` -> { remoteUrl, localPath }

  for (const hero of heroes) {
    if (isRemote(hero.portrait)) {
      const ext = pickExt(hero.portrait);
      const localRel = `/portraits/${hero.key}${ext}`;
      const localAbs = resolve(ROOT, "public", `portraits/${hero.key}${ext}`);
      portraitMap.set(hero.portrait, localRel);
      jobs.push({
        kind: "portrait",
        heroKey: hero.key,
        url: hero.portrait,
        rel: localRel,
        abs: localAbs,
      });
    }

    if (Array.isArray(hero.abilities)) {
      const heroAbilitiesDir = resolve(ABILITIES_DIR, hero.key);
      for (const ab of hero.abilities) {
        if (!ab || !ab.icon || !isRemote(ab.icon)) continue;
        const slug = slugify(ab.name);
        if (!slug) continue;
        const ext = pickExt(ab.icon);
        const localRel = `/abilities/${hero.key}/${slug}${ext}`;
        const localAbs = resolve(heroAbilitiesDir, `${slug}${ext}`);
        iconMap.set(`${hero.key}::${slug}`, {
          remoteUrl: ab.icon,
          localPath: localRel,
        });
        jobs.push({
          kind: "icon",
          heroKey: hero.key,
          slug,
          url: ab.icon,
          rel: localRel,
          abs: localAbs,
          dir: heroAbilitiesDir,
        });
      }
    }
  }

  console.log(
    `Plan: ${jobs.filter((j) => j.kind === "portrait").length} portraits + ${jobs.filter((j) => j.kind === "icon").length} ability icons`,
  );

  const ensuredDirs = new Set();
  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  await runPool(jobs, 8, async (job) => {
    if (job.dir && !ensuredDirs.has(job.dir)) {
      await mkdir(job.dir, { recursive: true });
      ensuredDirs.add(job.dir);
    }
    if (!FORCE && (await exists(job.abs))) {
      skipped++;
      return;
    }
    try {
      const bytes = await downloadTo(job.url, job.abs);
      downloaded++;
      const tag = job.kind === "portrait" ? job.heroKey : `${job.heroKey}/${job.slug}`;
      console.log(`  ✓ ${tag.padEnd(40)} ${(bytes / 1024).toFixed(1)}kb`);
    } catch (err) {
      failed++;
      console.error(`  ✗ ${job.url} — ${err.message}`);
    }
  });

  console.log(
    `\nDone: ${downloaded} downloaded, ${skipped} already present, ${failed} failed.`,
  );

  if (REWRITE) {
    let rewritten = 0;
    for (const hero of heroes) {
      const portraitLocal = portraitMap.get(hero.portrait);
      if (portraitLocal) {
        hero.portrait = portraitLocal;
        rewritten++;
      }
      if (Array.isArray(hero.abilities)) {
        for (const ab of hero.abilities) {
          if (!ab || !ab.icon) continue;
          const slug = slugify(ab.name);
          const entry = iconMap.get(`${hero.key}::${slug}`);
          if (entry && entry.remoteUrl === ab.icon) {
            ab.icon = entry.localPath;
            rewritten++;
          }
        }
      }
    }
    await writeFile(HEROES_JSON, JSON.stringify(heroes, null, 2) + "\n");
    console.log(`Rewrote ${rewritten} URLs in data/heroes.json → local paths.`);
  } else {
    console.log("Skipped heroes.json rewrite. Pass --rewrite to update paths.");
  }

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
