// Scans public/melee/<hero>.{mp3,mp4} (the output of the melee labeler
// after `npm run sync-melee` has unzipped it) and writes
// data/melee-clips.json — one entry per hero, since Melee mode has exactly
// one clip per hero. Mirrors scripts/build-sound-clips.mjs but for the
// flat one-file-per-hero layout instead of sounds/<hero>/<slug>.
//
// WIP: the Melee game mode that consumes this manifest isn't built yet —
// this closes the capture → export → sync loop so the data is ready when
// the mode is.

import {
  readdir,
  writeFile,
  access,
  readFile,
  rename,
  stat,
  unlink,
} from "node:fs/promises";
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

// The labeler exports the mp4s as raw game captures (1440p60 at ~100Mbps —
// ~80MB for a 4s clip). Served as-is they stall the reveal player, so squash
// anything oversized down to the Sound-reveal spec (720p, CRF 23, faststart;
// same recipe as reencode-large-clips.sh) before hashing. Already-encoded
// files sit around 1–2MB and skip this entirely.
const REENCODE_THRESHOLD_BYTES = 10 * 1024 * 1024;

// Loudness target. Melee hits are mastered extremely quiet in-game — raw
// captures land around -28 to -43 LUFS integrated, ~17-32 dB below the
// target, which reads as "always too quiet" and can't be rescued by the
// in-app volume boost (playback volume clamps at the clip's native
// level). Normalize every clip with the same loudnorm engine the Sound
// catalog uses (scripts/normalize-sounds.mjs) but at a HOTTER -11 LUFS
// target: a melee clip is a brief percussive hit surrounded by quiet
// ambient, so its integrated loudness reads low for a given perceived
// level and needs a hotter target to feel as loud as sustained voice/
// ability clips. Keep this in lockstep with scripts/fix-quiet-melee-
// clips.mjs. The -1.5 dBTP ceiling still caps the impact, so nothing
// clips. Idempotent: re-running on a normalized file is a near no-op.
const LOUDNORM = "loudnorm=I=-11:TP=-1.5:LRA=7:linear=false";

async function reencodeInPlace(path) {
  const tmp = `${path}.reencode.mp4`;
  await new Promise((res, rej) => {
    const proc = spawn(
      ffmpegPath,
      // prettier-ignore
      [
        "-hide_banner", "-loglevel", "error", "-y",
        "-i", path,
        "-c:v", "libx264", "-crf", "23", "-preset", "fast",
        "-vf", "scale=-2:720",
        "-c:a", "aac", "-b:a", "96k",
        "-movflags", "+faststart",
        tmp,
      ],
      { stdio: ["ignore", "ignore", "inherit"] },
    );
    proc.on("exit", (code) =>
      code === 0 ? res() : rej(new Error(`ffmpeg exited ${code} for ${path}`)),
    );
    proc.on("error", rej);
  });
  await rename(tmp, path);
}

// Loudness-normalize a clip in place with the shared LOUDNORM filter.
// Handles both the .mp3 (guessing phase) and the .mp4 reveal — the mp4
// keeps its video stream (-c:v copy) and only its audio track is lifted.
async function normalizeAudioInPlace(path) {
  const isMp4 = path.endsWith(".mp4");
  const tmp = `${path}.norm.${isMp4 ? "mp4" : "mp3"}`;
  const args = isMp4
    ? // prettier-ignore
      [
        "-hide_banner", "-loglevel", "error", "-y",
        "-i", path,
        "-c:v", "copy",
        "-af", LOUDNORM, "-ar", "48000",
        "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart",
        tmp,
      ]
    : // prettier-ignore
      [
        "-hide_banner", "-loglevel", "error", "-y",
        "-i", path,
        "-af", LOUDNORM, "-ar", "48000",
        "-c:a", "libmp3lame", "-q:a", "2",
        tmp,
      ];
  await new Promise((res, rej) => {
    const proc = spawn(ffmpegPath, args, { stdio: ["ignore", "ignore", "inherit"] });
    proc.on("exit", (code) =>
      code === 0 ? res() : rej(new Error(`loudnorm exited ${code} for ${path}`)),
    );
    proc.on("error", rej);
  });
  await rename(tmp, path);
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
    if (hasMp4) {
      const { size } = await stat(mp4Path);
      if (size > REENCODE_THRESHOLD_BYTES) {
        console.log(
          `  ${hero}: raw capture (${(size / 1048576).toFixed(0)}MB) — re-encoding to 720p`,
        );
        try {
          await reencodeInPlace(mp4Path);
        } catch (e) {
          console.warn(`  ${hero}: re-encode failed (${e.message}) — keeping original`);
          await unlink(`${mp4Path}.reencode.mp4`).catch(() => {});
        }
      }
    }
    // Lift levels to the Sound-catalog target so melee isn't inaudibly
    // quiet. Runs before hashing so the content hash reflects the shipped
    // (normalized) bytes. A failure here keeps the original level rather
    // than dropping the hero entirely.
    try {
      await normalizeAudioInPlace(mp3Path);
      if (hasMp4) await normalizeAudioInPlace(mp4Path);
    } catch (e) {
      console.warn(`  ${hero}: loudnorm failed (${e.message}) — keeping original level`);
    }
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
