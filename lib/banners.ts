import bannersData from "@/data/banners.json";

export type BannerType = "key-art" | "map";

export type Banner = {
  type: BannerType;
  key: string;
  label: string;
  sublabel: string | null;
  file: string;
};

const KEY_ART: Banner[] = (bannersData.keyArt as Banner[]) ?? [];
const MAPS: Banner[] = (bannersData.maps as Banner[]) ?? [];

// Weight key art more heavily than map screenshots — the user explicitly
// wanted the home page to lean into the marketing-style art that headlines
// overwatch.blizzard.com, with maps as variety. Repeating each key-art
// entry pushes its overall share of the rotation up while still letting
// maps appear regularly.
const KEY_ART_WEIGHT = 4;
const WEIGHTED: Banner[] = [
  ...Array(KEY_ART_WEIGHT).fill(KEY_ART).flat(),
  ...MAPS,
];

function fnv1a(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

function dedupeAdjacent(list: Banner[]): Banner[] {
  const out: Banner[] = [];
  for (const b of list) {
    if (out.length === 0 || out[out.length - 1].key !== b.key) out.push(b);
  }
  return out;
}

// Deterministic per-day shuffle so the order is stable across re-renders on
// the same day, then rotates the next day. Same seed family as lib/daily.ts.
export function getDailyBanners(day: string): Banner[] {
  const out = [...WEIGHTED];
  let s = fnv1a(`owdle:banner:${day}`) || 1;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return dedupeAdjacent(out);
}

// Stable order used for SSR / pre-hydration so the first paint already shows
// an image. The client swaps in the day-seeded order after hydration.
export const STATIC_BANNERS: Banner[] = dedupeAdjacent(WEIGHTED);
