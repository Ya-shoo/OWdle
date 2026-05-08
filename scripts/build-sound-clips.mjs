// Scans public/sounds/<hero>/<slug>.{mp3,mp4} (the output of the labeler
// after sync-clips has unzipped it) and writes data/sound-clips.json with
// each clip's url, duration, and a derived human-readable label. The
// daily quiz reads this manifest at build time to pick the day's puzzle
// and to know how much of the clip to reveal per guess.

import { readdir, writeFile, access, readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import ffmpegPath from "ffmpeg-static";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOUNDS_DIR = resolve(__dirname, "..", "public", "sounds");
const OUT_FILE = resolve(__dirname, "..", "data", "sound-clips.json");

// Cache-bust suffix for the audio/video URL. CF Pages serves /sounds/* with
// a 1-day max-age + 7-day stale-while-revalidate, and re-deploys to the
// same path do NOT immediately invalidate the edge cache — visitors keep
// hearing the previous version until their TTL expires. Appending an
// 8-char content hash makes each re-encoded clip a distinct URL, so the
// browser and edge both treat it as a brand-new resource and fetch fresh.
async function contentHash(path) {
  const buf = await readFile(path);
  return createHash("sha256").update(buf).digest("hex").slice(0, 8);
}

function probeDuration(path) {
  return new Promise((res) => {
    const proc = spawn(
      ffmpegPath,
      ["-i", path, "-f", "null", "-"],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let out = "";
    proc.stderr.on("data", (d) => (out += d.toString()));
    proc.on("exit", () => {
      const m = out.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
      if (!m) return res(null);
      res(
        parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3]),
      );
    });
    proc.on("error", () => res(null));
  });
}

function slugToLabel(slug) {
  return slug
    .split("-")
    .map((w) => (w[0] ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ")
    .trim();
}

async function fileExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const entries = await readdir(SOUNDS_DIR, { withFileTypes: true });
  const heroes = entries
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const manifest = {};
  let total = 0;
  for (const hero of heroes) {
    const heroDir = resolve(SOUNDS_DIR, hero);
    const files = (await readdir(heroDir))
      .filter((f) => f.endsWith(".mp3"))
      .sort();

    const clips = [];
    for (const f of files) {
      const slug = f.replace(/\.mp3$/, "");
      const mp3Path = resolve(heroDir, f);
      const mp4Path = resolve(heroDir, `${slug}.mp4`);
      const hasMp4 = await fileExists(mp4Path);
      const duration = await probeDuration(mp3Path);
      if (duration == null || duration < 0.2) {
        console.warn(`  skipping ${hero}/${slug} — no usable duration`);
        continue;
      }
      const mp3Hash = await contentHash(mp3Path);
      const mp4Hash = hasMp4 ? await contentHash(mp4Path) : null;
      clips.push({
        slug,
        label: slugToLabel(slug),
        audioUrl: `/sounds/${hero}/${slug}.mp3?v=${mp3Hash}`,
        videoUrl: hasMp4 ? `/sounds/${hero}/${slug}.mp4?v=${mp4Hash}` : null,
        duration: Number(duration.toFixed(3)),
      });
    }
    if (clips.length > 0) {
      manifest[hero] = clips;
      total += clips.length;
    }
    console.log(`  ${hero.padEnd(15)} ${clips.length} clips`);
  }

  await writeFile(OUT_FILE, JSON.stringify(manifest, null, 2));
  console.log(
    `\nmanifest → ${OUT_FILE}\nheroes: ${Object.keys(manifest).length}, clips: ${total}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
