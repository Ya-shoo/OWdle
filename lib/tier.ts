// Daily performance → Overwatch competitive rank tier mapping. Used by
// DailyTierBadge on the DailyCompletePanel.
//
// Composite formula: per mode, won ? (cap - guesses) / cap : 0. Summed
// across the 5 built modes. Range: 0 (lost everything) → ~4.34 (won
// every mode in 1 guess).
//
// Tier assignment: server returns 6 quantile cutoffs against today's
// finisher distribution; the client checks its own composite from top
// to bottom. T500/GM/Diamond cutoffs come from Yash's spec; the rest
// fill out the distribution.
//
// CAPS must mirror each game component's MAX_GUESSES. The server-side
// HogQL uses properties.cap from the mode_completed event, so per-event
// drift is handled — but the client-side composite uses these constants,
// so they need to stay in lockstep with the games.

import type { ModeSlug } from "./modes";

// Hard cap per mode. Keep this in sync with each game's MAX_GUESSES:
//   ClassicGame.tsx  → 8
//   SoundGame.tsx    → 8
//   QuoteGame.tsx    → 8
//   AbilityGame.tsx  → 12
//   SplashGame.tsx   → 5
export const CAPS: Record<ModeSlug, number> = {
  classic: 8,
  sound: 8,
  quote: 8,
  ability: 12,
  splash: 5,
  // Map is built:false in lib/modes.ts so this entry is unused, but the
  // record type requires it. If/when Map ships, set to its real cap.
  map: 5,
};

// 7-tier ladder, top → bottom. Order matters: tier assignment walks this
// list and returns the first tier whose cutoff the composite clears.
export const TIERS = [
  "top500",
  "grandmaster",
  "diamond",
  "platinum",
  "gold",
  "silver",
  "bronze",
] as const;

export type Tier = (typeof TIERS)[number];

// Server-supplied composite cutoffs. A composite ≥ cutoff lands the
// player in that tier (or higher, depending on order). Server only
// emits this when today's finishers > 9; client treats undefined as
// "below display threshold, hide badge".
export type TierCutoffs = {
  top500: number;       // top 1%   — composite ≥ this
  grandmaster: number;  // top 10%
  diamond: number;      // top 30%
  platinum: number;     // top 50%
  gold: number;         // top 70%
  silver: number;       // top 90%
  // Below silver cutoff → Bronze. No explicit Bronze cutoff needed.
};

// Per-mode score: efficient win > inefficient win > loss.
// Loss contributes 0 (no penalty beyond opportunity cost — they tried).
export function modeScore(
  mode: ModeSlug,
  won: boolean,
  guesses: number,
): number {
  if (!won) return 0;
  const cap = CAPS[mode];
  if (cap <= 0 || guesses <= 0) return 0;
  return Math.max(0, (cap - guesses) / cap);
}

// Per-mode state shape sufficient for composite. We accept a duck-typed
// object because Quote uses ConversationState (different shape) but the
// only fields we need are `won` (boolean) and `guesses` (array).
export type ModeProgress = {
  won?: boolean;
  guesses?: unknown[];
};

// Sum of per-mode scores across the 5 built modes.
export function dailyComposite(
  modes: Partial<Record<ModeSlug, ModeProgress>>,
): number {
  let total = 0;
  for (const slug of Object.keys(CAPS) as ModeSlug[]) {
    if (slug === "map") continue; // not in BUILT_MODE_SLUGS
    const st = modes[slug];
    const won = st?.won === true;
    const count = Array.isArray(st?.guesses) ? st.guesses.length : 0;
    total += modeScore(slug, won, count);
  }
  return total;
}

// Map a composite to a tier label using server-supplied cutoffs. Walks
// top → bottom and returns the first tier whose cutoff is cleared.
// Falls through to "bronze" when nothing else matches.
export function tierForComposite(
  composite: number,
  cutoffs: TierCutoffs,
): Tier {
  if (composite >= cutoffs.top500) return "top500";
  if (composite >= cutoffs.grandmaster) return "grandmaster";
  if (composite >= cutoffs.diamond) return "diamond";
  if (composite >= cutoffs.platinum) return "platinum";
  if (composite >= cutoffs.gold) return "gold";
  if (composite >= cutoffs.silver) return "silver";
  return "bronze";
}

// Index in TIERS array. Lower index = higher rank. Used for the
// promote-only ratchet in DailyTierBadge: only update cached tier when
// new index < cached index (i.e., a strictly higher rank).
export function tierRank(tier: Tier): number {
  return TIERS.indexOf(tier);
}

// Display label per tier.
export const TIER_LABEL: Record<Tier, string> = {
  top500: "Top 500",
  grandmaster: "Grandmaster",
  diamond: "Diamond",
  platinum: "Platinum",
  gold: "Gold",
  silver: "Silver",
  bronze: "Bronze",
};
