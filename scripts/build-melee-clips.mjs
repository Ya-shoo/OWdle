// Scans public/melee/<hero>.{mp3,mp4} (the output of the melee labeler
// after `npm run sync-melee` has unzipped it) and writes
// data/melee-clips.json — one entry per hero, since Melee mode has exactly
// one clip per hero. Mirrors scripts/build-sound-clips.mjs but for the
// flat one-file-per-hero layout instead of sounds/<hero>/<slug>.
//
// WIP: the Melee game mode that consumes this manifest isn't built yet —
// this closes the capture → export → sync loop so the data is ready when
// the mode is.

import { readdir, writeFile, access, readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import ffmpegPath from "ffmpeg-static";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MELEE_DIR = resolve(__dirname, "..", "public", "melee");
const OUT_FILE = resolve(__dirname, "..", "data", "melee-clips.json");

// 8-char content hash appended to the URL — same cache-busting rationale
// as build-sound-clips.mjs (CF Pages edge cache doesn't invalidate on
// re-deploy to the same path).
async function contentHash(path) {
  const buf = await readFile(path);
  return createHash("sha256").update(buf).digest("hex").slice(0, 8);
}

function probeDuration(path) {
  return new Promise((res) => {
    const proc = spawn(ffmpegPath, ["-i", path, "-f", "null", "-"], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let out = "";
    proc.stderr.on("data", (d) => (out += d.toString()));
    proc.on("exit", () => {
      const m = out.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
      if (!m) return res(null);
      res(parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3]));
    });
    proc.on("error", () => res(null));
  });
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
  let entries;
  try {
    entries = await readdir(MELEE_DIR, { withFileTypes: true });
  } catch {
    console.warn(
      `no ${MELEE_DIR} yet — export from /labeler/melee/ and run this again.`,
    );
    await writeFile(OUT_FILE, JSON.stringify({}, null, 2));
    return;
  }

  const heroes = entries
    .filter((d) => d.isFile() && d.name.endsWith(".mp3"))
    .map((d) => d.name.replace(/\.mp3$/, ""))
    .sort();

  const manifest = {};
  for (const hero of heroes) {
    const mp3Path = resolve(MELEE_DIR, `${hero}.mp3`);
    const mp4Path = resolve(MELEE_DIR, `${hero}.mp4`);
    const hasMp4 = await fileExists(mp4Path);
    const duration = await probeDuration(mp3Path);
    if (duration == null || duration < 0.1) {
      console.warn(`  skipping ${hero} — no usable duration`);
      continue;
    }
    const mp3Hash = await contentHash(mp3Path);
    const mp4Hash = hasMp4 ? await contentHash(mp4Path) : null;
    manifest[hero] = {
      audioUrl: `/melee/${hero}.mp3?v=${mp3Hash}`,
      videoUrl: hasMp4 ? `/melee/${hero}.mp4?v=${mp4Hash}` : null,
      duration: Number(duration.toFixed(3)),
    };
    console.log(`  ${hero.padEnd(15)} ${duration.toFixed(2)}s`);
  }

  await writeFile(OUT_FILE, JSON.stringify(manifest, null, 2));
  console.log(
    `\nmanifest → ${OUT_FILE}\nheroes: ${Object.keys(manifest).length}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
