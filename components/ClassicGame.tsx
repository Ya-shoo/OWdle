"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { HEROES, HEROES_BY_KEY, type Hero } from "@/lib/heroes";
import { dayString, getHeroForDay, prettyDay } from "@/lib/daily";
import { loadClassic, saveClassic, type ClassicState } from "@/lib/storage";
import { HeroCombobox } from "./HeroCombobox";
import { GuessRow } from "./GuessRow";
import { Brand } from "./Brand";
import { NextModeCTA } from "./NextModeCTA";

export function ClassicGame() {
  const [day, setDay] = useState<string | null>(null);
  const [state, setState] = useState<ClassicState | null>(null);

  useEffect(() => {
    const d = dayString();
    setDay(d);
    setState(loadClassic(d));
  }, []);

  if (!day || !state) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-16">
        <div className="font-mono text-xs uppercase tracking-[0.2em] text-ink-faint">
          Loading…
        </div>
      </main>
    );
  }

  const answer = getHeroForDay(day);
  const guessedHeroes = state.guesses
    .map((k) => HEROES_BY_KEY[k])
    .filter(Boolean);
  const excludeKeys = new Set(state.guesses);

  const handleGuess = (hero: Hero) => {
    if (state.won) return;
    const newGuesses = [...state.guesses, hero.key];
    const won = hero.key === answer.key;
    const next: ClassicState = { ...state, guesses: newGuesses, won };
    setState(next);
    saveClassic(next);
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-16">
      <header className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-info">
            <span suppressHydrationWarning>{prettyDay(day)}</span>
          </p>
          <h1 className="mt-3 font-display display-headline text-5xl text-ink sm:text-6xl">
            Classic
          </h1>
          <p className="mt-3 max-w-md text-ink-soft">
            Type a hero. Match the eight attributes. New puzzle daily.
          </p>
        </div>
        <div className="hidden flex-col items-end font-mono text-xs uppercase tracking-[0.2em] text-ink-faint sm:flex">
          <Brand size="sm" />
          <span className="mt-1 text-info">classic mode</span>
        </div>
      </header>

      {!state.won && (
        <div className="mb-6">
          <HeroCombobox
            heroes={HEROES}
            excludeKeys={excludeKeys}
            onSelect={handleGuess}
          />
          <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-info">
            {state.guesses.length}{" "}
            {state.guesses.length === 1 ? "guess" : "guesses"}
          </p>
        </div>
      )}

      <AnimatePresence>
        {state.won && (
          <motion.div
            key="win"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="mb-8 rounded-(--radius-card) border border-correct/40 bg-correct/10 p-5 sm:p-6"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={answer.portrait}
                alt=""
                className="h-16 w-16 rounded-(--radius-card) bg-muted object-cover sm:h-20 sm:w-20"
              />
              <div className="flex-1">
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-info">
                  Solved
                </div>
                <div className="mt-1 font-display text-3xl text-ink">
                  {answer.name}{" "}
                  <span className="text-ink-soft">
                    in {state.guesses.length}
                  </span>
                </div>
                <div className="mt-3">
                  <NextModeCTA current="classic" />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Guess history (newest at top) */}
      <div className="space-y-4">
        <AnimatePresence initial={false}>
          {[...guessedHeroes].reverse().map((hero, revIdx) => {
            const originalIdx = guessedHeroes.length - 1 - revIdx;
            const isLatest = originalIdx === guessedHeroes.length - 1;
            return (
              <GuessRow
                key={hero.key}
                guess={hero}
                answer={answer}
                isLatest={isLatest}
              />
            );
          })}
        </AnimatePresence>
      </div>

      {state.guesses.length === 0 && (
        <div className="mt-10 rounded-(--radius-card) border border-dashed border-line bg-inset/40 p-6 sm:p-8">
          <p className="text-center font-mono text-xs uppercase tracking-[0.18em] text-ink-faint">
            Start by typing a hero name above.
          </p>
          {/* First-guess legend — surfaces the tile-color semantics
              inline so first-time players don't have to detour to
              /how-to-play to interpret their first row of feedback.
              Disappears as soon as a guess is submitted. */}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-line pt-4">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
              Tiles mean
            </span>
            <LegendChip color="correct" label="Match" />
            <LegendChip color="partial" label="Close" />
            <LegendChip color="far" label="Far" />
            <LegendChip color="wrong" label="Miss" />
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
              ↑ ↓ point toward the answer
            </span>
          </div>
        </div>
      )}
    </main>
  );
}

function LegendChip({
  color,
  label,
}: {
  color: "correct" | "partial" | "far" | "wrong";
  label: string;
}) {
  const swatch = {
    correct: "bg-correct",
    partial: "bg-partial",
    far: "bg-far",
    wrong: "bg-wrong",
  }[color];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className={`tile-shape inline-block h-3 w-3 ${swatch}`}
      />
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
        {label}
      </span>
    </span>
  );
}

