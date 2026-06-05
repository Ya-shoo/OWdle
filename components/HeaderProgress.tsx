"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { dayString } from "@/lib/daily";
import { loadModeState } from "@/lib/storage";
import { BUILT_MODE_SLUGS, type ModeSlug } from "@/lib/modes";
import { StreakRankBadge } from "./StreakRankBadge";

type ModeStatus = "won" | "lost" | "open";

const REFRESH_EVENT = "feedback:refresh";
// Dispatched by lib/tracking.ts trackModeCompleted exactly once per
// completion, with { mode, outcome } detail. Drives the celebration
// animation below — unlike REFRESH_EVENT it also covers the final mode
// of the day (where NextModeCTA never mounts) and tells us WHICH dot
// just earned its fill.
const COMPLETED_EVENT = "mode:completed";

// How long the completed dot wears its pop keyframe class.
const DOT_POP_MS = 700;
// How long the "X / N" counter stays force-visible on mobile after a
// completion before fading back out.
const COUNTER_FLASH_MS = 2500;

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
//
// Completion celebration: when `mode:completed` fires, the matching dot
// pops (scale up, settle) and the counter — normally desktop-only —
// flashes into view on mobile with the new tally. The point is to teach
// first-time players what the dots ARE at the exact moment one of them
// fills in: you finished one of five daily games, and the tracker in the
// chrome is keeping score. The completed mode's status comes from the
// event detail rather than localStorage so the animation can't race the
// persist of the state it celebrates.
function readStatus(slug: ModeSlug, day: string): ModeStatus {
  const st = loadModeState(slug, day);
  if (st.won) return "won";
  if (st.lost === true || st.gaveUp === true) return "lost";
  return "open";
}

export function HeaderProgress() {
  const [statuses, setStatuses] = useState<ModeStatus[] | null>(null);
  // Index of the dot currently wearing the pop animation, or null.
  const [justDone, setJustDone] = useState<number | null>(null);
  // Whether the counter is in its post-completion emphasis window.
  const [flash, setFlash] = useState(false);

  const refresh = useCallback(() => {
    const day = dayString();
    setStatuses(BUILT_MODE_SLUGS.map((slug) => readStatus(slug, day)));
  }, []);

  useEffect(() => {
    refresh();
    const onVis = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const onCompleted = (e: Event) => {
      const detail = (
        e as CustomEvent<{ mode?: string; outcome?: string }>
      ).detail;
      const idx = BUILT_MODE_SLUGS.indexOf(detail?.mode as ModeSlug);
      const day = dayString();
      setStatuses(
        BUILT_MODE_SLUGS.map((slug, i) => {
          // Overlay the just-completed mode from the event so the dot
          // fills even if its localStorage write lands after this event.
          if (i === idx) return detail?.outcome === "won" ? "won" : "lost";
          return readStatus(slug, day);
        }),
      );
      if (idx >= 0) {
        setJustDone(idx);
        setFlash(true);
      }
    };
    window.addEventListener(REFRESH_EVENT, refresh);
    window.addEventListener(COMPLETED_EVENT, onCompleted);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener(REFRESH_EVENT, refresh);
      window.removeEventListener(COMPLETED_EVENT, onCompleted);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);

  // Take the pop class off after its keyframe finishes so the next
  // completion's dot can re-trigger the animation cleanly.
  useEffect(() => {
    if (justDone === null) return;
    const t = window.setTimeout(() => setJustDone(null), DOT_POP_MS);
    return () => window.clearTimeout(t);
  }, [justDone]);

  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(false), COUNTER_FLASH_MS);
    return () => window.clearTimeout(t);
  }, [flash]);

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
      {/* Mobile twin of the counter — mounts only during the flash
          window so phones (where the readout is normally hidden) see the
          tally tick up at the moment a dot fills, then fade away. */}
      <AnimatePresence>
        {flash && (
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent-soft sm:hidden"
          >
            {doneCount} / {total}
          </motion.span>
        )}
      </AnimatePresence>
      <span
        className={
          "hidden font-mono text-[10px] uppercase tracking-[0.2em] sm:inline " +
          (flash ? "counter-tick text-accent-soft" : "text-info")
        }
      >
        {doneCount} / {total}
      </span>
      <div className="flex items-center gap-1.5">
        {statuses.map((status, i) => (
          <span
            key={i}
            className={
              "flex items-center justify-center" +
              (i === justDone ? " dot-pop" : "")
            }
          >
            {status === "lost" ? (
              <svg
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
            ) : (
              <span
                className={
                  status === "won"
                    ? "h-1.5 w-1.5 rounded-full bg-correct"
                    : "h-1.5 w-1.5 rounded-full bg-line"
                }
              />
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
