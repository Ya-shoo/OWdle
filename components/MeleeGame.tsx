"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { HEROES, HEROES_BY_KEY, type Hero } from "@/lib/heroes";
import {
  dayString,
  getAllMeleeClips,
  getMeleeForDay,
  prettyDay,
  resolveMeleeClip,
} from "@/lib/daily";
import { loadModeState, saveModeState, type ModeState } from "@/lib/storage";
import { ROLE_AUDIO_BOOST } from "@/lib/audio";
import { media } from "@/lib/media";
import { HeroCombobox } from "./HeroCombobox";
import { Brand } from "./Brand";
import { NextModeCTA } from "./NextModeCTA";
import { WaveformPlayer } from "./WaveformPlayer";

const IS_DEV = process.env.NODE_ENV !== "production";

const MODE = "melee";
// Three chances, then the answer (and source video) are revealed.
const MAX_GUESSES = 3;

export function MeleeGame() {
  const [day, setDay] = useState<string | null>(null);
  const [state, setState] = useState<ModeState | null>(null);
  // Dev-only hero override for previewing any hero's melee clip. When set
  // we serve that clip and skip localStorage so test plays don't pollute
  // real daily progress.
  const [overrideHero, setOverrideHero] = useState<string | null>(null);
  const isOverride = overrideHero !== null;

  useEffect(() => {
    const d = dayString();
    setDay(d);
    const loaded = loadModeState(MODE, d);
    // If the daily seed rotated under a finished game (e.g. during dev),
    // reset the stale win so the new puzzle is playable.
    const todayKey = getMeleeForDay(d).hero.key;
    const wonStale =
      loaded.won && loaded.guesses[loaded.guesses.length - 1] !== todayKey;
    if (wonStale) {
      const fresh: ModeState = { day: d, guesses: [], won: false };
      setState(fresh);
      saveModeState(MODE, fresh);
    } else {
      setState(loaded);
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

  const resolved =
    (isOverride ? resolveMeleeClip(overrideHero) : null) ??
    getMeleeForDay(day);
  const { hero: answer, audioUrl, videoUrl, duration: clipDuration } = resolved;

  const guessedHeroes = state.guesses
    .map((k) => HEROES_BY_KEY[k])
    .filter(Boolean);
  const excludeKeys = new Set(state.guesses);
  const guessCount = state.guesses.length;
  const lost = !state.won && guessCount >= MAX_GUESSES;
  const reveal = state.won || lost;
  const guessesLeft = Math.max(0, MAX_GUESSES - guessCount);

  const persist = (next: ModeState) => {
    setState(next);
    if (!isOverride) saveModeState(MODE, next);
  };

  const handleGuess = (hero: Hero) => {
    if (reveal) return;
    persist({
      ...state,
      guesses: [...state.guesses, hero.key],
      won: hero.key === answer.key,
    });
  };

  const applyOverride = (heroKey: string | null) => {
    setOverrideHero(heroKey);
    if (heroKey) {
      setState({ day, guesses: [], won: false });
    } else {
      setState(loadModeState(MODE, day));
    }
  };

  // Full clip is playable from the first tap — the pressure here is the
  // three-guess cap, not a lengthening snippet. Fall back to a generous
  // duration if the manifest somehow lacks one.
  const playDuration = clipDuration && clipDuration > 0 ? clipDuration : 30;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-16">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-info">
            <span suppressHydrationWarning>{prettyDay(day)}</span>
          </p>
          <h1 className="mt-3 font-display display-headline text-5xl text-ink sm:text-6xl">
            Melee
          </h1>
          <p className="mt-3 max-w-md text-ink-soft">
            Whose melee is this? Listen to the hit. Three guesses.
          </p>
        </div>
        <div className="hidden flex-col items-end font-mono text-xs uppercase tracking-[0.2em] text-ink-faint sm:flex">
          <Brand size="sm" />
          <span className="mt-1 text-info">melee mode</span>
        </div>
      </header>

      {IS_DEV && (
        <div className="mb-6 flex flex-wrap items-center gap-2 rounded-(--radius-card) border border-dashed border-line bg-inset/30 px-3 py-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">
            dev · preview hero
          </span>
          <select
            value={overrideHero ?? ""}
            onChange={(e) => applyOverride(e.target.value || null)}
            className="rounded-(--radius-card) border border-line bg-inset/60 px-2 py-1 font-mono text-[11px] text-ink outline-none focus:border-accent"
          >
            <option value="">— daily ({getMeleeForDay(day).hero.name}) —</option>
            {getAllMeleeClips().map((c) => (
              <option key={c.heroKey} value={c.heroKey}>
                {c.heroName} ({c.duration.toFixed(1)}s)
              </option>
            ))}
          </select>
          {isOverride && (
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
              override active · progress not saved
            </span>
          )}
        </div>
      )}

      <div className="mb-6 flex flex-col items-center gap-3">
        {reveal && videoUrl ? (
          <RevealPlayer videoUrl={videoUrl} />
        ) : (
          <WaveformPlayer
            variant="melee"
            audioUrl={audioUrl}
            revealDuration={playDuration}
            boost={ROLE_AUDIO_BOOST[answer.role]}
          />
        )}
      </div>

      {!reveal && (
        <div className="mb-6">
          <HeroCombobox
            heroes={HEROES}
            excludeKeys={excludeKeys}
            onSelect={handleGuess}
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-info">
              {guessCount} {guessCount === 1 ? "guess" : "guesses"}
              <span className="ml-2 text-ink-faint">
                · {guessesLeft} left
              </span>
            </p>
            <PipTracker used={guessCount} total={MAX_GUESSES} />
          </div>
        </div>
      )}

      <AnimatePresence>
        {reveal && (
          <motion.div
            key="reveal"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className={
              "mb-8 rounded-(--radius-card) p-5 sm:p-6 " +
              (state.won
                ? "border border-correct/40 bg-correct/10"
                : "border border-far/40 bg-far/10")
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
                <div
                  className={
                    "font-mono text-[10px] uppercase tracking-[0.2em] " +
                    (state.won ? "text-info" : "text-far")
                  }
                >
                  {state.won ? "Solved" : "Out of guesses"}
                </div>
                <div className="mt-1 font-display text-2xl text-ink sm:text-3xl">
                  {answer.name}
                  <span className="ml-2 text-ink-soft">· Melee</span>
                </div>
                <div className="mt-1 font-mono text-xs uppercase tracking-[0.18em] text-ink-faint">
                  {state.won
                    ? `in ${guessCount} ${guessCount === 1 ? "guess" : "guesses"}`
                    : `after ${guessCount} wrong ${guessCount === 1 ? "guess" : "guesses"}`}
                </div>
                <div className="mt-3">
                  <NextModeCTA current="melee" />
                </div>
              </div>
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
              <MeleeGuessCard
                key={hero.key}
                hero={hero}
                correct={hero.key === answer.key}
                isLatest={isLatest}
              />
            );
          })}
        </AnimatePresence>
      </div>

      {state.guesses.length === 0 && (
        <div className="mt-10 rounded-(--radius-card) border border-dashed border-line bg-inset/40 p-8 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-ink-faint">
            Tap the waveform to hear the melee. You get {MAX_GUESSES} guesses —
            the source clip reveals when you solve it or run out.
          </p>
        </div>
      )}
    </main>
  );
}

// Three pips that fill red as guesses are spent — an at-a-glance read on
// how many chances are left.
function PipTracker({ used, total }: { used: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-hidden>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={
            "h-2.5 w-2.5 rounded-full border transition-colors " +
            (i < used
              ? "border-far bg-far"
              : "border-accent/50 bg-accent/15")
          }
        />
      ))}
    </div>
  );
}

// Ability-mode-style guess card: just the hero portrait + name, no
// attribute breakdown — right or wrong.
function MeleeGuessCard({
  hero,
  correct,
  isLatest,
}: {
  hero: Hero;
  correct: boolean;
  isLatest: boolean;
}) {
  return (
    <motion.div
      layout
      initial={isLatest ? { opacity: 0, y: -10 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className={
        "tile-shape mx-auto flex w-full max-w-xs flex-col items-center justify-center gap-3 border px-5 py-6 " +
        (correct
          ? "border-correct/50 bg-correct/15"
          : "border-far/40 bg-far/15")
      }
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

// Plays the full source MP4 once the puzzle is over (won or out of guesses).
// Autoplay is permitted because the player has already interacted with the
// page (they tapped the waveform / made guesses).
function RevealPlayer({ videoUrl }: { videoUrl: string }) {
  return (
    <div className="w-full max-w-2xl">
      <video
        src={media(videoUrl)}
        controls
        autoPlay
        playsInline
        className="w-full rounded-(--radius-card) bg-black"
      />
      <p className="mt-2 text-center font-mono text-[10px] uppercase tracking-[0.22em] text-info">
        Source clip · full melee audio + video
      </p>
    </div>
  );
}
