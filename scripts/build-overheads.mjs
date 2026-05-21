// Overhead asset pipeline. For each map in data/maps.json, fetch the clean
// orthographic top-down from Statbanana's public Google Drive folder, save
// as lossless WebP at the source's full resolution, write to
// public/maps/overhead/. Stamp source / fetchedAt into data/maps.json.
//
// Why Statbanana over Liquipedia: Liquipedia's `_Top_Down_View` JPGs have
// the payload route, capture-point circles, and spawn markers drawn on top
// — answer-leaks for a GeoGuessr-style game. Statbanana hosts the same
// renders without those overlays (just terrain + their corner logo for
// attribution). Geometry is OW1-era but unchanged for the launch 11 maps.
//
// Why lossless WebP: source PNGs are 14–36 MB; Cloudflare Pages caps assets
// at 25 MiB, and the 10000×5000 Control composites blow past. Lossless WebP
// preserves every source pixel and typically lands at ~30–60% of the PNG
// size — fits under the cap and nothing visual is sacrificed.
//
// Statbanana folder: https://drive.google.com/drive/folders/1cxoCDiHF4QGvxVQglbYiSR2gCSJvHuBB
// Attribution required — keep their logo visible (lives top-right of each
// image) and credit "Statbanana" wherever we render these.
//
// Re-runnable. Failures keep the previous overheadFile entry intact.

import { writeFile, mkdir, readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAPS_JSON = resolve(__dirname, "..", "data", "maps.json");
const OVERHEAD_OUT = resolve(__dirname, "..", "public", "maps", "overhead");

const UA = "OWdle-fan-quiz/1.0 (https://owdle-c2k.pages.dev)";

// Statbanana Google Drive file IDs per map key. Verified clean (no route
// lines / point circles), captured 2026-05.
//
// Note: Control composites (Ilios, Lijiang Tower, Oasis) are 3-arena side-
// by-side renders. Resized to 2500 long edge keeps each sub-arena ~833 px
// wide — adequate for calibration, but if we ever want pixel-perfect per-
// arena pinning, we should split these into 3 separate images and key the
// game by sub-arena (TODO post-launch).
const STATBANANA_DRIVE_IDS = {
  "kings-row": "10If1ecmAW3c0CUpDaefyMwwgYWmsOp7d",
  hanamura: "1zJIoWE6tqyuOXEwAfqQK4O23sCYBlz9s",
  dorado: "1flxWL0plP_-2jy0-UrM9sEeBDGOWToxF",
  ilios: "1BBLG8y0GGxCLEW0FK0nopZ2ISXpPIHmk",
  "watchpoint-gibraltar": "1jo6V3YjmLjF32wEmtx9V00IuOuqnm1zA",
  eichenwalde: "1d7FuLNZ-SOnTfsWcYsQQTK0oGuX5xiHf",
  hollywood: "1nGxoje9NBkVIfTQanHNVG22sOnbPxhpE",
  numbani: "1iJYEVKqr1HwEXzfenplLIcHsedDpkGPV",
  "lijiang-tower": "1fRXx6WFYdIieW8Ymfqbbj0MjhZwrFaOB",
  junkertown: "1tECichGmNZqEq7qNhZ2Wz21fCajRbUEo",
  oasis: "1si5G9Xtt-hfMG_QZpMMXBcnmUa4VBVXz",
  "blizzard-world": "12LfcRpyjUS7NV3KNQcxbluYTtX7GPMk-",
  "horizon-lunar-colony": "1kqsn1XgrvwIla5R0ejQ_S53z1jJ-yUd1",
  paris: "1DWQcIHTv_6NgSs-xnm7m3dqRgiZIUE-g",
  "temple-of-anubis": "10LJ9GJRBbQePyCm46hr45jYl3iXcLaTx",
  "volskaya-industries": "1ivL5PpWZUXksd1UPTNdMFeyhGq5Rae_o",
  rialto: "1jrEJXl70oDUNqS1UGhlDJ4RfEVCq1dJ9",
  "route-66": "15HPRFGowqsQm_eJ_uEqPz-GW-OWvNuWo",
  busan: "18BIEqEC5KtXscBPpm_XakGXzENJiClnZ",
  nepal: "1DFXQmC1CAu-s-6SkpRqPY23P-x-Vj4Tg",
  // Havana is NOT on Statbanana — would need a different source
  // (Liquipedia's annotated `Havana_Top_Down_Map.jpg` is the only
  // option, and it has callouts baked in). Leaving out for now.
};

function driveDownloadUrl(id) {
  return `https://drive.google.com/uc?export=download&id=${id}`;
}

async function fetchWithRetry(url, attempt = 1) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    const ct = res.headers.get("content-type") ?? "";
    if (ct.startsWith("text/html")) {
      // Drive's "can't scan for viruses" page; would need confirm-token
      // handling. Hasn't fired for any of these files in testing — they
      // sit under the threshold — but warn loudly if it ever does.
      throw new Error(
        `Drive returned HTML (likely virus-scan confirmation page) for ${url}`,
      );
    }
    return res;
  } catch (e) {
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 800 * attempt));
      return fetchWithRetry(url, attempt + 1);
    }
    throw e;
  }
}

async function fetchStatbananaOverhead(driveId) {
  const sourceUrl = driveDownloadUrl(driveId);
  const res = await fetchWithRetry(sourceUrl);
  const bytes = Buffer.from(await res.arrayBuffer());
  return { bytes, sourceUrl };
}

async function main() {
  const maps = JSON.parse(await readFile(MAPS_JSON, "utf-8"));
  await mkdir(OVERHEAD_OUT, { recursive: true });

  const successes = [];
  const failures = [];
  const skipped = [];

  for (let i = 0; i < maps.length; i++) {
    const map = maps[i];
    process.stdout.write(`[${i + 1}/${maps.length}] ${map.label}… `);

    const driveId = STATBANANA_DRIVE_IDS[map.key];
    if (!driveId) {
      skipped.push(map.label);
      process.stdout.write(`skipped (no Statbanana ID)\n`);
      continue;
    }

    try {
      const { bytes, sourceUrl } = await fetchStatbananaOverhead(driveId);
      const pre = await sharp(bytes).metadata();
      // Lossless WebP at native resolution. effort: 6 is sharp's max (slowest
      // encode, smallest output) — fine for a build-time job we run rarely.
      const out = await sharp(bytes)
        .webp({ lossless: true, effort: 6 })
        .toBuffer();
      const post = await sharp(out).metadata();
      const outPath = resolve(OVERHEAD_OUT, `${map.key}.webp`);
      await writeFile(outPath, out);
      // Clear any stale prior-format file (.jpg / .png) for this key so we
      // don't ship two copies after format changes.
      for (const stale of ["jpg", "png"]) {
        await rm(resolve(OVERHEAD_OUT, `${map.key}.${stale}`), {
          force: true,
        });
      }
      map.overheadFile = `/maps/overhead/${map.key}.webp`;
      map.source = "statbanana";
      map.sourceUrl = sourceUrl;
      map.attribution = "Statbanana (overwatch.statbanana.com)";
      map.fetchedAt = new Date().toISOString();
      successes.push({
        map: map.label,
        srcKB: Math.round(bytes.length / 1024),
        srcDim: `${pre.width}×${pre.height}`,
        outKB: Math.round(out.length / 1024),
        outDim: `${post.width}×${post.height}`,
      });
      process.stdout.write(
        `✓ ${pre.width}×${pre.height} ${(bytes.length / 1024 / 1024).toFixed(1)}MB png → ${post.width}×${post.height} ${(out.length / 1024 / 1024).toFixed(1)}MB webp\n`,
      );
    } catch (e) {
      failures.push({ map: map.label, error: e.message });
      process.stdout.write(`✗ ${e.message}\n`);
    }

    if (i < maps.length - 1) {
      await new Promise((r) => setTimeout(r, 600));
    }
  }

  await writeFile(MAPS_JSON, JSON.stringify(maps, null, 2) + "\n");

  console.log("");
  console.log(
    `Done. ${successes.length} ok, ${failures.length} failed, ${skipped.length} skipped. data/maps.json updated.`,
  );
  if (skipped.length > 0) {
    console.log("");
    console.log("Skipped (no Statbanana ID — add to STATBANANA_DRIVE_IDS):");
    for (const m of skipped) console.log(`  - ${m}`);
  }
  if (failures.length > 0) {
    console.log("");
    console.log("Failures:");
    for (const f of failures) console.log(`  - ${f.map}: ${f.error}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
