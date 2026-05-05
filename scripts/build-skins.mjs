// Skin asset pipeline. For each hero in data/heroes.json, query the Overwatch
// Fandom MediaWiki API for `Template:{Hero} Skins`, parse rarity-grouped CPB
// entries, resolve File: titles to direct CDN URLs, then smartcrop + resize
// each image to a self-hosted 800×800 JPEG. The resulting manifest lives at
// data/skins.json and image files at public/skins/{hero}/{skin-key}.jpg.
//
// Filter: Epic (purple) + Legendary (orange) tiers only. Common and Rare are
// recolors of Classic and uninteresting for the Splash mode guessing pool.
// Mythic could be added by extending ALLOWED_RARITIES.

import { writeFile, mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import sharp from "sharp";
import smartcrop from "smartcrop-sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HEROES_JSON = resolve(__dirname, "..", "data", "heroes.json");
const OUT_JSON = resolve(__dirname, "..", "data", "skins.json");
const SKINS_OUT = resolve(__dirname, "..", "public", "skins");
const FANDOM_API = "https://overwatch.fandom.com/api.php";
const UA = "OWdle-fan-quiz/1.0 (https://owdle-c2k.pages.dev)";

const SKIN_SIZE = 800;
const SKIN_QUALITY = 80;
const CONCURRENCY = 6;

// Rarity codes from {{rl|<code>...}}: c=common, r=rare, e=epic, l=legendary,
// m=mythic. Keep Epic + Legendary only — those are the ones with distinct
// designs worth guessing in Splash mode.
const ALLOWED_RARITIES = new Set(["e", "l"]);
const RARITY_NAMES = { c: "common", r: "rare", e: "epic", l: "legendary", m: "mythic" };

// Hero key (heroes.json kebab-case) → Fandom wiki page title.
// Most heroes match by capitalizing words in `hero.name` and replacing spaces
// with underscores; map only the irregulars here.
const WIKI_NAME_OVERRIDES = {
  "dva": "D.Va",
  "soldier-76": "Soldier:_76",
};

function wikiTitleFor(hero) {
  if (WIKI_NAME_OVERRIDES[hero.key]) return WIKI_NAME_OVERRIDES[hero.key];
  return hero.name.replace(/\s+/g, "_");
}

// kebab-case slug for filenames. Strip apostrophes (Will-O'-Wisp → will-o-wisp)
// but treat periods as separators (T.Racer → t-racer, distinct from "tracer").
function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function fetchJson(url, params, attempt = 1) {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  try {
    const res = await fetch(u, {
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 500 * attempt));
      return fetchJson(url, params, attempt + 1);
    }
    throw e;
  }
}

// Pull `Template:{wikiTitle} Skins` and walk the wikitext line by line.
// CTS section headers carry the rarity marker {{rl|<code>...}}; CPB lines
// list a single skin name. Each CPB inherits the rarity of the most recent
// CTS preceding it.
async function fetchSkinsForHero(wikiTitle) {
  const data = await fetchJson(FANDOM_API, {
    action: "parse",
    format: "json",
    page: `Template:${wikiTitle}_Skins`,
    prop: "wikitext",
  });
  const wt = data?.parse?.wikitext?.["*"];
  if (!wt) return [];

  const skins = [];
  let currentRarity = null;
  for (const rawLine of wt.split("\n")) {
    const line = rawLine.trim();

    if (line.startsWith("{{CTS")) {
      const m = line.match(/\{\{rl\|([cremlCREML])(?:\||\}\})/);
      currentRarity = m ? m[1].toLowerCase() : null;
      continue;
    }

    const cpb = line.match(/^\{\{CPB\|h=([^|]+) Skin\|n=([^|}]+)/);
    if (cpb) {
      if (!currentRarity || !ALLOWED_RARITIES.has(currentRarity)) continue;
      const heroPrefix = cpb[1].trim();
      const skinName = cpb[2].trim();
      skins.push({
        name: skinName,
        rarity: RARITY_NAMES[currentRarity],
        // Fandom normalizes underscores ↔ spaces; ask in space-form.
        fileTitle: `File:${heroPrefix} Skin ${skinName}.png`,
      });
    }
  }
  // De-duplicate by name (some skins are listed twice in templates with
  // different display configs).
  const seen = new Set();
  return skins.filter((s) => {
    if (seen.has(s.name)) return false;
    seen.add(s.name);
    return true;
  });
}

// Resolve File: titles to image URLs in batches of 50 (MW API limit).
async function resolveBatch(titles) {
  const out = new Map();
  const BATCH = 50;
  for (let i = 0; i < titles.length; i += BATCH) {
    const slice = titles.slice(i, i + BATCH);
    const data = await fetchJson(FANDOM_API, {
      action: "query",
      format: "json",
      titles: slice.join("|"),
      prop: "imageinfo",
      iiprop: "url",
    });
    const normalized = data?.query?.normalized ?? [];
    const normMap = new Map(normalized.map((n) => [n.from, n.to]));
    const pages = data?.query?.pages ?? {};
    for (const reqTitle of slice) {
      const finalTitle = normMap.get(reqTitle) || reqTitle;
      const page = Object.values(pages).find((p) => p?.title === finalTitle);
      const url = page?.imageinfo?.[0]?.url;
      if (url) out.set(reqTitle, url);
    }
  }
  return out;
}

// Soldier 76 quirk: display names like "Commando: 76" map to files named
// just `S76 Skin Commando.png` (the trailing ": 76" is stripped on disk).
// Returns the file title with that suffix removed, or null if no change.
function fallbackTitle(fileTitle) {
  const stripped = fileTitle.replace(/:\s*\d+(?=\.png$)/, "");
  return stripped !== fileTitle ? stripped : null;
}

// Two-pass resolution: try the literal file title, then for any misses try a
// stripped variant. Returns Map<originalTitle, url>.
async function resolveFileUrls(titles) {
  const first = await resolveBatch(titles);
  const misses = titles.filter((t) => !first.has(t));
  if (misses.length === 0) return first;

  const fallbackPairs = misses
    .map((t) => [t, fallbackTitle(t)])
    .filter(([, fb]) => fb);
  if (fallbackPairs.length === 0) return first;

  const fallbackTitles = fallbackPairs.map(([, fb]) => fb);
  const fallbackResolved = await resolveBatch(fallbackTitles);
  for (const [orig, fb] of fallbackPairs) {
    const url = fallbackResolved.get(fb);
    if (url) first.set(orig, url);
  }
  return first;
}

async function processSkin(url, outPath) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`download HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const meta = await sharp(buf).metadata();
  if (!meta.width || !meta.height) throw new Error("bad image metadata");

  // Smartcrop the most salient 1:1 region (almost always the character).
  // For wiki skin images that are already square, this is a centered no-op.
  const result = await smartcrop.crop(buf, { width: 1, height: 1 });
  const c = result.topCrop;

  await sharp(buf)
    .extract({
      left: Math.max(0, Math.round(c.x)),
      top: Math.max(0, Math.round(c.y)),
      width: Math.min(meta.width - Math.round(c.x), Math.round(c.width)),
      height: Math.min(meta.height - Math.round(c.y), Math.round(c.height)),
    })
    .resize(SKIN_SIZE, SKIN_SIZE, { fit: "cover" })
    .jpeg({ quality: SKIN_QUALITY, progressive: true })
    .toFile(outPath);
}

// Run async tasks with bounded concurrency.
async function runConcurrent(tasks, concurrency) {
  const queue = [...tasks];
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      const t = queue.shift();
      if (t) await t();
    }
  });
  await Promise.all(workers);
}

async function main() {
  const heroes = JSON.parse(await readFile(HEROES_JSON, "utf8"));
  await mkdir(SKINS_OUT, { recursive: true });

  const allManifest = {};
  let totalOk = 0;
  let totalFail = 0;

  for (const hero of heroes) {
    const wikiTitle = wikiTitleFor(hero);
    process.stdout.write(`${hero.key.padEnd(15)} (${wikiTitle}) `);

    let skins;
    try {
      skins = await fetchSkinsForHero(wikiTitle);
    } catch (e) {
      console.log(`SKIP — fetch ${e.message}`);
      continue;
    }

    if (skins.length === 0) {
      console.log("(no skins)");
      continue;
    }

    process.stdout.write(`${skins.length} candidates, resolving... `);
    const titles = skins.map((s) => s.fileTitle);
    const urls = await resolveFileUrls(titles);

    await mkdir(resolve(SKINS_OUT, hero.key), { recursive: true });

    const manifest = [];
    let ok = 0;
    let fail = 0;

    const tasks = skins.map((s) => async () => {
      const url = urls.get(s.fileTitle);
      if (!url) {
        fail++;
        return;
      }
      const skinKey = slugify(s.name);
      if (!skinKey) {
        fail++;
        return;
      }
      const outPath = resolve(SKINS_OUT, hero.key, `${skinKey}.jpg`);
      try {
        await processSkin(url, outPath);
        manifest.push({
          key: skinKey,
          name: s.name,
          rarity: s.rarity,
          file: `/skins/${hero.key}/${skinKey}.jpg`,
        });
        ok++;
      } catch (e) {
        console.log(`\n  ${hero.key}/${skinKey}: ${e.message}`);
        fail++;
      }
    });

    await runConcurrent(tasks, CONCURRENCY);

    if (manifest.length > 0) {
      // Stable order: legendary first (more iconic), then epic, name-sorted within tier.
      const order = { mythic: 0, legendary: 1, epic: 2 };
      manifest.sort(
        (a, b) =>
          (order[a.rarity] ?? 9) - (order[b.rarity] ?? 9) ||
          a.name.localeCompare(b.name),
      );
      allManifest[hero.key] = manifest;
    }

    totalOk += ok;
    totalFail += fail;
    console.log(`${ok} ok / ${fail} miss`);
  }

  await writeFile(OUT_JSON, JSON.stringify(allManifest, null, 2));
  const heroesWithSkins = Object.keys(allManifest).length;
  console.log(
    `\nWrote ${totalOk} skins across ${heroesWithSkins} heroes (${totalFail} misses) → ${OUT_JSON}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
