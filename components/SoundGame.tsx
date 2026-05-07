"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { HEROES, HEROES_BY_KEY, type Hero } from "@/lib/heroes";
import {
  dayString,
  getSoundBonusOptions,
  getSoundForDay,
  prettyDay,
} from "@/lib/daily";
import { loadModeState, saveModeState, type ModeState } from "@/lib/storage";
import { HeroCombobox } from "./HeroCombobox";
import { GuessRow } from "./GuessRow";
import { Brand } from "./Brand";
import { ShareButton } from "./ShareButton";
import { NextModeCTA } from "./NextModeCTA";
import { BonusRound } from "./BonusRound";
import { WaveformPlayer } from "./WaveformPlayer";
import { ROLE_AUDIO_BOOST } from "@/lib/audio";

const MODE = "sound";
// Sentinel pushed into guesses[] when the player skips a turn. Counts
// toward the snippet-reveal ladder but is filtered out of share output
// and the "guesses" label so the player isn't penalized in the share
// summary for asking to hear more.
const SKIP_MARKER = "__skip__";

// Number of wrong guesses (including skips) before the player is offered
// the "Show answer" escape hatch. There's no hard cap — they can keep
// guessing forever — but after this many turns we stop teasing more of
// the clip and let them tap out if they're stuck.
const SHOW_ANSWER_AFTER = 10;

// Linear ramp from a small "taste" of the clip to the full duration over
// SHOW_ANSWER_AFTER turns. Floors at 0.4s so the first reveal is never so
// short the player can't hear anything. Past SHOW_ANSWER_AFTER, the
// snippet stays at full duration. Falls back to a fixed ladder when we
// don't have a known clip duration (legacy SFX path).
function snippetDurationFor(
  guessCount: number,
  done: boolean,
  clipDuration: number | null,
): number {
  if (clipDuration && clipDuration > 0) {
    if (done || guessCount >= SHOW_ANSWER_AFTER) return clipDuration;
    const fraction = (guessCount + 1) / SHOW_ANSWER_AFTER;
    return Math.max(0.4, fraction * clipDuration);
  }
  const FALLBACK_LADDER = [
    0.4, 0.8, 1.2, 1.6, 2.0, 2.5, 3.0, 4.0, 5.0, 30,
  ];
  if (done) return 30;
  return FALLBACK_LADDER[Math.min(guessCount, FALLBACK_LADDER.length - 1)];
}

export function SoundGame() {
  const [day, setDay] = useState<string | null>(null);
  const [state, setState] = useState<ModeState | null>(null);

  useEffect(() => {
    const d = dayString();
    setDay(d);
    const loaded = loadModeState(MODE, d);
    // If the seed rotated under us (e.g., during testing), auto-reset stale
    // win-state so the user can play the new puzzle.
    const todayKey = getSoundForDay(d).hero.key;
    const wonStale =
      loaded.won &&
      loaded.guesses[loaded.guesses.length - 1] !== todayKey;
    // Gave-up states are tied to whichever clip was current when the
    // user tapped "Show answer." If the daily seed rotates afterwards
    // they'd see the reveal for a hero that doesn't match today's
    // waveform, so wipe and restart on rotation.
    const gaveUpStale = loaded.gaveUp === true;
    if (wonStale || gaveUpStale) {
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

  const {
    hero: answer,
    audioUrl,
    videoUrl,
    label,
    slug,
    duration: clipDuration,
  } = getSoundForDay(day);
  const guessedHeroes = state.guesses
    .map((k) => HEROES_BY_KEY[k])
    .filter(Boolean);
  const heroGuessKeys = state.guesses.filter((k) => HEROES_BY_KEY[k]);
  const excludeKeys = new Set(heroGuessKeys);

  const turnsUsed = state.guesses.length;
  const canShowAnswer = turnsUsed >= SHOW_ANSWER_AFTER && !state.won;

  // Bonus options come from the labeled clip set for this hero. Empty
  // for legacy unlabeled clips. Skip the bonus round entirely when
  // there's only one option (it'd be a one-tile "puzzle" with the
  // answer obvious) — reveal directly on win instead.
  const bonusOptions = slug ? getSoundBonusOptions(answer.key, slug) : [];
  const bonusEligible = bonusOptions.length >= 2;

  // The win flow staggers two reveal stages so the bonus round happens
  // BEFORE the video reveal: get the hero, identify the ability, THEN
  // see the source clip. Giving up skips bonus and reveals immediately.
  const bonusPending = state.won && bonusEligible && !state.bonus;
  const reveal =
    (state.won && (!bonusEligible || !!state.bonus)) || !!state.gaveUp;

  // While the bonus round is pending, treat the clip as fully revealed
  // (they nailed the hero and can replay the whole sound while picking
  // the ability).
  const snippetDuration = snippetDurationFor(
    turnsUsed,
    reveal || bonusPending,
    clipDuration,
  );

  const handleGuess = (hero: Hero) => {
    if (reveal) return;
    const next: ModeState = {
      ...state,
      guesses: [...state.guesses, hero.key],
      won: hero.key === answer.key,
    };
    setState(next);
    saveModeState(MODE, next);
  };

  const handleSkip = () => {
    if (reveal) return;
    const next: ModeState = {
      ...state,
      guesses: [...state.guesses, SKIP_MARKER],
    };
    setState(next);
    saveModeState(MODE, next);
  };

  const handleGiveUp = () => {
    if (reveal) return;
    const next: ModeState = {
      ...state,
      gaveUp: true,
    };
    setState(next);
    saveModeState(MODE, next);
  };

  const handleBonus = (selected: number, correct: boolean | null) => {
    if (!state.won || state.bonus) return;
    const next: ModeState = {
      ...state,
      bonus: { selected, correct },
    };
    setState(next);
    saveModeState(MODE, next);
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-16">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-info">
            <span suppressHydrationWarning>{prettyDay(day)}</span>
          </p>
          <h1 className="mt-3 font-display display-headline text-5xl text-ink sm:text-6xl">
            Sound
          </h1>
          <p className="mt-3 max-w-md text-ink-soft">
            Listen to the ability sound. Each wrong guess extends the clip.
          </p>
        </div>
        <div className="hidden flex-col items-end font-mono text-xs uppercase tracking-[0.2em] text-ink-faint sm:flex">
          <Brand size="sm" />
          <span className="mt-1 text-info">sound mode</span>
        </div>
      </header>

      <div className="mb-8 flex flex-col items-center">
        {reveal && videoUrl ? (
          <RevealPlayer videoUrl={videoUrl} />
        ) : (
          <WaveformPlayer
            audioUrl={audioUrl}
            revealDuration={snippetDuration}
            boost={ROLE_AUDIO_BOOST[answer.role]}
          />
        )}
      </div>

      {!state.won && !state.gaveUp && (
        <div className="mb-6">
          <HeroCombobox
            heroes={HEROES}
            excludeKeys={excludeKeys}
            onSelect={handleGuess}
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-info">
              {heroGuessKeys.length}{" "}
              {heroGuessKeys.length === 1 ? "guess" : "guesses"}
              <span className="ml-2 text-ink-faint">
                · {snippetDuration.toFixed(1)}s clip
              </span>
            </p>
            <div className="flex items-center gap-3">
              {canShowAnswer && (
                <button
                  type="button"
                  onClick={handleGiveUp}
                  className="rounded-(--radius-card) border border-far/50 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-far transition-colors hover:bg-far/10"
                >
                  Show answer
                </button>
              )}
              <button
                type="button"
                onClick={handleSkip}
                className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint underline-offset-4 transition-colors hover:text-accent hover:underline"
              >
                Skip turn →
              </button>
            </div>
          </div>
        </div>
      )}

      {state.won && bonusEligible && (
        <div className="mb-8 space-y-4">
          <BonusRound
            heroName={answer.name}
            options={bonusOptions}
            saved={state.bonus}
            onSelect={handleBonus}
          />
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
                  {state.won ? "Solved" : "Revealed"}
                </div>
                <div className="mt-1 font-display text-2xl text-ink sm:text-3xl">
                  {answer.name}
                  {label && (
                    <span className="ml-2 text-ink-soft">· {label}</span>
                  )}
                </div>
                {state.won ? (
                  <div className="mt-1 font-mono text-xs uppercase tracking-[0.18em] text-ink-faint">
                    in {heroGuessKeys.length}{" "}
                    {heroGuessKeys.length === 1 ? "guess" : "guesses"}
                  </div>
                ) : (
                  <div className="mt-1 font-mono text-xs uppercase tracking-[0.18em] text-ink-faint">
                    after {heroGuessKeys.length} wrong{" "}
                    {heroGuessKeys.length === 1 ? "guess" : "guesses"}
                  </div>
                )}
                <div className="mt-3">
                  <NextModeCTA current="sound" />
                </div>
              </div>
              {state.won && (
                <ShareButton
                  modeLabel="Sound"
                  answer={answer}
                  guesses={heroGuessKeys}
                  day={day}
                  headline={answer.name}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
        <div className="mt-10 rounded-(--radius-card) border border-dashed border-line bg-inset/40 p-8 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-ink-faint">
            Click the waveform to hear what's audible. Each wrong guess (or
            skip) reveals more. After {SHOW_ANSWER_AFTER} wrong guesses you
            can show the answer.
          </p>
        </div>
      )}
    </main>
  );
}

// Plays the full source MP4 once the puzzle is over (won or gave up).
// Autoplay is allowed because the user has already interacted with the
// page (they made guesses); browsers permit unmuted autoplay after a
// gesture chain like that.
function RevealPlayer({ videoUrl }: { videoUrl: string }) {
  return (
    <div className="w-full max-w-2xl">
      <video
        src={videoUrl}
        controls
        autoPlay
        playsInline
        className="w-full rounded-(--radius-card) bg-black"
      />
      <p className="mt-2 text-center font-mono text-[10px] uppercase tracking-[0.22em] text-info">
        Source clip · full audio + video
      </p>
    </div>
  );
}

