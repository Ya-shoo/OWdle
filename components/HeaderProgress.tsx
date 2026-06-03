"use client";

import { useCallback, useEffect, useState } from "react";
import { dayString } from "@/lib/daily";
import { loadModeState } from "@/lib/storage";
import { BUILT_MODE_SLUGS } from "@/lib/modes";
import { StreakRankBadge } from "./StreakRankBadge";

type ModeStatus = "won" | "lost" | "open";

const REFRESH_EVENT = "feedback:refresh";

// Tiny daily-progress indicator on the right side of the header. One
// dot per built mode: green when won, bright red when lost (cap hit
// without a solve), neutral hairline when not yet finished. The compact
// "X / N" readout summarizes completed modes (won + lost) for
// at-a-glance scoring.
//
// The Header is rendered at the layout level and doesn't re-mount during
// in-app navigation, so we subscribe to the same `feedback:refresh`
// signal NextModeCTA dispatches on every win/loss — plus focus and
// visibility — so the dots stay in lockstep with localStorage without
// a full page reload.
export function HeaderProgress() {
  const [statuses, setStatuses] = useState<ModeStatus[] | null>(null);

  const refresh = useCallback(() => {
    const day = dayString();
    setStatuses(
      BUILT_MODE_SLUGS.map((slug) => {
        const st = loadModeState(slug, day);
        if (st.won) return "won";
        if (st.lost === true || st.gaveUp === true) return "lost";
        return "open";
      }),
    );
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

  if (!statuses) {
    return (
      <div
        aria-hidden
        className="flex items-center gap-1.5 opacity-0"
        style={{ minWidth: BUILT_MODE_SLUGS.length * 14 }}
      />
    );
  }

  const wonCount = statuses.filter((s) => s === "won").length;
  const lostCount = statuses.filter((s) => s === "lost").length;
  const doneCount = wonCount + lostCount;
  const total = statuses.length;

  const title = `${wonCount} won · ${lostCount} lost · ${total - doneCount} left`;

  return (
    <div
      className="flex items-center gap-3 sm:gap-4"
      title={title}
      aria-label={title}
    >
      <StreakRankBadge />
      <span className="hidden font-mono text-[10px] uppercase tracking-[0.2em] text-info sm:inline">
        {doneCount} / {total}
      </span>
      <div className="flex items-center gap-1.5">
        {statuses.map((status, i) => {
          if (status === "lost") {
            return (
              <svg
                key={i}
                viewBox="0 0 8 8"
                aria-hidden
                className="h-2 w-2 text-far"
              >
                <path
                  d="M1.5 1.5 L6.5 6.5 M6.5 1.5 L1.5 6.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            );
          }
          return (
            <span
              key={i}
              className={
                status === "won"
                  ? "h-1.5 w-1.5 rounded-full bg-correct"
                  : "h-1.5 w-1.5 rounded-full bg-line"
              }
            />
          );
        })}
      </div>
    </div>
  );
}
