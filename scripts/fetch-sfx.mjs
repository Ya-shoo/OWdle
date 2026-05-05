// One-shot pull of hero ability-style SFX from the
// Overwatch-Item-Tracker/sounds GitHub repo. We deliberately AVOID any
// files mapped in mappedVoicelines.json or mappedSounds.json (those are
// voice lines / spoken phrases) and filter by file size to bias toward
// short SFX clips (~0.5–1.5s) — gunshots, ability casts, ult cues — rather
// than spoken combat banter or full ult voice quotes.
//
// All audio © Blizzard Entertainment — used under fair-use for a fan
// project. Source: https://github.com/Overwatch-Item-Tracker/sounds

import { writeFile, mkdir, rm } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SFX_OUT = resolve(__dirname, "..", "public", "sfx");
const MANIFEST_OUT = resolve(__dirname, "..", "data", "sfx.json");

const REPO = "Overwatch-Item-Tracker/sounds";
const BRANCH = "master";

// Source repo predates the McCree → Cassidy rename.
const HERO_KEY_MAP = { mccree: "cassidy" };

const SFX_PER_HERO = 8;
const MIN_SIZE = 4000;  // ~0.4s @ 64kbps OGG — drop sub-artifacts
const MAX_SIZE = 14000; // ~1.4s — short enough to skew SFX over voice

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchToFile(url, outPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  await writeFile(outPath, Buffer.from(buf));
}

// Probe audio duration (seconds) and peak loudness (dB). Lets us drop any
// near-silent or near-zero-length file that slipped through size filtering.
function probeAudio(path) {
  return new Promise((resolve) => {
    const proc = spawn(
      ffmpegPath,
      ["-i", path, "-af", "volumedetect", "-f", "null", "-"],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let out = "";
    proc.stderr.on("data", (d) => (out += d.toString()));
    proc.on("exit", () => {
      const dm = out.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
      const vm = out.match(/max_volume: (-?[\d.]+) dB/);
      resolve({
        duration: dm
          ? parseInt(dm[1]) * 3600 + parseInt(dm[2]) * 60 + parseFloat(dm[3])
          : null,
        maxDb: vm ? parseFloat(vm[1]) : null,
      });
    });
  });
}

async function main() {
  await rm(SFX_OUT, { recursive: true, force: true });
  await mkdir(SFX_OUT, { recursive: true });

  console.log("fetching mapping data…");
  const voiceMap = await fetchJson(
    `https://raw.githubusercontent.com/${REPO}/${BRANCH}/data/mappedVoicelines.json`,
  );
  const soundMap = await fetchJson(
    `https://raw.githubusercontent.com/${REPO}/${BRANCH}/data/mappedSounds.json`,
  );

  const manifest = {};
  const sourceHeroKeys = Object.keys(voiceMap);

  for (const sourceKey of sourceHeroKeys) {
    const heroKey = HERO_KEY_MAP[sourceKey] || sourceKey;
    // Voice-mapped IDs (combined from both mapping files) — exclude these.
    const namedIds = new Set([
      ...Object.keys(voiceMap[sourceKey] || {}),
      ...Object.keys(soundMap[sourceKey] || {}),
    ]);

    process.stdout.write(`  ${heroKey.padEnd(15)} `);
    let files;
    try {
      files = await fetchJson(
        `https://api.github.com/repos/${REPO}/contents/sounds/${sourceKey}?per_page=2000`,
      );
    } catch (e) {
      console.log(`list failed: ${e.message}`);
      continue;
    }

    const candidates = files
      .filter((f) => f.type === "file" && f.name.endsWith(".ogg"))
      .filter((f) => {
        const m = f.name.match(/.*-([0-9A-F]+)\.ogg$/);
        return m && !namedIds.has(m[1]);
      })
      .filter((f) => f.size >= MIN_SIZE && f.size <= MAX_SIZE);

    // Stable pick (sorted by id) so re-runs give identical output.
    candidates.sort((a, b) => a.name.localeCompare(b.name));

    const heroDir = resolve(SFX_OUT, heroKey);
    await mkdir(heroDir, { recursive: true });

    const entries = [];
    let kept = 0;
    for (const f of candidates) {
      if (kept >= SFX_PER_HERO) break;
      const outPath = resolve(heroDir, `${kept}.ogg`);
      try {
        await fetchToFile(f.download_url, outPath);
        const probe = await probeAudio(outPath);
        // Drop near-silent or sub-quarter-second files (artifacts)
        if (
          probe.duration != null &&
          probe.duration < 0.25
        ) {
          await rm(outPath);
          continue;
        }
        if (probe.maxDb != null && probe.maxDb < -30) {
          await rm(outPath);
          continue;
        }
        entries.push({
          url: `/sfx/${heroKey}/${kept}.ogg`,
          duration: probe.duration,
        });
        kept++;
      } catch (e) {
        // skip
      }
    }

    manifest[heroKey] = entries;
    console.log(`${entries.length} clips`);
  }

  await writeFile(MANIFEST_OUT, JSON.stringify(manifest, null, 2));
  console.log(`\nmanifest → ${MANIFEST_OUT}`);
  console.log(
    `coverage: ${Object.values(manifest).filter((a) => a.length > 0).length} heroes`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
