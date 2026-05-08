// Banner asset pipeline. Two sources:
//   1. Map screenshots — primarily Fandom wiki (2560px painterly art),
//      falling back to OverFast `/maps` (~1000-1200px gameplay shots) only
//      when the Fandom override is missing.
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
const MAP_OVERRIDES_PATH = resolve(
  __dirname,
  "..",
  "data",
  "map-art-overrides.json",
);
const OVERFAST = "https://overfast-api.tekrop.fr";

// 1920×864 is the native ceiling on most Fandom map images and matches
// the practical max display size on virtually all consumer displays. Going
// wider would force upscaling somewhere — either at build time (bad) or at
// browser render time (acceptable but not better). Aspect held at ~2.22:1.
const TARGET_W = 1920;
const TARGET_H = 864;
const QUALITY = 92;
// Strict no-upscale floor. Sources smaller than the banner target get
// SKIPped — better to drop a banner than ship a soft one.
const MIN_SOURCE_W = TARGET_W;

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Blizzard's contentstack CDN returns a 1553w default but accepts a
// `?width=N` query that re-serves at the requested resolution from a
// higher-res original. 2560 gives us crisp downsampling to our 1920w
// target without upscaling the comic source.
function expandSourceUrl(url) {
  if (!url.includes("blz-contentstack-images.akamaized.net")) return url;
  if (url.includes("?")) return url; // already has params, don't second-guess
  return `${url}?width=2560`;
}

async function downloadAndResize(url, outPath, opts = {}) {
  const { cropMode = "attention", format = "jpeg" } = opts;
  const fetchUrl = expandSourceUrl(url);
  let buf;
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(fetchUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      buf = Buffer.from(await res.arrayBuffer());
      break;
    } catch (e) {
      lastErr = e;
      if (attempt < 3) await new Promise((r) => setTimeout(r, 600 * attempt));
    }
  }
  if (!buf) throw new Error(`download ${lastErr?.message ?? "unknown"}`);

  // Quality gate: skip sources too small to upscale cleanly. Painterly art
  // hides modest upscaling; this floor cuts pre-2018 thumbnails.
  const meta = await sharp(buf).metadata();
  if (!meta.width || meta.width < MIN_SOURCE_W) {
    throw new Error(`source ${meta.width}x${meta.height} below ${MIN_SOURCE_W}w floor`);
  }

  // Crop strategy:
  //   - "attention": entropy heuristic, keeps the most visually salient
  //     region — ideal for maps and clean key art.
  //   - "center": dead-center crop — used for in-game menu screenshots
  //     where UI bars sit at top/bottom and the painterly art lives in the
  //     middle band. Attention would otherwise lock onto bright UI text.
  const position =
    cropMode === "center" ? "center" : sharp.strategy.attention;

  const pipeline = sharp(buf).resize(TARGET_W, TARGET_H, {
    fit: "cover",
    position,
  });
  // WebP at q82 produces ~25-30% the size of our JPEGs at q92 with no
  // perceptible quality loss on the painterly comic key art that headlines
  // the homepage. The hero banner is the LCP element, so this is real.
  if (format === "webp") {
    await pipeline.webp({ quality: 82, effort: 5 }).toFile(outPath);
  } else {
    await pipeline
      .jpeg({ quality: QUALITY, progressive: true, chromaSubsampling: "4:4:4" })
      .toFile(outPath);
  }
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
    const outPath = resolve(BANNERS_OUT, "key-art", `${e.key}.webp`);
    process.stdout.write(`  ${e.label.padEnd(28)} `);
    try {
      await downloadAndResize(e.url, outPath, {
        cropMode: e.cropMode,
        format: "webp",
      });
      out.push({
        type: "key-art",
        subtype: e.type || "key-art",
        key: e.key,
        label: e.label,
        sublabel: e.sublabel || null,
        file: `/banners/key-art/${e.key}.webp`,
      });
      console.log("ok");
    } catch (err) {
      console.log(`SKIP — ${err.message}`);
    }
  }
  return out;
}

// Workshop maps are flat sandbox test environments (literal green-screen,
// blank chambers) — not real Overwatch locations. Skip them so they don't
// land in the banner rotation looking like placeholder art.
const MAP_BLOCKLIST = new Set([
  "workshop-green-screen",
  "workshop-chamber",
  "workshop-expanse",
  "workshop-island",
]);

async function buildMaps() {
  console.log("\nMaps: fetching OverFast /maps");
  const maps = await fetchJson(`${OVERFAST}/maps`);
  console.log(`Got ${maps.length} maps`);
  await mkdir(resolve(BANNERS_OUT, "maps"), { recursive: true });

  // Fandom overrides — 2560px wiki images keyed by OverFast map key.
  // Generated by scripts/discover-map-art.mjs; preferred over OverFast.
  let overrides = {};
  try {
    overrides = JSON.parse(await readFile(MAP_OVERRIDES_PATH, "utf8"));
    console.log(`Overrides: ${Object.keys(overrides).length} from Fandom`);
  } catch (e) {
    console.log(`No map-art-overrides.json (${e.message}); OverFast only.`);
  }

  const out = [];
  for (const m of maps) {
    if (MAP_BLOCKLIST.has(m.key)) {
      console.log(`  ${m.name.padEnd(28)} SKIP — blocklist`);
      continue;
    }
    const override = overrides[m.key];
    const url = override?.url || m.screenshot;
    if (!url) {
      console.log(`  ${m.name.padEnd(28)} SKIP — no source`);
      continue;
    }
    const source = override ? "fandom" : "overfast";
    const outPath = resolve(BANNERS_OUT, "maps", `${m.key}.jpg`);
    process.stdout.write(`  ${m.name.padEnd(28)} ${source.padEnd(8)} `);
    try {
      await downloadAndResize(url, outPath);
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
