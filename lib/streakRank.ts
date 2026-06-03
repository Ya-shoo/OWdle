// Current-streak → Overwatch competitive rank tier mapping. Powers the
// StreakRankBadge in the header and the StreakRankModal celebration.
//
// This is deliberately SEPARATE from lib/tier.ts. That module ranks a
// player's *daily performance* (guesses used today) and surfaces a "Daily
// Rank" badge. This one ranks how long their *streak* is and surfaces a
// "Streak Rank" badge. They reuse the same rank PNGs but mean different
// things, so they live in different modules and label themselves
// distinctly to avoid confusion.
//
// A streak tier is earned only when the player clears BOTH gates:
//   1. Percentile  — their current streak is in the top N% of the pool
//      (pool = distinct players who finished a daily in the last 30 days,
//      ranked by current streak; see functions/api/stats/streaks.ts).
//   2. Floor       — their current streak meets an absolute minimum.
// Net requirement per tier = max(percentile cutoff, floor). The floors
// bind while the app is young and top streaks are small (nobody should be
// "Top 500" at a 6-day streak just because they're #1 of a small pool);
// the percentile takes over once streaks grow past the floors.

// Top → bottom. Order matters: streakTierFor walks this list and returns
// the first (highest) tier the player clears.
export const STREAK_TIERS = ["top500", "champion", "grandmaster"] as const;

export type StreakTier = (typeof STREAK_TIERS)[number];

// Percentile band per tier (inclusive). top500 = top 1%, champion = top
// 5%, grandmaster = top 10%. Nothing below 10% earns a streak rank.
export const STREAK_TIER_PERCENTILE_MAX: Record<StreakTier, number> = {
  top500: 1,
  champion: 5,
  grandmaster: 10,
};

// Absolute minimum current streak (days) per tier. Yash spec. Prevents an
// un-prestigious rank when the pool is small or top streaks are still low.
export const STREAK_TIER_FLOOR: Record<StreakTier, number> = {
  top500: 15,
  champion: 10,
  grandmaster: 7,
};

// Display label per tier. "streaker" is appended in copy ("Top 500
// streaker") so the same PNG used by the Daily Rank badge can't be
// mistaken for daily performance.
export const STREAK_TIER_LABEL: Record<StreakTier, string> = {
  top500: "Top 500",
  champion: "Champion",
  grandmaster: "Grandmaster",
};

// UI accent per tier — the badge art's dominant hue. Used for glow washes
// and label tinting in the modal + share card so each rank reads with its
// own color identity (gold / violet / orange-red) rather than the single
// site accent.
export const STREAK_TIER_ACCENT: Record<StreakTier, string> = {
  top500: "#ffd86b",
  champion: "#c084fc",
  grandmaster: "#ff7a59",
};

// Streak value at each band's percentile cutoff, computed server-side from
// the pool's current-streak distribution. cutoffs.top500 is the streak at
// the 99th percentile (top-1% threshold), champion the 95th, grandmaster
// the 90th. A player whose current streak ≥ cutoffs.top500 is in the top
// 1% by streak length. Mirrors the sorted-distribution approach the daily
// tier badge uses, but pre-reduced to three cutoffs on the server since
// there are only three bands.
export type StreakCutoffs = {
  top500: number;
  champion: number;
  grandmaster: number;
};

// Minimum pool size (distinct players active in the trailing 30-day
// window) before streak ranks surface at all. Below this the percentile
// is too noisy to mean anything. The server omits cutoffs below this
// floor; this constant lets the client gate defensively too.
export const MIN_STREAK_POOL = 30;

// Highest streak tier the player qualifies for, or null if none.
// Requires the pool to be large enough, a positive current streak, and —
// per tier, top → down — that current streak clears BOTH the percentile
// cutoff and the absolute floor (i.e. current ≥ max(cutoff, floor)).
export function streakTierFor(
  current: number,
  cutoffs: StreakCutoffs | null | undefined,
  poolN: number,
): StreakTier | null {
  if (!cutoffs) return null;
  if (!Number.isFinite(poolN) || poolN < MIN_STREAK_POOL) return null;
  if (!Number.isFinite(current) || current <= 0) return null;
  for (const tier of STREAK_TIERS) {
    const need = Math.max(cutoffs[tier], STREAK_TIER_FLOOR[tier]);
    if (current >= need) return tier;
  }
  return null;
}

// Index in STREAK_TIERS. Lower = higher rank. Used by the promote-only
// ratchet so the celebration modal fires only when a player reaches a
// strictly higher tier than they've ever held.
export function streakTierRank(tier: StreakTier): number {
  return STREAK_TIERS.indexOf(tier);
}
