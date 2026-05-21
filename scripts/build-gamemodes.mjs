// Gamemode icon pipeline. Pulls the seven canonical OW gamemode
// icons from the Overwatch Fandom wiki (File:{Mode}.png) and stores
// them as self-hosted PNGs under public/gamemodes/. Used by the map
// picker's per-card gamemode badge instead of our inline SVGs.
//
// Re-run when the wiki refreshes icons or when a new gamemode lands
// (just add to MODES below). Idempotent.

import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "..", "public", "gamemodes");
const OUT_JSON = resolve(__dirname, "..", "data", "gamemodes.json");
const FANDOM_API = "https://overwatch.fandom.com/api.php";
const UA = "OWdle-fan-quiz/1.0 (https://owdle-c2k.pages.dev)";

// Canonical mode list, lower-case keys match data/maps.json `gamemode`.
// Wiki uses Title Case file names: File:{Title}.png — confirmed via
// MediaWiki imageinfo for all seven.
const MODES = [
  { key: "assault", title: "Assault" },
  { key: "hybrid", title: "Hybrid" },
  { key: "escort", title: "Escort" },
  { key: "control", title: "Control" },
  { key: "push", title: "Push" },
  { key: "flashpoint", title: "Flashpoint" },
  { key: "clash", title: "Clash" },
];

async function fetchJson(url, params) {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = await fetch(u, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${u}`);
  return await res.json();
}

async function resolveImageUrl(fileTitle) {
  const data = await fetchJson(FANDOM_API, {
    action: "query",
    format: "json",
    titles: fileTitle,
    prop: "imageinfo",
    iiprop: "url",
  });
  const page = Object.values(data?.query?.pages ?? {})[0];
  return page?.imageinfo?.[0]?.url ?? null;
}

async function downloadTo(url, outPath) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} downloading ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(outPath, buf);
  return buf.byteLength;
}

(async () => {
  await mkdir(OUT_DIR, { recursive: true });
  const manifest = [];

  for (const mode of MODES) {
    const fileTitle = `File:${mode.title}.png`;
    process.stdout.write(`  ${mode.key.padEnd(12)} `);
    const url = await resolveImageUrl(fileTitle);
    if (!url) {
      console.log("MISSING — wiki returned no image");
      continue;
    }
    const outPath = resolve(OUT_DIR, `${mode.key}.png`);
    const bytes = await downloadTo(url, outPath);
    console.log(`${(bytes / 1024).toFixed(1)} KB  ←  ${fileTitle}`);
    manifest.push({
      key: mode.key,
      label: mode.title,
      file: `/gamemodes/${mode.key}.png`,
      source: "Overwatch Fandom",
      sourceUrl: `https://overwatch.fandom.com/wiki/${fileTitle.replace(/^File:/, "")}`,
      fetchedAt: new Date().toISOString(),
    });
  }

  await writeFile(OUT_JSON, JSON.stringify(manifest, null, 2));
  console.log(
    `\nWrote ${manifest.length} icons → ${OUT_DIR}\nManifest → ${OUT_JSON}`,
  );
})();
