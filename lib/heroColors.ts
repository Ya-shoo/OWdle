import palettesData from "@/data/hero-palettes.json";

// Costume palette per hero — 2-5 colors, dominant first, sourced from
// each hero's base-skin design (armor, clothes, hair, signature FX).
// Two of these become the concentric frame rings on round share cards;
// overlap between heroes is fine — the LOGIC is what matters (a Mercy
// frame should read gold/white like Mercy).
//
// The data lives in data/hero-palettes.json and is edited visually via
// the dev palette editor on /labeler/share-preview/ (eyedropper + color
// pickers, saved through scripts/palette-server.mjs). Heroes missing
// from the file fall back to a single ring in the per-mode CHIP_COLOR
// from ShareCard.tsx, so a new hero never ships a broken frame.
export const HERO_PALETTE: Record<string, string[]> = palettesData as Record<
  string,
  string[]
>;

// Palette lookup with a single-ring fallback for unmapped heroes.
export function heroPalette(key: string, fallback: string): string[] {
  return HERO_PALETTE[key] ?? [fallback];
}

// Pick the TWO frame colors (outer, inner) for a hero's card. "Random"
// but seeded by hero + day: every render of the same card agrees (the
// share modal and the native-share capture can't show different frames
// mid-flow, and all players see the same frame on a given day), while
// different days reshuffle which costume colors land outer vs inner.
export function heroFrameColors(
  key: string,
  day: string,
  fallback: string,
): [string, string] {
  const palette = HERO_PALETTE[key] ?? [fallback];
  if (palette.length === 1) return [palette[0], palette[0]];
  const seed = hashString(`${key}:${day}`);
  const outerIdx = seed % palette.length;
  // Offset by 1..len-1 so inner is always a DIFFERENT palette color.
  const step =
    1 + (Math.floor(seed / palette.length) % (palette.length - 1));
  const innerIdx = (outerIdx + step) % palette.length;
  return [palette[outerIdx], palette[innerIdx]];
}

// FNV-1a — tiny, deterministic, good-enough scatter for color picks.
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
