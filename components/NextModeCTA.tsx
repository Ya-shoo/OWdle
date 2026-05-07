"use client";

import Link from "next/link";
import { useState } from "react";
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
// (won or gave up), and recommend the first remaining one. If everything
// is done, the CTA flips to a "Daily Complete" link back home.
//
// We read all mode statuses synchronously in the initial state. This is
// safe because the parent only mounts NextModeCTA after its own effect
// has hydrated localStorage state, so we are guaranteed to be client-side
// here — the SSR/static prerender omits this component entirely.
export function NextModeCTA({ current }: { current: ModeSlug }) {
  const [next] = useState<ModeDef | null>(() => {
    const day = dayString();
    const done = new Set<ModeSlug>();
    // Treat both wins and "Show answer" as finished for routing — once
    // the player has bailed on a mode, looping them back into it isn't
    // helpful. They can still revisit via the home grid if they want.
    for (const slug of BUILT_MODE_SLUGS) {
      const st = loadModeState(slug, day);
      if (st.won || st.gaveUp) done.add(slug);
    }
    // Defensive: ensure the just-won mode is treated as done even if the
    // localStorage write hasn't been observed by this read yet.
    done.add(current);
    return nextUnfinishedMode(current, done);
  });

  if (next === null) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="inline-block"
      >
        <Link
          href="/"
          className="tile-shape group inline-flex items-center gap-3 border-2 border-correct bg-correct/15 px-6 py-3 transition-colors hover:bg-correct/25"
        >
          <span aria-hidden className="font-mono text-base text-correct">
            ✓
          </span>
          <span className="font-display text-sm font-bold uppercase tracking-wide text-correct">
            Daily Complete
          </span>
          <span
            aria-hidden
            className="text-correct transition-transform group-hover:translate-x-1"
          >
            →
          </span>
        </Link>
      </motion.div>
    );
  }

  return (
    <motion.div
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
