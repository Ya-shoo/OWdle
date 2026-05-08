// Loudness normalization for every voice/sound clip in public/sounds/<hero>/.
// Brings all clips (.mp3 + matching .mp4 reveal videos) to a consistent
// perceived loudness around -15 LUFS so support and DPS audio sit at the
// same level instead of supports being ~10 dB quieter, and so that the
// overall playback is audible on laptop speakers WITHOUT brick-wall
// limiter distortion.
//
// Filter: ffmpeg `loudnorm` single-pass, dynamic mode (linear=false).
//
//   loudnorm=I=-13:TP=-1.5:LRA=7:linear=false
//
// loudnorm is EBU R128 multi-band — it lifts integrated loudness by
// mixing fixed gain with smooth band-limited compression, and enforces
// the true-peak ceiling internally. Output lands clips at -13 to -19 LUFS
// (mean ~-15) with all true peaks under -0.7 dBFS. No additional limiter
// stage is needed.
//
// History:
//   v1 — loudnorm at -16 LUFS, linear=true: clean but too quiet on
//        laptop speakers, peaks left clips stuck at -16 to -22 LUFS.
//   v2 — stacked volume + alimiter chain to -10 LUFS: loud and consistent
//        but the brick-wall limiter introduced audible distortion ("to
//        the point of being distorted").
//   v3 — current. loudnorm dynamic mode at -13 LUFS. Loud enough,
//        clean transients, ~6 dB spread between supports/DPS — within
//        the natural-sounding range.

import { readdir, rename } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOUNDS_DIR = resolve(__dirname, "..", "public", "sounds");
const CONCURRENCY = 4;

const FILTER = "loudnorm=I=-13:TP=-1.5:LRA=7:linear=false";

function run(args) {
  return new Promise((res, rej) => {
    const proc = spawn(ffmpegPath, args, {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("exit", (code) => {
      if (code === 0) res({ stderr });
      else rej(new Error(`ffmpeg exit ${code}\n${stderr.slice(-500)}`));
    });
    proc.on("error", rej);
  });
}

async function measure(input) {
  const { stderr } = await run([
    "-hide_banner", "-i", input,
    "-af", "ebur128=peak=true",
    "-f", "null", "-",
  ]);
  const m = stderr.match(/Integrated loudness:[\s\S]*?I:\s*(-?[\d.]+|-?inf)/);
  return m ? parseFloat(m[1]) : null;
}

async function normalizeMp3(input, tmp) {
  await run([
    "-y", "-hide_banner", "-i", input,
    "-af", FILTER,
    "-ar", "48000",
    "-c:a", "libmp3lame", "-q:a", "2",
    tmp,
  ]);
}

async function normalizeMp4(input, tmp) {
  await run([
    "-y", "-hide_banner", "-i", input,
    "-c:v", "copy",
    "-af", FILTER,
    "-ar", "48000",
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart",
    tmp,
  ]);
}

async function processOne(file) {
  const tmp = `${file}.tmp.${file.endsWith(".mp4") ? "mp4" : "mp3"}`;
  const before = await measure(file);
  if (file.endsWith(".mp4")) await normalizeMp4(file, tmp);
  else await normalizeMp3(file, tmp);
  await rename(tmp, file);
  const after = await measure(file);
  return { file, before, after };
}

async function pool(items, fn, n) {
  const results = [];
  let i = 0;
  const workers = Array.from({ length: n }, async () => {
    while (i < items.length) {
      const idx = i++;
      try {
        results[idx] = await fn(items[idx]);
      } catch (e) {
        results[idx] = { file: items[idx], error: e.message };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  const heroes = (await readdir(SOUNDS_DIR, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const files = [];
  for (const hero of heroes) {
    const heroDir = resolve(SOUNDS_DIR, hero);
    const names = await readdir(heroDir);
    for (const n of names) {
      if (n.endsWith(".mp3") || n.endsWith(".mp4")) {
        files.push(resolve(heroDir, n));
      }
    }
  }
  console.log(`Found ${files.length} files across ${heroes.length} heroes.`);
  console.log(`Filter: ${FILTER}`);
  console.log(`Concurrency: ${CONCURRENCY}\n`);

  const t0 = Date.now();
  let done = 0;
  const results = await pool(
    files,
    async (f) => {
      const r = await processOne(f);
      done++;
      const rel = f.replace(SOUNDS_DIR + "/", "");
      if (r.error) {
        console.log(`[${done}/${files.length}] ERR  ${rel}: ${r.error}`);
      } else {
        const b = r.before == null ? "?" : r.before.toFixed(1);
        const a = r.after == null ? "?" : r.after.toFixed(1);
        console.log(`[${done}/${files.length}] ok   ${rel}  ${b} → ${a} LUFS`);
      }
      return r;
    },
    CONCURRENCY,
  );

  const ok = results.filter((r) => !r.error);
  const errs = results.filter((r) => r.error);
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nDone in ${dt}s — ${ok.length} normalized, ${errs.length} errors.`);

  const afterVals = ok.map((r) => r.after).filter((v) => v != null && Number.isFinite(v));
  if (afterVals.length > 0) {
    afterVals.sort((a, b) => a - b);
    const mean = afterVals.reduce((s, v) => s + v, 0) / afterVals.length;
    const median = afterVals[Math.floor(afterVals.length / 2)];
    console.log(
      `Post-norm LUFS: min=${afterVals[0].toFixed(1)} max=${afterVals[afterVals.length - 1].toFixed(1)} mean=${mean.toFixed(1)} median=${median.toFixed(1)}`,
    );
  }

  if (errs.length) {
    for (const e of errs) console.log(`  err ${e.file}: ${e.error}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
