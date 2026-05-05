"use client";

// Quote mode plays as a "Conversation" puzzle: a pre-match exchange between
// two heroes, with each speaker guessed in their OWN dedicated combobox.
// Guesses go into a unified history at the bottom, each tagged with which
// speaker they were targeting and showing attribute tiles vs that speaker.

import { useEffect, useState } from "react";
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
import { NextModeCTA } from "./NextModeCTA";
import clsx from "clsx";

export function QuoteGame() {
  const [day, setDay] = useState<string | null>(null);
  const [state, setState] = useState<ConversationState | null>(null);

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

  if (!day || !state) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-16">
        <div className="font-mono text-xs uppercase tracking-[0.2em] text-ink-faint">
          Loading…
        </div>
      </main>
    );
  }

  const { conversation, speakers } = getConversationForDay(day);
  const [speakerA, speakerB] = speakers;

  const aRevealed = state.guesses.some(
    (g) => g.target === 0 && g.heroKey === speakerA.key,
  );
  const bRevealed = state.guesses.some(
    (g) => g.target === 1 && g.heroKey === speakerB.key,
  );
  const won = aRevealed && bRevealed;

  // Per-field exclusion: a hero already tried in Field A can still be tried
  // in Field B (the player may correctly suspect them in the other slot).
  const excludedA = new Set(
    state.guesses.filter((g) => g.target === 0).map((g) => g.heroKey),
  );
  const excludedB = new Set(
    state.guesses.filter((g) => g.target === 1).map((g) => g.heroKey),
  );

  // Two-stage reveal: `textLines` is how many lines are shown as actual text
  // (grows by one per guess), `renderedLines` includes a couple of blurred
  // placeholders past the text frontier so the player can see more dialogue
  // is coming. Lines past `renderedLines` aren't rendered at all yet — they
  // appear (still blurred) once the player guesses further.
  const BLURRED_AHEAD = 2;
  const textLines = won
    ? conversation.lines.length
    : Math.min(1 + state.guesses.length, conversation.lines.length);
  const renderedLines = won
    ? conversation.lines.length
    : Math.min(textLines + BLURRED_AHEAD, conversation.lines.length);

  const handleGuess = (hero: Hero, target: 0 | 1) => {
    if (won) return;
    const newGuess: ConversationGuess = { heroKey: hero.key, target };
    const newGuesses = [...state.guesses, newGuess];
    const newARevealed = newGuesses.some(
      (g) => g.target === 0 && g.heroKey === speakerA.key,
    );
    const newBRevealed = newGuesses.some(
      (g) => g.target === 1 && g.heroKey === speakerB.key,
    );
    const next: ConversationState = {
      day,
      speakers: [speakerA.key, speakerB.key],
      guesses: newGuesses,
      won: newARevealed && newBRevealed,
    };
    setState(next);
    saveConversationState(next);
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
            A pre-match exchange between two heroes. Guess each speaker in
            their own field — more dialogue reveals as you go.
          </p>
        </div>
        <div className="hidden flex-col items-end font-mono text-xs uppercase tracking-[0.2em] text-ink-faint sm:flex">
          <Brand size="sm" />
          <span className="mt-1 text-info">conversation mode</span>
        </div>
      </header>

      <div className="mb-8 flex flex-col items-center">
        <ConversationCard
          conversation={conversation}
          speakers={[speakerA, speakerB]}
          aRevealed={aRevealed}
          bRevealed={bRevealed}
          textLines={textLines}
          renderedLines={renderedLines}
        />
      </div>

      {/* Two parallel guess fields — one per speaker */}
      {!won && (
        <div className="mb-6 grid gap-4 md:grid-cols-2">
          <SpeakerField
            label="Speaker A"
            tone="info"
            revealed={aRevealed}
            speakerHero={speakerA}
            excluded={excludedA}
            onGuess={(hero) => handleGuess(hero, 0)}
          />
          <SpeakerField
            label="Speaker B"
            tone="accent-soft"
            revealed={bRevealed}
            speakerHero={speakerB}
            excluded={excludedB}
            onGuess={(hero) => handleGuess(hero, 1)}
          />
        </div>
      )}

      {!won && (
        <p className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-info">
          {state.guesses.length}{" "}
          {state.guesses.length === 1 ? "guess" : "guesses"}
          <span className="ml-2 text-ink-faint">
            · {(aRevealed ? 1 : 0) + (bRevealed ? 1 : 0)} / 2 found
          </span>
        </p>
      )}

      <AnimatePresence>
        {won && (
          <motion.div
            key="win"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="mb-8 rounded-(--radius-card) border border-correct/40 bg-correct/10 p-5 sm:p-6"
          >
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
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-info">
                  Solved
                </div>
                <div className="mt-1 font-display text-2xl text-ink sm:text-3xl">
                  {speakerA.name} & {speakerB.name}{" "}
                  <span className="text-ink-soft">
                    in {state.guesses.length}
                  </span>
                </div>
                <div className="mt-3">
                  <NextModeCTA current="quote" />
                </div>
              </div>
              <ConversationShareButton
                day={day}
                guesses={state.guesses}
                speakers={[speakerA, speakerB]}
              />
            </div>
          </motion.div>
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

      {state.guesses.length === 0 && (
        <div className="mt-10 rounded-(--radius-card) border border-dashed border-line bg-inset/40 p-8 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-ink-faint">
            Pick a hero in either field to make your first guess. Each guess
            reveals more dialogue.
          </p>
        </div>
      )}
    </main>
  );
}

function SpeakerField({
  label,
  tone,
  revealed,
  speakerHero,
  excluded,
  onGuess,
}: {
  label: string;
  tone: "info" | "accent-soft";
  revealed: boolean;
  speakerHero: Hero;
  excluded: Set<string>;
  onGuess: (hero: Hero) => void;
}) {
  const toneClass = tone === "info" ? "text-info" : "text-accent-soft";

  return (
    <div>
      <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.24em]">
        <span className={revealed ? "text-correct" : toneClass}>
          {revealed ? `✓ ${speakerHero.name}` : label}
        </span>
        <span className="text-ink-faint">
          {revealed ? "Solved" : "Guessing"}
        </span>
      </div>
      {revealed ? (
        <div className="flex items-center gap-3 rounded-(--radius-card) border border-correct/40 bg-correct/10 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={speakerHero.portrait}
            alt=""
            className="h-10 w-10 rounded-(--radius-card) bg-muted object-cover"
          />
          <div className="font-display text-base text-ink">
            {speakerHero.name}
          </div>
        </div>
      ) : (
        <HeroCombobox
          heroes={HEROES}
          excludeKeys={excluded}
          onSelect={onGuess}
          placeholder={`Enter a hero…`}
        />
      )}
    </div>
  );
}

function ConversationCard({
  conversation,
  speakers,
  aRevealed,
  bRevealed,
  textLines,
  renderedLines,
}: {
  conversation: Conversation;
  speakers: [Hero, Hero];
  aRevealed: boolean;
  bRevealed: boolean;
  textLines: number;
  renderedLines: number;
}) {
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

          return (
            <ConversationLineRow
              key={i}
              isA={isA}
              speakerHero={speakerHero}
              speakerLabel={`Speaker ${isA ? "A" : "B"}`}
              revealed={revealed}
              visible={visible}
              text={line.text}
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
}: {
  isA: boolean;
  speakerHero: Hero;
  speakerLabel: string;
  revealed: boolean;
  visible: boolean;
  text: string;
}) {
  return (
    <motion.div
      layout
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.24em]">
        {revealed ? (
          <span className="text-correct">{speakerHero.name}</span>
        ) : (
          <span className={isA ? "text-info" : "text-accent-soft"}>
            {speakerLabel}
          </span>
        )}
      </p>
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
            className="font-display text-xl leading-snug text-ink-faint sm:text-2xl select-none"
            aria-hidden
          >
            {redactedFor(text)}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function redactedFor(text: string): string {
  const len = Math.min(60, Math.max(18, Math.round(text.length * 0.6)));
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
          <AttributeTile key={r.attr} result={r} index={i} />
        ))}
      </div>
    </motion.div>
  );
}

function ConversationShareButton({
  day,
  guesses,
  speakers,
}: {
  day: string;
  guesses: ConversationGuess[];
  speakers: [Hero, Hero];
}) {
  const [copied, setCopied] = useState(false);

  const buildText = () => {
    const [a, b] = speakers;
    const lines: string[] = [];
    lines.push(`OWdle Quote · ${day}`);
    lines.push(`${a.name} & ${b.name} in ${guesses.length}`);
    lines.push("");
    for (const g of guesses) {
      const hero = HEROES_BY_KEY[g.heroKey];
      if (!hero) continue;
      const speaker = g.target === 0 ? a : b;
      const row = compareHero(hero, speaker)
        .map((r) => emojiFor(r.status))
        .join("");
      const targetTag = g.target === 0 ? "🅰" : "🅱";
      lines.push(`${targetTag} ${row}`);
    }
    return lines.join("\n");
  };

  const onClick = () => {
    if (!navigator.clipboard) return;
    navigator.clipboard
      .writeText(buildText())
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      })
      .catch(() => {});
  };

  return (
    <button
      onClick={onClick}
      className="rounded-(--radius-pill) bg-accent px-5 py-2.5 font-mono text-xs uppercase tracking-[0.18em] text-on-accent transition-opacity hover:opacity-90"
    >
      {copied ? "Copied" : "Share"}
    </button>
  );
}

function emojiFor(status: string): string {
  if (status === "correct") return "🟩";
  if (status === "partial") return "🟨";
  if (status === "far") return "🟥";
  return "⬛";
}
