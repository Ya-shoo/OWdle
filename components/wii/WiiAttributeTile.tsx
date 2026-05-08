"use client";

import { motion } from "motion/react";
import clsx from "clsx";
import type { AttrResult } from "@/lib/compare";

const STATUS_CLASS: Record<AttrResult["status"], string> = {
  correct: "wii-tile--correct",
  partial: "wii-tile--partial",
  far: "wii-tile--far",
  wrong: "wii-tile--wrong",
};

// Mii-friendly status glyph: a tiny shape that doubles colour with form
// so colour-blind players still get the signal. Drawn as SVG so it
// scales and tints with currentColor.
function StatusGlyph({ status }: { status: AttrResult["status"] }) {
  const stroke = "currentColor";
  if (status === "correct") {
    return (
      <svg viewBox="0 0 14 14" width="11" height="11" aria-hidden>
        <path
          d="M2 7 L6 11 L12 3"
          fill="none"
          stroke={stroke}
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (status === "partial") {
    return (
      <svg viewBox="0 0 14 14" width="11" height="11" aria-hidden>
        <circle cx="7" cy="7" r="4.5" fill="none" stroke={stroke} strokeWidth="2.2" />
      </svg>
    );
  }
  if (status === "far") {
    return (
      <svg viewBox="0 0 14 14" width="11" height="11" aria-hidden>
        <path
          d="M3.5 3.5 L10.5 10.5 M10.5 3.5 L3.5 10.5"
          fill="none"
          stroke={stroke}
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 14 14" width="11" height="11" aria-hidden>
      <path
        d="M3 7 L11 7"
        fill="none"
        stroke={stroke}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function WiiAttributeTile({
  result,
  index,
}: {
  result: AttrResult;
  index: number;
}) {
  return (
    <motion.div
      initial={{ scale: 0.55, opacity: 0, y: 8 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      transition={{
        duration: 0.5,
        delay: index * 0.06,
        // bouncy spring for that Mii-channel pop
        ease: [0.34, 1.56, 0.64, 1],
      }}
      className={clsx(
        "wii-tile relative flex min-h-[78px] flex-col items-center justify-center px-2 py-2 text-center sm:min-h-[88px]",
        STATUS_CLASS[result.status],
      )}
    >
      {/* status glyph in the corner — not a layout piece, just an
          accessibility / quick-scan affordance. */}
      <span
        className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full"
        style={{
          background: "rgba(255, 255, 255, 0.35)",
          color: "currentColor",
        }}
      >
        <StatusGlyph status={result.status} />
      </span>

      <div
        className="text-[10px] font-bold uppercase tracking-[0.18em] opacity-75"
      >
        {result.label}
      </div>
      <div className="mt-1 flex items-center gap-1 text-[15px] font-bold leading-tight sm:text-base">
        <span>{result.display}</span>
        {result.hint === "higher" && (
          <span aria-label="answer is higher" className="text-base font-bold">
            ↑
          </span>
        )}
        {result.hint === "lower" && (
          <span aria-label="answer is lower" className="text-base font-bold">
            ↓
          </span>
        )}
      </div>
    </motion.div>
  );
}
