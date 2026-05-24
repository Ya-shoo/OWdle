"use client";

import { motion } from "motion/react";
import clsx from "clsx";
import type { AttrResult } from "@/lib/compare";
import { getFlagSrc } from "@/lib/flags";

const STATUS_BG: Record<AttrResult["status"], string> = {
  correct: "bg-correct text-on-correct",
  partial: "bg-partial text-on-partial",
  far: "bg-far text-on-far",
  wrong: "bg-wrong text-on-wrong",
};

export function AttributeTile({
  result,
  index,
  animate = true,
}: {
  result: AttrResult;
  index: number;
  // When false, the row renders in its final state without the flip
  // cascade. Used for guess history rows older than the most-recent one
  // so a player on guess 5 isn't watching the same 8-tile animation five
  // times. Defaults to animating so call sites that don't care still
  // get the reveal on the first render.
  animate?: boolean;
}) {
  // Origin shows the country's flag instead of spelled-out text so the
  // player has to recognize the flag. Lunar Colony has no canonical flag
  // → getFlagSrc returns null and we fall back to text.
  const flagSrc =
    result.attr === "country" ? getFlagSrc(result.display) : null;

  return (
    <motion.div
      initial={animate ? { rotateX: -90, opacity: 0 } : false}
      animate={{ rotateX: 0, opacity: 1 }}
      transition={
        animate
          ? {
              duration: 0.45,
              delay: index * 0.08,
              ease: [0.22, 1, 0.36, 1],
            }
          : { duration: 0 }
      }
      style={{ transformOrigin: "top center", transformStyle: "preserve-3d" }}
      className={clsx(
        "tile-shape relative flex min-h-[72px] flex-col items-center justify-center px-2 py-2 text-center sm:min-h-[80px]",
        STATUS_BG[result.status],
      )}
    >
      <div className="font-mono text-[9px] uppercase tracking-[0.18em] opacity-70">
        {result.label}
      </div>
      <div className="mt-1 flex items-center gap-1 font-display text-sm leading-tight sm:text-base">
        {flagSrc ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={flagSrc}
            alt={result.display}
            className="h-6 w-auto rounded-[2px] shadow-sm ring-1 ring-black/10 sm:h-7"
          />
        ) : (
          <span className="font-medium">{result.display}</span>
        )}
        {result.hint === "higher" && (
          <span aria-label="answer is higher" className="text-base">
            ↑
          </span>
        )}
        {result.hint === "lower" && (
          <span aria-label="answer is lower" className="text-base">
            ↓
          </span>
        )}
      </div>
    </motion.div>
  );
}
