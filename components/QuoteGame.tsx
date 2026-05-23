"use client";

// Quote mode plays as a "Conversation" puzzle: a pre-match exchange between
// two heroes. The player picks which speaker to guess via a segmented
// toggle, then enters a hero in a single combobox. The toggle auto-jumps
// to the unsolved speaker after a correct guess. Guesses go into a unified
// history at the bottom, each tagged with which speaker they were
// targeting and showing attribute tiles vs that speaker.
//
// Audio hint cadence: line 1's voice clip unlocks AT guess 5; line 2's
// clip unlocks AT guess 7. No further unlocks after that — even for
// 3+ line conversations, only the first two lines ever get audio. Past
// guess 8 the round ends as a loss.
//
// Hard cap on combined guesses (across both speakers). Player loses on
// the cap-th wrong move; both speakers reveal in a muted LossReveal.

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { HEROES, HEROES_BY_KEY, type Hero } from "@/lib/heroes";
import { dayString, getConversationForDay, prettyDay } from "@/lib/daily";
import type { Conversation } from "@/lib/conversations";
import { compareHero } from "@/lib/compare";
import {
  loadConversationState,
  saveConversationState,
  type ConversationGuess,
  type ConversationState,
} from "@/lib/storage";
import { HeroCombobox } from "./HeroCombobox";
import { AttributeTile } from "./AttributeTile";
import { Brand } from "./Brand";
import { media } from "@/lib/media";
import {
  trackGuessSubmitted,
  trackModeCompleted,
  trackModeStarted,
} from "@/lib/tracking";
import { NextModeCTA } from "./NextModeCTA";
import { LossReveal } from "./LossReveal";
import { GuessRemaining } from "./GuessRemaining";
import { ModeStatsLine } from "./ModeStatsLine";
import { DevViewToggle, useDevViewState } from "./DevViewToggle";
import { DevQuotePicker } from "./DevQuotePicker";
import clsx from "clsx";

const IS_DEV = process.env.NODE_ENV !== "production";

const MAX_GUESSES = 8;

// Discrete audio unlocks. Line 1 at guess 5, line 2 at guess 7. Capped
// at totalLines so 2-line conversations don't pretend to have a line-3
// to unlock.
function audioUnlockedCount(guessCount: number, totalLines: number): number {
  if (guessCount >= 7) return Math.min(2, totalLines);
  if (guessCount >= 5) return Math.min(1, totalLines);
  return 0;
}

function nextAudioAt(
  unlocked: number,
  totalLines: number,
): number | null {
  if (unlocked === 0 && totalLines >= 1) return 5;
  if (unlocked === 1 && totalLines >= 2) return 7;
  return null;
}

export function QuoteGame() {
  const [day, setDay] = useState<string | null>(null);
  const [state, setState] = useState<ConversationState | null>(null);
  // Which speaker the toggle is pointed at when *both* are still unsolved.
  // Once one is solved, `activeTarget` is forced to the unsolved one.
  const [chosenTarget, setChosenTarget] = useState<0 | 1>(0);
  // Dev-only view + conversation override.
  const [devView, setDevView] = useDevViewState("quote");
  const [overrideConv, setOverrideConv] = useState<Conversation | null>(null);
  const isOverride = overrideConv !== null;

  const applyOverride = (conv: Conversation | null) => {
    setOverrideConv(conv);
    if (!conv) {
      // Back to daily; rehydrate today's saved state so paused
      // progress isn't lost.
      if (day) {
        const loaded = loadConversationState(day);
        setState(loaded);
      }
      return;
    }
    setState({
      day: day ?? "",
      speakers: [conv.speakers[0], conv.speakers[1]],
      guesses: [],
      won: false,
    });
    setChosenTarget(0);
  };

  useEffect(() => {
    const d = dayString();
    setDay(d);
    const loaded = loadConversationState(d);
    // If the saved state is for a different conversation than today's pick
    // (because the pool or seed rotated), drop it so the user starts fresh.
    const { speakers: today } = getConversationForDay(d);
    const todayPair: [string, string] = [today[0].key, today[1].key];
    const matchesToday =
      loaded.speakers?.[0] === todayPair[0] &&
      loaded.speakers?.[1] === todayPair[1];
    if (loaded.guesses.length > 0 && !matchesToday) {
      const fresh: ConversationState = {
        day: d,
        speakers: todayPair,
        guesses: [],
        won: false,
      };
      setState(fresh);
      saveConversationState(fresh);
    } else {
      setState({ ...loaded, speakers: todayPair });
    }
  }, []);

  // mode_started — once per day, skip dev overrides.
  useEffect(() => {
    if (!day || isOverride) return;
    const { speakers: sp } = getConversationForDay(day);
    const answerId = `${sp[0].key}_${sp[1].key}`;
    trackModeStarted({ mode: "quote", dailyId: day, answerId });
  }, [day, isOverride]);

  // mode_completed — fires on terminal transition.
  const stateWon = state?.won === true;
  const stateLost = state?.lost === true;
  useEffect(() => {
    if (!day || isOverride) return;
    if (!stateWon && !stateLost) return;
    const { speakers: sp } = getConversationForDay(day);
    const answerId = `${sp[0].key}_${sp[1].key}`;
    trackModeCompleted({
      mode: "quote",
      dailyId: day,
      outcome: stateWon ? "won" : "lost",
      totalGuesses: state?.guesses.length ?? 0,
      cap: MAX_GUESSES,
      answerId,
      conversationId: answerId,
    });
  }, [day, isOverride, stateWon, stateLost, state?.guesses.length]);

  if (!day || !state) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-16">
        <div className="font-mono text-xs uppercase tracking-[0.2em] text-ink-faint">
          Loading…
        </div>
      </main>
    );
  }

  // Override path serves the picker's conversation; daily uses the
  // seeded one.
  const conversation: Conversation = overrideConv ?? getConversationForDay(day).conversation;
  const speakerA = HEROES_BY_KEY[conversation.speakers[0]];
  const speakerB = HEROES_BY_KEY[conversation.speakers[1]];
  if (!speakerA || !speakerB) {
    return null;
  }
  const speakers: [Hero, Hero] = [speakerA, speakerB];

  const aRevealed = state.guesses.some(
    (g) => g.target === 0 && g.heroKey === speakerA.key,
  );
  const bRevealed = state.guesses.some(
    (g) => g.target === 1 && g.heroKey === speakerB.key,
  );
  const won = aRevealed && bRevealed;
  const lost = state.lost === true;
  const ended = won || lost;

  // Per-target exclusion: a hero already tried as Speaker A can still be
  // tried as Speaker B (the player may correctly suspect them in the other
  // slot).
  const excludedA = new Set(
    state.guesses.filter((g) => g.target === 0).map((g) => g.heroKey),
  );
  const excludedB = new Set(
    state.guesses.filter((g) => g.target === 1).map((g) => g.heroKey),
  );

  const activeTarget: 0 | 1 = aRevealed ? 1 : bRevealed ? 0 : chosenTarget;

  // Two-stage reveal: `textLines` is how many lines are shown as actual text
  // (grows by one per guess), `renderedLines` includes a couple of blurred
  // placeholders past the text frontier so the player can see more dialogue
  // is coming. On end (win or loss) we show everything.
  const BLURRED_AHEAD = 2;
  const textLines = ended
    ? conversation.lines.length
    : Math.min(1 + state.guesses.length, conversation.lines.length);
  const renderedLines = ended
    ? conversation.lines.length
    : Math.min(textLines + BLURRED_AHEAD, conversation.lines.length);

  // Per-line audio unlocks. After a win OR loss, every line's button is
  // playable so the player can replay any voice line.
  const unlockedAudio = ended
    ? conversation.lines.length
    : audioUnlockedCount(state.guesses.length, conversation.lines.length);
  const nextUnlockGuess = nextAudioAt(
    unlockedAudio,
    conversation.lines.length,
  );
  const guessesUntilNextAudio =
    nextUnlockGuess !== null && !ended
      ? Math.max(0, nextUnlockGuess - state.guesses.length)
      : null;

  const handleGuess = (hero: Hero, target: 0 | 1) => {
    if (ended) return;
    const newGuess: ConversationGuess = { heroKey: hero.key, target };
    const newGuesses = [...state.guesses, newGuess];
    const newARevealed = newGuesses.some(
      (g) => g.target === 0 && g.heroKey === speakerA.key,
    );
    const newBRevealed = newGuesses.some(
      (g) => g.target === 1 && g.heroKey === speakerB.key,
    );
    const nextWon = newARevealed && newBRevealed;
    const nextLost = !nextWon && newGuesses.length >= MAX_GUESSES;
    const targetSpeaker = target === 0 ? speakerA : speakerB;
    if (!isOverride) {
      trackGuessSubmitted({
        mode: "quote",
        dailyId: day,
        guessNumber: newGuesses.length,
        isCorrect: hero.key === targetSpeaker.key,
        guessId: `${hero.key}@${target}`,
        answerId: `${speakerA.key}_${speakerB.key}`,
      });
    }
    const next: ConversationState = {
      day,
      speakers: [speakerA.key, speakerB.key],
      guesses: newGuesses,
      won: nextWon,
      lost: nextLost,
    };
    setState(next);
    if (!isOverride) saveConversationState(next);
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-16">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-info">
            <span suppressHydrationWarning>{prettyDay(day)}</span>
          </p>
          <h1 className="mt-3 font-display display-headline text-5xl text-ink sm:text-6xl">
            Quote
          </h1>
          <p className="mt-3 max-w-md text-ink-soft">
            A pre-match exchange between two heroes. Pick which speaker
            you&apos;re guessing, then enter a hero. More dialogue reveals as
            you go.
          </p>
        </div>
        <div className="hidden flex-col items-end font-mono text-xs uppercase tracking-[0.2em] text-ink-faint sm:flex">
          <Brand size="sm" />
          <span className="mt-1 text-info">conversation mode</span>
        </div>
      </header>

      {IS_DEV && (
        <div className="mb-4 flex justify-center">
          <DevViewToggle
            mode="quote"
            active={devView}
            onChange={setDevView}
          />
        </div>
      )}
      {IS_DEV && devView && (
        <DevQuotePicker
          currentSpeakers={[speakerA.key, speakerB.key]}
          overrideActive={isOverride}
          onApply={applyOverride}
        />
      )}

      <div className="mb-8 flex flex-col items-center">
        <ConversationCard
          conversation={conversation}
          speakers={[speakerA, speakerB]}
          aRevealed={aRevealed || lost}
          bRevealed={bRevealed || lost}
          textLines={textLines}
          renderedLines={renderedLines}
          unlockedAudio={unlockedAudio}
        />
      </div>

      {!ended && (
        <div className="mb-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <GuessRemaining used={state.guesses.length} cap={MAX_GUESSES} />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">
              {(aRevealed ? 1 : 0) + (bRevealed ? 1 : 0)} / 2 found
              {guessesUntilNextAudio !== null && (
                <>
                  {" · "}
                  <span className="text-accent-soft">
                    audio in {guessesUntilNextAudio}{" "}
                    {guessesUntilNextAudio === 1 ? "guess" : "guesses"}
                  </span>
                </>
              )}
            </span>
          </div>
          <SpeakerToggle
            activeTarget={activeTarget}
            aRevealed={aRevealed}
            bRevealed={bRevealed}
            speakerA={speakerA}
            speakerB={speakerB}
            onSelect={setChosenTarget}
          />
          <HeroCombobox
            heroes={HEROES}
            excludeKeys={activeTarget === 0 ? excludedA : excludedB}
            onSelect={(hero) => handleGuess(hero, activeTarget)}
            placeholder={
              activeTarget === 0
                ? "Guess Speaker A — enter a hero…"
                : "Guess Speaker B — enter a hero…"
            }
          />
        </div>
      )}

      <AnimatePresence>
        {won && (
          <motion.div
            key="win"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto mb-8 w-full max-w-md rounded-(--radius-card) border border-correct/40 bg-correct/10 p-4 sm:p-5"
          >
            <div className="flex flex-col gap-5">
              <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-center sm:text-left">
                <div className="flex shrink-0 -space-x-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={speakerA.portrait}
                    alt=""
                    className="h-16 w-16 rounded-(--radius-card) bg-muted object-cover ring-2 ring-canvas sm:h-20 sm:w-20"
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={speakerB.portrait}
                    alt=""
                    className="h-16 w-16 rounded-(--radius-card) bg-muted object-cover ring-2 ring-canvas sm:h-20 sm:w-20"
                  />
                </div>
                <div className="flex-1">
                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-info">
                    Solved
                  </div>
                  <div className="mt-1 font-display text-2xl text-ink sm:text-3xl">
                    {speakerA.name} & {speakerB.name}{" "}
                    <span className="text-ink-soft">
                      in {state.guesses.length}
                    </span>
                  </div>
                  <ModeStatsLine mode="quote" />
                </div>
              </div>
              <div className="flex justify-center sm:justify-start">
                <NextModeCTA current="quote" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {lost && !won && (
          <LossReveal current="quote">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex shrink-0 -space-x-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={speakerA.portrait}
                  alt=""
                  className="h-16 w-16 rounded-(--radius-card) bg-muted object-cover ring-2 ring-canvas sm:h-20 sm:w-20"
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={speakerB.portrait}
                  alt=""
                  className="h-16 w-16 rounded-(--radius-card) bg-muted object-cover ring-2 ring-canvas sm:h-20 sm:w-20"
                />
              </div>
              <div className="flex-1">
                <div className="font-display text-2xl text-ink sm:text-3xl">
                  {speakerA.name} & {speakerB.name}
                </div>
                <div className="mt-1 font-mono text-xs uppercase tracking-[0.18em] text-ink-faint">
                  {aRevealed && !bRevealed && (
                    <>caught Speaker A · missed Speaker B</>
                  )}
                  {bRevealed && !aRevealed && (
                    <>caught Speaker B · missed Speaker A</>
                  )}
                  {!aRevealed && !bRevealed && <>missed both speakers</>}
                </div>
                <ModeStatsLine mode="quote" />
              </div>
            </div>
          </LossReveal>
        )}
      </AnimatePresence>

      {/* Aggregated guess history (newest first) */}
      <div className="space-y-4">
        <AnimatePresence initial={false}>
          {[...state.guesses].reverse().map((g, revIdx) => {
            const hero = HEROES_BY_KEY[g.heroKey];
            if (!hero) return null;
            const speaker = g.target === 0 ? speakerA : speakerB;
            const originalIdx = state.guesses.length - 1 - revIdx;
            const isLatest = originalIdx === state.guesses.length - 1;
            return (
              <ConversationGuessRow
                key={`${originalIdx}-${g.heroKey}-${g.target}`}
                guess={hero}
                target={g.target}
                speaker={speaker}
                isCorrect={hero.key === speaker.key}
                isLatest={isLatest}
              />
            );
          })}
        </AnimatePresence>
      </div>

      {state.guesses.length === 0 && !ended && (
        <div className="mt-10 rounded-(--radius-card) border border-dashed border-line bg-inset/40 p-8 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-ink-faint">
            Pick which speaker you&apos;re guessing, then enter a hero. Each
            guess reveals more dialogue. Audio hints unlock at guess 5 and
            guess 7. You have {MAX_GUESSES} guesses total.
          </p>
        </div>
      )}
    </main>
  );
}

function SpeakerToggle({
  activeTarget,
  aRevealed,
  bRevealed,
  speakerA,
  speakerB,
  onSelect,
}: {
  activeTarget: 0 | 1;
  aRevealed: boolean;
  bRevealed: boolean;
  speakerA: Hero;
  speakerB: Hero;
  onSelect: (target: 0 | 1) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Choose which speaker to guess"
      className="grid grid-cols-2 gap-1 rounded-(--radius-card) border border-line bg-inset/60 p-1"
    >
      <SpeakerSegment
        target={0}
        active={activeTarget === 0}
        revealed={aRevealed}
        speaker={speakerA}
        fallbackLabel="Speaker A"
        tone="info"
        onClick={() => onSelect(0)}
      />
      <SpeakerSegment
        target={1}
        active={activeTarget === 1}
        revealed={bRevealed}
        speaker={speakerB}
        fallbackLabel="Speaker B"
        tone="accent-soft"
        onClick={() => onSelect(1)}
      />
    </div>
  );
}

function SpeakerSegment({
  active,
  revealed,
  speaker,
  fallbackLabel,
  tone,
  onClick,
}: {
  target: 0 | 1;
  active: boolean;
  revealed: boolean;
  speaker: Hero;
  fallbackLabel: string;
  tone: "info" | "accent-soft";
  onClick: () => void;
}) {
  // Active when both are unsolved is the player's choice; once solved, the
  // segment locks into a checked state regardless of `active`.
  const baseTone =
    tone === "info"
      ? "text-info"
      : "text-accent-soft";
  const activeBg =
    tone === "info"
      ? "bg-info/15 ring-1 ring-info/40"
      : "bg-accent-soft/15 ring-1 ring-accent-soft/40";

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      disabled={revealed}
      onClick={onClick}
      className={clsx(
        "flex min-h-[44px] items-center justify-center gap-2 rounded-(--radius-card) px-3 py-2 text-center font-mono text-[11px] uppercase tracking-[0.22em] transition-colors",
        revealed
          ? "bg-correct/15 text-correct ring-1 ring-correct/40 cursor-default"
          : active
            ? clsx(activeBg, baseTone)
            : clsx("bg-transparent text-ink-soft hover:bg-muted/40", baseTone),
      )}
    >
      {revealed ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={speaker.portrait}
            alt=""
            className="h-6 w-6 shrink-0 rounded-(--radius-pill) bg-muted object-cover"
          />
          <span className="truncate">✓ {speaker.name}</span>
        </>
      ) : (
        <span className="truncate">{fallbackLabel}</span>
      )}
    </button>
  );
}

function ConversationCard({
  conversation,
  speakers,
  aRevealed,
  bRevealed,
  textLines,
  renderedLines,
  unlockedAudio,
}: {
  conversation: Conversation;
  speakers: [Hero, Hero];
  aRevealed: boolean;
  bRevealed: boolean;
  textLines: number;
  renderedLines: number;
  unlockedAudio: number;
}) {
  // One Audio element per line — each line has its own file, no shared
  // seeking required. We track which line is playing to swap icon/label
  // and to stop any other line that was playing when a new one starts.
  const audioRefs = useRef<Record<number, HTMLAudioElement | null>>({});
  const [playingLine, setPlayingLine] = useState<number | null>(null);

  const stopAll = useCallback(() => {
    for (const a of Object.values(audioRefs.current)) {
      if (a) {
        a.pause();
        a.currentTime = 0;
      }
    }
    setPlayingLine(null);
  }, []);

  // Pause on unmount or when the conversation changes (day rollover).
  useEffect(() => {
    return () => stopAll();
  }, [stopAll]);
  useEffect(() => {
    stopAll();
    audioRefs.current = {};
  }, [conversation, stopAll]);

  const toggleLine = (i: number, audioUrl: string) => {
    if (playingLine === i) {
      stopAll();
      return;
    }
    stopAll();
    let audio = audioRefs.current[i];
    if (!audio) {
      audio = new Audio(media(audioUrl));
      audio.addEventListener("ended", () => {
        setPlayingLine((cur) => (cur === i ? null : cur));
      });
      audioRefs.current[i] = audio;
    }
    audio.currentTime = 0;
    audio
      .play()
      .then(() => setPlayingLine(i))
      .catch(() => setPlayingLine(null));
  };

  return (
    <motion.figure
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="tile-shape relative w-full max-w-2xl border border-line bg-muted/40 px-7 py-10 shadow-2xl shadow-black/10 sm:px-12 sm:py-14"
    >
      {conversation.context && (
        <p className="mb-7 font-mono text-[10px] uppercase tracking-[0.24em] text-info">
          {conversation.context}
        </p>
      )}

      <div className="space-y-7">
        {conversation.lines.slice(0, renderedLines).map((line, i) => {
          const isA = line.speaker === 0;
          const speakerHero = isA ? speakers[0] : speakers[1];
          const revealed = isA ? aRevealed : bRevealed;
          const visible = i < textLines;
          const audioReady = i < unlockedAudio && !!line.audio;

          return (
            <ConversationLineRow
              key={i}
              isA={isA}
              speakerHero={speakerHero}
              speakerLabel={`Speaker ${isA ? "A" : "B"}`}
              revealed={revealed}
              visible={visible}
              text={line.text}
              audioUnlocked={audioReady}
              audioPlaying={playingLine === i}
              onToggleAudio={() => line.audio && toggleLine(i, line.audio)}
            />
          );
        })}
      </div>
    </motion.figure>
  );
}

function ConversationLineRow({
  isA,
  speakerHero,
  speakerLabel,
  revealed,
  visible,
  text,
  audioUnlocked,
  audioPlaying,
  onToggleAudio,
}: {
  isA: boolean;
  speakerHero: Hero;
  speakerLabel: string;
  revealed: boolean;
  visible: boolean;
  text: string;
  audioUnlocked: boolean;
  audioPlaying: boolean;
  onToggleAudio: () => void;
}) {
  return (
    <motion.div
      layout
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em]">
          {revealed ? (
            <span className="text-correct">{speakerHero.name}</span>
          ) : (
            <span className={isA ? "text-info" : "text-accent-soft"}>
              {speakerLabel}
            </span>
          )}
        </p>
        {audioUnlocked && (
          <LineAudioButton
            playing={audioPlaying}
            tone={isA ? "info" : "accent-soft"}
            onToggle={onToggleAudio}
          />
        )}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {visible ? (
          <motion.p
            key="visible"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="font-display text-xl leading-snug text-ink sm:text-2xl"
          >
            “{text}”
          </motion.p>
        ) : (
          <motion.p
            key="hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="font-display text-xl leading-snug text-ink-faint sm:text-2xl select-none break-all"
            aria-hidden
          >
            {redactedFor(text)}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function LineAudioButton({
  playing,
  tone,
  onToggle,
}: {
  playing: boolean;
  tone: "info" | "accent-soft";
  onToggle: () => void;
}) {
  const toneClass =
    tone === "info"
      ? "border-info/40 bg-info/10 text-info hover:bg-info/15"
      : "border-accent-soft/50 bg-accent-soft/10 text-accent-soft hover:bg-accent-soft/15";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={playing ? "Stop voice line" : "Play this voice line"}
      className={clsx(
        "inline-flex h-6 w-6 items-center justify-center rounded-(--radius-pill) border transition-colors sm:h-9 sm:w-9",
        toneClass,
      )}
    >
      {playing ? <StopIcon /> : <PlayIcon />}
    </button>
  );
}

function PlayIcon() {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden
      className="h-2.5 w-2.5 shrink-0 sm:h-3.5 sm:w-3.5"
    >
      <path d="M3 2 L3 10 L10 6 Z" fill="currentColor" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden
      className="h-2.5 w-2.5 shrink-0 sm:h-3.5 sm:w-3.5"
    >
      <rect x="3" y="3" width="6" height="6" fill="currentColor" />
    </svg>
  );
}

function redactedFor(text: string): string {
  const len = Math.min(36, Math.max(18, Math.round(text.length * 0.6)));
  return "█".repeat(len);
}

function ConversationGuessRow({
  guess,
  target,
  speaker,
  isCorrect,
  isLatest,
}: {
  guess: Hero;
  target: 0 | 1;
  speaker: Hero;
  isCorrect: boolean;
  isLatest: boolean;
}) {
  const targetLabel = target === 0 ? "A" : "B";
  const targetColor = target === 0 ? "text-info" : "text-accent-soft";
  const results = compareHero(guess, speaker);

  return (
    <motion.div
      layout
      initial={isLatest ? { opacity: 0, y: -12 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col gap-3"
    >
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={guess.portrait}
          alt=""
          width={56}
          height={56}
          className="h-14 w-14 shrink-0 rounded-(--radius-card) bg-muted object-cover"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-base font-medium text-ink">
            {guess.name}
          </div>
          <div className="truncate font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
            {guess.role} · {guess.subrole ?? "—"}
          </div>
        </div>
        <span
          className={clsx(
            "shrink-0 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em]",
            "border",
            isCorrect
              ? "border-correct/50 bg-correct/15 text-correct"
              : `border-line bg-muted/50 ${targetColor}`,
          )}
        >
          {isCorrect ? "✓" : "for"} Speaker {targetLabel}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8 sm:gap-2">
        {results.map((r, i) => (
          <AttributeTile
            key={r.attr}
            result={r}
            index={i}
            animate={isLatest}
          />
        ))}
      </div>
    </motion.div>
  );
}
