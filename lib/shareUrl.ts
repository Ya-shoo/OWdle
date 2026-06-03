// Compact URL encoder for daily-complete share links. Format:
//
//   <YYMMDD>-<5 mode results>-<hints><skips>
//
// Each segment is base36 (0-9, then a-z). Counts up to 34 fit in a
// single char; "z" is the sentinel for "missed" / "lost" so the encoded
// segment width stays predictable. Daily-complete shares only fire
// when every built mode is finished, so "pending" is impossible.
//
// Example: 2026-05-29, results [3, 2, 1, 3, 4], 2 hints, 0 skips
//   → "260529-32134-20"
//
// 15 chars total. URL: /r/260529-32134-20
//
// Mode order is fixed to BUILT_MODE_SLUGS so the encoder stays in lock
// step with the in-app daily rollup. If a mode is added to or removed
// from BUILT_MODE_SLUGS, OLD encoded links would decode with the wrong
// slot-to-mode mapping — accept that as a known limitation since the
// links are inherently dated (the date prefix already says the link
// refers to a past puzzle that may have used a different mode set).

import { BUILT_MODE_SLUGS, type ModeSlug } from "./modes";

const MISSED_CHAR = "z";

export type EncodedResults = {
  // The single path segment after /r/ — pass straight into the share URL.
  code: string;
};

export type DecodedResults = {
  // ISO date string YYYY-MM-DD reconstructed from the encoded YYMMDD.
  date: string;
  // One outcome per mode, in BUILT_MODE_SLUGS order.
  results: { slug: ModeSlug; outcome: "won" | "lost"; guesses: number }[];
  hints: number;
  skips: number;
};

// Encode a single mode result to a base36 character. Won counts > 34
// clamp to "y" (34) so the encoder never produces an ambiguous char
// vs. the missed sentinel. In practice no mode caps higher than 14.
function encodeOne(outcome: "won" | "lost", guesses: number): string {
  if (outcome === "lost") return MISSED_CHAR;
  const n = Math.max(0, Math.min(34, guesses));
  return n.toString(36);
}

function decodeOne(ch: string): { outcome: "won" | "lost"; guesses: number } {
  if (ch === MISSED_CHAR) return { outcome: "lost", guesses: 0 };
  const n = parseInt(ch, 36);
  if (Number.isNaN(n)) return { outcome: "lost", guesses: 0 };
  return { outcome: "won", guesses: n };
}

// Two-digit YYMMDD encoding. Dates outside 2000-2099 clamp to year 99
// — acceptable since the share links are inherently puzzle-day-scoped
// and the puzzle isn't shipping outside that century.
function encodeDate(day: string): string {
  const [y, m, d] = day.split("-");
  const yy = (parseInt(y, 10) % 100).toString().padStart(2, "0");
  const mm = m.padStart(2, "0");
  const dd = d.padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

function decodeDate(code: string): string | null {
  if (code.length !== 6) return null;
  const yy = parseInt(code.slice(0, 2), 10);
  const mm = parseInt(code.slice(2, 4), 10);
  const dd = parseInt(code.slice(4, 6), 10);
  if (Number.isNaN(yy) || Number.isNaN(mm) || Number.isNaN(dd)) return null;
  const year = 2000 + yy;
  return `${year}-${mm.toString().padStart(2, "0")}-${dd.toString().padStart(2, "0")}`;
}

// Cap hints + skips at 35 (single base36 char "z") since real games
// can't exceed their per-mode caps. Defensive only.
function clampToChar(n: number): string {
  return Math.max(0, Math.min(35, n)).toString(36);
}

export function encodeResults(opts: {
  day: string;
  results: { slug: ModeSlug; outcome: "won" | "lost"; guesses: number }[];
  hints: number;
  skips: number;
}): EncodedResults {
  const date = encodeDate(opts.day);
  // Reindex caller results by slug so the output order is canonical.
  const bySlug = new Map(opts.results.map((r) => [r.slug, r]));
  const modeChars = BUILT_MODE_SLUGS.map((slug) => {
    const r = bySlug.get(slug);
    if (!r) return MISSED_CHAR;
    return encodeOne(r.outcome, r.guesses);
  }).join("");
  const counters = `${clampToChar(opts.hints)}${clampToChar(opts.skips)}`;
  return { code: `${date}-${modeChars}-${counters}` };
}

export function decodeResults(code: string): DecodedResults | null {
  // Strip any trailing slash from the path segment defensively.
  const trimmed = code.replace(/\/+$/, "");
  const parts = trimmed.split("-");
  if (parts.length !== 3) return null;
  const [datePart, modePart, counterPart] = parts;
  const date = decodeDate(datePart);
  if (date === null) return null;
  if (modePart.length !== BUILT_MODE_SLUGS.length) return null;
  if (counterPart.length !== 2) return null;
  const results = BUILT_MODE_SLUGS.map((slug, i) => ({
    slug,
    ...decodeOne(modePart[i]),
  }));
  const hints = parseInt(counterPart[0], 36);
  const skips = parseInt(counterPart[1], 36);
  if (Number.isNaN(hints) || Number.isNaN(skips)) return null;
  return { date, results, hints, skips };
}
