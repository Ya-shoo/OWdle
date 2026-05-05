"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { nextBuiltMode, type ModeSlug } from "@/lib/modes";

// Primary CTA shown after a mode is solved. Big, filled, with an animated
// arrow and entrance — the goal is for the player to immediately see that
// there is a next game in the daily set and tap straight through.
export function NextModeCTA({ current }: { current: ModeSlug }) {
  const next = nextBuiltMode(current);

  if (!next) {
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
