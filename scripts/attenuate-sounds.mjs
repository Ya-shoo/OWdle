// Apply a flat dB attenuation to every public/sounds/<hero>/* clip in
// place. Used after normalize-sounds.mjs when the post-normalization level
// is too hot — pure gain reduction, no compression, no quality loss
// (the audio is already encoded; this just scales sample values down).
//
// Default -5 dB ≈ 30% perceived loudness drop. Override with --db=N.

import { readdir, rename } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOUNDS_DIR = resolve(__dirname, "..", "public", "sounds");
const CONCURRENCY = 4;

const DB = (() => {
  const arg = process.argv.find((a) => a.startsWith("--db="));
  return arg ? parseFloat(arg.split("=")[1]) : -5;
})();

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

async function attenuateMp3(input, tmp) {
  await run([
    "-y", "-hide_banner", "-i", input,
    "-af", `volume=${DB}dB`,
    "-c:a", "libmp3lame", "-q:a", "2",
    tmp,
  ]);
}

async function attenuateMp4(input, tmp) {
  await run([
    "-y", "-hide_banner", "-i", input,
    "-c:v", "copy",
    "-af", `volume=${DB}dB`,
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart",
    tmp,
  ]);
}

async function processOne(file) {
  const tmp = `${file}.tmp.${file.endsWith(".mp4") ? "mp4" : "mp3"}`;
  if (file.endsWith(".mp4")) await attenuateMp4(file, tmp);
  else await attenuateMp3(file, tmp);
  await rename(tmp, file);
  return { file };
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
  console.log(`Attenuating ${files.length} files by ${DB} dB at concurrency ${CONCURRENCY}…\n`);

  const t0 = Date.now();
  let done = 0;
  const results = await pool(
    files,
    async (f) => {
      const r = await processOne(f);
      done++;
      if (done % 25 === 0 || done === files.length) {
        console.log(`  [${done}/${files.length}]`);
      }
      return r;
    },
    CONCURRENCY,
  );

  const errs = results.filter((r) => r.error);
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nDone in ${dt}s — ${results.length - errs.length} attenuated, ${errs.length} errors.`);
  if (errs.length) {
    for (const e of errs) console.log(`  err ${e.file}: ${e.error}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
