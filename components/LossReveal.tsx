"use client";

import { ReactNode } from "react";
import { motion } from "motion/react";
import type { ModeSlug } from "@/lib/modes";
import { NextModeCTA } from "./NextModeCTA";

// Shared "out of guesses" card. Slight red wash + "Better luck tomorrow"
// eyebrow + caller-supplied reveal content (portrait, name, extras) +
// the standard NextModeCTA. Each mode renders its own answer details as
// children so the wrapper doesn't have to know about per-mode reveal
// shape (Ability has the ability name + description, Splash has the
// optional skin tag, etc.).
//
// Color tokens: wrong/* (red) chosen over far/* (orange) so the muted
// loss card reads as a clear miss rather than the bonus-round "off"
// state. Border opacity stays low so the card feels muted, not alarming.
export function LossReveal({
  current,
  children,
}: {
  current: ModeSlug;
  children: ReactNode;
}) {
  return (
    <motion.div
      key="loss"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto mb-8 w-full max-w-md rounded-(--radius-card) border border-wrong/35 bg-wrong/10 p-4 sm:p-5"
    >
      <div className="flex flex-col gap-5">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-wrong">
          Better luck tomorrow
        </div>
        {children}
        <div className="flex justify-center sm:justify-start">
          <NextModeCTA current={current} />
        </div>
      </div>
    </motion.div>
  );
}
