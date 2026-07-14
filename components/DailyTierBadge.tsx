"use client";

// Overwatch competitive rank badge shown on DailyCompletePanel summarizing
// the player's daily performance.
//
// Scoring is intentionally simple: each finisher's daily total = sum of
// guesses + Classic hints across all 5 modes. Lower is better. Tier is a
// percentile band of that ranking against today's all-5-modes finishers.
// No composite formula, no bonus weights — just raw count of slots used.
//
// Server returns the full sorted-ascending list of today's finisher
// totals (gated at ≥ 10 finishers). The client binary-searches its own
// total to derive "Top X%" + the matching tier band.
//
// Promote-only ratchet: the player's lowest-seen `topPercent` for the
// day is cached in localStorage. We never overwrite the cache with a
// worse number, so an early finisher who's "Top 4%" out of three other
// people won't see their rank decay to "Top 22%" when faster players
// land later. Player-friendly, slightly dishonest at the extremes.
//
// Gating: server omits `totals` when finishers < 10 (MIN_TIER_FINISHERS
// in the endpoint). Below that, this component renders nothing.

import { useEffect, useState } from "react";
import { dayString } from "@/lib/daily";
import { BUILT_MODE_SLUGS, type ModeSlug } from "@/lib/modes";
import { loadModeState } from "@/lib/storage";
import { useDailyStats } from "@/lib/stats";
import {
  dailyTotal,
  tierForTopPercent,
  topPercent as computeTopPercent,
  TIER_LABEL,
  type ModeProgress,
  type Tier,
} from "@/lib/tier";

const CACHE_KEY_PREFIX = "owdle.tier.";

type CachedRank = { topPercent: number };

function loadCachedRank(day: string): CachedRank | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY_PREFIX + day);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const tp = Number(parsed?.topPercent);
    if (!Number.isFinite(tp) || tp < 1 || tp > 100) return null;
    return { topPercent: tp };
  } catch {
    return null;
  }
}

function saveCachedRank(day: string, topPercent: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      CACHE_KEY_PREFIX + day,
      JSON.stringify({ topPercent }),
    );
  } catch {
    // ignore quota / private-mode errors — losing the cache just means
    // the next render recomputes from scratch.
  }
}

export function DailyTierBadge() {
  const stats = useDailyStats();
  const [view, setView] = useState<{ tier: Tier; topPercent: number } | null>(
    null,
  );

  useEffect(() => {
    const totals = stats?.daily.totals;
    if (!totals || totals.length === 0) {
      setView(null);
      return;
    }
    const day = dayString();

    // Pull this device's per-mode state. ConversationState (Quote) and
    // ModeState share the surface dailyTotal needs (guesses + hintsUsed).
    const modes: Partial<Record<ModeSlug, ModeProgress>> = {};
    for (const slug of BUILT_MODE_SLUGS) {
      modes[slug] = loadModeState(slug, day);
    }
    const total = dailyTotal(modes);
    const computed = computeTopPercent(total, totals);

    // Promote-only ratchet on topPercent. Lower number = better, so we
    // keep the cached value only when it's strictly lower than (or
    // equal to) the newly-computed reading. Tier is derived from the
    // displayed percent so they can't disagree.
    const cached = loadCachedRank(day);
    const displayed =
      cached && cached.topPercent <= computed ? cached.topPercent : computed;
    if (!cached || displayed < cached.topPercent) {
      saveCachedRank(day, displayed);
    }
    setView({ tier: tierForTopPercent(displayed), topPercent: displayed });
  }, [stats]);

  if (!view) return null;
  const { tier, topPercent } = view;

  return (
    <div
      className="relative flex flex-col items-center gap-2 border-y border-line py-4"
      aria-label={`Daily rank: ${TIER_LABEL[tier]}, top ${topPercent}%`}
    >
      <span className="utility-label text-[10px] text-info">
        Daily Rank
      </span>
      <img
        src={`/ranks/${tier}.png`}
        alt=""
        width={80}
        height={80}
        className="h-20 w-20 object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.45)]"
      />
      <span className="font-display text-2xl font-bold uppercase tracking-wide leading-none text-accent">
        {TIER_LABEL[tier]}
      </span>
      <span className="utility-label text-[10px] text-ink-faint">
        Top <span className="tabular-nums text-accent-soft">{topPercent}%</span>
        {" "}of today&apos;s finishers
      </span>
    </div>
  );
}
