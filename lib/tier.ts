// Daily performance → Overwatch competitive rank tier mapping. Used by
// DailyTierBadge on the DailyCompletePanel.
//
// Scoring is intentionally simple: each finisher's score is the total
// number of guesses + Classic hints they used across all 5 modes, with
// two small decimal sub-points layered on for tie-breaks:
//   • +0.5 for each lost mode  (so a win-at-cap cleanly beats a
//     loss-at-cap that would otherwise tie on slot count)
//   • −0.5 if Classic bonus question answered correctly  (the only
//     win-quality signal we expose beyond raw guess count)
//
// Lower total = better. Tier is purely a percentile of this score
// among today's finishers; no composite formula, no precision bonus,
// no hint tax. A player who used fewer slots ranks higher.
//
// CAPS must mirror each game component's MAX_GUESSES. The server-side
// HogQL uses properties.cap from the mode_completed event, so per-event
// drift is handled — but the client-side total uses these constants to
// validate inputs, so they need to stay in lockstep with the games.

import type { ModeSlug } from "./modes";

// Hard cap per mode. Keep this in sync with each game's MAX_GUESSES:
//   ClassicGame.tsx  → 8
//   SoundGame.tsx    → 8
//   QuoteGame.tsx    → 8
//   AbilityGame.tsx  → 8
//   SplashGame.tsx   → 5
export const CAPS: Record<ModeSlug, number> = {
  classic: 8,
  sound: 8,
  quote: 8,
  ability: 8,
  splash: 5,
  // Map is built:false in lib/modes.ts so this entry is unused, but the
  // record type requires it. If/when Map ships, set to its real cap.
  map: 5,
};

// 7-tier ladder, top → bottom. Order matters: tier assignment walks this
// list and returns the first tier whose percentile threshold the player's
// rank clears.
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

// Tier percentile bands (Yash spec for T500/GM/Diamond + sensible
// defaults below). Inclusive upper bound — a player with topPercent
// exactly equal to the threshold gets that tier.
export const TIER_PERCENTILE_MAX: Record<Tier, number> = {
  top500: 1,
  grandmaster: 10,
  diamond: 30,
  platinum: 50,
  gold: 70,
  silver: 90,
  bronze: 100,
};

// Sub-point penalties + credits. Kept on this module so the server-side
// HogQL formula can mirror them exactly via constants near
// functions/api/stats/today.ts.
export const LOSS_PENALTY = 0.5;
export const BONUS_QUESTION_CREDIT = 0.5;

// Per-mode state shape sufficient for the daily total. Duck-typed
// because Quote uses ConversationState (different shape) but the only
// fields we need are `won`/`guesses`/`hintsUsed`/`bonus`.
//   • `guesses` (array — its .length matters)
//   • `hintsUsed` (Classic-only — separate array from `guesses[]`, so
//     the total has to look at both to match the in-game counter)
//   • `bonus` (Classic-only — { correct: boolean | null } per the
//     ModeState shape in lib/storage; only `correct === true` triggers
//     the credit)
export type ModeProgress = {
  won?: boolean;
  guesses?: unknown[];
  hintsUsed?: unknown[];
  bonus?: { correct?: boolean | null } | null;
};

// Attempts a player spent on ONE mode — the "solved in N" number. Counts
// every slot charged against the cap: real hero guesses PLUS the hidden
// ones. Sound's skips already sit inside `guesses[]` (a SKIP_MARKER per
// skip), so they're counted there; Classic keeps hints in a separate
// `hintsUsed[]`, so we add both. Single source of truth for the result
// cards, the daily rollup (HomeContent), and the streak summary — and it
// matches the server-side guesses+hints total used for tiering, so the
// number a player sees on their card lines up with their daily rank.
export function modeAttempts(st: ModeProgress | null | undefined): number {
  const guesses = Array.isArray(st?.guesses) ? st.guesses.length : 0;
  const hints = Array.isArray(st?.hintsUsed) ? st.hintsUsed.length : 0;
  return guesses + hints;
}

// Sum of guesses + Classic hints across the 5 built modes, plus the
// loss penalty and bonus-question credit decimals. Lower is better.
// Lost modes contribute their full guess count (which is the cap when
// the player exhausted all attempts) PLUS LOSS_PENALTY so they sort
// strictly worse than a win at the same slot count. Classic bonus
// correct subtracts BONUS_QUESTION_CREDIT (the only win-quality
// signal in the daily total).
export function dailyTotal(
  modes: Partial<Record<ModeSlug, ModeProgress>>,
): number {
  let total = 0;
  for (const slug of Object.keys(CAPS) as ModeSlug[]) {
    if (slug === "map") continue; // not in BUILT_MODE_SLUGS
    const st = modes[slug];
    total += modeAttempts(st);
    if (st && st.won !== true) total += LOSS_PENALTY;
    if (st?.bonus?.correct === true) total -= BONUS_QUESTION_CREDIT;
  }
  return total;
}

// "Top X%" given a player's daily total and today's full sorted-ascending
// distribution. Definition: rank = 1 + (number of finishers strictly
// better, i.e. strictly *lower* total). Ties get the generous
// shared-top reading. topPercent = ceil(rank / N × 100), clamped to
// [1, 100] so we never display "Top 0%". Returns 100 when the
// distribution is empty.
//
// totals MUST be sorted ascending. lowerBound finds the index of the
// first total ≥ mine; everything before it is strictly less (better).
export function topPercent(
  total: number,
  totals: readonly number[],
): number {
  const n = totals.length;
  if (n === 0) return 100;
  const strictlyBetter = lowerBound(totals, total);
  const rank = strictlyBetter + 1;
  const pct = (rank / n) * 100;
  return Math.max(1, Math.min(100, Math.ceil(pct)));
}

// Map a "Top X%" reading to a tier band. T500 = top 1%, GM = top 10%,
// etc. The mapping is monotonic: a better (lower) percentile always
// yields a same-or-better tier.
export function tierForTopPercent(percent: number): Tier {
  if (percent <= TIER_PERCENTILE_MAX.top500) return "top500";
  if (percent <= TIER_PERCENTILE_MAX.grandmaster) return "grandmaster";
  if (percent <= TIER_PERCENTILE_MAX.diamond) return "diamond";
  if (percent <= TIER_PERCENTILE_MAX.platinum) return "platinum";
  if (percent <= TIER_PERCENTILE_MAX.gold) return "gold";
  if (percent <= TIER_PERCENTILE_MAX.silver) return "silver";
  return "bronze";
}

// Index of the first element ≥ target in a sorted-ascending array.
// Equivalent to "how many elements are strictly less than target".
function lowerBound(arr: readonly number[], target: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
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
