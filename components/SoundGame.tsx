"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { HEROES, HEROES_BY_KEY, type Hero } from "@/lib/heroes";
import {
  dayString,
  getSoundBonusOptions,
  getSoundForDay,
  prettyDay,
  type ResolvedSoundClip,
} from "@/lib/daily";
import { loadModeState, saveModeState, type ModeState } from "@/lib/storage";
import { HeroCombobox } from "./HeroCombobox";
import { GuessRow } from "./GuessRow";
import { Brand } from "./Brand";
import { media } from "@/lib/media";
import { NextModeCTA } from "./NextModeCTA";
import { BonusRound } from "./BonusRound";
import { WaveformPlayer } from "./WaveformPlayer";
import { DevSoundPicker } from "./DevSoundPicker";
import { DevSoundTrimmer } from "./DevSoundTrimmer";
import { saveSoundClipTrim, type SavedTrim } from "@/lib/soundTrims";
import { ROLE_AUDIO_BOOST } from "@/lib/audio";

const IS_DEV = process.env.NODE_ENV !== "production";

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
  // Dev-only override. When set, the picker has chosen a specific clip;
  // we serve it instead of the daily seed and skip localStorage so test
  // playthroughs don't pollute the user's real progress for that day.
  const [overrideClip, setOverrideClip] = useState<ResolvedSoundClip | null>(
    null,
  );
  const isOverride = overrideClip !== null;

  // Dev-only trim state.
  //
  // `trimDraft` holds the values the trim editor is currently showing
  // for the active clip. It resets when the active slug changes so that
  // switching clips doesn't carry over an unsaved edit to a different
  // file. Null means "no live edit — use whatever the persisted value is."
  //
  // `trimOverrides` holds successfully-saved values that haven't yet been
  // picked up by the static JSON import (which only refreshes on browser
  // reload). Without it, a successful save would visually "snap back" to
  // the old value after we clear the draft. Keyed by `${hero}:${slug}`.
  const [trimDraft, setTrimDraft] = useState<{
    slug: string;
    start: number | null;
    end: number | null;
  } | null>(null);
  const [trimOverrides, setTrimOverrides] = useState<
    Record<string, SavedTrim>
  >({});
  const [audioMeta, setAudioMeta] = useState<{
    audioUrl: string;
    fileDuration: number;
    autoStartOffset: number;
  } | null>(null);

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

  const resolved = overrideClip ?? getSoundForDay(day);
  const {
    hero: answer,
    audioUrl,
    videoUrl,
    label,
    slug,
    duration: clipDuration,
  } = resolved;

  // Persisted trim for this clip — JSON-import value, optionally upgraded
  // by an in-session save that hasn't been picked up by a reload yet.
  const overrideKey = slug ? `${answer.key}:${slug}` : null;
  const sessionOverride =
    overrideKey != null ? trimOverrides[overrideKey] : undefined;
  const persistedStart =
    sessionOverride !== undefined
      ? sessionOverride.start
      : resolved.startOffset;
  const persistedEnd =
    sessionOverride !== undefined
      ? sessionOverride.end
      : resolved.endOffset;

  // Trim values used for actual playback. Live draft wins when it's for
  // the current clip; otherwise fall back to the persisted value above.
  const draftMatches = trimDraft != null && trimDraft.slug === slug;
  const activeStart = draftMatches ? trimDraft!.start : persistedStart;
  const activeEnd = draftMatches ? trimDraft!.end : persistedEnd;
  const guessedHeroes = state.guesses
    .map((k) => HEROES_BY_KEY[k])
    .filter(Boolean);
  const heroGuessKeys = state.guesses.filter((k) => HEROES_BY_KEY[k]);
  const excludeKeys = new Set(heroGuessKeys);

  const turnsUsed = state.guesses.length;
  const canShowAnswer = turnsUsed >= SHOW_ANSWER_AFTER && !state.won;
  // Surface a proximity hint two turns out so a player nearing the limit
  // sees the escape hatch coming. Without this, the "Show answer" button
  // pops in unannounced at turn 10 — fine on a fresh play but jarring if
  // they've spent eight rounds wondering whether there's any way out.
  const turnsUntilShowAnswer = canShowAnswer
    ? 0
    : Math.max(0, SHOW_ANSWER_AFTER - turnsUsed);
  const showAnswerHint =
    !state.won && !canShowAnswer && turnsUntilShowAnswer > 0 && turnsUntilShowAnswer <= 2;

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
  //
  // Snippet ladder is sized against the AUDIBLE window (post-trim) so
  // that a clip trimmed to 2.4s ramps from a small taste up to 2.4s
  // over the ten reveal steps — not up to the raw 8s file length, which
  // would never actually play because the WaveformPlayer caps at the
  // end-trim anyway.
  const effectiveDuration =
    clipDuration != null
      ? Math.max(
          0.4,
          (activeEnd ?? clipDuration) - (activeStart ?? 0),
        )
      : null;
  const snippetDuration = snippetDurationFor(
    turnsUsed,
    reveal || bonusPending,
    effectiveDuration,
  );

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

  const handleSkip = () => {
    if (reveal) return;
    persist({
      ...state,
      guesses: [...state.guesses, SKIP_MARKER],
    });
  };

  const handleGiveUp = () => {
    if (reveal) return;
    persist({ ...state, gaveUp: true });
  };

  const handleBonus = (selected: number, correct: boolean | null) => {
    if (!state.won || state.bonus) return;
    persist({ ...state, bonus: { selected, correct } });
  };

  const applyOverride = (clip: ResolvedSoundClip | null) => {
    setOverrideClip(clip);
    setTrimDraft(null);
    setAudioMeta(null);
    if (!day) return;
    if (clip) {
      // Fresh in-memory state for the new clip; localStorage is left
      // alone so the user's real daily progress survives dev poking.
      setState({ day, guesses: [], won: false });
    } else {
      // Restoring the daily — re-hydrate from localStorage.
      setState(loadModeState(MODE, day));
    }
  };

  const handleTrimChange = (next: {
    start: number | null;
    end: number | null;
  }) => {
    if (!slug) return;
    setTrimDraft({ slug, start: next.start, end: next.end });
  };

  const handleTrimSave = async (next: {
    start: number | null;
    end: number | null;
  }) => {
    if (!slug || !overrideKey) return;
    await saveSoundClipTrim(answer.key, slug, next);
    // Promote the saved values into the in-session override map so the
    // editor's "saved" indicator and the persisted-vs-draft diff reflect
    // the write without waiting for a page reload to re-import the JSON.
    setTrimOverrides((prev) => ({
      ...prev,
      [overrideKey]: { start: next.start, end: next.end },
    }));
    setTrimDraft(null);
  };

  const handleAudioMetadata = (info: {
    fileDuration: number;
    autoStartOffset: number;
  }) => {
    setAudioMeta({ audioUrl, ...info });
  };

  // Reset the audio metadata snapshot when the underlying file changes,
  // so the trimmer doesn't briefly display the prior clip's duration
  // during the new clip's load.
  const audioMetaForCurrent =
    audioMeta && audioMeta.audioUrl === audioUrl ? audioMeta : null;

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

      {IS_DEV && (
        <DevSoundPicker
          currentClip={resolved}
          overrideActive={isOverride}
          onApply={applyOverride}
        />
      )}

      <div className="mb-6 flex flex-col items-center gap-3">
        {reveal && videoUrl ? (
          <RevealPlayer videoUrl={videoUrl} />
        ) : (
          <>
            <WaveformPlayer
              audioUrl={audioUrl}
              revealDuration={snippetDuration}
              boost={ROLE_AUDIO_BOOST[answer.role]}
              startOffset={activeStart}
              endOffset={activeEnd}
              onAudioMetadata={IS_DEV ? handleAudioMetadata : undefined}
            />
            {IS_DEV && slug && (
              <DevSoundTrimmer
                heroKey={answer.key}
                slug={slug}
                fileDuration={audioMetaForCurrent?.fileDuration ?? null}
                autoStartOffset={
                  audioMetaForCurrent?.autoStartOffset ?? null
                }
                persistedStart={persistedStart}
                persistedEnd={persistedEnd}
                draftStart={activeStart}
                draftEnd={activeEnd}
                onChange={handleTrimChange}
                onSave={handleTrimSave}
              />
            )}
            {!state.won && !state.gaveUp && (
              <button
                type="button"
                onClick={handleSkip}
                className="rounded-(--radius-card) border border-line bg-inset/60 px-5 py-3 font-mono text-xs uppercase tracking-[0.2em] text-ink-soft transition-colors hover:border-accent/60 hover:bg-accent/10 hover:text-accent active:scale-[0.98] sm:py-2.5 sm:text-[11px]"
              >
                Skip turn · reveal more →
              </button>
            )}
          </>
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
              {showAnswerHint && (
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">
                  show answer in {turnsUntilShowAnswer}{" "}
                  {turnsUntilShowAnswer === 1 ? "guess" : "guesses"}
                </span>
              )}
              {canShowAnswer && (
                <button
                  type="button"
                  onClick={handleGiveUp}
                  className="rounded-(--radius-card) border border-far/50 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-far transition-colors hover:bg-far/10"
                >
                  Show answer
                </button>
              )}
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
        src={media(videoUrl)}
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

