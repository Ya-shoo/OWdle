// Merge owdle-spots-*.zip bundles (exported from /labeler/map/review)
// into the repo: spot metadata into data/spots.json, masked JPEGs into
// public/maps/spots/<mapKey>/<id>.jpg.
//
// Idempotent and order-aware:
//   - Bundles are processed in chronological order (filename suffixes
//     are base-36 timestamps, so lexicographic == chronological).
//   - Spots are de-duplicated by `mapKey::sourceFilename`. If the same
//     screenshot was processed in two bundles, the later one wins —
//     useful when you re-process a screenshot after correcting OCR.
//   - Images always get rewritten (cheap, ensures the on-disk JPEG
//     matches the latest spot record's id).
//
// Usage: npm run sync-spots [downloadsDir]
// Default downloadsDir = ~/Downloads (resolved via $USERPROFILE on Windows).

import { readdir, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SPOTS_OUT_DIR = join(ROOT, "public", "maps", "spots");
const JSON_OUT = join(ROOT, "data", "spots.json");

const downloadsDir =
  process.argv[2] ??
  join(process.env.USERPROFILE || process.env.HOME || ".", "Downloads");

console.log(`Scanning ${downloadsDir}…`);
const allFiles = await readdir(downloadsDir);
const bundles = allFiles
  .filter((f) => /^owdle-spots-.+\.zip$/.test(f))
  .sort();

console.log(
  `Found ${bundles.length} bundle${bundles.length === 1 ? "" : "s"}.`,
);
if (bundles.length === 0) {
  console.log("Nothing to sync.");
  process.exit(0);
}

// Load existing merged spots.json. Tolerate a legacy flat-array shape
// (early spec said array; we now key by mapKey for O(1) lookup).
let merged = {};
if (existsSync(JSON_OUT)) {
  try {
    const raw = JSON.parse(await readFile(JSON_OUT, "utf-8"));
    if (Array.isArray(raw)) {
      for (const s of raw) {
        if (!merged[s.mapKey]) merged[s.mapKey] = [];
        merged[s.mapKey].push(s);
      }
    } else {
      merged = raw;
    }
  } catch (e) {
    console.warn(
      `Couldn't parse existing spots.json (${e.message}); starting fresh.`,
    );
    merged = {};
  }
}

// Index existing spots so we can replace by source filename.
const indexByKey = new Map();
for (const [mk, spots] of Object.entries(merged)) {
  spots.forEach((s, i) => {
    if (s.sourceFilename) indexByKey.set(`${mk}::${s.sourceFilename}`, i);
  });
}

let added = 0;
let replaced = 0;
let imagesWritten = 0;

await mkdir(SPOTS_OUT_DIR, { recursive: true });

for (const fname of bundles) {
  console.log(`\n→ ${fname}`);
  const buf = await readFile(join(downloadsDir, fname));
  const zip = await JSZip.loadAsync(buf);

  const spotsFile = zip.file("spots.json");
  if (!spotsFile) {
    console.log(`  ✗ no spots.json in zip — skipping`);
    continue;
  }
  const data = JSON.parse(await spotsFile.async("string"));

  for (const [mapKey, spots] of Object.entries(data)) {
    if (!merged[mapKey]) merged[mapKey] = [];
    let bundleAdded = 0;
    let bundleReplaced = 0;
    for (const s of spots) {
      const key = s.sourceFilename ? `${mapKey}::${s.sourceFilename}` : null;
      if (key && indexByKey.has(key)) {
        merged[mapKey][indexByKey.get(key)] = s;
        bundleReplaced++;
        replaced++;
      } else {
        merged[mapKey].push(s);
        if (key) {
          indexByKey.set(key, merged[mapKey].length - 1);
        }
        bundleAdded++;
        added++;
      }
    }
    console.log(
      `  ${mapKey}: +${bundleAdded} new, ${bundleReplaced} replaced`,
    );
  }

  for (const path of Object.keys(zip.files)) {
    const m = path.match(/^spots\/([^/]+)\/(.+\.jpg)$/);
    if (!m) continue;
    const [, mapKey, imgName] = m;
    const dir = join(SPOTS_OUT_DIR, mapKey);
    await mkdir(dir, { recursive: true });
    const target = join(dir, imgName);
    const bytes = await zip.files[path].async("nodebuffer");
    await writeFile(target, bytes);
    imagesWritten++;
  }
}

await writeFile(JSON_OUT, JSON.stringify(merged, null, 2) + "\n");

const totalSpots = Object.values(merged).reduce((a, b) => a + b.length, 0);
const perMap = Object.entries(merged)
  .map(([k, v]) => `${k}: ${v.length}`)
  .join(", ");
console.log("");
console.log(
  `Done. ${added} new, ${replaced} replaced, ${imagesWritten} images written.`,
);
console.log(`spots.json now: ${totalSpots} total — ${perMap}`);
