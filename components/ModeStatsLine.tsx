"use client";

// Muted "X% solved today's <Mode>" line shown on per-mode result cards
// (both win and loss). Renders nothing when no stats are available yet
// (cold cache, missing PostHog secrets, or sample size below the
// display threshold). Pulls from /api/stats/today via lib/stats.

import {
  modeWinPercent,
  useDailyStats,
  type StatsMode,
} from "@/lib/stats";

const MODE_LABEL: Record<StatsMode, string> = {
  classic: "Classic",
  quote: "Quote",
  ability: "Ability",
  splash: "Spotlight",
  sound: "Sound",
  melee: "Melee",
};

export function ModeStatsLine({
  mode,
  className,
}: {
  mode: StatsMode;
  className?: string;
}) {
  const stats = useDailyStats();
  const win = modeWinPercent(stats, mode);
  if (!win) return null;
  return (
    <p
      className={
        className ??
        "utility-label mt-1 text-[10px] text-ink-faint"
      }
    >
      {win.percent}% solved today&apos;s {MODE_LABEL[mode]}
    </p>
  );
}
