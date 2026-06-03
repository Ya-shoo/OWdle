"use client";

import { useCallback, useEffect, useState } from "react";
import { bumpStreakIfNeeded } from "@/lib/streak";
import { useStreakStats } from "@/lib/streakStats";
import {
  STREAK_TIERS,
  STREAK_TIER_LABEL,
  streakTierFor,
  streakTierRank,
  type StreakTier,
} from "@/lib/streakRank";
import { trackStreakRankPromoted } from "@/lib/tracking";
import { StreakBadge } from "./StreakBadge";
import { StreakRankModal } from "./StreakRankModal";

const REFRESH_EVENT = "feedback:refresh";

// Persistent (not per-day) ratchet of the best streak tier ever reached, so
// the celebration only fires on a genuine promotion to a higher tier.
const BEST_KEY = "owdle.streakRank.best";

function readBest(): StreakTier | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(BEST_KEY);
    return v && (STREAK_TIERS as readonly string[]).includes(v)
      ? (v as StreakTier)
      : null;
  } catch {
    return null;
  }
}

function writeBest(t: StreakTier): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BEST_KEY, t);
  } catch {
    // ignore quota / private-mode errors
  }
}

// Current streak, kept in lockstep with localStorage via the same
// feedback:refresh / focus / visibility signals StreakBadge subscribes to,
// so the rank updates the instant the day's last mode completes.
function useCurrentStreak(): number {
  const [current, setCurrent] = useState(0);
  const refresh = useCallback(() => {
    setCurrent(bumpStreakIfNeeded().current);
  }, []);
  useEffect(() => {
    refresh();
    const onVis = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener(REFRESH_EVENT, refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener(REFRESH_EVENT, refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);
  return current;
}

// Header streak-rank badge + promotion watcher. Computes the player's
// streak tier from their current streak and the rolling-30-day cutoffs,
// renders a compact pill in the header (desktop only for now — mobile
// placement TBD), and auto-opens the celebration modal the first time they
// reach a new, higher tier. The component stays mounted in the Header even
// when no tier is earned (rendering nothing), so the watcher keeps running.
export function StreakRankBadge() {
  const current = useCurrentStreak();
  const stats = useStreakStats();
  const [modalOpen, setModalOpen] = useState(false);

  const tier =
    stats && stats.cutoffs
      ? streakTierFor(current, stats.cutoffs, stats.n)
      : null;

  // Promotion watcher: fire once per newly-reached higher tier. The ratchet
  // makes this a no-op once the player has already celebrated that tier (or
  // a better one), so it won't re-pop on reload or navigation.
  useEffect(() => {
    if (!stats || !stats.cutoffs) return;
    const t = streakTierFor(current, stats.cutoffs, stats.n);
    if (!t) return;
    const best = readBest();
    if (best == null || streakTierRank(t) < streakTierRank(best)) {
      writeBest(t);
      setModalOpen(true);
      trackStreakRankPromoted({ tier: t, streak: current, poolN: stats.n });
    }
  }, [current, stats]);

  return (
    <>
      {tier ? (
        <>
          {/* Mobile keeps the plain flame + count (the rank pill is
              desktop-only for now); desktop shows the combined pill. */}
          <span className="sm:hidden">
            <StreakBadge variant="header" />
          </span>
          <StreakRankPill
            tier={tier}
            streak={current}
            onClick={() => setModalOpen(true)}
          />
        </>
      ) : (
        <StreakBadge variant="header" />
      )}
      {modalOpen && tier && (
        <StreakRankModal
          tier={tier}
          streak={current}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}

// Presentational header pill. Exported so the dev preview can render it
// without the data/effect machinery. Desktop-only (`hidden sm:inline-flex`)
// until mobile placement is decided.
// Combined header pill for ranked players: flame + streak count │ rank
// badge + title, all in one. Exported so the dev preview can render it
// without the data/effect machinery. Desktop-only (`hidden sm:inline-flex`)
// until mobile placement is decided.
export function StreakRankPill({
  tier,
  streak,
  onClick,
}: {
  tier: StreakTier;
  streak: number;
  onClick?: () => void;
}) {
  const label = STREAK_TIER_LABEL[tier];
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${streak}-day streak · Streak Rank: ${label} · tap to share`}
      aria-label={`${streak} day streak. Streak rank: ${label}. Open to share.`}
      className="hidden items-center gap-2 rounded-full border border-accent/40 bg-accent/5 px-2.5 py-1 text-accent transition-colors hover:border-accent hover:bg-accent/10 sm:inline-flex"
    >
      <FlamePip size={16} />
      <span className="font-sans text-sm font-bold tabular-nums leading-none">
        {streak}
      </span>
      <span aria-hidden className="h-3.5 w-px bg-accent/30" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/ranks/${tier}.png`}
        alt=""
        width={22}
        height={22}
        style={{ width: 22, height: 22 }}
        className="object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)]"
      />
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em]">
        {label}
      </span>
    </button>
  );
}

// Red fire glyph matching StreakBadge's flame identity (hardcoded fill so
// it stays red regardless of the surrounding accent text color).
function FlamePip({ size = 16 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden
      fill="#ef4444"
      className="shrink-0"
    >
      <path d="M13.5 1.5c0 3 1.5 4 3 6s2 4 2 6c0 4-3 7-6.5 7s-6.5-3-6.5-7c0-2 1-3.5 2-4.5 0 2 1 2.5 2 1.5 0-1.5 0-3 1-4.5 1-1.5 2-2.5 3-5z" />
    </svg>
  );
}
