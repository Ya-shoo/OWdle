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

// Primary CTA shown after a mode is solved. Big, filled, with an animated
// arrow and entrance — the goal is for the player to immediately see that
// there is a next game in the daily set and tap straight through.
//
// Routing rule: walk canonical play order, skip already-finished modes
// (won or gave up), and recommend the first remaining one. When everything
// is done we render nothing — the parent game has already detected that
// state via isDailyComplete() and is rendering DailyCompleteResultCard
// in place of the per-mode result card, which owns the back-to-home
// affordance, share button, and countdown.
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
  const [next] = useState<ModeDef | null>(() => {
    const day = dayString();
    const done = new Set<ModeSlug>();
    for (const slug of BUILT_MODE_SLUGS) {
      const st = loadModeState(slug, day);
      if (st.won || st.lost || st.gaveUp) done.add(slug);
    }
    // Defensive: ensure the just-won mode is treated as done even if the
    // localStorage write hasn't been observed by this read yet.
    done.add(current);
    return nextUnfinishedMode(current, done);
  });

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
    // Daily-complete state is handled by DailyCompleteResultCard up the
    // tree. Render nothing here so we don't double up the back-to-home
    // affordance or the score recap.
    return null;
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
        className="group inline-flex items-center gap-3 rounded-full bg-accent px-6 py-3 shadow-[0_2px_6px_-1px_rgba(0,0,0,0.3),0_0_4px_-1px_var(--accent)] transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.05] hover:bg-accent-soft hover:shadow-[0_3px_8px_-2px_rgba(0,0,0,0.4),0_0_6px_-2px_var(--accent)] active:scale-[0.98]"
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-on-accent/75">
          Up Next
        </span>
        <span className="font-display text-base font-bold uppercase tracking-wide text-on-accent">
          {next.label}
        </span>
      </Link>
    </motion.div>
  );
}
