"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  BUILT_MODE_SLUGS,
  MODES,
  nextUnfinishedMode,
  type ModeDef,
  type ModeSlug,
} from "@/lib/modes";
import { dayString } from "@/lib/daily";
import { isFirstDay, loadModeState } from "@/lib/storage";
import { trackNextModeCta } from "@/lib/tracking";
import { ModeGlyph } from "./ModeGlyph";
import { NextResetCountdown } from "./NextResetCountdown";

// Post-completion "next mode" block, shown after a mode is solved or
// lost. Three stacked pieces (Loldle-style):
//
//   1. Next-mode card — accent-bordered banner with the mode's glyph
//      and name. The whole card is the tap-through button.
//   2. Auto-advance strip (first-day players only — see below).
//   3. Progress track — every built mode as a glyph node on a hairline
//      rail: green ✓ badge when won, red ✕ when lost, accent glow on
//      the recommended next mode, muted for the rest. Each node links
//      to its mode, so the track doubles as quick nav while teaching
//      the five-game daily structure at the exact moment one fills in.
//
// Routing rule: walk canonical play order, skip already-finished modes
// (won or gave up), and recommend the first remaining one. When everything
// is done we render nothing — the parent game has already detected that
// state via isDailyComplete() and is rendering DailyCompleteResultCard
// in place of the per-mode result card, which owns the back-to-home
// affordance, share button, and countdown.
//
// Auto-advance: on a player's FIRST day ever (no prior-day localStorage
// trace — see isFirstDay), a short countdown navigates to the next mode
// by itself: 4s after a win, 5s after a loss (the answer reveal needs a
// beat longer to land). Replay data showed first-timers are the only
// cohort that doesn't know the five-mode daily structure exists;
// returning players continue at ~96% on their own, so they never see the
// countdown. The clock only starts once the block is actually visible,
// and any real gesture — pointer down outside the block, wheel, touch
// scroll, a key press, or the explicit "stay here" link — cancels it:
// auto-advance carries the passive player, while anyone engaging with
// their result has opted out by acting. A per-mode/day marker makes the
// countdown once-per-completion, so reloading or back-navigating to a
// finished mode never re-yanks.
//
// We read all mode statuses synchronously in the initial state. This is
// safe because the parent only mounts NextModeCTA after its own effect
// has hydrated localStorage state, so we are guaranteed to be client-side
// here — the SSR/static prerender omits this component entirely.

const WIN_FUSE_MS = 4000;
const LOSS_FUSE_MS = 5000;
// Beat between the block entering the viewport and the clock starting, so
// the scroll gesture that revealed it can finish without instantly
// cancelling the countdown it just triggered.
const ARM_GRACE_MS = 300;

type Phase = "armed" | "counting" | "off";
type CancelGesture = "touch" | "scroll" | "tap" | "key" | "stay";
type ModeOutcome = "won" | "lost" | "open";

function autoAdvanceMarkerKey(mode: ModeSlug, day: string): string {
  return `owdle.autoadv.${mode}.${day}`;
}

export function NextModeCTA({
  current,
  scrollIntoViewOnMount = true,
  context = "win",
}: {
  current: ModeSlug;
  scrollIntoViewOnMount?: boolean;
  // Which result screen hosts this CTA. Sets the just-finished mode's
  // badge on the progress track (✓ vs ✕) and the auto-advance fuse
  // length — losses get an extra second so the answer reveal can land.
  context?: "win" | "loss";
}) {
  const router = useRouter();

  const [init] = useState<{
    next: ModeDef | null;
    status: Map<ModeSlug, ModeOutcome>;
  }>(() => {
    const day = dayString();
    const status = new Map<ModeSlug, ModeOutcome>();
    for (const slug of BUILT_MODE_SLUGS) {
      const st = loadModeState(slug, day);
      status.set(
        slug,
        st.won ? "won" : st.lost || st.gaveUp ? "lost" : "open",
      );
    }
    // Defensive: the just-finished mode is terminal even if its
    // localStorage write hasn't been observed by this read yet. The
    // hosting result screen tells us which way it ended.
    status.set(current, context === "loss" ? "lost" : "won");
    const done = new Set<ModeSlug>(
      [...status].filter(([, s]) => s !== "open").map(([slug]) => slug),
    );
    return { next: nextUnfinishedMode(current, done), status };
  });
  const next = init.next;

  // First-day detection happens once per mount; the answer can't change
  // mid-session (today's keys don't count, only prior days').
  const [firstDay] = useState<boolean>(
    () => typeof window !== "undefined" && isFirstDay(dayString()),
  );

  const [phase, setPhase] = useState<Phase>(() => {
    if (!firstDay || next === null) return "off";
    // Once per completion: a reload of (or back-navigation to) an
    // already-finished mode must not re-run the countdown.
    try {
      const marker = window.localStorage.getItem(
        autoAdvanceMarkerKey(current, dayString()),
      );
      if (marker === "1") return "off";
    } catch {
      return "off";
    }
    return "armed";
  });

  const fuseMs = context === "loss" ? LOSS_FUSE_MS : WIN_FUSE_MS;
  // Countdown bookkeeping lives in refs — the rAF loop reads/writes these
  // every frame and only `secondsLeft` (display) needs to re-render.
  // firedRef / cancelledRef / shownRef are set synchronously so two
  // gestures (or a gesture racing the timer) in the same tick can't
  // double-navigate or double-track.
  const remainingRef = useRef(fuseMs);
  const deadlineRef = useRef(0);
  const firedRef = useRef(false);
  const cancelledRef = useRef(false);
  const shownRef = useRef(false);
  const barRef = useRef<HTMLDivElement>(null);
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(fuseMs / 1000));

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

  const doCancel = useCallback(
    (gesture: CancelGesture) => {
      if (firedRef.current || cancelledRef.current) return;
      cancelledRef.current = true;
      setPhase("off");
      // "shown" only fires once counting starts, so skip the funnel event
      // for a cancel that lands inside the arming grace window.
      if (shownRef.current && next !== null) {
        trackNextModeCta({
          action: "cancelled",
          fromMode: current,
          toMode: next.slug,
          context,
          firstDay: true,
          cancelGesture: gesture,
        });
      }
    },
    [context, current, next],
  );

  // Arm → counting: wait until the block is actually visible. The result
  // card auto-scrolls itself into view after a win, but Quote opts out of
  // that, and on long guess histories the CTA can start below the fold —
  // an invisible countdown that navigates away would read as a glitch,
  // so visibility is the trigger no matter how the block gets there.
  useEffect(() => {
    if (phase !== "armed" || next === null) return;
    const el = wrapRef.current;
    if (el === null) return;
    let graceTimer: number | undefined;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        graceTimer = window.setTimeout(
          () => setPhase("counting"),
          ARM_GRACE_MS,
        );
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (graceTimer !== undefined) window.clearTimeout(graceTimer);
    };
  }, [phase, next]);

  // The countdown clock. rAF-driven with an absolute deadline (immune to
  // the global prefers-reduced-motion CSS clamp, smooth at any frame
  // rate), paused while the tab is hidden so a backgrounded player isn't
  // navigated behind their back. Gesture listeners are window-level
  // capture so nothing in the page can swallow them first.
  useEffect(() => {
    if (phase !== "counting" || next === null) return;

    try {
      window.localStorage.setItem(
        autoAdvanceMarkerKey(current, dayString()),
        "1",
      );
    } catch {
      // ignore — worst case a reload shows the countdown once more
    }
    if (!shownRef.current) {
      shownRef.current = true;
      trackNextModeCta({
        action: "shown",
        fromMode: current,
        toMode: next.slug,
        context,
        firstDay: true,
      });
    }

    let paused = document.visibilityState === "hidden";
    deadlineRef.current = performance.now() + remainingRef.current;
    let raf = 0;

    const fire = () => {
      if (firedRef.current) return;
      firedRef.current = true;
      trackNextModeCta({
        action: "auto_fired",
        fromMode: current,
        toMode: next.slug,
        context,
        firstDay: true,
      });
      router.push(`/${next.slug}/`);
    };

    const tick = (now: number) => {
      if (!paused) {
        const remaining = Math.max(0, deadlineRef.current - now);
        remainingRef.current = remaining;
        if (barRef.current) {
          barRef.current.style.transform = `scaleX(${1 - remaining / fuseMs})`;
        }
        setSecondsLeft((prev) => {
          const s = Math.ceil(remaining / 1000);
          return s === prev ? prev : s;
        });
        if (remaining <= 0) {
          fire();
          return; // stop the loop; navigation unmounts us
        }
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);

    const onPointerDown = (e: PointerEvent) => {
      // Taps inside the block are either a nav link or the stay-here
      // button — both handle themselves.
      const wrap = wrapRef.current;
      if (wrap && e.target instanceof Node && wrap.contains(e.target)) return;
      doCancel("tap");
    };
    const onWheel = () => doCancel("scroll");
    const onTouchMove = () => doCancel("touch");
    const onKeyDown = () => doCancel("key");
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        paused = true;
        remainingRef.current = Math.max(
          0,
          deadlineRef.current - performance.now(),
        );
      } else {
        paused = false;
        deadlineRef.current = performance.now() + remainingRef.current;
      }
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("wheel", onWheel, {
      capture: true,
      passive: true,
    });
    window.addEventListener("touchmove", onTouchMove, {
      capture: true,
      passive: true,
    });
    window.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("wheel", onWheel, true);
      window.removeEventListener("touchmove", onTouchMove, true);
      window.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [phase, next, context, current, fuseMs, router, doCancel]);

  if (next === null) {
    // Daily-complete state is handled by DailyCompleteResultCard up the
    // tree. Render nothing here so we don't double up the back-to-home
    // affordance or the score recap.
    return null;
  }

  const showCountdown = phase === "armed" || phase === "counting";

  // Any manual navigation out of the block: stop a pending auto-fire from
  // racing it, and attribute the click (first_day separates the cohorts).
  const makeNavClick = (toSlug: string) => () => {
    firedRef.current = true;
    trackNextModeCta({
      action: "clicked",
      fromMode: current,
      toMode: toSlug,
      context,
      firstDay,
    });
  };

  const stripModes = MODES.filter((m) => m.built);

  return (
    <>
    <motion.div
      ref={wrapRef}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="w-full max-w-sm"
    >
      <div className="flex w-full flex-col items-center gap-3">
        {/* Next-mode card — the prominent tap-through. Glyph chip pops
            in filled accent beside the mode name. */}
        <Link
          href={`/${next.slug}/`}
          onClick={makeNavClick(next.slug)}
          className="group flex w-full items-center gap-3 rounded-(--radius-card) border border-accent/50 bg-accent/10 p-3 pr-4 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.35)] transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-accent hover:bg-accent/15 active:scale-[0.99]"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent shadow-[0_0_10px_-2px_var(--accent)]">
            <ModeGlyph slug={next.slug} className="h-6 w-6" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-1 text-left">
            <span className="font-mono text-[9px] uppercase tracking-[0.24em] text-accent-soft">
              Up next
            </span>
            <span className="font-display text-xl font-bold uppercase leading-none tracking-wide text-ink">
              {next.label}
            </span>
          </span>
          <span
            aria-hidden
            className="shrink-0 font-display text-lg text-accent transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-0.5"
          >
            →
          </span>
        </Link>

        {/* Auto-advance strip — first-day players only. */}
        {showCountdown && (
          <div className="flex w-full items-center gap-3 px-1">
            <div
              className="h-1 flex-1 overflow-hidden rounded-full bg-line"
              aria-hidden
            >
              <div
                ref={barRef}
                className="h-full w-full origin-left bg-accent"
                style={{ transform: "scaleX(0)" }}
              />
            </div>
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-faint">
              in {secondsLeft}s…
            </span>
            <button
              type="button"
              onClick={() => doCancel("stay")}
              className="shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint underline-offset-4 transition-colors hover:text-ink hover:underline"
            >
              stay here
            </button>
          </div>
        )}

        {/* Progress track — every built mode on a hairline rail. The
            just-finished mode renders as a static "you are here" node;
            the rest link straight to their pages. */}
        <div className="relative flex w-full items-center justify-between px-1 pt-1">
          <span
            aria-hidden
            className="absolute left-5 right-5 top-1/2 h-px -translate-y-1/2 bg-line"
          />
          {stripModes.map((m) => {
            const outcome = init.status.get(m.slug) ?? "open";
            const isNext = m.slug === next.slug;
            const isCurrent = m.slug === current;
            const nodeClass =
              // group/node scopes the hover so each node only reveals its
              // own label; the scale pop carries the label up with it.
              "group/node relative z-10 flex h-10 w-10 items-center justify-center rounded-full border bg-canvas transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.2] " +
              (outcome === "won"
                ? "border-correct/60 text-correct"
                : outcome === "lost"
                  ? "border-wrong/50 text-wrong"
                  : isNext
                    ? "border-accent text-accent shadow-[0_0_10px_-2px_var(--accent)]"
                    : "border-line text-ink-faint hover:border-edge hover:text-ink-soft");
            const badge =
              outcome === "won" ? (
                <NodeBadge kind="won" />
              ) : outcome === "lost" ? (
                <NodeBadge kind="lost" />
              ) : null;
            const label =
              m.label +
              (outcome === "won"
                ? " — solved"
                : outcome === "lost"
                  ? " — missed"
                  : isNext
                    ? " — up next"
                    : "");
            const inner = (
              <>
                <ModeGlyph slug={m.slug} className="h-5 w-5" />
                {badge}
                {/* Hover/focus label — names the mode without waiting on
                    the native title-tooltip delay. */}
                <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-sm border border-line bg-canvas px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-ink opacity-0 transition-opacity duration-150 group-hover/node:opacity-100 group-focus-visible/node:opacity-100">
                  {m.label}
                </span>
              </>
            );
            return isCurrent ? (
              <span key={m.slug} className={nodeClass} aria-label={label}>
                {inner}
              </span>
            ) : (
              <Link
                key={m.slug}
                href={`/${m.slug}/`}
                onClick={makeNavClick(m.slug)}
                className={nodeClass}
                aria-label={label}
              >
                {inner}
              </Link>
            );
          })}
        </div>
      </div>
    </motion.div>

    {/* "Next puzzle in" reset countdown. Every host renders this
        component inside the same `flex flex-wrap` action row with the
        ShareButton as a later sibling — `order-last` + w-full slots
        this line BELOW the share button visually without touching the
        six call sites. Disappears with the rest of the block on the
        final mode, where DailyCompleteResultCard owns its own (larger)
        countdown moment. */}
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.45, delay: 0.35 }}
      className="order-last flex w-full flex-col items-center gap-1 pt-2"
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-info">
        Next puzzle in
      </span>
      <NextResetCountdown
        label=""
        className="font-display text-2xl font-bold tabular-nums leading-none text-accent-soft"
      />
    </motion.div>
    </>
  );
}

// Small ✓ / ✕ status badge pinned to a track node's corner, ringed in
// the page background so it reads as sitting on top of the circle.
function NodeBadge({ kind }: { kind: "won" | "lost" }) {
  return (
    <span
      aria-hidden
      className={
        "absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-canvas " +
        (kind === "won"
          ? "bg-correct text-on-correct"
          : "bg-wrong text-on-wrong")
      }
    >
      <svg
        viewBox="0 0 8 8"
        className="h-2 w-2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {kind === "won" ? (
          <path d="M1.5 4.5l1.7 1.7L6.5 2.5" />
        ) : (
          <path d="M2 2l4 4M6 2L2 6" />
        )}
      </svg>
    </span>
  );
}
