// Client wrapper for /api/stats/streaks — the rolling-30-day current-streak
// distribution used to rank a player's streak against the active userbase.
//
// Mirrors lib/stats.ts:useDailyStats: one fetch per page load, per-tab
// cached, returns null until resolved (and null permanently on failure)
// so the StreakRankBadge can render nothing without flicker. Distinct
// endpoint + cache from the daily stats because this window is a rolling
// 30 days, not a single Pacific puzzle day.

"use client";

import { useEffect, useState } from "react";
import type { StreakCutoffs } from "./streakRank";

export type StreakStatsResponse = {
  // Distinct players who finished a daily in the trailing 30-day window.
  n: number;
  // Streak cutoffs at the 99th / 95th / 90th percentile. Null when the
  // pool is below the server's display floor (so the badge stays hidden).
  cutoffs: StreakCutoffs | null;
};

// Module-scope cache: the distribution shifts slowly (a player gains at
// most one streak-day per real day), so a single fetch per page load is
// plenty. The server adds a ~1h CDN cache on top.
let cached: StreakStatsResponse | null = null;
let inflight: Promise<StreakStatsResponse | null> | null = null;

async function fetchStreakStats(): Promise<StreakStatsResponse | null> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch("/api/stats/streaks");
      if (!res.ok) return null;
      const parsed = (await res.json()) as StreakStatsResponse;
      cached = parsed;
      return parsed;
    } catch {
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function useStreakStats(): StreakStatsResponse | null {
  const [stats, setStats] = useState<StreakStatsResponse | null>(cached);
  useEffect(() => {
    if (cached) {
      setStats(cached);
      return;
    }
    let mounted = true;
    fetchStreakStats().then((s) => {
      if (mounted) setStats(s);
    });
    return () => {
      mounted = false;
    };
  }, []);
  return stats;
}
