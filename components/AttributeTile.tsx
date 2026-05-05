"use client";

import { motion } from "motion/react";
import clsx from "clsx";
import type { AttrResult } from "@/lib/compare";

const STATUS_BG: Record<AttrResult["status"], string> = {
  correct: "bg-correct text-on-correct",
  partial: "bg-partial text-on-partial",
  far: "bg-far text-on-far",
  wrong: "bg-wrong text-on-wrong",
};

export function AttributeTile({
  result,
  index,
}: {
  result: AttrResult;
  index: number;
}) {
  return (
    <motion.div
      initial={{ rotateX: -90, opacity: 0 }}
      animate={{ rotateX: 0, opacity: 1 }}
      transition={{
        duration: 0.45,
        delay: index * 0.08,
        ease: [0.22, 1, 0.36, 1],
      }}
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
        <span className="font-medium">{result.display}</span>
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
