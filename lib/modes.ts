export type ModeSlug =
  | "classic"
  | "quote"
  | "ability"
  | "splash"
  | "sound"
  | "melee"
  | "map";

// Three-tier model (see the "bonus mode" reframe):
//   • canonical — the daily. The five modes that gate day-complete,
//     streak, rank, and the daily share card. This set is EXACTLY 5 and
//     is the source of truth everywhere via BUILT_MODE_SLUGS.
//   • bonus     — playable, individually shareable islands OUTSIDE the
//     daily. No completion gating, no streak, no rank (Melee).
//   • featured  — bonus mechanics + premium home placement + its own
//     scoring (Map, still WIP/greyed).
export type ModeTier = "canonical" | "bonus" | "featured";

export type ModeDef = {
  slug: ModeSlug;
  label: string;
  blurb: string;
  built: boolean;
  tier: ModeTier;
};

// Canonical play order. New modes go here in the position users should
// encounter them. Changing the order changes the suggested-next progression
// across the entire app.
export const MODES: ModeDef[] = [
  {
    slug: "classic",
    label: "Classic",
    blurb: "Guess the hero from eight attribute tiles. Colored by closeness.",
    built: true,
    tier: "canonical",
  },
  {
    slug: "sound",
    label: "Sound",
    blurb: "Guess the hero from an ability sound. Each miss plays more.",
    built: true,
    tier: "canonical",
  },
  {
    slug: "quote",
    label: "Quote",
    blurb: "Two heroes talk before a match. Identify both speakers.",
    built: true,
    tier: "canonical",
  },
  {
    slug: "splash",
    label: "Spotlight",
    blurb: "Guess the hero from a cropped sliver of skin art. It zooms out with each miss.",
    built: true,
    tier: "canonical",
  },
  {
    slug: "ability",
    label: "Ability",
    blurb: "Guess the hero from a hidden ability icon. It uncovers tile by tile.",
    built: true,
    tier: "canonical",
  },
  {
    // Bonus mode — playable + shareable island OUTSIDE the daily. built:
    // true makes it a real route/sitemap entry, but tier:"bonus" keeps it
    // out of BUILT_MODE_SLUGS so it never touches day-complete, streak, or
    // rank. Surfaces in its own "Bonus modes" home section, not the grid.
    slug: "melee",
    label: "Melee",
    blurb: "Guess the hero from one melee swing. Three tries.",
    built: true,
    tier: "bonus",
  },
  {
    slug: "map",
    label: "Map",
    blurb: "GeoGuessr for Overwatch.",
    built: false,
    tier: "featured",
  },
];

// The canonical daily set — EXACTLY the 5 tier:"canonical" built modes.
// This is the source of truth for day-complete, streak, rank, the daily
// share code, sitemap slot order, and progress dots. Bonus/featured modes
// are deliberately excluded so a bonus mode can never re-enter the daily.
export const BUILT_MODE_SLUGS: ModeSlug[] = MODES.filter(
  (m) => m.built && m.tier === "canonical",
).map((m) => m.slug);

// Every mode that has a real, reachable page: canonical + bonus (Melee).
// Used for routes, the sitemap, and home discovery — anywhere we want the
// full set of playable pages rather than just the daily. Excludes
// featured Map while it stays built:false (WIP).
export const PLAYABLE_MODE_SLUGS: ModeSlug[] = MODES.filter(
  (m) => m.built,
).map((m) => m.slug);

export function getMode(slug: string): ModeDef | null {
  return MODES.find((m) => m.slug === slug) ?? null;
}

// First unfinished CANONICAL mode, in play order. `current` is excluded
// automatically — the caller has just finished it, so we never recommend
// it back to them. Returns null when every canonical mode is done — the
// cue to show the daily all-done state.
//
// Canonical-only by design: this drives the "up next" daily progression,
// so bonus/featured modes are skipped (a bonus island must never be a
// step in the daily sequence). Finishing a bonus mode still calls this to
// nudge the player back toward any unfinished canonical modes; when the
// daily is already swept it returns null and the CTA renders nothing.
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
    if (m.tier !== "canonical") continue;
    if (m.slug === current) continue;
    if (done.has(m.slug)) continue;
    return m;
  }
  return null;
}
