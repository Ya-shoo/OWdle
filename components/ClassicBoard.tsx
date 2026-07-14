"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { HEROES, HEROES_BY_KEY, type Hero } from "@/lib/heroes";
import {
  loadModeState,
  saveModeState,
  type ClassicState,
} from "@/lib/storage";
import { ATTRIBUTES, compareHero, type AttrKey } from "@/lib/compare";
import { HeroCombobox } from "./HeroCombobox";
import { GuessRow } from "./GuessRow";
import { GuessRemaining } from "./GuessRemaining";
import { HintConfirmModal } from "./HintConfirmModal";

// The shared Classic "core board" — the guess/hint loop that is identical
// between the daily /classic engine and the /archive/classic replay. The
// STATE MACHINE lives in the useClassicRound hook; the shared VIEW (input
// row + guess/hint timeline + first-guess legend + confirm modal) lives in
// ClassicBoard. Everything variant-specific — the page header, the
// win/loss reveal chrome, analytics, streak, and storage namespace — stays
// in the wrapping engine, which injects its reveal cards through the
// `reveal` slot. This split is the template the other four modes follow
// when they gain an archive.

// Hard cap on combined guesses + hints. Past this with no win, the round
// ends as a loss and the answer is revealed.
export const MAX_GUESSES = 8;

// Hint thresholds, expressed as the minimum wrong-guess count required to
// unlock each hint. Effective-guess slots include both real guesses and
// already-consumed hints.
//
// Safety rescue: regardless of these thresholds, the next available hint
// also unlocks the moment the player is on their second-to-last guess
// (effective remaining = 2). That guarantees a player can always burn a
// hint and still have one real attempt left.
//
// Lockout: when only one effective slot remains, the hint button is
// disabled — using it would immediately end the round with info that
// can't be acted on.
const HINT_UNLOCK_AT = [4, 7] as const;
export const MAX_HINTS = HINT_UNLOCK_AT.length;

// Merged timeline of guesses + hint reveals, in submit order.
export type TimelineEntry =
  | { kind: "guess"; hero: Hero; chronoIdx: number }
  | { kind: "hint"; attr: AttrKey; chronoIdx: number };

export type ClassicRound = {
  day: string;
  answer: Hero;
  state: ClassicState;
  guessedHeroes: Hero[];
  timeline: TimelineEntry[];
  hintsUsed: AttrKey[];
  effectiveUsed: number;
  cap: number;
  ended: boolean;
  excludeKeys: Set<string>;
  // hint availability, resolved through the three gates documented below
  canHint: boolean;
  hintsRemaining: number;
  nextUnlockAt: number | null;
  effectiveRemaining: number;
  tooFewSlots: boolean;
  pendingHint: AttrKey | null;
  handleGuess: (hero: Hero) => void;
  handleHint: () => void;
  confirmHint: () => void;
  cancelHint: () => void;
  // Wipe the in-memory round back to empty (and overwrite storage when
  // persisting). Drives archive "Play Again"; unused by the daily.
  resetRound: () => void;
};

function freshRound(day: string): ClassicState {
  return { day, guesses: [], hintsUsed: [], won: false };
}

// Headless state machine for a single Classic round on an arbitrary day.
// Storage, analytics, and streak are all injected/observed by the caller:
//   - `storageMode` picks the localStorage namespace ("classic" for the
//     live daily, "archive.classic" for a replay) — routed through the
//     same loadModeState/saveModeState, so the archive key can never
//     collide with the live one.
//   - `persist:false` runs a throwaway round (the daily dev override) —
//     no storage writes, and the round re-inits empty whenever the answer
//     changes.
//   - onGuessSubmitted/onHintUsed fire per action; onTerminal fires once,
//     from the action that ends the round (never from a resume/reload), so
//     the caller can record a completion without an effect that would
//     double-fire on hydration.
// Returns null until the day, answer, and hydrated state are all ready —
// the caller renders its own loading state.
export function useClassicRound(opts: {
  day: string | null;
  answer: Hero | null;
  storageMode: string;
  persist: boolean;
  // Archive-only: stamp the resolved answer key into every saved state so
  // the round stays pinned to this hero even if the daily bag reshuffles
  // later. The daily leaves this off (today's answer is stable intraday),
  // keeping its stored shape unchanged.
  stampAnswerKey?: boolean;
  onGuessSubmitted?: (o: {
    guessNumber: number;
    isCorrect: boolean;
    hero: Hero;
  }) => void;
  onHintUsed?: (o: {
    hintIndex: number;
    atGuessNumber: number;
    attr: AttrKey;
  }) => void;
  onTerminal?: (o: {
    outcome: "won" | "lost";
    guesses: number;
    hints: number;
  }) => void;
}): ClassicRound | null {
  const { day, answer, storageMode, persist } = opts;
  const answerKey = answer?.key ?? null;
  const [state, setState] = useState<ClassicState | null>(null);
  const [pendingHint, setPendingHint] = useState<AttrKey | null>(null);

  // Hydrate on mount and whenever the day, the answer (dev-override switch),
  // or the persist flag changes. A non-persisting round starts empty; a
  // persisting one resumes from its storage namespace. Keeping this in an
  // effect (rather than lazy useState) matches the daily's original
  // SSR-safe pattern: the first paint is empty on both server and client,
  // so there's no hydration mismatch, then localStorage fills in.
  useEffect(() => {
    if (!day) {
      setState(null);
      return;
    }
    setPendingHint(null);
    setState(persist ? loadModeState(storageMode, day) : freshRound(day));
  }, [day, answerKey, persist, storageMode]);

  const guessedHeroes = useMemo(
    () =>
      (state?.guesses ?? [])
        .map((k) => HEROES_BY_KEY[k])
        .filter(Boolean) as Hero[],
    [state?.guesses],
  );

  // Guesses + hint reveals in submit order. Hints slot in after the guess
  // they followed (order = the wrong-guess count at hint time). Pre-Phase-3
  // states without hintOrder fall through to the tail so rows still appear.
  const timeline = useMemo<TimelineEntry[]>(() => {
    const guesses = (state?.guesses ?? [])
      .map((k) => HEROES_BY_KEY[k])
      .filter(Boolean) as Hero[];
    const hints = (state?.hintsUsed ?? []) as AttrKey[];
    const order = state?.hintOrder ?? [];
    const entries: TimelineEntry[] = [];
    let hintIdx = 0;
    let chrono = 0;
    while (hintIdx < hints.length && (order[hintIdx] ?? 0) === 0) {
      entries.push({ kind: "hint", attr: hints[hintIdx], chronoIdx: chrono++ });
      hintIdx++;
    }
    for (let g = 0; g < guesses.length; g++) {
      entries.push({ kind: "guess", hero: guesses[g], chronoIdx: chrono++ });
      while (hintIdx < hints.length && (order[hintIdx] ?? 0) === g + 1) {
        entries.push({
          kind: "hint",
          attr: hints[hintIdx],
          chronoIdx: chrono++,
        });
        hintIdx++;
      }
    }
    while (hintIdx < hints.length) {
      entries.push({ kind: "hint", attr: hints[hintIdx], chronoIdx: chrono++ });
      hintIdx++;
    }
    return entries;
  }, [state?.guesses, state?.hintsUsed, state?.hintOrder]);

  if (!day || !answer || !state) return null;

  const hintsUsed: AttrKey[] = (state.hintsUsed ?? []) as AttrKey[];
  const effectiveUsed = state.guesses.length + hintsUsed.length;
  const ended = state.won || state.lost === true;
  const excludeKeys = new Set(state.guesses);

  const persistState = (next: ClassicState) => {
    const toSave =
      opts.stampAnswerKey && answer ? { ...next, answerKey: answer.key } : next;
    setState(toSave);
    if (persist) saveModeState(storageMode, toSave);
  };

  const handleGuess = (hero: Hero) => {
    if (ended) return;
    const newGuesses = [...state.guesses, hero.key];
    const won = hero.key === answer.key;
    const newEffective = newGuesses.length + hintsUsed.length;
    const lost = !won && newEffective >= MAX_GUESSES;
    opts.onGuessSubmitted?.({
      guessNumber: newGuesses.length,
      isCorrect: won,
      hero,
    });
    persistState({ ...state, guesses: newGuesses, won, lost });
    if (won || lost) {
      opts.onTerminal?.({
        outcome: won ? "won" : "lost",
        guesses: newGuesses.length,
        hints: hintsUsed.length,
      });
    }
  };

  // The hint button opens the confirmation modal. We pick the attribute now
  // and stash it as pendingHint so the modal's confirm handler operates on a
  // stable choice even if guess state mutates while the modal is open.
  const handleHint = () => {
    if (ended) return;
    const picked = pickHintAttr(guessedHeroes, answer, hintsUsed);
    if (!picked) return;
    setPendingHint(picked);
  };

  const confirmHint = () => {
    const picked = pendingHint;
    setPendingHint(null);
    if (!picked || ended) return;
    const newHints = [...hintsUsed, picked];
    const newOrder = [...(state.hintOrder ?? []), state.guesses.length];
    const newEffective = state.guesses.length + newHints.length;
    const lost = !state.won && newEffective >= MAX_GUESSES;
    opts.onHintUsed?.({
      hintIndex: hintsUsed.length,
      atGuessNumber: state.guesses.length,
      attr: picked,
    });
    persistState({
      ...state,
      hintsUsed: newHints,
      hintOrder: newOrder,
      lost,
    });
    if (lost) {
      opts.onTerminal?.({
        outcome: "lost",
        guesses: state.guesses.length,
        hints: newHints.length,
      });
    }
  };

  const cancelHint = () => setPendingHint(null);

  const resetRound = () => {
    const fresh =
      opts.stampAnswerKey && answer
        ? { ...freshRound(day), answerKey: answer.key }
        : freshRound(day);
    setPendingHint(null);
    setState(fresh);
    if (persist) saveModeState(storageMode, fresh);
  };

  // Hint availability resolves through three gates:
  //   (1) hints remain (under MAX_HINTS)
  //   (2) at least 2 effective slots remain — using a hint with 1 slot left
  //       would auto-lose, so we lock the button at that point
  //   (3) the natural threshold is hit OR the player is on their 2nd-to-last
  //       guess (effectiveRemaining === 2 rescue rule)
  const nextHintIndex = hintsUsed.length;
  const hintsRemaining = MAX_HINTS - nextHintIndex;
  const effectiveRemaining = MAX_GUESSES - effectiveUsed;
  const tooFewSlots = effectiveRemaining <= 1;
  const thresholdMet =
    nextHintIndex < MAX_HINTS &&
    state.guesses.length >= HINT_UNLOCK_AT[nextHintIndex];
  const safetyMet = effectiveRemaining === 2;
  const canHint =
    !ended && hintsRemaining > 0 && !tooFewSlots && (thresholdMet || safetyMet);

  return {
    day,
    answer,
    state,
    guessedHeroes,
    timeline,
    hintsUsed,
    effectiveUsed,
    cap: MAX_GUESSES,
    ended,
    excludeKeys,
    canHint,
    hintsRemaining,
    nextUnlockAt: HINT_UNLOCK_AT[nextHintIndex] ?? null,
    effectiveRemaining,
    tooFewSlots,
    pendingHint,
    handleGuess,
    handleHint,
    confirmHint,
    cancelHint,
    resetRound,
  };
}

// The shared board view. Renders the input row (while the round is live),
// the caller's `reveal` chrome, the guess/hint timeline, the first-guess
// legend, and the hint-confirm modal — in the exact order the daily used,
// so the daily is visually unchanged. Variant-specific reveal cards are
// injected through `reveal` so this view never learns about daily vs
// archive.
export function ClassicBoard({
  round,
  reveal,
}: {
  round: ClassicRound;
  reveal?: ReactNode;
}) {
  const { answer, state, ended, effectiveUsed, cap, timeline } = round;

  return (
    <>
      {!ended && (
        <div className="mb-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <GuessRemaining used={effectiveUsed} cap={cap} />
            <HintButton
              canHint={round.canHint}
              hintsRemaining={round.hintsRemaining}
              nextUnlockAt={round.nextUnlockAt}
              wrongCount={state.guesses.length}
              effectiveRemaining={round.effectiveRemaining}
              tooFewSlots={round.tooFewSlots}
              onClick={round.handleHint}
            />
          </div>
          <HeroCombobox
            heroes={HEROES}
            excludeKeys={round.excludeKeys}
            onSelect={round.handleGuess}
          />
        </div>
      )}

      {reveal}

      {/* Guess history (newest at top) — interleaves real guesses with
          hint rows. A hint renders as an auto-submitted-style row: blank
          portrait slot labelled "Hint used", one green tile at the
          revealed attribute's position, dashes for the others. */}
      <div className="space-y-4">
        <AnimatePresence initial={false}>
          {[...timeline].reverse().map((entry, revIdx) => {
            const originalIdx = timeline.length - 1 - revIdx;
            const isLatest = originalIdx === timeline.length - 1;
            if (entry.kind === "hint") {
              return (
                <HintGuessRow
                  key={`hint-${entry.chronoIdx}`}
                  attr={entry.attr}
                  answer={answer}
                  isLatest={isLatest}
                />
              );
            }
            return (
              <GuessRow
                key={`guess-${entry.chronoIdx}-${entry.hero.key}`}
                guess={entry.hero}
                answer={answer}
                isLatest={isLatest}
              />
            );
          })}
        </AnimatePresence>
      </div>

      {state.guesses.length === 0 && !ended && (
        <div className="mt-10 rounded-(--radius-card) border border-dashed border-line bg-muted p-6 sm:p-8">
          {/* First-guess legend — surfaces the tile-color semantics inline
              so first-time players don't have to detour to /how-to-play to
              interpret their first row of feedback. */}
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            <span className="utility-label text-[10px] text-ink-faint">
              Tiles mean
            </span>
            <LegendChip color="correct" label="Match" />
            <LegendChip color="partial" label="Close" />
            <LegendChip color="far" label="Far" />
            <LegendChip color="wrong" label="Miss" />
            <span className="utility-label text-[10px] text-ink-faint">
              ↑ ↓ point toward the answer
            </span>
          </div>
        </div>
      )}

      <HintConfirmModal
        open={round.pendingHint !== null}
        effectiveRemaining={cap - effectiveUsed}
        hintsLeftAfter={Math.max(0, round.hintsRemaining - 1)}
        onConfirm={round.confirmHint}
        onCancel={round.cancelHint}
      />
    </>
  );
}

// Picks an attribute whose value the player doesn't yet know. "Known" = any
// prior guess landed a green tile on that attribute, or a hint already
// covers it. Falls back to a random non-hinted attribute if every attribute
// is already known (shouldn't happen pre-win, but the guard keeps the call
// total).
function pickHintAttr(
  guesses: Hero[],
  answer: Hero,
  hintsUsed: AttrKey[],
): AttrKey | null {
  const solved = new Set<AttrKey>(hintsUsed);
  for (const g of guesses) {
    for (const r of compareHero(g, answer)) {
      if (r.status === "correct") solved.add(r.attr);
    }
  }
  const candidates = ATTRIBUTES.map((a) => a.key).filter((k) => !solved.has(k));
  if (candidates.length === 0) {
    const remaining = ATTRIBUTES.map((a) => a.key).filter(
      (k) => !hintsUsed.includes(k),
    );
    if (remaining.length === 0) return null;
    return remaining[Math.floor(Math.random() * remaining.length)];
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function HintButton({
  canHint,
  hintsRemaining,
  nextUnlockAt,
  wrongCount,
  effectiveRemaining,
  tooFewSlots,
  onClick,
}: {
  canHint: boolean;
  hintsRemaining: number;
  nextUnlockAt: number | null;
  wrongCount: number;
  effectiveRemaining: number;
  tooFewSlots: boolean;
  onClick: () => void;
}) {
  if (hintsRemaining <= 0) {
    return (
      <span className="utility-label text-[10px] text-ink-faint">
        Hints used
      </span>
    );
  }
  if (tooFewSlots) {
    // Visible but disabled so the player understands the affordance is
    // there, just out of reach on their final attempt.
    return (
      <button
        type="button"
        disabled
        className="inline-flex cursor-not-allowed items-center gap-2 rounded-(--radius-card) border border-line bg-muted px-3 py-1.5 utility-label text-[10px] text-ink-faint"
        title="Hint locked on your last guess."
      >
        <span aria-hidden className="grayscale">
          💡
        </span>
        <span>Hint locked · last guess</span>
      </button>
    );
  }
  if (!canHint && nextUnlockAt !== null) {
    // Soonest unlock between the natural threshold and the 2-remaining
    // safety net. The min keeps the countdown honest as the player
    // approaches either condition.
    const toThreshold = Math.max(0, nextUnlockAt - wrongCount);
    const toSafety = Math.max(0, effectiveRemaining - 2);
    const need = Math.min(toThreshold, toSafety);
    return (
      <span className="utility-label text-[10px] text-ink-faint">
        Hint in {need} {need === 1 ? "guess" : "guesses"}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!canHint}
      className="inline-flex items-center gap-2 rounded-(--radius-card) border border-line bg-card px-3 py-1.5 utility-label text-[10px] text-accent transition-colors hover:border-edge disabled:cursor-not-allowed disabled:opacity-50"
      title={`${hintsRemaining} ${hintsRemaining === 1 ? "hint" : "hints"} remaining. Reveals one attribute and consumes one of your guesses.`}
    >
      <span aria-hidden>💡</span>
      <span>Hint ×{hintsRemaining} · costs a guess</span>
    </button>
  );
}

// Hint reveal rendered as if it were an auto-submitted guess — slots into
// the guess history alongside real guesses. Portrait area is replaced with a
// dashed accent placeholder labelled "Hint used"; the revealed attribute
// lands as a green tile in its canonical position, and every other tile in
// the row is a dash so the row reads as a partial info-leak rather than a
// full guess.
function HintGuessRow({
  attr,
  answer,
  isLatest,
}: {
  attr: AttrKey;
  answer: Hero;
  isLatest: boolean;
}) {
  const display = formatHintValue(attr, answer);
  const meta = ATTRIBUTES.find((a) => a.key === attr);
  return (
    <motion.div
      layout
      initial={isLatest ? { opacity: 0, y: -12 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col gap-3 rounded-(--radius-card) outline outline-2 outline-accent outline-offset-2 md:flex-row md:items-stretch md:gap-2"
    >
      <div className="flex items-center gap-3 md:w-44 md:shrink-0 md:gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-(--radius-card) bg-accent text-on-accent">
          <span aria-hidden className="text-2xl">
            💡
          </span>
        </div>
        <div className="min-w-0">
          <div className="truncate font-display text-base font-bold uppercase tracking-wide text-accent">
            Hint
          </div>
          <div className="truncate utility-label text-[10px] text-ink-faint">
            {meta?.label ?? attr} revealed
          </div>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-4 gap-1.5 sm:grid-cols-8 sm:gap-2">
        {ATTRIBUTES.map((a, i) => {
          const isRevealed = a.key === attr;
          if (isRevealed) {
            return (
              <motion.div
                key={a.key}
                initial={isLatest ? { rotateX: -90, opacity: 0 } : false}
                animate={{ rotateX: 0, opacity: 1 }}
                transition={
                  isLatest
                    ? {
                        duration: 0.45,
                        delay: i * 0.08,
                        ease: [0.22, 1, 0.36, 1],
                      }
                    : { duration: 0 }
                }
                style={{
                  transformOrigin: "top center",
                  transformStyle: "preserve-3d",
                }}
                className="tile-shape relative flex min-h-[72px] flex-col items-center justify-center bg-correct px-2 py-2 text-center text-on-correct sm:min-h-[80px]"
              >
                <div className="utility-label text-[9px] opacity-70">
                  {a.label}
                </div>
                <div className="mt-1 flex items-center gap-1 font-display text-sm leading-tight sm:text-base">
                  <span className="font-medium">{display}</span>
                </div>
              </motion.div>
            );
          }
          return (
            <div
              key={a.key}
              className="tile-shape relative flex min-h-[72px] flex-col items-center justify-center border border-dashed border-line bg-muted px-2 py-2 text-center text-ink-faint sm:min-h-[80px]"
              aria-hidden
            >
              <span className="font-display text-base leading-none">—</span>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

function formatHintValue(attr: AttrKey, answer: Hero): string {
  const v: unknown =
    attr === "role"
      ? answer.role
      : attr === "country"
        ? answer.country
        : attr === "affiliation"
          ? answer.affiliation
          : attr === "species"
            ? answer.species
            : attr === "gender"
              ? answer.gender
              : attr === "age"
                ? answer.age
                : attr === "release_year"
                  ? answer.release_year
                  : attr === "hp"
                    ? answer.hp
                    : null;
  if (v == null || v === "") return "?";
  if (typeof v === "number") return String(v);
  // Title-case categorical values (matches compare.ts display logic).
  return String(v)
    .split(" ")
    .map((w) =>
      w
        .split("-")
        .map((p) => p[0]?.toUpperCase() + p.slice(1))
        .join("-"),
    )
    .join(" ");
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
      <span className="utility-label text-[10px] text-ink-soft">
        {label}
      </span>
    </span>
  );
}
