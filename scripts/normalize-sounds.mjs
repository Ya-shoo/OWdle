// Two-pass EBU R128 loudness normalization for every voice/sound clip in
// public/sounds/<hero>/. Brings all clips (both .mp3 and the matching .mp4
// reveal videos) to a consistent perceived loudness so support and DPS
// audio sit at the same level instead of supports being ~10 dB quieter.
//
// Target: -16 LUFS integrated, true peak ceiling -1.5 dBTP. That's the
// streaming-loud range (close to YouTube/Spotify) — loud enough to hear on
// laptop speakers but with enough headroom to avoid intersample clipping.
//
// Pass 1 measures with `loudnorm=...:print_format=json`, pass 2 re-encodes
// with the measured values fed back in — much more accurate than one-pass
// on short clips where there isn't enough audio to gather statistics
// reliably during the encode.

import { readdir, rename, stat } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOUNDS_DIR = resolve(__dirname, "..", "public", "sounds");
const TARGET_I = -16;
const TARGET_TP = -1.5;
const TARGET_LRA = 11;
const CONCURRENCY = 4;

function run(args, { capture = false } = {}) {
  return new Promise((res, rej) => {
    const proc = spawn(ffmpegPath, args, {
      stdio: ["ignore", capture ? "pipe" : "ignore", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    if (capture) proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("exit", (code) => {
      if (code === 0) res({ stdout, stderr });
      else rej(new Error(`ffmpeg exit ${code}\n${stderr}`));
    });
    proc.on("error", rej);
  });
}

async function measure(input) {
  const filter = `loudnorm=I=${TARGET_I}:TP=${TARGET_TP}:LRA=${TARGET_LRA}:print_format=json`;
  const { stderr } = await run(["-hide_banner", "-i", input, "-af", filter, "-f", "null", "-"]);
  const m = stderr.match(/\{[\s\S]*?\}/);
  if (!m) throw new Error(`no loudnorm JSON in stderr for ${input}`);
  return JSON.parse(m[0]);
}

async function normalizeMp3(input, tmp, measured) {
  const filter =
    `loudnorm=I=${TARGET_I}:TP=${TARGET_TP}:LRA=${TARGET_LRA}` +
    `:measured_I=${measured.input_i}` +
    `:measured_TP=${measured.input_tp}` +
    `:measured_LRA=${measured.input_lra}` +
    `:measured_thresh=${measured.input_thresh}` +
    `:offset=${measured.target_offset}` +
    `:linear=true:print_format=summary`;
  await run([
    "-y", "-hide_banner", "-i", input,
    "-af", filter,
    "-ar", "48000",
    "-c:a", "libmp3lame", "-q:a", "2",
    tmp,
  ]);
}

async function normalizeMp4(input, tmp, measured) {
  const filter =
    `loudnorm=I=${TARGET_I}:TP=${TARGET_TP}:LRA=${TARGET_LRA}` +
    `:measured_I=${measured.input_i}` +
    `:measured_TP=${measured.input_tp}` +
    `:measured_LRA=${measured.input_lra}` +
    `:measured_thresh=${measured.input_thresh}` +
    `:offset=${measured.target_offset}` +
    `:linear=true:print_format=summary`;
  await run([
    "-y", "-hide_banner", "-i", input,
    "-c:v", "copy",
    "-af", filter,
    "-ar", "48000",
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart",
    tmp,
  ]);
}

async function processOne(file) {
  const tmp = `${file}.tmp.${file.endsWith(".mp4") ? "mp4" : "mp3"}`;
  const measured = await measure(file);
  if (measured.input_i === "-inf" || measured.input_i === "inf") {
    console.warn(`  skip silent: ${file}`);
    return { file, before: null, after: null, skipped: true };
  }
  if (file.endsWith(".mp4")) await normalizeMp4(file, tmp, measured);
  else await normalizeMp3(file, tmp, measured);
  await rename(tmp, file);
  return {
    file,
    before: parseFloat(measured.input_i),
    after: parseFloat(measured.output_i),
    skipped: false,
  };
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
  console.log(`Target: ${TARGET_I} LUFS, ${TARGET_TP} dBTP, LRA ${TARGET_LRA}.`);
  console.log(`Concurrency: ${CONCURRENCY}\n`);

  const t0 = Date.now();
  let done = 0;
  const results = await pool(
    files,
    async (f) => {
      const r = await processOne(f);
      done++;
      const rel = f.replace(SOUNDS_DIR + "/", "");
      if (r.skipped) console.log(`[${done}/${files.length}] SKIP ${rel}`);
      else if (r.error) console.log(`[${done}/${files.length}] ERR  ${rel}: ${r.error}`);
      else console.log(`[${done}/${files.length}] ok   ${rel}  ${r.before.toFixed(1)} → ${r.after.toFixed(1)} LUFS`);
      return r;
    },
    CONCURRENCY,
  );

  const ok = results.filter((r) => !r.error && !r.skipped);
  const errs = results.filter((r) => r.error);
  const skipped = results.filter((r) => r.skipped);
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `\nDone in ${dt}s — ${ok.length} normalized, ${skipped.length} skipped, ${errs.length} errors.`,
  );
  if (errs.length) {
    for (const e of errs) console.log(`  err ${e.file}: ${e.error}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
