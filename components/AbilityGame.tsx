"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import {
  HEROES,
  HEROES_BY_KEY,
  type Ability,
  type Hero,
} from "@/lib/heroes";
import {
  dayString,
  getAbilityForDay,
  prettyDay,
  shuffleOrder,
} from "@/lib/daily";
import { loadModeState, saveModeState, type ModeState } from "@/lib/storage";
import { HeroCombobox } from "./HeroCombobox";
import { Brand } from "./Brand";
import { ShareButton } from "./ShareButton";
import { NextModeCTA } from "./NextModeCTA";

const MODE = "ability";

// 4×4 reveal grid — 16 tiles total. Initial peek shows 1 tile;
// every wrong guess reveals one more. Win unmasks all.
const GRID_DIM = 4;
const TOTAL_CELLS = GRID_DIM * GRID_DIM;
const INITIAL_REVEALS = 1;

// Hard mode rotates the icon by a per-day amount so it's harder to recognize
// even with most cells revealed. Defaults on; the player can toggle off any
// time. Preference persists locally across sessions.
const HARD_MODE_KEY = "owdle:ability:hardMode";
const HARD_MODE_ANGLES = [90, 180, 270];

function rotationForDay(day: string): number {
  let h = 2166136261;
  for (let i = 0; i < day.length; i++) {
    h ^= day.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return HARD_MODE_ANGLES[h % HARD_MODE_ANGLES.length];
}

export function AbilityGame() {
  const [day, setDay] = useState<string | null>(null);
  const [state, setState] = useState<ModeState | null>(null);
  const [hardMode, setHardMode] = useState(true);

  useEffect(() => {
    const d = dayString();
    setDay(d);
    setState(loadModeState(MODE, d));
    try {
      const v = window.localStorage.getItem(HARD_MODE_KEY);
      if (v !== null) setHardMode(v === "true");
    } catch {
      // ignore — default stays on
    }
  }, []);

  const toggleHardMode = () => {
    setHardMode((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(HARD_MODE_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  if (!day || !state) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-16">
        <div className="font-mono text-xs uppercase tracking-[0.2em] text-ink-faint">
          Loading…
        </div>
      </main>
    );
  }

  const { hero: answer, ability } = getAbilityForDay(day);
  const guessedHeroes = state.guesses
    .map((k) => HEROES_BY_KEY[k])
    .filter(Boolean);
  const excludeKeys = new Set(state.guesses);

  const handleGuess = (hero: Hero) => {
    if (state.won) return;
    const next: ModeState = {
      ...state,
      guesses: [...state.guesses, hero.key],
      won: hero.key === answer.key,
    };
    setState(next);
    saveModeState(MODE, next);
  };

  const cellsRevealed = state.won
    ? TOTAL_CELLS
    : Math.min(INITIAL_REVEALS + state.guesses.length, TOTAL_CELLS);

  // After winning we drop the rotation so the player can read the icon
  // straight; while playing, hard mode applies the per-day rotation.
  const rotation = !state.won && hardMode ? rotationForDay(day) : 0;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-16">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-info">
            <span suppressHydrationWarning>{prettyDay(day)}</span>
          </p>
          <h1 className="mt-3 font-display display-headline text-5xl text-ink sm:text-6xl">
            Ability
          </h1>
          <p className="mt-3 max-w-md text-ink-soft">
            Whose ability is this? More of the icon reveals with each guess.
          </p>
        </div>
        <div className="hidden flex-col items-end font-mono text-xs uppercase tracking-[0.2em] text-ink-faint sm:flex">
          <Brand size="sm" />
          <span className="mt-1 text-info">ability mode</span>
        </div>
      </header>

      <div className="mb-8 flex flex-col items-center gap-4">
        <AbilityArtCard
          ability={ability}
          revealedHero={state.won ? answer : null}
          day={day}
          cellsRevealed={cellsRevealed}
          rotation={rotation}
        />
        {!state.won && (
          <HardModeToggle on={hardMode} onToggle={toggleHardMode} />
        )}
      </div>

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
            <span className="ml-2 text-ink-faint">
              · {cellsRevealed} / {TOTAL_CELLS} tiles
            </span>
          </p>
        </div>
      )}

      <AnimatePresence>
        {state.won && (
          <motion.div
            key="win"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
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
                <div className="mt-1 font-display text-2xl text-ink sm:text-3xl">
                  {answer.name}'s{" "}
                  <span className="italic">{ability.name}</span>{" "}
                  <span className="text-ink-soft">
                    in {state.guesses.length}
                  </span>
                </div>
                <div className="mt-3">
                  <NextModeCTA current="ability" />
                </div>
              </div>
              <ShareButton
                modeLabel="Ability"
                answer={answer}
                guesses={state.guesses}
                day={day}
                headline={`${answer.name}'s "${ability.name}"`}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-2.5">
        <AnimatePresence initial={false}>
          {[...guessedHeroes].reverse().map((hero, revIdx) => {
            const originalIdx = guessedHeroes.length - 1 - revIdx;
            const isLatest = originalIdx === guessedHeroes.length - 1;
            return (
              <WrongGuessCard key={hero.key} hero={hero} isLatest={isLatest} />
            );
          })}
        </AnimatePresence>
      </div>

      {state.guesses.length === 0 && (
        <div className="mt-10 rounded-(--radius-card) border border-dashed border-line bg-inset/40 p-8 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-ink-faint">
            One tile is showing. Type a hero to reveal more.
          </p>
        </div>
      )}
    </main>
  );
}

function HardModeToggle({
  on,
  onToggle,
}: {
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      className={clsx(
        "tile-shape group inline-flex items-center gap-2.5 border px-3.5 py-2 font-mono text-[10px] uppercase tracking-[0.22em] transition-colors",
        on
          ? "border-accent/60 bg-accent/15 text-accent-soft hover:bg-accent/25"
          : "border-line bg-muted/40 text-ink-faint hover:border-accent/40 hover:text-ink",
      )}
    >
      <span
        aria-hidden
        className={clsx(
          "inline-flex h-4 w-7 items-center rounded-full border transition-colors",
          on ? "border-accent bg-accent/40" : "border-line bg-muted",
        )}
      >
        <span
          className={clsx(
            "h-3 w-3 rounded-full transition-transform",
            on ? "translate-x-3 bg-accent" : "translate-x-0.5 bg-ink-faint",
          )}
        />
      </span>
      <span>Hard Mode</span>
      <span
        className={clsx(
          "font-display text-xs tracking-wide",
          on ? "text-accent" : "text-ink-faint",
        )}
      >
        {on ? "ON" : "OFF"}
      </span>
    </button>
  );
}

function WrongGuessCard({ hero, isLatest }: { hero: Hero; isLatest: boolean }) {
  return (
    <motion.div
      layout
      initial={isLatest ? { opacity: 0, y: -10 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="tile-shape mx-auto flex w-full max-w-sm flex-col items-center justify-center gap-4 border border-far/40 bg-far/15 px-6 py-8"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={hero.portrait}
        alt={hero.name}
        width={144}
        height={144}
        className="h-32 w-32 rounded-(--radius-card) bg-muted object-cover sm:h-36 sm:w-36"
      />
      <div className="font-display text-3xl uppercase tracking-wide text-ink sm:text-4xl">
        {hero.name}
      </div>
    </motion.div>
  );
}

function AbilityArtCard({
  ability,
  revealedHero,
  day,
  cellsRevealed,
  rotation,
}: {
  ability: Ability;
  revealedHero: Hero | null;
  day: string;
  cellsRevealed: number;
  rotation: number;
}) {
  // Stable reveal order seeded by day + ability. Each cell index appears once.
  const revealOrder = useMemo(
    () => shuffleOrder(`owdle:ability:${day}:${ability.icon}`, TOTAL_CELLS),
    [day, ability.icon],
  );
  const revealedSet = useMemo(
    () => new Set(revealOrder.slice(0, cellsRevealed)),
    [revealOrder, cellsRevealed],
  );

  return (
    <div className="flex flex-col items-center gap-5">
      <div
        className="relative tile-shape border border-line bg-muted/40 p-4 shadow-2xl shadow-black/10 sm:p-5"
        style={{ width: 240, height: 240 }}
      >
        <div className="relative h-full w-full">
          <motion.img
            src={ability.icon}
            alt={revealedHero ? ability.name : "Mystery ability"}
            className="absolute inset-0 h-full w-full object-contain"
            loading="eager"
            decoding="async"
            initial={false}
            animate={{ rotate: rotation }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          />
          {/* Grid mask overlay — each cell hides its slice until revealed */}
          <div
            aria-hidden={!!revealedHero}
            className="absolute inset-0 grid"
            style={{
              gridTemplateColumns: `repeat(${GRID_DIM}, 1fr)`,
              gridTemplateRows: `repeat(${GRID_DIM}, 1fr)`,
            }}
          >
            {Array.from({ length: TOTAL_CELLS }).map((_, i) => {
              const isRevealed = revealedSet.has(i);
              const col = i % GRID_DIM;
              const row = Math.floor(i / GRID_DIM);
              const isLastCol = col === GRID_DIM - 1;
              const isLastRow = row === GRID_DIM - 1;
              return (
                <motion.div
                  key={i}
                  initial={false}
                  animate={{
                    opacity: isRevealed ? 0 : 1,
                    scale: isRevealed ? 1.04 : 1,
                  }}
                  transition={{
                    duration: 0.45,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className={`bg-muted ${
                    !isLastCol ? "border-r border-line/70" : ""
                  } ${!isLastRow ? "border-b border-line/70" : ""}`}
                />
              );
            })}
          </div>
        </div>
      </div>
      {revealedHero && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="text-center"
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-info">
            Ability
          </p>
          <p className="mt-1 font-display text-2xl text-ink">{ability.name}</p>
          {ability.description && (
            <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">
              {ability.description}
            </p>
          )}
        </motion.div>
      )}
    </div>
  );
}
