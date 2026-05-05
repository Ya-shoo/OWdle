// Extracts the audio track from each ability's video MP4 and writes it as
// a self-hosted MP3 to public/sounds/{hero}/{i}.mp3. Updates heroes.json
// with `audioUrl` on each ability so the runtime can use a plain <audio>
// element pointed at our own domain — bypasses every cross-origin / video-
// container quirk that was breaking Sound mode.

import { writeFile, readFile, mkdir, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import ffmpegPath from "ffmpeg-static";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOUNDS_DIR = resolve(__dirname, "..", "public", "sounds");
const HEROES_FILE = resolve(__dirname, "..", "data", "heroes.json");
const CONCURRENCY = 5;
// Most ability captures are 5–12s; cap at 30s so even the longest still
// fits with margin while keeping file sizes small.
const MAX_DURATION_SECONDS = 30;

async function fileExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("error", reject);
    proc.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-400)}`));
    });
  });
}

async function extract(mp4Url, outputPath) {
  await runFfmpeg([
    "-loglevel",
    "error",
    "-y",
    "-i",
    mp4Url,
    "-vn", // no video
    "-t",
    String(MAX_DURATION_SECONDS),
    "-acodec",
    "libmp3lame",
    "-q:a",
    "5", // VBR quality, ~96kbps mono/stereo, good size/quality
    outputPath,
  ]);
}

async function main() {
  const heroes = JSON.parse(await readFile(HEROES_FILE, "utf8"));
  await mkdir(SOUNDS_DIR, { recursive: true });

  const tasks = [];
  for (const hero of heroes) {
    if (!hero.abilities?.length) continue;
    await mkdir(resolve(SOUNDS_DIR, hero.key), { recursive: true });
    for (let i = 0; i < hero.abilities.length; i++) {
      const ab = hero.abilities[i];
      if (!ab.videoUrl) continue;
      const outputPath = resolve(SOUNDS_DIR, hero.key, `${i}.mp3`);
      tasks.push({ hero, ab, i, outputPath });
    }
  }

  const total = tasks.length;
  console.log(`extracting ${total} clips with concurrency=${CONCURRENCY}…`);

  const queue = [...tasks];
  let done = 0;
  let failed = 0;

  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (true) {
        const t = queue.pop();
        if (!t) break;
        // Skip if already extracted (idempotent re-runs)
        if (await fileExists(t.outputPath)) {
          t.ab.audioUrl = `/sounds/${t.hero.key}/${t.i}.mp3`;
        } else {
          try {
            await extract(t.ab.videoUrl, t.outputPath);
            t.ab.audioUrl = `/sounds/${t.hero.key}/${t.i}.mp3`;
          } catch (e) {
            failed++;
            const msg = e instanceof Error ? e.message : String(e);
            process.stdout.write(
              `\n  FAIL ${t.hero.key}/${t.i}: ${msg.slice(0, 120)}\n`,
            );
          }
        }
        done++;
        process.stdout.write(`\r  ${done} / ${total}   `);
      }
    }),
  );

  console.log(`\nwriting heroes.json…`);
  await writeFile(HEROES_FILE, JSON.stringify(heroes, null, 2));
  console.log(`done (${done - failed} ok, ${failed} failed)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
