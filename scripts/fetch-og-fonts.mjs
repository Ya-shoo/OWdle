// Regenerates the self-hosted font subsets the OG card renderer uses
// (public/og-fonts/*.ttf). The renderer (functions/og/r/[code].tsx)
// fetches these same-origin at render time — production renders must
// NOT depend on Google Fonts: per-render fetches to fonts.googleapis
// from the edge flake intermittently and 503 the card (proven on
// Deadlockle's launch night, 2026-06-05). Same-origin statics are as
// reliable as the spray assets and get edge-cached.
//
// The subset string below is the UNION of every glyph any card
// renders. IF A CARD EVER GAINS A NEW GLYPH (new mode label letter
// beyond A-Z, new punctuation, etc.), add it here and re-run:
//
//   node scripts/fetch-og-fonts.mjs
//
// Missing glyphs render as tofu boxes — Satori does not fall back.
// The ✓/✕ verdict glyphs are inline SVG paths, NOT text, so they are
// deliberately absent. NOTE: no "&" in SUBSET (nothing renders it).

import { mkdirSync, writeFileSync } from "node:fs";

const SUBSET =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ" +
  "0123456789 ,.:·-—/?";

const FONTS = [
  { family: "Bricolage Grotesque", weight: 800, out: "bricolage-800.ttf" },
  { family: "Bricolage Grotesque", weight: 500, out: "bricolage-500.ttf" },
  { family: "IBM Plex Mono", weight: 500, out: "plex-mono-500.ttf" },
  { family: "Saira Condensed", weight: 500, out: "saira-condensed-500.ttf" },
  // 800 carries the OWdle wordmark on the share cards (the brand face, per
  // components/Brand.tsx). Bricolage 800 still sets the big result numbers.
  { family: "Saira Condensed", weight: 800, out: "saira-condensed-800.ttf" },
];

// The css2 endpoint serves TTF (not woff2) to legacy user agents —
// same trick workers-og's loadGoogleFont uses. Satori needs TTF/OTF.
const LEGACY_UA = "Mozilla/5.0 (Windows NT 6.1; rv:10.0) Gecko/20100101";

mkdirSync("public/og-fonts", { recursive: true });

for (const f of FONTS) {
  const cssUrl =
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f.family)}:wght@${f.weight}` +
    `&text=${encodeURIComponent(SUBSET)}`;
  const css = await (
    await fetch(cssUrl, { headers: { "User-Agent": LEGACY_UA } })
  ).text();
  const m = css.match(/src:\s*url\(([^)]+)\)/);
  if (!m) throw new Error(`No font URL in css2 response for ${f.family}`);
  const bin = Buffer.from(await (await fetch(m[1])).arrayBuffer());
  const magic = bin.subarray(0, 4).toString("hex");
  if (magic !== "00010000" && bin.subarray(0, 4).toString() !== "OTTO") {
    throw new Error(`${f.out}: unexpected font format (magic ${magic})`);
  }
  writeFileSync(`public/og-fonts/${f.out}`, bin);
  console.log(`public/og-fonts/${f.out} ${bin.length}b (${f.family} ${f.weight})`);
}
