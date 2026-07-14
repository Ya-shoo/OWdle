"use client";

import { ReactNode } from "react";
import { motion } from "motion/react";
import type { ModeSlug } from "@/lib/modes";
import { NextModeCTA } from "./NextModeCTA";

// Shared "out of guesses" card. Solid soft-red panel + "Better luck
// tomorrow" eyebrow + caller-supplied reveal content (portrait, name,
// extras) + the standard NextModeCTA, optionally paired with a share
// button. Each mode renders its own answer details as children so the
// wrapper doesn't have to know about per-mode reveal shape (Ability has
// the ability name + description, Splash has the optional skin tag, etc.).
//
// The body carries the loss in a full-strength SOLID red (bg-loss), the
// mirror of the win card's solid green — a deliberate, opaque fill, not a
// translucent tint (see globals.css --bg-loss).
export function LossReveal({
  current,
  children,
  share,
  scrollIntoViewOnMount = true,
}: {
  current: ModeSlug;
  children: ReactNode;
  // Optional share button to render alongside NextModeCTA. Each game
  // constructs its own (with its answer hero), so the wrapper stays
  // mode-agnostic.
  share?: ReactNode;
  scrollIntoViewOnMount?: boolean;
}) {
  return (
    <motion.div
      key="loss"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="result-card mx-auto mb-8 w-full max-w-md rounded-(--radius-card) border border-loss-edge bg-loss p-4 sm:p-5"
    >
      <div className="flex flex-col gap-5">
        <div className="utility-label text-[10px] text-on-wrong">
          Better luck tomorrow
        </div>
        {children}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <NextModeCTA
            current={current}
            scrollIntoViewOnMount={scrollIntoViewOnMount}
            context="loss"
          />
          {share}
        </div>
      </div>
    </motion.div>
  );
}
