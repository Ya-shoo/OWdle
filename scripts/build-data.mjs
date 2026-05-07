// One-shot data pipeline: fetch OverFast hero data, merge with hand-curated
// overlay (species/gender/release_year/country), normalize country/continent,
// detect a saliency-based focal point for each splash background, and write
// data/heroes.json. Run once and commit the output.

import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import sharp from "sharp";
import smartcrop from "smartcrop-sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "..", "data", "heroes.json");
const SPLASH_OUT = resolve(__dirname, "..", "public", "splash");
const OVERFAST = "https://overfast-api.tekrop.fr";

// Output crop side length and JPEG quality for self-hosted splash squares.
const SPLASH_SIZE = 800;
const SPLASH_QUALITY = 80;

// Hand-curated overlay keyed by OverFast `key` (kebab-case).
// `country`: optional override when OverFast location strings are too messy
// (multiple historical locations) to parse reliably.
const OVERLAY = {
  // Tanks
  "dva":           { species: "human",  gender: "female",     release_year: 2016, country: "South Korea" },
  "domina":        { species: "human",  gender: "female",     release_year: 2026, country: "India" },
  "doomfist":      { species: "human",  gender: "male",       release_year: 2017, country: "Nigeria" },
  "hazard":        { species: "human",  gender: "male",       release_year: 2024, country: "Scotland" },
  "junker-queen":  { species: "human",  gender: "female",     release_year: 2022, country: "Australia" },
  "mauga":         { species: "human",  gender: "male",       release_year: 2023, country: "Samoa" },
  "orisa":         { species: "omnic",  gender: "female",     release_year: 2017, country: "Numbani" },
  "ramattra":      { species: "omnic",  gender: "male",       release_year: 2022, country: "India" },
  "reinhardt":     { species: "human",  gender: "male",       release_year: 2016, country: "Germany" },
  "roadhog":       { species: "human",  gender: "male",       release_year: 2016, country: "Australia" },
  "sigma":         { species: "human",  gender: "male",       release_year: 2019, country: "Netherlands" },
  "winston":       { species: "animal", gender: "male",       release_year: 2016, country: "Lunar Colony" },
  "wrecking-ball": { species: "animal", gender: "male",       release_year: 2018, country: "Lunar Colony" },
  "zarya":         { species: "human",  gender: "female",     release_year: 2016, country: "Russia" },
  // Damage
  "anran":         { species: "human",  gender: "female",     release_year: 2026, country: "China" },
  "ashe":          { species: "human",  gender: "female",     release_year: 2018, country: "USA" },
  "bastion":       { species: "omnic",  gender: "neutral",    release_year: 2016, country: "Germany" },
  "cassidy":       { species: "human",  gender: "male",       release_year: 2016, country: "USA" },
  "echo":          { species: "ai",     gender: "female",     release_year: 2020, country: "USA" },
  "emre":          { species: "cyborg", gender: "male",       release_year: 2026, country: "Turkey" },
  "freja":         { species: "human",  gender: "female",     release_year: 2025, country: "Denmark" },
  "genji":         { species: "cyborg", gender: "male",       release_year: 2016, country: "Japan" },
  "hanzo":         { species: "human",  gender: "male",       release_year: 2016, country: "Japan" },
  "junkrat":       { species: "human",  gender: "male",       release_year: 2016, country: "Australia" },
  "mei":           { species: "human",  gender: "female",     release_year: 2016, country: "China" },
  "pharah":        { species: "human",  gender: "female",     release_year: 2016, country: "Egypt" },
  "reaper":        { species: "human",  gender: "male",       release_year: 2016, country: "USA" },
  "sierra":        { species: "human",  gender: "female",     release_year: 2026, country: "USA" },
  "sojourn":       { species: "cyborg", gender: "female",     release_year: 2022, country: "Canada" },
  "soldier-76":    { species: "human",  gender: "male",       release_year: 2016, country: "USA" },
  "sombra":        { species: "human",  gender: "female",     release_year: 2016, country: "Mexico" },
  "symmetra":      { species: "human",  gender: "female",     release_year: 2016, country: "India" },
  "torbjorn":      { species: "human",  gender: "male",       release_year: 2016, country: "Sweden" },
  "tracer":        { species: "human",  gender: "female",     release_year: 2016, country: "United Kingdom" },
  "vendetta":      { species: "human",  gender: "female",     release_year: 2025, country: "Italy" },
  "venture":       { species: "human",  gender: "non-binary", release_year: 2024, country: "Canada" },
  "widowmaker":    { species: "human",  gender: "female",     release_year: 2016, country: "France" },
  // Support
  "ana":           { species: "human",  gender: "female",     release_year: 2016, country: "Egypt" },
  "baptiste":      { species: "human",  gender: "male",       release_year: 2019, country: "Haiti" },
  "brigitte":      { species: "human",  gender: "female",     release_year: 2018, country: "Sweden" },
  "illari":        { species: "human",  gender: "female",     release_year: 2023, country: "Peru" },
  // Jetpack Cat (in-universe "Fika") is Brigitte's adopted stray. The wiki
  // doesn't assign her a nationality the way it does humans/omnics, but
  // her voice lines are Swedish and she's bonded to Brigitte (Swedish),
  // so Sweden is the most defensible canonical answer for the puzzle.
  "jetpack-cat":   { species: "animal", gender: "female",     release_year: 2026, country: "Sweden" },
  "juno":          { species: "human",  gender: "female",     release_year: 2024, country: "Mars" },
  "kiriko":        { species: "human",  gender: "female",     release_year: 2022, country: "Japan" },
  "lifeweaver":    { species: "human",  gender: "male",       release_year: 2023, country: "Thailand" },
  "lucio":         { species: "human",  gender: "male",       release_year: 2016, country: "Brazil" },
  "mercy":         { species: "human",  gender: "female",     release_year: 2016, country: "Switzerland" },
  "mizuki":        { species: "human",  gender: "male",       release_year: 2026, country: "Japan" },
  "moira":         { species: "human",  gender: "female",     release_year: 2017, country: "Ireland" },
  "wuyang":        { species: "human",  gender: "male",       release_year: 2025, country: "China" },
  "zenyatta":      { species: "omnic",  gender: "male",       release_year: 2016, country: "Nepal" },
};

// Country → continent. Includes fictional Overwatch locations.
const CONTINENT = {
  "Egypt": "Africa", "Nigeria": "Africa", "Numbani": "Africa",
  "South Africa": "Africa", "Morocco": "Africa",
  "South Korea": "Asia", "China": "Asia", "Japan": "Asia",
  "India": "Asia", "Nepal": "Asia", "Tibet": "Asia", "Thailand": "Asia",
  "Iraq": "Asia", "Iran": "Asia", "Israel": "Asia", "Turkey": "Asia",
  "Mexico": "North America", "USA": "North America",
  "United States": "North America", "Canada": "North America", "Haiti": "North America",
  "Brazil": "South America", "Peru": "South America",
  "Argentina": "South America", "Colombia": "South America",
  "France": "Europe", "Germany": "Europe", "Sweden": "Europe",
  "Switzerland": "Europe", "Ireland": "Europe", "Netherlands": "Europe",
  "Russia": "Europe", "United Kingdom": "Europe", "UK": "Europe",
  "Scotland": "Europe", "England": "Europe", "Spain": "Europe",
  "Italy": "Europe", "Greece": "Europe", "Denmark": "Europe", "Norway": "Europe",
  "Australia": "Oceania", "New Zealand": "Oceania", "Samoa": "Oceania",
  "Lunar Colony": "Other", "Moon": "Other", "Mars": "Other", "Saturn": "Other",
};

const COUNTRY_NORMALIZE = {
  "United States of America": "USA",
  "United States": "USA",
  "America": "USA",
  "U.S.A.": "USA",
};

// Smart location parser as fallback for heroes without an overlay country.
function parseLocation(loc) {
  if (!loc) return null;
  const segments = loc.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  const cleaned = segments
    .map((s) => s.replace(/\([^)]*\)/g, "").replace(/[.]+$/, "").trim())
    .filter(Boolean)
    .filter((s) => !/^Watchpoint/i.test(s) && !/^Roaming$/i.test(s) && !/^Unknown$/i.test(s));
  for (const seg of cleaned) {
    const normalized = COUNTRY_NORMALIZE[seg] || seg;
    if (CONTINENT[normalized]) return normalized;
  }
  return cleaned[cleaned.length - 1] || null;
}

function birthdayMonth(birthday) {
  if (!birthday || typeof birthday !== "string") return null;
  const map = { Jan: "January", Feb: "February", Mar: "March", Apr: "April", May: "May", Jun: "June", Jul: "July", Aug: "August", Sep: "September", Oct: "October", Nov: "November", Dec: "December" };
  const m = birthday.match(/^([A-Za-z]+)/);
  return m ? map[m[1]] || m[1] : null;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
  return res.json();
}

// Smartcrop finds the most "interesting" square region of a splash background
// using saliency heuristics (skin tones, edges, saturation). For OW splash
// art the salient square is virtually always the character. We then crop and
// resize to a 1:1 self-hosted JPEG so the runtime can do trivial zoom math
// (transformOrigin 50%/50%) on a known-square image.
async function processSplash(url, heroKey) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const meta = await sharp(buf).metadata();
    if (!meta.width || !meta.height) return null;

    // Smartcrop returns the largest crop matching the requested aspect; for
    // 1:1 the result is min(W,H) — which on a banner-shaped splash is the
    // character region.
    const result = await smartcrop.crop(buf, { width: 1, height: 1 });
    if (!result?.topCrop) return null;
    const c = result.topCrop;

    await sharp(buf)
      .extract({
        left: Math.max(0, Math.round(c.x)),
        top: Math.max(0, Math.round(c.y)),
        width: Math.min(meta.width - Math.round(c.x), Math.round(c.width)),
        height: Math.min(meta.height - Math.round(c.y), Math.round(c.height)),
      })
      .resize(SPLASH_SIZE, SPLASH_SIZE, { fit: "cover" })
      .jpeg({ quality: SPLASH_QUALITY })
      .toFile(resolve(SPLASH_OUT, `${heroKey}.jpg`));

    return {
      url: `/splash/${heroKey}.jpg`,
      score: c.score?.total ?? null,
    };
  } catch (e) {
    console.log(`[splash crop failed: ${e.message}]`);
    return null;
  }
}

async function main() {
  await mkdir(SPLASH_OUT, { recursive: true });

  console.log("Fetching hero list...");
  const list = await fetchJson(`${OVERFAST}/heroes`);
  console.log(`Got ${list.length} heroes`);

  const out = [];
  const missingOverlay = [];
  for (const basic of list) {
    process.stdout.write(`  ${basic.key.padEnd(15)} `);
    let detail;
    try {
      detail = await fetchJson(`${OVERFAST}/heroes/${basic.key}`);
    } catch (e) {
      console.log(`SKIP (${e.message})`);
      continue;
    }

    const overlay = OVERLAY[basic.key];
    if (!overlay) missingOverlay.push(basic.key);

    const country = overlay?.country ?? parseLocation(detail.location);
    const continent = country ? CONTINENT[country] || null : null;

    const abilities = (detail.abilities || [])
      .filter((a) => a && a.name && a.icon)
      .map((a) => ({
        name: a.name,
        description: a.description || null,
        icon: a.icon,
        // MP4 of the ability animation (Akamai). The audio track inside is
        // playable directly via an HTMLAudioElement / <audio> tag — that's
        // what Sound mode uses as its clip source.
        videoUrl: a.video?.link?.mp4 || null,
      }));

    // Backgrounds may come as objects ({ image, ... }) or as URL strings.
    // Pick the highest-resolution image url we can find per entry.
    const backgrounds = (detail.backgrounds || [])
      .map((b) => {
        if (typeof b === "string") return b;
        if (!b) return null;
        return b.image || b.url || b.large || b.full || null;
      })
      .filter(Boolean);

    // Smartcrop + resize the highest-res splash to a self-hosted 1:1 JPEG
    // centered on the character. Saved to public/splash/{key}.jpg.
    let splash = null;
    const splashUrl = backgrounds[backgrounds.length - 1];
    if (splashUrl) {
      process.stdout.write("crop… ");
      splash = await processSplash(splashUrl, basic.key);
    }

    out.push({
      key: basic.key,
      name: basic.name,
      role: basic.role,
      subrole: basic.subrole || null,
      gamemodes: basic.gamemodes || [],
      portrait: basic.portrait,
      location: detail.location || null,
      country,
      continent,
      age: typeof detail.age === "number" ? detail.age : null,
      hp: detail.hitpoints?.total ?? null,
      birthday: detail.birthday || null,
      birthday_month: birthdayMonth(detail.birthday),
      species: overlay?.species ?? null,
      gender: overlay?.gender ?? null,
      release_year: overlay?.release_year ?? null,
      abilities,
      backgrounds,
      splash_url: splash?.url ?? null,
    });
    console.log("ok");
    await new Promise((r) => setTimeout(r, 80));
  }

  await mkdir(resolve(__dirname, "..", "data"), { recursive: true });
  await writeFile(OUT, JSON.stringify(out, null, 2));

  console.log(`\nWrote ${out.length} heroes → ${OUT}`);
  console.log(`  with full overlay: ${out.filter((h) => h.species && h.gender && h.release_year).length}`);
  console.log(`  in quickplay: ${out.filter((h) => h.gamemodes.includes("quickplay")).length}`);
  console.log(`  with splash crop:  ${out.filter((h) => h.splash_url).length}`);
  if (missingOverlay.length) {
    console.log(`\nMissing overlay for ${missingOverlay.length}:`);
    console.log("  " + missingOverlay.join(", "));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
