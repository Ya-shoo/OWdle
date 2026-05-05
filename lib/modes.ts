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
    blurb: "Type a hero, get attribute-match tiles. Eight categories.",
    built: true,
  },
  {
    slug: "quote",
    label: "Quote",
    blurb: "A pre-match exchange between two heroes. Identify both speakers.",
    built: true,
  },
  {
    slug: "ability",
    label: "Ability",
    blurb: "An ability icon, gradually revealed. Which hero?",
    built: true,
  },
  {
    slug: "splash",
    label: "Spotlight",
    blurb: "A cropped sliver of hero or skin art. It zooms out as you guess.",
    built: true,
  },
  {
    slug: "sound",
    label: "Sound",
    blurb: "A short voice line, lengthening with each miss.",
    built: true,
  },
  {
    slug: "map",
    label: "Map",
    blurb: "A screenshot. Pin where it was taken.",
    built: false,
  },
];

export const BUILT_MODE_SLUGS: ModeSlug[] = MODES.filter((m) => m.built).map(
  (m) => m.slug,
);

export function getMode(slug: string): ModeDef | null {
  return MODES.find((m) => m.slug === slug) ?? null;
}

// Next built mode in canonical order. Returns null when there are no more
// built modes after `current` — that's the cue to show the all-done state.
export function nextBuiltMode(current: ModeSlug): ModeDef | null {
  const idx = MODES.findIndex((m) => m.slug === current);
  if (idx < 0) return null;
  for (let i = idx + 1; i < MODES.length; i++) {
    if (MODES[i].built) return MODES[i];
  }
  return null;
}
