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

// Daily-progress indicator on the right side of the header, drawn as a
// payload escort run (the Workshop language): one checkpoint diamond per
// built mode — gold when won, red ✕ when lost (cap hit without a solve),
// hollow when open — with a tiny payload cart that rolls one stop per
// completion. The compact "X / N" readout summarizes completed modes
// (won + lost) for at-a-glance scoring.
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
        style={{ minWidth: 150 }}
      />
    );
  }

  const wonCount = statuses.filter((s) => s === "won").length;
  const lostCount = statuses.filter((s) => s === "lost").length;
  const doneCount = wonCount + lostCount;
  const total = statuses.length;
  const delivered = doneCount === total;

  // Payload position. Checkpoints sit at i/(total-1) along the rail; after
  // k completions the cart has rolled to the k-th checkpoint. Completion
  // count (not per-mode index) drives it, so out-of-order play still reads
  // as overall escort progress while each diamond keeps its own mode's
  // won/lost color.
  const cartPct =
    doneCount === 0 ? 0 : ((doneCount - 1) / (total - 1)) * 100;

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
          tally tick up at the moment a checkpoint fills, then fade away. */}
      <AnimatePresence>
        {flash && (
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="utility-label text-[10px] text-accent-soft sm:hidden"
          >
            {doneCount} / {total}
          </motion.span>
        )}
      </AnimatePresence>
      <span
        className={
          "utility-label hidden text-[10px] sm:inline " +
          (flash ? "counter-tick text-accent-soft" : "text-info")
        }
      >
        {doneCount} / {total}
      </span>
      {/* The payload run — the daily is an escort mission. One checkpoint
          diamond per canonical mode (gold when won, red ✕ when lost,
          hollow when open); the cart advances one stop per completion and
          the cleared rail lights up behind it — gold once all five are
          delivered, orange while the run is live. */}
      <div className="relative h-3.5 w-[108px] sm:w-[140px]">
        <span className="absolute left-0 right-0 top-1/2 h-[2px] -translate-y-1/2 bg-line" />
        <span
          className={
            "absolute left-0 top-1/2 h-[2px] -translate-y-1/2 transition-[width] duration-700 ease-[var(--ease-out)] " +
            (delivered ? "bg-gold" : "bg-accent")
          }
          style={{ width: doneCount === 0 ? 0 : `${cartPct}%` }}
        />
        {statuses.map((status, i) => (
          <span
            key={i}
            className={
              "absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center" +
              (i === justDone ? " dot-pop" : "")
            }
            style={{ left: `${(i / (total - 1)) * 100}%` }}
          >
            {status === "lost" ? (
              <svg viewBox="0 0 8 8" aria-hidden className="h-2 w-2 text-far">
                <path
                  d="M1.5 1.5 L6.5 6.5 M6.5 1.5 L1.5 6.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            ) : status === "won" ? (
              <span className="h-2 w-2 rotate-45 bg-gold" />
            ) : (
              <span className="h-2 w-2 rotate-45 border-[1.5px] border-line bg-canvas" />
            )}
          </span>
        ))}
        {/* The cart itself — rides ABOVE the rail (wheels kissing the line)
            so the checkpoint it's parked on stays visible beneath it, one
            stop per completed mode. Hidden until the first completion so a
            fresh day reads as "five empty checkpoints", not "a cart parked
            on an empty one". */}
        {doneCount > 0 && (
          <span
            aria-hidden
            className="absolute -top-[5px] -translate-x-1/2 transition-[left] duration-700 ease-[var(--ease-out)]"
            style={{ left: `${cartPct}%` }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14">
              <rect
                x="2"
                y="3.5"
                width="10"
                height="5.5"
                fill={delivered ? "var(--gold)" : "var(--accent)"}
              />
              <rect x="4" y="5" width="6" height="2.5" fill="var(--bg-base)" />
              <circle cx="4.5" cy="10.5" r="1.4" fill="var(--fg-subtle)" />
              <circle cx="9.5" cy="10.5" r="1.4" fill="var(--fg-subtle)" />
            </svg>
          </span>
        )}
      </div>
    </div>
  );
}
