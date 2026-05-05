"use client";

import { motion } from "motion/react";
import clsx from "clsx";
import { compareHero } from "@/lib/compare";
import type { Hero } from "@/lib/heroes";
import { AttributeTile } from "./AttributeTile";

export function GuessRow({
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
      initial={isLatest ? { opacity: 0, y: -12 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className={clsx(
        "flex flex-col gap-3 md:flex-row md:items-stretch md:gap-2",
        matchAll && "outline outline-2 outline-correct/50 rounded-(--radius-card) p-1 -m-1",
      )}
    >
      {/* Hero portrait + name */}
      <div className="flex items-center gap-3 md:w-44 md:shrink-0 md:gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={guess.portrait}
          alt={guess.name}
          width={56}
          height={56}
          className="h-14 w-14 shrink-0 rounded-(--radius-card) bg-muted object-cover"
        />
        <div className="min-w-0">
          <div className="truncate font-display text-base font-medium text-ink">
            {guess.name}
          </div>
          <div className="truncate font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
            {guess.role} · {guess.subrole ?? "—"}
          </div>
        </div>
      </div>

      {/* Attribute tiles */}
      <div className="grid flex-1 grid-cols-4 gap-1.5 sm:grid-cols-8 sm:gap-2">
        {results.map((result, idx) => (
          <AttributeTile key={result.attr} result={result} index={idx} />
        ))}
      </div>
    </motion.div>
  );
}
