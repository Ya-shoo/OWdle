// Discover higher-resolution map art on the Overwatch Fandom wiki.
//
// OverFast's map screenshots are 1000–1200px wide; the Fandom infobox image
// for the same map page is consistently 2560px. The wiki uses a mix of
// concept art, loading screens, and gameplay shots — all painterly and
// banner-ready.
//
// We hit MediaWiki's `prop=pageimages` endpoint with `pithumbsize=2560`
// (Fandom's max thumbnail width) for each OverFast map. The result is
// cached to data/map-art-overrides.json keyed by the OverFast map key,
// which the banner pipeline then prefers over OverFast's screenshot.
//
// No headless scraping — pageimages already returns the page's primary
// image, which is what we want.
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, "..", "data", "map-art-overrides.json");
const OVERFAST = "https://overfast-api.tekrop.fr";
const FANDOM_API = "https://overwatch.fandom.com/api.php";

// Fandom skips workshop sandboxes anyway — banner pipeline already excludes
// these via MAP_BLOCKLIST. We mirror the list here so the override file
// stays clean.
const SKIP = new Set([
  "workshop-green-screen",
  "workshop-chamber",
  "workshop-expanse",
  "workshop-island",
]);

// Fandom titles that don't match OverFast's `name` exactly. Most do — the
// wiki's primary page name typically matches Blizzard's official spelling —
// but a handful need a hint (alt names, redirects to non-default forms).
const TITLE_OVERRIDES = {
  // King's Row's API title uses a straight apostrophe; OverFast uses the
  // curly form. URL-encoding handles this, but be explicit so the lookup
  // doesn't fail silently if Fandom changes their canonical title.
  "kings-row": "King's Row",
};

// Strict floor — anything smaller is rejected here so the override file
// only contains images the build pipeline will actually accept.
const MIN_W = 1920;

// Fandom's `pageimages` API misreports dimensions: it returns the
// `pithumbsize` we asked for as the width/height, even when the underlying
// file is smaller. To get the true native size we have to chase the
// pageimage filename through `imageinfo`, which queries the actual file
// metadata.
async function fandomPageImage(title) {
  const params = new URLSearchParams({
    action: "query",
    prop: "pageimages",
    pithumbsize: "2560",
    titles: title,
    redirects: "1",
    format: "json",
    formatversion: "2",
  });
  const res = await fetch(`${FANDOM_API}?${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const page = data?.query?.pages?.[0];
  if (!page || page.missing) return null;
  const pageImage = page.pageimage;
  if (!pageImage) return null;

  const info = await fandomImageInfo(pageImage);
  if (!info) return null;
  return {
    url: info.url,
    width: info.width,
    height: info.height,
    pageImage,
    title: page.title,
  };
}

async function fandomImageInfo(filename) {
  const params = new URLSearchParams({
    action: "query",
    titles: `File:${filename}`,
    prop: "imageinfo",
    iiprop: "url|size",
    format: "json",
    formatversion: "2",
  });
  const res = await fetch(`${FANDOM_API}?${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const page = data?.query?.pages?.[0];
  const ii = page?.imageinfo?.[0];
  if (!ii) return null;
  return { url: ii.url, width: ii.width, height: ii.height };
}

// Fallback: when the primary pageimage is too small (the wiki picked an
// icon, logo, or thumbnail variant), scan ALL images on the page and pick
// the widest landscape that clears the floor. Filters out:
//   - audio/video (.ogg, .webm, .mp4)
//   - game-mode icon PNGs (always portrait or square, way under 1920w)
//   - tall/portrait images (heroes, infobox sidebars) — banner needs landscape
async function fandomLargestImage(title) {
  const params = new URLSearchParams({
    action: "query",
    titles: title,
    prop: "images",
    imlimit: "100",
    redirects: "1",
    format: "json",
    formatversion: "2",
  });
  const res = await fetch(`${FANDOM_API}?${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const page = data?.query?.pages?.[0];
  const images = page?.images || [];

  let best = null;
  for (const i of images) {
    const fname = i.title.replace(/^File:/, "");
    if (/\.(ogg|webm|mp4|svg|gif)$/i.test(fname)) continue;
    let info;
    try {
      info = await fandomImageInfo(fname);
    } catch {
      continue;
    }
    if (!info) continue;
    if (info.width < MIN_W) continue;
    if (info.height > info.width) continue; // skip portrait/tall
    if (!best || info.width > best.width) {
      best = { ...info, pageImage: fname };
    }
  }
  return best;
}

async function main() {
  const maps = await fetch(`${OVERFAST}/maps`).then((r) => r.json());
  console.log(`OverFast: ${maps.length} maps`);

  const overrides = {};
  let hits = 0;
  let misses = 0;

  for (const m of maps) {
    if (SKIP.has(m.key)) continue;
    const title = TITLE_OVERRIDES[m.key] || m.name;
    process.stdout.write(`  ${m.name.padEnd(28)} `);
    try {
      let result = await fandomPageImage(title);
      let path = "primary";
      if (!result || result.width < MIN_W) {
        const fallback = await fandomLargestImage(title);
        if (fallback) {
          result = { ...fallback, title };
          path = "scan";
        }
      }
      if (!result || result.width < MIN_W) {
        console.log(`MISS (${result ? `${result.width}w too small` : "no image"})`);
        misses++;
        continue;
      }
      overrides[m.key] = result;
      console.log(
        `${result.width}x${result.height}  ${result.pageImage}` +
          (path === "scan" ? " [scan]" : ""),
      );
      hits++;
    } catch (err) {
      console.log(`ERROR ${err.message}`);
      misses++;
    }
    // Polite throttle. Fandom doesn't publish a strict rate limit but their
    // Help:API page asks for one request at a time.
    await new Promise((r) => setTimeout(r, 200));
  }

  await writeFile(OUT_PATH, JSON.stringify(overrides, null, 2));
  console.log(`\nWrote ${hits} overrides (${misses} misses) → ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
