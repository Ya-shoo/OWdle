// Banner asset pipeline. Two sources:
//   1. Map screenshots from OverFast `/maps` (programmatic; 57 maps)
//   2. Hand-curated Overwatch key-art URLs from `data/key-art.json`
//      (atmospheric / ensemble / season spotlight pieces — the kind of
//       imagery that headlines overwatch.blizzard.com)
//
// Each source image is downloaded once, resized to 2000×900 (~2.22:1) using
// sharp's attention strategy so the salient region (character, focal point)
// stays in the crop. Output JPEGs are written to public/banners/{type}/{key}.jpg
// and a single manifest at data/banners.json describes every entry for the
// runtime to pick from.

import { writeFile, mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BANNERS_OUT = resolve(__dirname, "..", "public", "banners");
const OUT_JSON = resolve(__dirname, "..", "data", "banners.json");
const KEY_ART_PATH = resolve(__dirname, "..", "data", "key-art.json");
const OVERFAST = "https://overfast-api.tekrop.fr";

const TARGET_W = 2000;
const TARGET_H = 900;
const QUALITY = 78;

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function downloadAndResize(url, outPath) {
  let buf;
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      buf = Buffer.from(await res.arrayBuffer());
      break;
    } catch (e) {
      lastErr = e;
      if (attempt < 3) await new Promise((r) => setTimeout(r, 600 * attempt));
    }
  }
  if (!buf) throw new Error(`download ${lastErr?.message ?? "unknown"}`);

  // `position: attention` uses sharp's entropy heuristic to keep the most
  // visually salient region of the source inside the cover-cropped target.
  // For character key art this lands the figure inside the frame; for map
  // screenshots it picks the most detailed slice.
  await sharp(buf)
    .resize(TARGET_W, TARGET_H, {
      fit: "cover",
      position: sharp.strategy.attention,
    })
    .jpeg({ quality: QUALITY, progressive: true })
    .toFile(outPath);
}

async function buildKeyArt() {
  let entries;
  try {
    entries = JSON.parse(await readFile(KEY_ART_PATH, "utf8"));
  } catch (e) {
    console.log(`No key-art.json (${e.message}); skipping key art.`);
    return [];
  }
  console.log(`\nKey art: ${entries.length} entries`);
  await mkdir(resolve(BANNERS_OUT, "key-art"), { recursive: true });

  const out = [];
  for (const e of entries) {
    const outPath = resolve(BANNERS_OUT, "key-art", `${e.key}.jpg`);
    process.stdout.write(`  ${e.label.padEnd(22)} `);
    try {
      await downloadAndResize(e.url, outPath);
      out.push({
        type: "key-art",
        key: e.key,
        label: e.label,
        sublabel: e.sublabel || null,
        file: `/banners/key-art/${e.key}.jpg`,
      });
      console.log("ok");
    } catch (err) {
      console.log(`SKIP — ${err.message}`);
    }
  }
  return out;
}

async function buildMaps() {
  console.log("\nMaps: fetching OverFast /maps");
  const maps = await fetchJson(`${OVERFAST}/maps`);
  console.log(`Got ${maps.length} maps`);
  await mkdir(resolve(BANNERS_OUT, "maps"), { recursive: true });

  const out = [];
  for (const m of maps) {
    if (!m.screenshot) continue;
    const outPath = resolve(BANNERS_OUT, "maps", `${m.key}.jpg`);
    process.stdout.write(`  ${m.name.padEnd(28)} `);
    try {
      await downloadAndResize(m.screenshot, outPath);
      out.push({
        type: "map",
        key: m.key,
        label: m.name,
        sublabel: m.location || null,
        gamemodes: m.gamemodes || [],
        file: `/banners/maps/${m.key}.jpg`,
      });
      console.log("ok");
    } catch (e) {
      console.log(`SKIP — ${e.message}`);
    }
  }
  return out;
}

async function main() {
  await mkdir(BANNERS_OUT, { recursive: true });

  const keyArt = await buildKeyArt();
  const maps = await buildMaps();

  const manifest = { keyArt, maps };
  await writeFile(OUT_JSON, JSON.stringify(manifest, null, 2));

  console.log(
    `\nWrote ${keyArt.length} key art + ${maps.length} maps → ${OUT_JSON}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
