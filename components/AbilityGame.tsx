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
import {
  trackGuessSubmitted,
  trackModeCompleted,
  trackModeStarted,
} from "@/lib/tracking";
import { HeroCombobox } from "./HeroCombobox";
import { Brand } from "./Brand";
import { NextModeCTA } from "./NextModeCTA";
import { LossReveal } from "./LossReveal";
import { GuessRemaining } from "./GuessRemaining";
import { ModeStatsLine } from "./ModeStatsLine";
import { DevViewToggle, useDevViewState } from "./DevViewToggle";
import { DevAbilityPicker } from "./DevAbilityPicker";

const IS_DEV = process.env.NODE_ENV !== "production";

const MODE = "ability";

// 4×4 reveal grid — 16 tiles total. Initial peek shows 1 tile;
// every wrong guess reveals one more. Win unmasks all.
const GRID_DIM = 4;
const TOTAL_CELLS = GRID_DIM * GRID_DIM;
const INITIAL_REVEALS = 1;

// Hard cap on guesses. Player loses on the cap-th wrong attempt and
// the icon snaps fully revealed (no rotation) inside the LossReveal.
const MAX_GUESSES = 12;

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
  // Dev-only view + (hero, ability) override pair.
  const [devView, setDevView] = useDevViewState("ability");
  const [override, setOverride] = useState<{
    hero: Hero;
    abilityIndex: number;
  } | null>(null);
  const isOverride = override !== null;

  const applyOverride = (hero: Hero | null, abilityIndex?: number) => {
    if (hero == null) {
      setOverride(null);
      if (day) setState(loadModeState(MODE, day));
      return;
    }
    const idx = abilityIndex ?? 0;
    setOverride({ hero, abilityIndex: idx });
    setState({ day: day ?? "", guesses: [], won: false });
  };

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

  // mode_started — once per day, skip dev overrides.
  useEffect(() => {
    if (!day || isOverride) return;
    const pick = getAbilityForDay(day);
    trackModeStarted({
      mode: "ability",
      dailyId: day,
      answerId: pick.hero.key,
    });
  }, [day, isOverride]);

  // mode_completed — fires on terminal transition.
  const stateWon = state?.won === true;
  const stateLost = state?.lost === true;
  useEffect(() => {
    if (!day || isOverride) return;
    if (!stateWon && !stateLost) return;
    const pick = getAbilityForDay(day);
    trackModeCompleted({
      mode: "ability",
      dailyId: day,
      outcome: stateWon ? "won" : "lost",
      totalGuesses: state?.guesses.length ?? 0,
      cap: MAX_GUESSES,
      answerId: pick.hero.key,
      abilityIndex: pick.abilityIndex,
    });
  }, [day, isOverride, stateWon, stateLost, state?.guesses.length]);

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

  const dailyPick = getAbilityForDay(day);
  const answer = override?.hero ?? dailyPick.hero;
  const ability =
    override != null
      ? override.hero.abilities[
          Math.min(override.abilityIndex, override.hero.abilities.length - 1)
        ]
      : dailyPick.ability;
  const abilityIndex = override?.abilityIndex ?? dailyPick.abilityIndex;
  const guessedHeroes = state.guesses
    .map((k) => HEROES_BY_KEY[k])
    .filter(Boolean);
  const excludeKeys = new Set(state.guesses);

  const lost = state.lost === true;
  const ended = state.won || lost;

  const handleGuess = (hero: Hero) => {
    if (ended) return;
    const newGuesses = [...state.guesses, hero.key];
    const won = hero.key === answer.key;
    const nextLost = !won && newGuesses.length >= MAX_GUESSES;
    if (!isOverride) {
      trackGuessSubmitted({
        mode: "ability",
        dailyId: day,
        guessNumber: newGuesses.length,
        isCorrect: won,
        guessId: hero.key,
        answerId: answer.key,
      });
    }
    const next: ModeState = {
      ...state,
      guesses: newGuesses,
      won,
      lost: nextLost,
    };
    setState(next);
    if (!isOverride) saveModeState(MODE, next);
  };

  const cellsRevealed = ended
    ? TOTAL_CELLS
    : Math.min(INITIAL_REVEALS + state.guesses.length, TOTAL_CELLS);

  // After the round ends (win or loss) we drop the rotation so the
  // player can read the icon straight; while playing, hard mode applies
  // the per-day rotation.
  const rotation = !ended && hardMode ? rotationForDay(day) : 0;

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

      {IS_DEV && (
        <div className="mb-4 flex justify-center">
          <DevViewToggle
            mode="ability"
            active={devView}
            onChange={setDevView}
          />
        </div>
      )}
      {IS_DEV && devView && (
        <DevAbilityPicker
          currentHeroKey={answer.key}
          currentAbilityIndex={abilityIndex}
          overrideActive={isOverride}
          onApply={applyOverride}
        />
      )}

      <div className="mb-8 flex flex-col items-center gap-4">
        <AbilityArtCard
          ability={ability}
          revealedHero={ended ? answer : null}
          day={day}
          cellsRevealed={cellsRevealed}
          rotation={rotation}
        />
        {!ended && <HardModeToggle on={hardMode} onToggle={toggleHardMode} />}
      </div>

      {!ended && (
        <div className="mb-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <GuessRemaining used={state.guesses.length} cap={MAX_GUESSES} />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">
              {cellsRevealed} / {TOTAL_CELLS} tiles
            </span>
          </div>
          <HeroCombobox
            heroes={HEROES}
            excludeKeys={excludeKeys}
            onSelect={handleGuess}
          />
        </div>
      )}

      <AnimatePresence>
        {state.won && (
          <motion.div
            key="win"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto mb-8 w-full max-w-md rounded-(--radius-card) border border-correct/40 bg-correct/10 p-4 sm:p-5"
          >
            <div className="flex flex-col gap-5">
              <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-center sm:text-left">
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
                  <ModeStatsLine mode="ability" />
                </div>
              </div>
              <div className="flex justify-center sm:justify-start">
                <NextModeCTA current="ability" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {lost && !state.won && (
          <LossReveal current="ability">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={answer.portrait}
                alt=""
                className="h-16 w-16 rounded-(--radius-card) bg-muted object-cover sm:h-20 sm:w-20"
              />
              <div className="flex-1">
                <div className="font-display text-2xl text-ink sm:text-3xl">
                  {answer.name}'s <span className="italic">{ability.name}</span>
                </div>
                <div className="mt-1 font-mono text-xs uppercase tracking-[0.18em] text-ink-faint">
                  after {state.guesses.length} wrong{" "}
                  {state.guesses.length === 1 ? "guess" : "guesses"}
                </div>
                <ModeStatsLine mode="ability" />
              </div>
            </div>
          </LossReveal>
        )}
      </AnimatePresence>

      <div className="space-y-2.5">
        <AnimatePresence initial={false}>
          {[...guessedHeroes].reverse().map((hero, revIdx) => {
            const originalIdx = guessedHeroes.length - 1 - revIdx;
            const isLatest = originalIdx === guessedHeroes.length - 1;
            const isCorrect = hero.key === answer.key;
            return (
              <GuessCard
                key={hero.key}
                hero={hero}
                isLatest={isLatest}
                isCorrect={isCorrect}
              />
            );
          })}
        </AnimatePresence>
      </div>

      {state.guesses.length === 0 && !ended && (
        <div className="mt-10 rounded-(--radius-card) border border-dashed border-line bg-inset/40 p-8 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-ink-faint">
            One tile is showing. Type a hero to reveal more. You get{" "}
            {MAX_GUESSES} guesses.
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

function GuessCard({
  hero,
  isLatest,
  isCorrect,
}: {
  hero: Hero;
  isLatest: boolean;
  isCorrect: boolean;
}) {
  return (
    <motion.div
      layout
      initial={isLatest ? { opacity: 0, y: -10 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className={clsx(
        "tile-shape mx-auto flex w-full max-w-xs flex-col items-center justify-center gap-3 border px-5 py-6",
        isCorrect
          ? "border-correct/40 bg-correct/15"
          : "border-far/40 bg-far/15",
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={hero.portrait}
        alt={hero.name}
        width={112}
        height={112}
        className="h-24 w-24 rounded-(--radius-card) bg-muted object-cover sm:h-28 sm:w-28"
      />
      <div className="font-display text-2xl uppercase tracking-wide text-ink sm:text-3xl">
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
