"use client";

import { useEffect, useRef, useState } from "react";
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
import {
  trackGuessSubmitted,
  trackModeCompleted,
  trackModeStarted,
} from "@/lib/tracking";
import { HeroCombobox } from "./HeroCombobox";
import { GuessRow } from "./GuessRow";
import { Brand } from "./Brand";
import { media } from "@/lib/media";
import { NextModeCTA } from "./NextModeCTA";
import { ScrollIntoViewOnMount } from "./ScrollIntoViewOnMount";
import { BonusRound } from "./BonusRound";
import { WaveformPlayer } from "./WaveformPlayer";
import { DevSoundPicker } from "./DevSoundPicker";
import { DevSoundTrimmer } from "./DevSoundTrimmer";
import { DevViewToggle, useDevViewState } from "./DevViewToggle";
import { saveSoundClipTrim, type SavedTrim } from "@/lib/soundTrims";
import { ROLE_AUDIO_BOOST } from "@/lib/audio";
import { LossReveal } from "./LossReveal";
import { GuessRemaining } from "./GuessRemaining";
import { ModeStatsLine } from "./ModeStatsLine";

const IS_DEV = process.env.NODE_ENV !== "production";

const MODE = "sound";
// Sentinel pushed into guesses[] when the player skips a turn. Counts
// toward both the snippet-reveal ladder AND the hard cap (skips burn
// real attempts), but is filtered out of the share output and "guesses"
// label so the visible solve count tracks real hero picks.
const SKIP_MARKER = "__skip__";

// Hard cap on total attempts (hero guesses + skips). The player loses
// on the cap-th wrong move and the source video auto-reveals.
const MAX_GUESSES = 8;

// Full audio unlocks one attempt BEFORE the cap so the player gets at
// least one shot at the unmasked clip. With cap=8 and unlock-at-7,
// fraction = (guessCount + 1) / 8 reaches 1 when guessCount = 7 — the
// state after the 7th wrong move, i.e. just before the 8th and final
// attempt.
const FULL_AUDIO_AT = MAX_GUESSES - 1;

// Linear ramp from a small "taste" of the clip up to full duration,
// reaching 100% on the player's final attempt. Floors at 0.4s so the
// first reveal is never inaudible. Falls back to a fixed ladder when we
// don't have a known clip duration (legacy SFX path).
function snippetDurationFor(
  guessCount: number,
  done: boolean,
  clipDuration: number | null,
): number {
  if (clipDuration && clipDuration > 0) {
    if (done || guessCount >= FULL_AUDIO_AT) return clipDuration;
    const fraction = (guessCount + 1) / MAX_GUESSES;
    return Math.max(0.4, fraction * clipDuration);
  }
  // Legacy fallback (unknown duration). Eight steps to match cap.
  const FALLBACK_LADDER = [0.4, 0.7, 1.1, 1.5, 2.0, 2.5, 3.5, 30];
  if (done) return 30;
  return FALLBACK_LADDER[Math.min(guessCount, FALLBACK_LADDER.length - 1)];
}

export function SoundGame() {
  const [day, setDay] = useState<string | null>(null);
  const [state, setState] = useState<ModeState | null>(null);
  // Dev-only "view" toggle. Hides every dev panel when set to User so
  // we can preview the shipping game without ceremony.
  const [devView, setDevView] = useDevViewState("sound");
  // Dev-only override. When set, the picker has chosen a specific clip;
  // we serve it instead of the daily seed and skip localStorage so test
  // playthroughs don't pollute the user's real progress for that day.
  const [overrideClip, setOverrideClip] = useState<ResolvedSoundClip | null>(
    null,
  );
  const isOverride = overrideClip !== null;

  // Scroll anchors for "center on what matters" after the main guess, each
  // replacing NextModeCTA's center-on-CTA scroll. While the bonus round is
  // pending we frame the bonus question + score, letting the waveform / play
  // button scroll above the fold. Once the bonus is answered — or on a
  // no-bonus win / loss — we frame the media column, which by then holds the
  // reveal video, + score. Guesses sit below the fold either way.
  const mediaRef = useRef<HTMLDivElement>(null);
  const bonusRef = useRef<HTMLDivElement>(null);

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
    fullPeaks: number[];
  } | null>(null);

  // mode_started — once per day, skip dev overrides.
  useEffect(() => {
    if (!day || isOverride) return;
    const pick = getSoundForDay(day);
    trackModeStarted({
      mode: "sound",
      dailyId: day,
      answerId: pick.hero.key,
    });
  }, [day, isOverride]);

  // mode_completed — fires on terminal transition. Legacy `gaveUp` saves
  // count as the third outcome bucket so old states still roll into
  // analytics correctly.
  const stateWon = state?.won === true;
  const stateLost = state?.lost === true;
  const stateGaveUp = state?.gaveUp === true;
  useEffect(() => {
    if (!day || isOverride) return;
    if (!stateWon && !stateLost && !stateGaveUp) return;
    const pick = getSoundForDay(day);
    const outcome = stateWon ? "won" : stateGaveUp ? "gaveUp" : "lost";
    trackModeCompleted({
      mode: "sound",
      dailyId: day,
      outcome,
      totalGuesses: state?.guesses.length ?? 0,
      cap: MAX_GUESSES,
      answerId: pick.hero.key,
    });
  }, [day, isOverride, stateWon, stateLost, stateGaveUp, state?.guesses.length]);

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
    // gaveUp / lost states are tied to whichever clip was current when
    // the round ended. If the daily seed rotates afterwards they'd see
    // the reveal for a hero that doesn't match today's waveform, so
    // wipe and restart on rotation.
    const endedStale = loaded.gaveUp === true || loaded.lost === true;
    if (wonStale || endedStale) {
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
  const lost = state.lost === true || state.gaveUp === true;
  const ended = state.won || lost;

  // Bonus options come from the labeled clip set for this hero. Empty
  // for legacy unlabeled clips. Skip the bonus round entirely when
  // there's only one option (it'd be a one-tile "puzzle" with the
  // answer obvious) — reveal directly on win instead.
  const bonusOptions = slug ? getSoundBonusOptions(answer.key, slug) : [];
  const bonusEligible = bonusOptions.length >= 2;

  // The win flow staggers two reveal stages so the bonus round happens
  // BEFORE the video reveal: get the hero, identify the ability, THEN
  // see the source clip. Losing skips the bonus and goes straight to
  // the video reveal alongside the LossReveal card.
  const bonusPending = state.won && bonusEligible && !state.bonus;
  const reveal =
    (state.won && (!bonusEligible || !!state.bonus)) || lost;

  // While the bonus round is pending, treat the clip as fully revealed
  // (they nailed the hero and can replay the whole sound while picking
  // the ability).
  //
  // Snippet ladder is sized against the AUDIBLE window (post-trim) so
  // that a clip trimmed to 2.4s ramps from a small taste up to 2.4s
  // over the ramp — not up to the raw 8s file length, which would
  // never actually play because the WaveformPlayer caps at the
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

  const finishGuess = (newGuesses: string[], hero: Hero | null) => {
    const won = hero != null && hero.key === answer.key;
    const newLost = !won && newGuesses.length >= MAX_GUESSES;
    persist({ ...state, guesses: newGuesses, won, lost: newLost });
  };

  const handleGuess = (hero: Hero) => {
    if (ended) return;
    if (!isOverride) {
      trackGuessSubmitted({
        mode: "sound",
        dailyId: day,
        guessNumber: state.guesses.length + 1,
        isCorrect: hero.key === answer.key,
        guessId: hero.key,
        answerId: answer.key,
      });
    }
    finishGuess([...state.guesses, hero.key], hero);
  };

  // Skip is locked when only one attempt remains — burning it would end
  // the round with no chance to guess the hero. Mirrors ClassicGame's
  // hint lockout at effectiveRemaining <= 1.
  const skipLocked = MAX_GUESSES - turnsUsed <= 1;

  const handleSkip = () => {
    if (ended || skipLocked) return;
    if (!isOverride) {
      trackGuessSubmitted({
        mode: "sound",
        dailyId: day,
        guessNumber: state.guesses.length + 1,
        isCorrect: false,
        guessId: SKIP_MARKER,
        answerId: answer.key,
      });
    }
    finishGuess([...state.guesses, SKIP_MARKER], null);
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
    fullPeaks: number[];
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
        <div className="mb-4 flex justify-center">
          <DevViewToggle
            mode="sound"
            active={devView}
            onChange={setDevView}
          />
        </div>
      )}
      {IS_DEV && devView && (
        <DevSoundPicker
          currentClip={resolved}
          overrideActive={isOverride}
          onApply={applyOverride}
        />
      )}

      <div
        ref={mediaRef}
        className="mb-6 flex scroll-mt-6 flex-col items-center gap-3 sm:scroll-mt-8"
      >
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
            {IS_DEV && devView && slug && (
              <DevSoundTrimmer
                heroKey={answer.key}
                slug={slug}
                fileDuration={audioMetaForCurrent?.fileDuration ?? null}
                autoStartOffset={
                  audioMetaForCurrent?.autoStartOffset ?? null
                }
                fullPeaks={audioMetaForCurrent?.fullPeaks ?? null}
                persistedStart={persistedStart}
                persistedEnd={persistedEnd}
                draftStart={activeStart}
                draftEnd={activeEnd}
                onChange={handleTrimChange}
                onSave={handleTrimSave}
              />
            )}
            {!ended && !skipLocked && (
              <button
                type="button"
                onClick={handleSkip}
                className="rounded-(--radius-card) border border-line bg-inset/60 px-5 py-3 font-mono text-xs uppercase tracking-[0.2em] text-ink-soft transition-colors hover:border-accent/60 hover:bg-accent/10 hover:text-accent active:scale-[0.98] sm:py-2.5 sm:text-[11px]"
              >
                Skip turn · reveal more →
              </button>
            )}
            {!ended && skipLocked && (
              <button
                type="button"
                disabled
                title="Skip locked on your last guess."
                aria-disabled="true"
                className="cursor-not-allowed rounded-(--radius-card) border border-line/60 bg-inset/30 px-5 py-3 font-mono text-xs uppercase tracking-[0.2em] text-ink-faint sm:py-2.5 sm:text-[11px]"
              >
                Skip locked · last guess
              </button>
            )}
          </>
        )}
      </div>

      {/* On completion, frame what matters next: the bonus question + score
          while the bonus is pending (the waveform scrolls above the fold),
          then the media column — by then the reveal video — + score once it's
          answered (or immediately on a no-bonus win / loss). The stage key
          remounts the trigger across that transition so the scroll re-fires. */}
      {(state.won || lost) && (
        <ScrollIntoViewOnMount
          key={reveal ? "reveal" : "bonus"}
          targetRef={reveal ? mediaRef : bonusRef}
        />
      )}

      {!ended && (
        <div className="mb-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <GuessRemaining used={turnsUsed} cap={MAX_GUESSES} />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">
              {snippetDuration.toFixed(1)}s clip ·{" "}
              {skipLocked ? "make it count" : "skip costs a guess"}
            </span>
          </div>
          <HeroCombobox
            heroes={HEROES}
            excludeKeys={excludeKeys}
            onSelect={handleGuess}
          />
        </div>
      )}

      {state.won && bonusEligible && (
        <div ref={bonusRef} className="mb-8 space-y-4 scroll-mt-6 sm:scroll-mt-8">
          <BonusRound
            heroName={answer.name}
            options={bonusOptions}
            saved={state.bonus}
            onSelect={handleBonus}
          />
        </div>
      )}

      <AnimatePresence>
        {state.won && !lost && (
          <motion.div
            key="win"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
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
                  <div className="mt-1 font-display text-2xl text-ink sm:text-3xl">
                    {answer.name}
                    {label && !bonusPending && (
                      <span className="ml-2 text-ink-soft">· {label}</span>
                    )}
                  </div>
                  <div className="mt-1 font-mono text-xs uppercase tracking-[0.18em] text-ink-faint">
                    in {heroGuessKeys.length}{" "}
                    {heroGuessKeys.length === 1 ? "guess" : "guesses"}
                  </div>
                  <ModeStatsLine mode="sound" />
                </div>
              </div>
              <div className="flex justify-center sm:justify-start">
                <NextModeCTA current="sound" scrollIntoViewOnMount={false} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {lost && !state.won && (
          <LossReveal current="sound" scrollIntoViewOnMount={false}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={answer.portrait}
                alt=""
                className="h-16 w-16 rounded-(--radius-card) bg-muted object-cover sm:h-20 sm:w-20"
              />
              <div className="flex-1">
                <div className="font-display text-2xl text-ink sm:text-3xl">
                  {answer.name}
                  {label && !bonusPending && (
                    <span className="ml-2 text-ink-soft">· {label}</span>
                  )}
                </div>
                <div className="mt-1 font-mono text-xs uppercase tracking-[0.18em] text-ink-faint">
                  after {heroGuessKeys.length} wrong{" "}
                  {heroGuessKeys.length === 1 ? "guess" : "guesses"}
                </div>
                <ModeStatsLine mode="sound" />
              </div>
            </div>
          </LossReveal>
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

      {state.guesses.length === 0 && !ended && (
        <div className="mt-10 rounded-(--radius-card) border border-dashed border-line bg-inset/40 p-8 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-ink-faint">
            Click the waveform to hear what's audible. Each wrong guess or skip
            reveals more. You get {MAX_GUESSES} attempts total.
          </p>
        </div>
      )}
    </main>
  );
}

// Plays the full source MP4 once the puzzle is over (won or lost). The
// native controls are dropped so the clip shows chrome-free at full
// brightness while it plays. We attempt autoplay WITH sound on mount:
// desktop (and Android, after the player's in-game interaction) honors it;
// iOS blocks unmuted autoplay outside a direct gesture, so play() rejects
// and we surface a tap-to-play glyph instead. The glyph appears only while
// paused (including after the clip ends, to invite a replay), so nothing
// overlays the video during playback. Tapping it is a user gesture, so the
// retry starts with sound. It's a real <button>, so it stays keyboard- and
// screen-reader-accessible despite the missing native controls.
function RevealPlayer({ videoUrl }: { videoUrl: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Optimistic: assume autoplay will take so desktop never flashes the
  // glyph. The mount attempt flips this to false if the browser blocks it.
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    videoRef.current
      ?.play()
      .then(() => setPlaying(true))
      .catch(() => setPlaying(false));
  }, []);

  return (
    <div className="w-full max-w-2xl">
      <div className="relative">
        <video
          ref={videoRef}
          src={media(videoUrl)}
          playsInline
          preload="auto"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          className="block w-full rounded-(--radius-card) bg-black"
        />
        {!playing && (
          <button
            type="button"
            onClick={() => videoRef.current?.play().catch(() => {})}
            aria-label="Play clip with sound"
            className="group absolute inset-0 flex items-center justify-center"
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/40 ring-1 ring-white/30 backdrop-blur-sm transition-transform group-hover:scale-105 group-active:scale-95">
              <svg
                viewBox="0 0 24 24"
                aria-hidden
                className="h-7 w-7 translate-x-[1px] fill-white"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </button>
        )}
      </div>
      <p className="mt-2 text-center font-mono text-[10px] uppercase tracking-[0.22em] text-info">
        Source clip · full audio + video
      </p>
    </div>
  );
}
