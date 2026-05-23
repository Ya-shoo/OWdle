"use client";

// Overwatch competitive rank badge shown on DailyCompletePanel summarizing
// the player's daily performance. Renders the official OW rank icon plus
// tier label, sitting between the score band and the streak band.
//
// Tier source: today's all-5-modes finisher distribution from
// /api/stats/today (tierCutoffs). The client computes its own composite
// from local mode states and maps to a tier via the cutoffs.
//
// Promote-only ratchet: tier is cached per-day in localStorage; we only
// ever overwrite the cache with a *higher* tier. This means an early
// finisher who's "T500" because they're one of three finishers won't
// see their badge demote to "Gold" when a wave of faster players land
// later — though they may get promoted if their relative standing
// improves. Player-friendly, slightly dishonest at the extremes.
//
// Gating: server omits tierCutoffs when finishers < 10 (MIN_TIER_FINISHERS
// in the endpoint). Below that, this component renders nothing.

import { useEffect, useState } from "react";
import { dayString } from "@/lib/daily";
import { BUILT_MODE_SLUGS, type ModeSlug } from "@/lib/modes";
import { loadModeState } from "@/lib/storage";
import { useDailyStats } from "@/lib/stats";
import {
  dailyComposite,
  tierForComposite,
  tierRank,
  TIER_LABEL,
  type ModeProgress,
  type Tier,
} from "@/lib/tier";

const CACHE_KEY_PREFIX = "owdle.tier.";

function loadCachedTier(day: string): Tier | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY_PREFIX + day);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.tier === "string" ? (parsed.tier as Tier) : null;
  } catch {
    return null;
  }
}

function saveCachedTier(day: string, tier: Tier): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      CACHE_KEY_PREFIX + day,
      JSON.stringify({ tier }),
    );
  } catch {
    // ignore quota / private-mode errors — losing the cache just means
    // the next render recomputes from scratch.
  }
}

export function DailyTierBadge() {
  const stats = useDailyStats();
  const [tier, setTier] = useState<Tier | null>(null);

  useEffect(() => {
    const cutoffs = stats?.daily.tierCutoffs;
    if (!cutoffs) {
      setTier(null);
      return;
    }
    const day = dayString();

    // Pull this device's per-mode state. ConversationState (Quote) and
    // ModeState share the surface `dailyComposite` needs (won + guesses).
    const modes: Partial<Record<ModeSlug, ModeProgress>> = {};
    for (const slug of BUILT_MODE_SLUGS) {
      modes[slug] = loadModeState(slug, day);
    }
    const composite = dailyComposite(modes);
    const computed = tierForComposite(composite, cutoffs);

    // Promote-only ratchet. Lower tierRank index = higher rank, so we
    // keep the cached value only when it is strictly better than or
    // equal to the newly-computed tier. Otherwise update the cache.
    const cached = loadCachedTier(day);
    if (cached && tierRank(cached) <= tierRank(computed)) {
      setTier(cached);
    } else {
      saveCachedTier(day, computed);
      setTier(computed);
    }
  }, [stats]);

  if (!tier) return null;

  return (
    <div
      className="relative flex flex-col items-center gap-2 border-y border-accent/25 py-4"
      aria-label={`Daily rank: ${TIER_LABEL[tier]}`}
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-info">
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
    </div>
  );
}
