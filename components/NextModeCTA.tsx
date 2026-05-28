"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  BUILT_MODE_SLUGS,
  nextUnfinishedMode,
  type ModeDef,
  type ModeSlug,
} from "@/lib/modes";
import { dayString } from "@/lib/daily";
import { loadModeState } from "@/lib/storage";
import { NextResetCountdown } from "./NextResetCountdown";
import { StreakBadge } from "./StreakBadge";
import { TryDeadlockleCard } from "./TryDeadlockleCard";
import { DailyStatsBand } from "./DailyStatsBand";
import { DailyTierBadge } from "./DailyTierBadge";

// Primary CTA shown after a mode is solved. Big, filled, with an animated
// arrow and entrance — the goal is for the player to immediately see that
// there is a next game in the daily set and tap straight through.
//
// Routing rule: walk canonical play order, skip already-finished modes
// (won or gave up), and recommend the first remaining one. If everything
// is done, the CTA flips to a "Daily Complete" link back home.
//
// We read all mode statuses synchronously in the initial state. This is
// safe because the parent only mounts NextModeCTA after its own effect
// has hydrated localStorage state, so we are guaranteed to be client-side
// here — the SSR/static prerender omits this component entirely.
export function NextModeCTA({
  current,
  scrollIntoViewOnMount = true,
}: {
  current: ModeSlug;
  scrollIntoViewOnMount?: boolean;
}) {
  const [data] = useState<{
    next: ModeDef | null;
    totalGuesses: number;
    roundGuesses: number;
  }>(() => {
    const day = dayString();
    const done = new Set<ModeSlug>();
    let totalGuesses = 0;
    let roundGuesses = 0;
    // Treat wins, losses, and legacy "Show answer" gives-up as finished
    // for routing: once the player is done with a mode (any outcome),
    // looping them back into it isn't helpful. They can still revisit
    // via the home grid if they want.
    for (const slug of BUILT_MODE_SLUGS) {
      const st = loadModeState(slug, day);
      if (st.won || st.lost || st.gaveUp) done.add(slug);
      // ConversationState (Quote) shares the same on-disk shape; .length
      // gives a usable per-mode count for both guess-array variants.
      const count = Array.isArray(st.guesses) ? st.guesses.length : 0;
      totalGuesses += count;
      if (slug === current) roundGuesses = count;
    }
    // Defensive: ensure the just-won mode is treated as done even if the
    // localStorage write hasn't been observed by this read yet.
    done.add(current);
    return {
      next: nextUnfinishedMode(current, done),
      totalGuesses,
      roundGuesses,
    };
  });
  const next = data.next;

  // After a win, the result card sits above an arbitrarily long guess
  // history. On long sessions the CTA can land below the fold without
  // any visible cue. Scrolling it into view on mount keeps the "next
  // game" affordance discoverable without forcing a sticky bar layout.
  // We delay one frame so the parent's win animation has a chance to
  // lock in its final layout height before we measure scroll position.
  // Quote opts out (scrollIntoViewOnMount=false): it scrolls the dialogue
  // to the top instead, so the replayable voice-line buttons stay in view.
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!scrollIntoViewOnMount) return;
    const id = window.requestAnimationFrame(() => {
      wrapRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => window.cancelAnimationFrame(id);
  }, [scrollIntoViewOnMount]);

  // Notify the FeedbackButton that a mode was just completed. On desktop
  // it re-scans for all-done amplification; on mobile it surfaces its
  // temporary sticky-footer popup. We dispatch on every NextModeCTA mount
  // (i.e., every win screen) rather than gating on all-done, since the
  // mobile popup is meant to fire after every completion. Same-tab
  // localStorage writes don't trigger the native `storage` event, so
  // this explicit signal is what drives both behaviours.
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("feedback:refresh"));
    }
  }, []);

  if (next === null) {
    return (
      <motion.div
        ref={wrapRef}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="block w-full max-w-xl"
      >
        <DailyCompletePanel
          modeCount={BUILT_MODE_SLUGS.length}
          totalGuesses={data.totalGuesses}
          roundGuesses={data.roundGuesses}
        />
      </motion.div>
    );
  }

  return (
    <motion.div
      ref={wrapRef}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="inline-block"
    >
      <Link
        href={`/${next.slug}/`}
        className="tile-shape group inline-flex items-center gap-3 bg-accent px-6 py-3 shadow-[0_0_24px_-8px_var(--accent)] transition-all hover:bg-accent-soft hover:shadow-[0_0_32px_-6px_var(--accent)] active:scale-[0.98]"
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-on-accent/75">
          Up Next
        </span>
        <span className="font-display text-base font-bold uppercase tracking-wide text-on-accent">
          {next.label}
        </span>
        <span
          aria-hidden
          className="font-display text-base text-on-accent transition-transform group-hover:translate-x-1"
        >
          →
        </span>
      </Link>
    </motion.div>
  );
}

// Shown inline when this is the last unfinished mode of the day. The
// player gets a round-by-round score recap, a 2:15am-Pacific reset
// countdown, and a sister-site nudge as their next-action prompt.
function DailyCompletePanel({
  modeCount,
  totalGuesses,
  roundGuesses,
}: {
  modeCount: number;
  totalGuesses: number;
  roundGuesses: number;
}) {
  // This panel always renders nested inside a green win card (or red
  // LossReveal), so it doesn't need its own border/background — that
  // would double up the green-on-green nesting. Padding stays minimal;
  // we lean on the parent card's p-4/p-5 for breathing room.
  return (
    <div data-daily-complete className="flex w-full flex-col gap-4">
      <div className="relative flex flex-col">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-correct">
          <span aria-hidden>✓</span>
          Daily Complete
        </div>

        {/* Score band: round vs total, tabular nums so digits don't jitter. */}
        <div className="mt-3 grid grid-cols-2 gap-3 border-y border-correct/25 py-3">
          <Stat
            label="This round"
            value={roundGuesses}
            unit={roundGuesses === 1 ? "guess" : "guesses"}
          />
          <Stat
            label={`Total across ${modeCount} ${modeCount === 1 ? "mode" : "modes"}`}
            value={totalGuesses}
            unit={totalGuesses === 1 ? "guess" : "guesses"}
          />
        </div>

        {/* Daily sweep stats — pulled from /api/stats/today, hides
            cleanly when the sample is too small. Renders as a single
            muted line so it doesn't compete visually with the score
            band's stat blocks. */}
        <DailyStatsBand />

        {/* Overwatch rank badge — shown when ≥ 10 finishers exist
            today (server omits tierCutoffs below that). Headlines the
            player's daily performance with the official OW rank icon
            for the percentile band their composite landed in. */}
        <div className="mt-3">
          <DailyTierBadge />
        </div>

        {/* Streak band — only renders when current > 0 (StreakBadge
            hides itself at 0). Sits between the score band and the
            "Next puzzle in" countdown so the cadence reads stats →
            rank → streak → time-to-next. */}
        <div className="mt-3">
          <StreakBadge variant="band" />
        </div>

        <div className="mt-3 flex flex-col items-center gap-1.5 border-b border-correct/25 pb-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-info">
            Next puzzle in
          </span>
          <div className="flex items-center gap-2.5">
            <LiveDot />
            <NextResetCountdown
              label=""
              className="font-display text-3xl font-semibold tabular-nums leading-none text-accent-soft sm:text-4xl"
            />
          </div>
          <span className="font-mono text-[9px] uppercase tracking-[0.28em] text-ink-faint">
            Refreshes at 2:15am Pacific
          </span>
        </div>

        <div className="mt-3 flex justify-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-info underline-offset-4 hover:underline"
          >
            ← Back to home
          </Link>
        </div>
      </div>

      {/* The player just cleared every mode for the day, so surfacing the
          sister site is the natural next-action prompt. Compact variant
          since this lives inside the max-w-md win card. */}
      <TryDeadlockleCard compact />
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
}: {
  label: string;
  value: number;
  unit: string;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <span className="font-mono text-[9px] uppercase tracking-[0.24em] text-ink-faint">
        {label}
      </span>
      <span className="mt-0.5 font-display text-2xl tabular-nums leading-none text-accent-soft sm:text-3xl">
        {value}
      </span>
      <span className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.24em] text-ink-faint">
        {unit}
      </span>
    </div>
  );
}

// Pulsing dot that visually anchors the countdown as something live.
function LiveDot() {
  return (
    <span className="relative inline-flex h-2.5 w-2.5 shrink-0" aria-hidden>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-correct opacity-70" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-correct" />
    </span>
  );
}
