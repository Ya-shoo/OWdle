"use client";

import { useCallback, useEffect, useState } from "react";
import { bumpStreakIfNeeded, type StreakState } from "@/lib/streak";

const REFRESH_EVENT = "feedback:refresh";

// Subscribes to the same `feedback:refresh` signal NextModeCTA already
// dispatches on every win/loss. Re-bumps on tab focus and visibility
// change so the badge stays correct after a day rollover or a cross-tab
// completion.
function useStreak(): StreakState | null {
  const [state, setState] = useState<StreakState | null>(null);

  const refresh = useCallback(() => {
    setState(bumpStreakIfNeeded());
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

  return state;
}

// Streak-specific: fill is hardcoded fire-red rather than currentColor so
// the flame keeps its identity even when the surrounding text color
// shifts between accent (active streak) and ink-faint (zero state).
function FlameIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden
      className="shrink-0"
      fill="#ef4444"
    >
      <path d="M13.5 1.5c0 3 1.5 4 3 6s2 4 2 6c0 4-3 7-6.5 7s-6.5-3-6.5-7c0-2 1-3.5 2-4.5 0 2 1 2.5 2 1.5 0-1.5 0-3 1-4.5 1-1.5 2-2.5 3-5z" />
    </svg>
  );
}

type Variant = "header" | "hero" | "band" | "inline";

export function StreakBadge({ variant }: { variant: Variant }) {
  const streak = useStreak();
  // Hero and band variants only render inside post-completion contexts
  // (DailyCompleteHero / DailyCompletePanel), where bumpStreakIfNeeded
  // has already pushed current to ≥ 1. Hide them otherwise — a "0"
  // badge inside a daily-complete celebration would read as a regression.
  if (!streak && variant !== "header") return null;
  if (streak && streak.current === 0 && variant !== "header") return null;

  // Header treatment: bare flame + count, no chrome. Faded ink for the
  // pre-streak state so new visitors see what they're aiming at without
  // it dominating; accent amber once they're on a run.
  if (variant === "header") {
    if (!streak) {
      // Hold layout space during hydration so the header doesn't jump.
      return (
        <span
          aria-hidden
          className="inline-flex items-center gap-1.5 leading-none opacity-0"
        >
          <FlameIcon size={18} />
          <span className="font-sans text-lg font-bold tabular-nums">0</span>
        </span>
      );
    }
    if (streak.current === 0) {
      return (
        <span
          className="inline-flex items-center gap-1.5 leading-none text-ink-faint opacity-70 transition-opacity hover:opacity-100"
          title="Finish every mode today to start a streak"
          aria-label="No active streak. Finish every mode today to start one."
        >
          <FlameIcon size={18} />
          <span className="font-sans text-lg font-bold tabular-nums">0</span>
        </span>
      );
    }
    const title = `${streak.current}-day streak${
      streak.longest > streak.current ? ` (best: ${streak.longest})` : ""
    }`;
    return (
      <span
        className="inline-flex items-center gap-1.5 leading-none text-accent"
        title={title}
        aria-label={title}
      >
        <FlameIcon size={18} />
        <span className="font-sans text-lg font-bold tabular-nums">
          {streak.current}
        </span>
      </span>
    );
  }

  // Past the header branch, streak is guaranteed non-null with current > 0.
  if (!streak) return null;
  const title = `${streak.current}-day streak${
    streak.longest > streak.current ? ` (best: ${streak.longest})` : ""
  }`;

  if (variant === "hero") {
    return (
      <div
        className="mt-6 inline-flex items-center gap-3 border border-accent/40 bg-accent/5 px-4 py-2.5 text-accent"
        aria-label={title}
      >
        <FlameIcon size={20} />
        <div className="text-left leading-none">
          <div className="font-sans text-lg font-semibold">
            <span className="tabular-nums">{streak.current}</span>-day streak
          </div>
          {streak.longest > streak.current && (
            <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">
              Best: <span className="tabular-nums">{streak.longest}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // inline — chrome-less stat cell. No borders / padding, so a caller
  // can place it side-by-side with another stat inside a shared band
  // (DailyCompleteResultCard uses this to sit streak next to the total-
  // guesses figure inside one row instead of two stacked bands).
  if (variant === "inline") {
    return (
      <div
        className="flex flex-col items-center gap-1 text-center"
        aria-label={title}
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink-faint">
          Streak
        </span>
        <div className="flex items-baseline gap-2 text-accent">
          <FlameIcon size={20} />
          <span className="font-display text-3xl font-extrabold tabular-nums leading-none sm:text-4xl">
            {streak.current}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-faint">
            {streak.current === 1 ? "day" : "days"}
          </span>
        </div>
        {streak.longest > streak.current && (
          <span className="font-mono text-[9px] uppercase tracking-[0.24em] text-ink-faint">
            Best: <span className="tabular-nums">{streak.longest}</span>
          </span>
        )}
      </div>
    );
  }

  // band — matches the rhythm of the "Next puzzle in" band in
  // DailyCompletePanel. Borders use accent (amber) instead of correct
  // (green) so it reads as its own streak-section, not part of the
  // panel's green completion chrome.
  return (
    <div
      className="relative flex flex-col items-center gap-2 border-y border-accent/25 py-3"
      aria-label={title}
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-info">
        Streak
      </span>
      <div className="flex items-baseline gap-3 text-accent">
        <FlameIcon size={22} />
        <span className="font-sans text-3xl font-bold tabular-nums leading-none">
          {streak.current}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-faint">
          {streak.current === 1 ? "day" : "days"}
        </span>
      </div>
      {streak.longest > streak.current && (
        <span className="font-mono text-[9px] uppercase tracking-[0.28em] text-ink-faint">
          Best: <span className="tabular-nums">{streak.longest}</span>
        </span>
      )}
    </div>
  );
}
