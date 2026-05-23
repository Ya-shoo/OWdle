// Daily player-stats client wrapper. Fetches /api/stats/today once per
// page load and exposes typed accessors that hide cleanly when data
// is missing or sample size is below the display threshold.
//
// The display threshold (MIN_SAMPLE) deliberately stays low (10) so
// the stats line surfaces mid-morning rather than mid-evening at ~36
// peak DAU. The cost is wider noise (~±20pp at n=10), but the stat is
// approximate by design (5-min cache + distinct_id dedup), so cheap
// surfacing wins over precision. Result cards suppress the line when
// the relevant bucket is below threshold so under-sampled days look
// identical to pre-Phase-3 builds.

"use client";

import { useEffect, useState } from "react";
import { dayString } from "./daily";

export type StatsMode = "classic" | "quote" | "ability" | "splash" | "sound";

export type ModeBucket = {
  won: number;
  lost: number;
  gaveUp: number;
  total: number;
};

export type DailyBucket = {
  finishers: number;
  sweepers: number;
  // Distinct_ids who started ≥ 2 modes today (denominator for
  // finish-rate). Server-supplied; see functions/api/stats/today.ts.
  starters_ge2: number;
};

export type StatsResponse = {
  day: string;
  modes: Record<StatsMode, ModeBucket>;
  daily: DailyBucket;
};

// Hide percentages until at least this many players have completed the
// mode (or, for daily numbers, finished the day / started ≥2 modes).
const MIN_SAMPLE = 10;

// Per-tab cache so React doesn't refetch on every mode switch. Cleared
// implicitly on full page reload, which is also when 5-min server cache
// would have rolled the underlying response anyway.
let cached: StatsResponse | null = null;
let inflight: Promise<StatsResponse | null> | null = null;

async function fetchStats(day: string): Promise<StatsResponse | null> {
  if (cached && cached.day === day) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch(
        `/api/stats/today?day=${encodeURIComponent(day)}`,
      );
      if (!res.ok) return null;
      const parsed = (await res.json()) as StatsResponse;
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

// Hook for client components that want to surface daily stats. Returns
// null until the fetch resolves (and null permanently if it fails) so
// callers can safely render a fallback without flicker.
export function useDailyStats(): StatsResponse | null {
  const [stats, setStats] = useState<StatsResponse | null>(cached);
  useEffect(() => {
    if (cached) {
      setStats(cached);
      return;
    }
    let mounted = true;
    fetchStats(dayString()).then((s) => {
      if (mounted) setStats(s);
    });
    return () => {
      mounted = false;
    };
  }, []);
  return stats;
}

// Win-rate for a given mode, expressed as a percentage. Returns null
// when stats are missing or the sample is too small to be meaningful.
export function modeWinPercent(
  stats: StatsResponse | null,
  mode: StatsMode,
): { percent: number; total: number } | null {
  if (!stats) return null;
  const bucket = stats.modes[mode];
  if (!bucket || bucket.total < MIN_SAMPLE) return null;
  return {
    percent: Math.round((bucket.won / bucket.total) * 100),
    total: bucket.total,
  };
}

// Sweep rate among players who finished every mode today. Returns null
// when finisher count is below the display threshold. The sweep rate
// answers "what % of players who finished today's set swept all 5
// modes" — easier to interpret than absolute counts.
export function dailySweepPercent(
  stats: StatsResponse | null,
): { sweepPercent: number; finishers: number; sweepers: number } | null {
  if (!stats) return null;
  const { finishers, sweepers } = stats.daily;
  if (finishers < MIN_SAMPLE) return null;
  return {
    sweepPercent: Math.round((sweepers / finishers) * 100),
    finishers,
    sweepers,
  };
}

// Finish-rate: of players who committed to today's set (started ≥ 2
// distinct modes), what % finished every built mode. Single-mode
// tourists are excluded from the denominator on the server so the
// stat reads as "of people who actually played today, what % went
// the distance" rather than including drive-by sampling.
export function dailyFinishPercent(
  stats: StatsResponse | null,
): { percent: number; finishers: number; starters: number } | null {
  if (!stats) return null;
  const { finishers, starters_ge2 } = stats.daily;
  if (starters_ge2 < MIN_SAMPLE) return null;
  return {
    percent: Math.round((finishers / starters_ge2) * 100),
    finishers,
    starters: starters_ge2,
  };
}
