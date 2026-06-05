export type ModeSlug =
  | "classic"
  | "quote"
  | "ability"
  | "splash"
  | "sound"
  | "map";

export type ModeDef = {
  slug: ModeSlug;
  label: string;
  blurb: string;
  built: boolean;
};

// Canonical play order. New modes go here in the position users should
// encounter them. Changing the order changes the suggested-next progression
// across the entire app.
export const MODES: ModeDef[] = [
  {
    slug: "classic",
    label: "Classic",
    blurb: "Type a hero, get attribute match tiles. Eight categories.",
    built: true,
  },
  {
    slug: "quote",
    label: "Quote",
    blurb: "Two heroes talk before a match. Identify both speakers.",
    built: true,
  },
  {
    slug: "splash",
    label: "Spotlight",
    blurb: "A cropped sliver of skin art. It zooms out as you guess.",
    built: true,
  },
  {
    slug: "sound",
    label: "Sound",
    blurb: "A short voice line, lengthening with each miss.",
    built: true,
  },
  {
    slug: "ability",
    label: "Ability",
    blurb: "An ability icon, gradually revealed. Which hero?",
    built: true,
  },
  {
    slug: "map",
    label: "Map",
    blurb: "GeoGuessr for Overwatch.",
    built: false,
  },
];

export const BUILT_MODE_SLUGS: ModeSlug[] = MODES.filter((m) => m.built).map(
  (m) => m.slug,
);

export function getMode(slug: string): ModeDef | null {
  return MODES.find((m) => m.slug === slug) ?? null;
}

// First built mode the player hasn't finished yet, in canonical play order.
// `current` is excluded automatically — the caller has just finished it,
// so we never recommend it back to them. Returns null when every built
// mode is done — that's the cue to show the all-done state.
//
// Walking from canonical position 0 (rather than from `current` forward)
// is intentional: if a player jumps ahead and wins a later mode, the next
// CTA pulls them back to the earliest unfinished mode so they experience
// the modes in their designed order.
export function nextUnfinishedMode(
  current: ModeSlug,
  done: ReadonlySet<ModeSlug>,
): ModeDef | null {
  for (const m of MODES) {
    if (!m.built) continue;
    if (m.slug === current) continue;
    if (done.has(m.slug)) continue;
    return m;
  }
  return null;
}
