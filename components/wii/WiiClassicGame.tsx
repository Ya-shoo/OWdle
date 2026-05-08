"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { HEROES, HEROES_BY_KEY, type Hero } from "@/lib/heroes";
import { dayString, getHeroForDay, prettyDay } from "@/lib/daily";
import { loadClassic, saveClassic, type ClassicState } from "@/lib/storage";
import { buildShareText } from "@/lib/share";
import { WiiCombobox } from "./WiiCombobox";
import { WiiGuessRow } from "./WiiGuessRow";
import { WiiTopBar } from "./WiiTopBar";

export function WiiClassicGame() {
  const [day, setDay] = useState<string | null>(null);
  const [state, setState] = useState<ClassicState | null>(null);

  useEffect(() => {
    const d = dayString();
    setDay(d);
    setState(loadClassic(d));
  }, []);

  if (!day || !state) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-16">
        <WiiTopBar />
        <div className="mt-12 grid place-items-center">
          <div
            className="text-[11px] font-bold uppercase tracking-[0.2em]"
            style={{ color: "var(--wii-blue)" }}
          >
            Loading channel…
          </div>
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
    <main className="mx-auto w-full max-w-5xl">
      <WiiTopBar />

      {/* Back-to-channels link mimics the Wii's home button — bottom
          left in the real UI, but we put it inline above the title so
          desktop and mobile users see it immediately. */}
      <div className="px-6 pt-2 sm:px-10">
        <Link
          href="/dev/wii/"
          className="inline-flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.2em] transition-colors"
          style={{ color: "var(--wii-blue)" }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
            <path
              d="M9 2 L4 7 L9 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Channels
        </Link>
      </div>

      {/* Header card — Wii Channel intro panel */}
      <section className="px-6 pt-4 sm:px-10">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="wii-card flex flex-col gap-4 px-7 py-7 sm:flex-row sm:items-end sm:justify-between sm:px-9 sm:py-8"
        >
          <div>
            <p className="wii-eyebrow">
              Channel 01 ·{" "}
              <span suppressHydrationWarning>{prettyDay(day)}</span>
            </p>
            <h1
              className="wii-display mt-2 text-5xl sm:text-6xl"
              style={{ color: "var(--wii-ink)" }}
            >
              Classic
            </h1>
            <p
              className="mt-2 max-w-md text-base"
              style={{ color: "var(--wii-ink-soft)" }}
            >
              Type a hero. Match all eight attributes. New puzzle every
              day at midnight UTC.
            </p>
          </div>
          <GuessCounter count={state.guesses.length} won={state.won} />
        </motion.div>
      </section>

      {/* Win panel sits above the input once solved — same flow as the
          production game but in Wii dress. */}
      <AnimatePresence>
        {state.won && (
          <section className="px-6 pt-6 sm:px-10">
            <WinPanel
              answer={answer}
              guesses={state.guesses}
              day={day}
            />
          </section>
        )}
      </AnimatePresence>

      {/* Combobox */}
      {!state.won && (
        <section className="px-6 pt-8 sm:px-10">
          <div className="mx-auto max-w-2xl">
            <WiiCombobox
              heroes={HEROES}
              excludeKeys={excludeKeys}
              onSelect={handleGuess}
              autoFocus
            />
          </div>
        </section>
      )}

      {/* Guess history */}
      <section className="px-6 pb-16 pt-8 sm:px-10 sm:pt-10">
        <div className="space-y-3 sm:space-y-4">
          <AnimatePresence initial={false}>
            {[...guessedHeroes].reverse().map((hero, revIdx) => {
              const originalIdx = guessedHeroes.length - 1 - revIdx;
              const isLatest =
                originalIdx === guessedHeroes.length - 1;
              return (
                <WiiGuessRow
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
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
            className="mt-10 grid place-items-center px-6 py-10 text-center"
            style={{
              borderRadius: "var(--wii-radius-card)",
              background: "rgba(8, 18, 42, 0.55)",
              boxShadow:
                "inset 0 0 0 2px rgba(108,200,255,0.16), inset 0 1px 0 rgba(255,255,255,0.05)",
            }}
          >
            <p
              className="text-[13px] font-semibold"
              style={{ color: "var(--wii-ink-soft)" }}
            >
              Type a hero name to begin. Tiles will fill in showing how
              close each attribute is to today&apos;s hero.
            </p>
          </motion.div>
        )}
      </section>
    </main>
  );
}

function GuessCounter({ count, won }: { count: number; won: boolean }) {
  return (
    <div className="flex shrink-0 items-center gap-3">
      <div
        className="grid h-[68px] w-[68px] place-items-center rounded-full"
        style={{
          background: won
            ? "linear-gradient(180deg, #a3e8a8 0%, var(--wii-green) 100%)"
            : "linear-gradient(180deg, #2c4078 0%, #16264a 100%)",
          boxShadow: won
            ? "inset 0 1px 0 rgba(255,255,255,0.4), 0 8px 18px -6px rgba(126,217,138,0.5)"
            : "inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -2px 0 rgba(0,0,0,0.3), 0 8px 18px -8px rgba(0,0,0,0.6)",
        }}
      >
        <div
          className="wii-display text-3xl"
          style={{ color: won ? "var(--wii-green-on)" : "var(--wii-ink)" }}
        >
          {count}
        </div>
      </div>
      <div className="leading-tight">
        <div
          className="text-[10px] font-bold uppercase tracking-[0.22em]"
          style={{ color: won ? "var(--wii-green)" : "var(--wii-blue)" }}
        >
          {won ? "Solved" : count === 1 ? "Guess" : "Guesses"}
        </div>
        <div
          className="text-[12px]"
          style={{ color: "var(--wii-ink-faint)" }}
        >
          {won ? "Daily complete" : "Keep going"}
        </div>
      </div>
    </div>
  );
}

function WinPanel({
  answer,
  guesses,
  day,
}: {
  answer: Hero;
  guesses: string[];
  day: string;
}) {
  const [copied, setCopied] = useState(false);

  const onShare = () => {
    if (!navigator.clipboard) return;
    const text = buildShareText({
      modeLabel: "Classic",
      answer,
      guesses,
      day,
    });
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      })
      .catch(() => {});
  };

  return (
    <motion.div
      key="win"
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.55, ease: [0.34, 1.56, 0.64, 1] }}
      className="wii-card relative px-7 py-8 sm:px-10 sm:py-10"
      style={{
        boxShadow:
          "0 14px 32px -14px rgba(0,0,0,0.7), 0 0 30px rgba(126,217,138,0.28), inset 0 1px 0 rgba(255,255,255,0.18)",
      }}
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={answer.portrait}
          alt=""
          className="wii-mii h-24 w-24 shrink-0 object-cover sm:h-28 sm:w-28"
          style={{
            boxShadow:
              "inset 0 0 0 3px var(--wii-green), inset 0 0 0 6px rgba(0,0,0,0.4), 0 8px 22px -8px rgba(126,217,138,0.6)",
          }}
        />
        <div className="flex-1">
          <div
            className="text-[11px] font-bold uppercase tracking-[0.22em]"
            style={{ color: "var(--wii-green)" }}
          >
            ✓ Daily complete
          </div>
          <div
            className="wii-display mt-2 text-3xl sm:text-4xl"
            style={{ color: "var(--wii-ink)" }}
          >
            {answer.name}
            <span
              className="ml-2 text-2xl sm:text-3xl"
              style={{ color: "var(--wii-ink-soft)" }}
            >
              in {guesses.length}
            </span>
          </div>
          <p
            className="mt-2 text-[14px]"
            style={{ color: "var(--wii-ink-soft)" }}
          >
            Nice work. Other channels are still live — head back to the
            menu for the rest of today&apos;s puzzles.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link href="/dev/wii/" className="wii-pill wii-pill--primary">
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                aria-hidden
                style={{ color: "currentColor" }}
              >
                <path
                  d="M3 7 L11 7 M7 3 L3 7 L7 11"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Wii Channels
            </Link>
            <button
              type="button"
              onClick={onShare}
              className="wii-pill"
              aria-label="Copy share text"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                <path
                  d="M4 5 L7 2 L10 5 M7 2 L7 9 M3 11 L11 11"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {copied ? "Copied!" : "Share"}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
