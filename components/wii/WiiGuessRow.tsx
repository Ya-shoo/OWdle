"use client";

import { motion } from "motion/react";
import clsx from "clsx";
import { compareHero } from "@/lib/compare";
import type { Hero } from "@/lib/heroes";
import { WiiAttributeTile } from "./WiiAttributeTile";

export function WiiGuessRow({
  guess,
  answer,
  isLatest,
}: {
  guess: Hero;
  answer: Hero;
  isLatest: boolean;
}) {
  const results = compareHero(guess, answer);
  const matchAll = results.every((r) => r.status === "correct");

  return (
    <motion.div
      layout
      initial={isLatest ? { opacity: 0, y: -10 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={clsx(
        "wii-card flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:gap-4",
      )}
      style={
        matchAll
          ? {
              boxShadow:
                "inset 0 0 0 2px var(--wii-green), 0 12px 26px -10px rgba(0,0,0,0.6), 0 0 24px rgba(126, 217, 138, 0.4)",
            }
          : undefined
      }
    >
      <div className="flex items-center gap-3 md:w-48 md:shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={guess.portrait}
          alt=""
          width={56}
          height={56}
          className="wii-mii h-14 w-14 shrink-0 object-cover"
        />
        <div className="min-w-0">
          <div
            className="truncate text-[16px] font-bold leading-tight"
            style={{ color: "var(--wii-ink)" }}
          >
            {guess.name}
          </div>
          <div
            className="truncate text-[10px] font-bold uppercase tracking-[0.18em]"
            style={{ color: "var(--wii-ink-faint)" }}
          >
            {guess.role}
            {guess.subrole ? ` · ${guess.subrole}` : ""}
          </div>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-4 gap-1.5 sm:grid-cols-8 sm:gap-2">
        {results.map((result, idx) => (
          <WiiAttributeTile key={result.attr} result={result} index={idx} />
        ))}
      </div>
    </motion.div>
  );
}
