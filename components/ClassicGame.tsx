"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { HEROES, HEROES_BY_KEY, type Hero } from "@/lib/heroes";
import { dayString, getHeroForDay, prettyDay } from "@/lib/daily";
import { loadClassic, saveClassic, type ClassicState } from "@/lib/storage";
import { ATTRIBUTES, compareHero, type AttrKey } from "@/lib/compare";
import {
  trackGuessSubmitted,
  trackHintUsed,
  trackModeCompleted,
  trackModeStarted,
} from "@/lib/tracking";
import { HeroCombobox } from "./HeroCombobox";
import { GuessRow } from "./GuessRow";
import { Brand } from "./Brand";
import { NextModeCTA } from "./NextModeCTA";
import { LossReveal } from "./LossReveal";
import { GuessRemaining } from "./GuessRemaining";
import { ModeStatsLine } from "./ModeStatsLine";
import { DevViewToggle, useDevViewState } from "./DevViewToggle";
import { DevHeroPicker } from "./DevHeroPicker";
import { HintConfirmModal } from "./HintConfirmModal";
import { ShareButton } from "./ShareButton";
import { TextShareBlock } from "./TextShareBlock";
import { buildClassicShareText } from "@/lib/share";
import { roundShareLinks } from "@/lib/shareLinks";
import { useShareLinkVisit } from "@/lib/useShareLinkVisit";
import { DailyCompleteResultCard } from "./DailyCompleteResultCard";
import { TryDeadlockleCard } from "./TryDeadlockleCard";
import { isDailyComplete } from "@/lib/storage";
import { BUILT_MODE_SLUGS } from "@/lib/modes";

const IS_DEV = process.env.NODE_ENV !== "production";

// Hard cap on combined guesses + hints. Past this with no win, the round
// ends as a loss and the answer is revealed in a muted "Better luck
// tomorrow" card.
const MAX_GUESSES = 8;

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
const MAX_HINTS = HINT_UNLOCK_AT.length;

export function ClassicGame() {
  // Inbound share-link attribution (?c= from /r/[code] redirects).
  useShareLinkVisit("classic");
  const [day, setDay] = useState<string | null>(null);
  const [state, setState] = useState<ClassicState | null>(null);
  // Dev-only view toggle + override hero. When override is set we
  // serve that hero instead of the daily seed and skip localStorage
  // saves so test playthroughs don't pollute the user's real progress.
  const [devView, setDevView] = useDevViewState("classic");
  const [overrideHero, setOverrideHero] = useState<Hero | null>(null);
  const isOverride = overrideHero !== null;
  // Pending hint pick — held in state while the confirmation modal is
  // open. The picker runs once when the modal opens so the modal's
  // confirm path uses the same attribute the user agreed to reveal,
  // even if the picker would have returned a different value by the
  // time they clicked Confirm (e.g., guess state mutated in between).
  const [pendingHint, setPendingHint] = useState<AttrKey | null>(null);

  useEffect(() => {
    const d = dayString();
    setDay(d);
    setState(loadClassic(d));
  }, []);

  const answer = overrideHero ?? (day ? getHeroForDay(day) : null);

  // mode_started — once per day, skip dev overrides so test runs don't
  // pollute prod analytics. The tracker itself dedupes via localStorage.
  useEffect(() => {
    if (!day || isOverride) return;
    const ans = getHeroForDay(day);
    if (!ans) return;
    trackModeStarted({ mode: "classic", dailyId: day, answerId: ans.key });
  }, [day, isOverride]);

  // mode_completed — fires once when the round transitions to won or
  // lost. Tracker dedupes; effect watches the two terminal flags only.
  const won = state?.won === true;
  const lost = state?.lost === true;
  useEffect(() => {
    if (!day || isOverride) return;
    if (!won && !lost) return;
    const ans = getHeroForDay(day);
    if (!ans) return;
    const guessesLen = state?.guesses.length ?? 0;
    const hintsLen = state?.hintsUsed?.length ?? 0;
    trackModeCompleted({
      mode: "classic",
      dailyId: day,
      outcome: won ? "won" : "lost",
      totalGuesses: guessesLen,
      cap: MAX_GUESSES,
      hintsUsed: hintsLen,
      bonusCorrect: state?.bonus?.correct ?? null,
      answerId: ans.key,
    });
  }, [
    day,
    isOverride,
    won,
    lost,
    state?.guesses.length,
    state?.hintsUsed?.length,
  ]);

  // Switching the override hero starts a fresh in-memory round so
  // previous guesses don't bleed into the new puzzle. Switching back
  // to "today" rehydrates the saved daily progress.
  const applyOverride = (hero: Hero | null) => {
    setOverrideHero(hero);
    if (hero) {
      setState({ day: day ?? "", guesses: [], hintsUsed: [], won: false });
    } else if (day) {
      setState(loadClassic(day));
    }
  };

  const guessedHeroes = useMemo(
    () =>
      (state?.guesses ?? [])
        .map((k) => HEROES_BY_KEY[k])
        .filter(Boolean) as Hero[],
    [state?.guesses],
  );

  // Merged timeline of guesses + hint reveals, in submit order. Hints
  // slot in after the guess they were taken following (order = the
  // wrong-guess count at hint time). Pre-Phase-3 states without
  // hintOrder fall through to the tail so the rows still appear, just
  // at the bottom of the history rather than in their original
  // chronological position.
  type TimelineEntry =
    | { kind: "guess"; hero: Hero; chronoIdx: number }
    | { kind: "hint"; attr: AttrKey; chronoIdx: number };
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
      while (
        hintIdx < hints.length &&
        (order[hintIdx] ?? 0) === g + 1
      ) {
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

  if (!day || !state || !answer) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-16">
        <div className="font-mono text-xs uppercase tracking-[0.2em] text-ink-faint">
          Loading…
        </div>
      </main>
    );
  }

  const hintsUsed: AttrKey[] = (state.hintsUsed ?? []) as AttrKey[];
  const effectiveUsed = state.guesses.length + hintsUsed.length;
  const ended = state.won || state.lost === true;
  const excludeKeys = new Set(state.guesses);

  const persist = (next: ClassicState) => {
    setState(next);
    // Skip writes while a dev override is active so the saved daily
    // run stays clean.
    if (!isOverride) saveClassic(next);
  };

  const handleGuess = (hero: Hero) => {
    if (ended) return;
    const newGuesses = [...state.guesses, hero.key];
    const won = hero.key === answer.key;
    const newEffective = newGuesses.length + hintsUsed.length;
    const lost = !won && newEffective >= MAX_GUESSES;
    if (!isOverride) {
      trackGuessSubmitted({
        mode: "classic",
        dailyId: day,
        guessNumber: newGuesses.length,
        isCorrect: won,
        guessId: hero.key,
        answerId: answer.key,
      });
    }
    persist({ ...state, guesses: newGuesses, won, lost });
  };

  // The hint button opens the custom confirmation modal. We pick the
  // attribute now and stash it as `pendingHint` so the modal's confirm
  // handler operates on a stable choice.
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
    if (!isOverride) {
      trackHintUsed({
        mode: "classic",
        dailyId: day,
        hintIndex: hintsUsed.length,
        atGuessNumber: state.guesses.length,
        attributeRevealed: picked,
      });
    }
    persist({ ...state, hintsUsed: newHints, hintOrder: newOrder, lost });
  };

  const cancelHint = () => setPendingHint(null);

  // Hint availability resolves through three gates:
  //   (1) hints remain (under MAX_HINTS)
  //   (2) at least 2 effective slots remain — using a hint with 1 slot
  //       left would auto-lose, so we lock the button at that point
  //   (3) the natural threshold is hit OR the player is on their 2nd-to-
  //       last guess (effectiveRemaining === 2 rescue rule)
  const nextHintIndex = hintsUsed.length;
  const hintsRemaining = MAX_HINTS - nextHintIndex;
  const effectiveRemaining = MAX_GUESSES - effectiveUsed;
  const tooFewSlots = effectiveRemaining <= 1;
  const thresholdMet =
    nextHintIndex < MAX_HINTS &&
    state.guesses.length >= HINT_UNLOCK_AT[nextHintIndex];
  const safetyMet = effectiveRemaining === 2;
  const canHint =
    !ended &&
    hintsRemaining > 0 &&
    !tooFewSlots &&
    (thresholdMet || safetyMet);

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

      {IS_DEV && (
        <div className="mb-4 flex justify-center">
          <DevViewToggle
            mode="classic"
            active={devView}
            onChange={setDevView}
          />
        </div>
      )}
      {IS_DEV && devView && (
        <DevHeroPicker
          label="Classic"
          currentHeroKey={answer.key}
          overrideActive={isOverride}
          onApply={applyOverride}
        />
      )}

      {!ended && (
        <div className="mb-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <GuessRemaining used={effectiveUsed} cap={MAX_GUESSES} />
            <HintButton
              canHint={canHint}
              hintsRemaining={hintsRemaining}
              hintsTotal={MAX_HINTS}
              nextUnlockAt={HINT_UNLOCK_AT[nextHintIndex] ?? null}
              wrongCount={state.guesses.length}
              effectiveRemaining={effectiveRemaining}
              tooFewSlots={tooFewSlots}
              onClick={handleHint}
            />
          </div>
          <HeroCombobox
            heroes={HEROES}
            excludeKeys={excludeKeys}
            onSelect={handleGuess}
          />
        </div>
      )}

      <AnimatePresence>
        {state.won &&
          (isDailyComplete({
            day,
            currentMode: "classic",
            currentDone: true,
            builtSlugs: BUILT_MODE_SLUGS,
          }) ? (
            <ClassicDailyComplete
              key="win-daily"
              answer={answer}
              guesses={effectiveUsed}
              hintsUsed={hintsUsed.length}
              outcome="won"
              day={day}
            />
          ) : (
            <motion.div
              key="win"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="result-card mx-auto mb-8 w-full max-w-md rounded-(--radius-card) border border-correct/40 bg-correct/10 p-4 sm:p-5"
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
                    <div className="mt-1 font-display text-3xl text-ink">
                      {answer.name}{" "}
                      <span className="text-ink-soft">
                        in {effectiveUsed}
                      </span>
                    </div>
                    {hintsUsed.length > 0 && (
                      <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
                        💡 used {hintsUsed.length}{" "}
                        {hintsUsed.length === 1 ? "hint" : "hints"}
                      </div>
                    )}
                    <ModeStatsLine mode="classic" />
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <NextModeCTA current="classic" />
                  <ShareButton
                    {...roundShareLinks({
                      day,
                      slug: "classic",
                      outcome: "won",
                      guesses: state.guesses.length,
                      hints: hintsUsed.length,
                    })}
                    filename={`owdle-classic-${day}.png`}
                    surface="round_result"
                    mode="classic"
                    dailyId={day}
                  />
                </div>
                {/* Emoji-grid text share — the guess path as 🟩🟨🟥 rows
                    (latest first, capped), LoLdle-style. Zero-friction
                    copy/paste alongside the image share above. */}
                <TextShareBlock
                  text={buildClassicShareText({
                    guesses: state.guesses,
                    answer,
                    won: true,
                    hints: hintsUsed.length,
                    // Personalized round link — the pasted text unfurls
                    // the spoiler-free result card in link-preview chats.
                    url: roundShareLinks({
                      day,
                      slug: "classic",
                      outcome: "won",
                      guesses: state.guesses.length,
                      hints: hintsUsed.length,
                    }).url,
                  })}
                  surface="round_result"
                  mode="classic"
                  dailyId={day}
                />
              </div>
            </motion.div>
          ))}
      </AnimatePresence>

      <AnimatePresence>
        {state.lost &&
          !state.won &&
          (isDailyComplete({
            day,
            currentMode: "classic",
            currentDone: true,
            builtSlugs: BUILT_MODE_SLUGS,
          }) ? (
            <ClassicDailyComplete
              key="loss-daily"
              answer={answer}
              guesses={state.guesses.length}
              hintsUsed={hintsUsed.length}
              outcome="lost"
              day={day}
            />
          ) : (
            <LossReveal
              current="classic"
              share={
                <ShareButton
                  {...roundShareLinks({
                    day,
                    slug: "classic",
                    outcome: "lost",
                    guesses: state.guesses.length,
                    hints: hintsUsed.length,
                  })}
                  filename={`owdle-classic-${day}.png`}
                  surface="round_result"
                  mode="classic"
                  dailyId={day}
                />
              }
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={answer.portrait}
                  alt=""
                  className="h-16 w-16 rounded-(--radius-card) bg-muted object-cover sm:h-20 sm:w-20"
                />
                <div className="flex-1">
                  <div className="font-display text-3xl text-ink">
                    {answer.name}
                  </div>
                  <div className="mt-1 font-mono text-xs uppercase tracking-[0.18em] text-ink-faint">
                    {state.guesses.length} guesses
                    {hintsUsed.length > 0 && ` · ${hintsUsed.length} hint${hintsUsed.length === 1 ? "" : "s"}`}
                  </div>
                  <ModeStatsLine mode="classic" />
                </div>
              </div>
            </LossReveal>
          ))}
      </AnimatePresence>

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

      <HintConfirmModal
        open={pendingHint !== null}
        effectiveRemaining={MAX_GUESSES - effectiveUsed}
        hintsLeftAfter={Math.max(0, hintsRemaining - 1)}
        onConfirm={confirmHint}
        onCancel={cancelHint}
      />
    </main>
  );
}

// Picks an attribute whose value the player doesn't yet know. "Known" =
// any prior guess landed a green tile on that attribute, or a hint
// already covers it. Falls back to a random non-hinted attribute if
// every attribute is already known (shouldn't happen pre-win, but the
// guard keeps the call total).
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
  hintsTotal,
  nextUnlockAt,
  wrongCount,
  effectiveRemaining,
  tooFewSlots,
  onClick,
}: {
  canHint: boolean;
  hintsRemaining: number;
  hintsTotal: number;
  nextUnlockAt: number | null;
  wrongCount: number;
  effectiveRemaining: number;
  tooFewSlots: boolean;
  onClick: () => void;
}) {
  if (hintsRemaining <= 0) {
    return (
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">
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
        className="inline-flex cursor-not-allowed items-center gap-2 rounded-(--radius-card) border border-line/60 bg-muted/30 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint opacity-60"
        title="Hint locked on your last guess."
      >
        <span aria-hidden>💡</span>
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
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">
        Hint in {need} {need === 1 ? "guess" : "guesses"}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!canHint}
      className="inline-flex items-center gap-2 rounded-(--radius-card) border border-accent/50 bg-accent/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-accent transition-colors hover:bg-accent/15 disabled:cursor-not-allowed disabled:opacity-50"
      title={`${hintsRemaining} ${hintsRemaining === 1 ? "hint" : "hints"} remaining. Reveals one attribute and consumes one of your guesses.`}
    >
      <span aria-hidden>💡</span>
      <span>Hint ×{hintsRemaining} · costs a guess</span>
    </button>
  );
}

// Hint reveal rendered as if it were an auto-submitted guess — slots
// into the guess history alongside real guesses. Portrait area is
// replaced with a dashed accent placeholder labelled "Hint used"; the
// revealed attribute lands as a green tile in its canonical position,
// and every other tile in the row is a dash so the row reads as a
// partial info-leak rather than a full guess.
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
      className="flex flex-col gap-3 rounded-(--radius-card) outline outline-2 outline-accent/40 outline-offset-2 md:flex-row md:items-stretch md:gap-2"
    >
      <div className="flex items-center gap-3 md:w-44 md:shrink-0 md:gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-(--radius-card) bg-accent/15 text-accent ring-1 ring-accent/50">
          <span aria-hidden className="text-2xl">
            💡
          </span>
        </div>
        <div className="min-w-0">
          <div className="truncate font-display text-base font-bold uppercase tracking-wide text-accent">
            Hint
          </div>
          <div className="truncate font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
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
                <div className="font-mono text-[9px] uppercase tracking-[0.18em] opacity-70">
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
              className="tile-shape relative flex min-h-[72px] flex-col items-center justify-center border border-dashed border-line/40 bg-inset/30 px-2 py-2 text-center text-ink-faint sm:min-h-[80px]"
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
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
        {label}
      </span>
    </span>
  );
}

// Classic-specific wrapper around DailyCompleteResultCard. Owns the
// mode-specific summary row (portrait + "Symmetra in 5" + hints used)
// and the TryDeadlockleCard sibling that the user wanted OUTSIDE the
// result card chrome.
function ClassicDailyComplete({
  answer,
  guesses,
  hintsUsed,
  outcome,
  day,
}: {
  answer: Hero;
  guesses: number;
  hintsUsed: number;
  outcome: "won" | "lost";
  day: string;
}) {
  const summary = (
    <div className="flex items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={answer.portrait}
        alt=""
        className="h-14 w-14 rounded-(--radius-card) bg-muted object-cover sm:h-16 sm:w-16"
      />
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-info">
          Classic {outcome === "won" ? "Solved" : "Missed"}
        </div>
        <div className="mt-0.5 truncate font-display text-xl text-ink sm:text-2xl">
          {answer.name}
          {outcome === "won" && (
            <span className="text-ink-soft"> in {guesses}</span>
          )}
        </div>
        {hintsUsed > 0 && (
          <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
            💡 used {hintsUsed} {hintsUsed === 1 ? "hint" : "hints"}
          </div>
        )}
      </div>
    </div>
  );
  return (
    <>
      <DailyCompleteResultCard
        mode="classic"
        guesses={guesses}
        outcome={outcome}
        day={day}
        summary={summary}
      />
      <div className="mx-auto mt-8 mb-10 w-full max-w-lg">
        <TryDeadlockleCard />
      </div>
    </>
  );
}
