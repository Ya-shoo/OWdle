"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { HEROES, HEROES_BY_KEY, type Hero } from "@/lib/heroes";
import {
  getSoundBonusOptions,
  type ResolvedSoundClip,
  type SoundBonusOption,
} from "@/lib/daily";
import { loadModeState, saveModeState, type ModeState } from "@/lib/storage";
import { media } from "@/lib/media";
import { audioBoostFor, loadVolume, saveVolume } from "@/lib/audio";
import { HeroCombobox } from "./HeroCombobox";
import { GuessRow } from "./GuessRow";
import { GuessRemaining } from "./GuessRemaining";
import { BonusRound } from "./BonusRound";
import { WaveformPlayer } from "./WaveformPlayer";
import { VolumeSlider } from "./VolumeSlider";
import { ScrollIntoViewOnMount } from "./ScrollIntoViewOnMount";

// The shared Sound "core board" — the listen/guess/skip loop that is
// identical between the daily /sound engine and the /archive/sound replay.
// The STATE MACHINE lives in the useSoundRound hook; the shared VIEW (media
// column + skip button + input row + bonus round + guess history + empty
// state) lives in SoundBoard. Everything variant-specific — the page header,
// the win/loss result chrome, analytics, streak, share, the dev tools, and
// the storage namespace — stays in the wrapping engine, which injects its
// reveal cards through the `reveal` slot and (for the daily) its trimmer
// through `mediaFooter`. Mirrors ClassicBoard, the template the modes follow
// when they gain an archive.

// Hard cap on total attempts (hero guesses + skips). The player loses on the
// cap-th wrong move and the source video auto-reveals.
export const MAX_GUESSES = 8;

// Full audio unlocks one attempt BEFORE the cap so the player gets at least
// one shot at the unmasked clip. With cap=8 and unlock-at-7, fraction =
// (guessCount + 1) / 8 reaches 1 when guessCount = 7 — the state after the
// 7th wrong move, i.e. just before the 8th and final attempt.
export const FULL_AUDIO_AT = MAX_GUESSES - 1;

// Sentinel pushed into guesses[] when the player skips a turn. Counts toward
// both the snippet-reveal ladder AND the hard cap (skips burn real
// attempts), but is filtered out of the visible solve count so that tracks
// real hero picks.
export const SKIP_MARKER = "__skip__";

// Linear ramp from a small "taste" of the clip up to full duration, reaching
// 100% on the player's final attempt. Floors at 0.4s so the first reveal is
// never inaudible. Falls back to a fixed ladder when we don't have a known
// clip duration (legacy SFX path).
export function snippetDurationFor(
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

export type SoundRound = {
  day: string;
  clip: ResolvedSoundClip;
  answer: Hero;
  state: ModeState;
  // Real hero guesses only (skips filtered out) — what the guess history
  // renders and what "solved in N" reports.
  guessedHeroes: Hero[];
  heroGuessKeys: string[];
  excludeKeys: Set<string>;
  // turnsUsed counts every slot spent — hero guesses AND skips — which is
  // what's charged against the cap. skipsUsed backs out the hidden portion.
  turnsUsed: number;
  skipsUsed: number;
  won: boolean;
  lost: boolean;
  ended: boolean;
  skipLocked: boolean;
  // Post-win ability bonus, sourced from the labeled clip set for this hero.
  bonusOptions: SoundBonusOption[];
  bonusEligible: boolean;
  bonusPending: boolean;
  // Show the source-video reveal: won past the bonus (or no bonus), or lost.
  showReveal: boolean;
  // Effective playback window driving the snippet ladder.
  effectiveStart: number | null;
  effectiveEnd: number | null;
  snippetDuration: number;
  handleGuess: (hero: Hero) => void;
  handleSkip: () => void;
  handleBonus: (selected: number, correct: boolean | null) => void;
  // Wipe the in-memory round back to empty (and overwrite storage when
  // persisting). Drives archive "Play Again"; unused by the daily.
  resetRound: () => void;
};

function freshState(day: string): ModeState {
  return { day, guesses: [], won: false };
}

// Headless state machine for a single Sound round on an arbitrary day.
// Storage, analytics, streak, and dev overrides are all injected/observed by
// the caller:
//   - `storageMode` picks the localStorage namespace ("sound" for the live
//     daily, "archive.sound" for a replay) — routed through the same
//     loadModeState/saveModeState, so the archive key can never collide with
//     the live one.
//   - `persist:false` runs a throwaway round (the daily dev override) — no
//     storage writes, and the round re-inits empty whenever the clip changes.
//   - `stampAnswer` pins the resolved hero key AND clip slug into every saved
//     state so a round stays tied to the exact clip even if the daily bag
//     reshuffles later. The archive needs both (a replay must stay on the clip
//     the player first heard); the daily sets it too but only reads the hero
//     key back — its reload rotation-guard compares a finished loss's
//     answerKey to the current clip's hero.
//   - `resetIfStale` (daily-only) wipes a hydrated terminal state ONLY when the
//     daily seed rotated under it (win: stale last-guess; loss: answerKey
//     mismatch) — preserving SoundGame's pre-existing rotation-reset intent
//     without discarding an ordinary same-day loss on reload.
//   - onGuessSubmitted fires per guess/skip (hero:null = skip); onTerminal
//     fires once, from the action that ends the round (never a resume/reload),
//     so the archive can record a completion without an effect that would
//     double-fire on hydration. The daily leaves onTerminal off and keeps its
//     own mode_completed effect.
// Returns null until the day, clip, and hydrated state are all ready.
export function useSoundRound(opts: {
  day: string | null;
  clip: ResolvedSoundClip | null;
  storageMode: string;
  persist: boolean;
  stampAnswer?: boolean;
  resetIfStale?: boolean;
  // Draft-aware playback window (the daily's dev trimmer). Omit to use the
  // clip's own persisted trim offsets — the production + archive path.
  activeStart?: number | null;
  activeEnd?: number | null;
  onGuessSubmitted?: (o: {
    guessNumber: number;
    isCorrect: boolean;
    hero: Hero | null;
  }) => void;
  onTerminal?: (o: {
    outcome: "won" | "lost";
    turnsUsed: number;
    heroGuesses: number;
    skips: number;
  }) => void;
}): SoundRound | null {
  const { day, clip, storageMode, persist, resetIfStale } = opts;
  // audioUrl uniquely identifies a clip (labeled or legacy) — used as the
  // hydration key so a dev-picker clip swap re-inits the round.
  const clipKey = clip?.audioUrl ?? null;
  const [state, setState] = useState<ModeState | null>(null);

  // Hydrate on mount and whenever the day, clip, or persist flag changes. A
  // non-persisting round starts empty; a persisting one resumes from its
  // storage namespace, optionally wiping a stale terminal state (daily
  // rotation). Effect-driven (not lazy useState) so the first paint is empty
  // on both server and client — no hydration mismatch — then storage fills.
  useEffect(() => {
    if (!day || !clip) {
      setState(null);
      return;
    }
    if (!persist) {
      setState(freshState(day));
      return;
    }
    const loaded = loadModeState(storageMode, day);
    if (resetIfStale) {
      // Auto-reset a terminal state ONLY when the daily seed genuinely
      // rotated under it (a mid-day data/bag change) — preserving
      // SoundGame's original rotation-reset intent without nuking an
      // ordinary same-day loss on reload. A win is self-probing: the
      // winning guess IS the answer, so a stale last-guess means rotation.
      // A loss/gaveUp doesn't encode the answer in its guesses, so it
      // carries an answerKey stamp (see stampAnswer) we compare instead,
      // and we wipe only on a real mismatch. Legacy losses saved before
      // stamping have no answerKey and are kept — a same-day loss survives.
      const wonStale =
        loaded.won &&
        loaded.guesses[loaded.guesses.length - 1] !== clip.hero.key;
      const endedStale =
        (loaded.lost === true || loaded.gaveUp === true) &&
        loaded.answerKey != null &&
        loaded.answerKey !== clip.hero.key;
      if (wonStale || endedStale) {
        const fresh = freshState(day);
        setState(fresh);
        saveModeState(storageMode, fresh);
        return;
      }
    }
    setState(loaded);
    // clip is keyed by clipKey (its unique audioUrl); depending on the object
    // itself would re-hydrate every render since callers re-derive it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, clipKey, persist, storageMode, resetIfStale]);

  const guessedHeroes = useMemo(
    () =>
      (state?.guesses ?? [])
        .map((k) => HEROES_BY_KEY[k])
        .filter(Boolean) as Hero[],
    [state?.guesses],
  );

  if (!day || !clip || !state) return null;

  const answer = clip.hero;
  const heroGuessKeys = state.guesses.filter((k) => HEROES_BY_KEY[k]);
  const excludeKeys = new Set(heroGuessKeys);
  const turnsUsed = state.guesses.length;
  const skipsUsed = turnsUsed - heroGuessKeys.length;
  const lost = state.lost === true || state.gaveUp === true;
  const won = state.won === true;
  const ended = won || lost;
  // Skip is locked when only one attempt remains — burning it would end the
  // round with no chance to guess the hero.
  const skipLocked = MAX_GUESSES - turnsUsed <= 1;

  // Bonus options come from the labeled clip set for this hero. Empty for
  // legacy unlabeled clips. Skip the bonus round entirely when there's only
  // one option (a one-tile "puzzle" with the answer obvious).
  const bonusOptions = clip.slug
    ? getSoundBonusOptions(answer.key, clip.slug)
    : [];
  const bonusEligible = bonusOptions.length >= 2;

  // The win flow staggers the reveal so the bonus round happens BEFORE the
  // video reveal: get the hero, identify the ability, THEN see the source
  // clip. Losing skips the bonus and reveals directly.
  const bonusPending = won && bonusEligible && !state.bonus;
  const showReveal = (won && (!bonusEligible || !!state.bonus)) || lost;

  const effectiveStart =
    opts.activeStart !== undefined ? opts.activeStart : clip.startOffset;
  const effectiveEnd =
    opts.activeEnd !== undefined ? opts.activeEnd : clip.endOffset;
  // Snippet ladder is sized against the AUDIBLE window (post-trim) so a clip
  // trimmed to 2.4s ramps up to 2.4s, not the raw file length.
  const effectiveDuration =
    clip.duration != null
      ? Math.max(0.4, (effectiveEnd ?? clip.duration) - (effectiveStart ?? 0))
      : null;
  // While the bonus round is pending, treat the clip as fully revealed (they
  // nailed the hero and can replay the whole sound while picking the ability).
  const snippetDuration = snippetDurationFor(
    turnsUsed,
    showReveal || bonusPending,
    effectiveDuration,
  );

  const persistState = (next: ModeState) => {
    const toSave = opts.stampAnswer
      ? { ...next, answerKey: answer.key, answerClip: clip.slug ?? undefined }
      : next;
    setState(toSave);
    if (persist) saveModeState(storageMode, toSave);
  };

  const finishGuess = (newGuesses: string[], hero: Hero | null) => {
    const didWin = hero != null && hero.key === answer.key;
    const didLose = !didWin && newGuesses.length >= MAX_GUESSES;
    persistState({ ...state, guesses: newGuesses, won: didWin, lost: didLose });
    if (didWin || didLose) {
      opts.onTerminal?.({
        outcome: didWin ? "won" : "lost",
        turnsUsed: newGuesses.length,
        heroGuesses: newGuesses.filter((k) => HEROES_BY_KEY[k]).length,
        skips: newGuesses.filter((k) => !HEROES_BY_KEY[k]).length,
      });
    }
  };

  const handleGuess = (hero: Hero) => {
    if (ended) return;
    opts.onGuessSubmitted?.({
      guessNumber: state.guesses.length + 1,
      isCorrect: hero.key === answer.key,
      hero,
    });
    finishGuess([...state.guesses, hero.key], hero);
  };

  const handleSkip = () => {
    if (ended || skipLocked) return;
    opts.onGuessSubmitted?.({
      guessNumber: state.guesses.length + 1,
      isCorrect: false,
      hero: null,
    });
    finishGuess([...state.guesses, SKIP_MARKER], null);
  };

  const handleBonus = (selected: number, correct: boolean | null) => {
    if (!won || state.bonus) return;
    persistState({ ...state, bonus: { selected, correct } });
  };

  const resetRound = () => {
    const base = freshState(day);
    const fresh = opts.stampAnswer
      ? { ...base, answerKey: answer.key, answerClip: clip.slug ?? undefined }
      : base;
    setState(fresh);
    if (persist) saveModeState(storageMode, fresh);
  };

  return {
    day,
    clip,
    answer,
    state,
    guessedHeroes,
    heroGuessKeys,
    excludeKeys,
    turnsUsed,
    skipsUsed,
    won,
    lost,
    ended,
    skipLocked,
    bonusOptions,
    bonusEligible,
    bonusPending,
    showReveal,
    effectiveStart,
    effectiveEnd,
    snippetDuration,
    handleGuess,
    handleSkip,
    handleBonus,
    resetRound,
  };
}

// The shared board view. Renders the media column (interactive waveform while
// playing, source video on reveal), the skip control, the input row, the
// bonus round, the caller's `reveal` chrome, the guess history, and the empty
// state — in the exact order the daily used, so the daily is visually
// unchanged. Variant-specific reveal cards are injected through `reveal`;
// `mediaFooter` + `onAudioMetadata` let the daily slot its dev trimmer under
// the player without this view learning about daily vs archive.
export function SoundBoard({
  round,
  reveal,
  onAudioMetadata,
  mediaFooter,
}: {
  round: SoundRound;
  reveal?: ReactNode;
  onAudioMetadata?: (info: {
    fileDuration: number;
    autoStartOffset: number;
    fullPeaks: number[];
  }) => void;
  mediaFooter?: ReactNode;
}) {
  const { clip, answer, state } = round;
  const boost = audioBoostFor(answer);

  // Scroll anchors for "center on what matters" after the main guess. While
  // the bonus is pending we frame the bonus question; once it's answered — or
  // on a no-bonus win / loss — we frame the media column (by then the reveal
  // video).
  const mediaRef = useRef<HTMLDivElement>(null);
  const bonusRef = useRef<HTMLDivElement>(null);

  // Warm the reveal clip into cache the instant the round is won, so by the
  // time the <video> mounts (after the bonus round) it's already local —
  // turning a cold cross-origin fetch into a cache hit. Consuming .blob()
  // forces the browser to stream the whole file rather than stall on an
  // unread body. Deduped per clip; a miss just falls back to a cold fetch.
  const prefetchedVideoRef = useRef<string | null>(null);
  useEffect(() => {
    if (!round.won || !clip.videoUrl) return;
    const src = media(clip.videoUrl);
    if (prefetchedVideoRef.current === src) return;
    prefetchedVideoRef.current = src;
    void fetch(src, { mode: "no-cors" })
      .then((r) => r.blob())
      .catch(() => {});
  }, [round.won, clip.videoUrl]);

  return (
    <>
      <div
        ref={mediaRef}
        className="mb-6 flex scroll-mt-6 flex-col items-center gap-3 sm:scroll-mt-8"
      >
        {round.showReveal && clip.videoUrl ? (
          <RevealPlayer
            videoUrl={clip.videoUrl}
            posterUrl={answer.portrait}
            boost={boost}
          />
        ) : (
          <>
            <WaveformPlayer
              audioUrl={clip.audioUrl}
              revealDuration={round.snippetDuration}
              boost={boost}
              startOffset={round.effectiveStart}
              endOffset={round.effectiveEnd}
              onAudioMetadata={onAudioMetadata}
            />
            {mediaFooter}
            {!round.ended && !round.skipLocked && (
              <button
                type="button"
                onClick={round.handleSkip}
                className="rounded-(--radius-card) border border-line bg-muted px-5 py-3 utility-label text-xs text-ink-soft transition-colors hover:border-edge hover:text-accent active:scale-[0.98] sm:py-2.5 sm:text-[11px]"
              >
                Skip turn · reveal more →
              </button>
            )}
            {!round.ended && round.skipLocked && (
              <button
                type="button"
                disabled
                title="Skip locked on your last guess."
                aria-disabled="true"
                className="cursor-not-allowed rounded-(--radius-card) border border-line bg-muted px-5 py-3 utility-label text-xs text-ink-faint sm:py-2.5 sm:text-[11px]"
              >
                Skip locked · last guess
              </button>
            )}
          </>
        )}
      </div>

      {/* On completion, frame what matters next: the bonus question while it's
          pending (the waveform scrolls above the fold), then the media column
          — by then the reveal video — once it's answered (or immediately on a
          no-bonus win / loss). The stage key remounts the trigger so the
          scroll re-fires across that transition. */}
      {(round.won || round.lost) && (
        <ScrollIntoViewOnMount
          key={round.showReveal ? "reveal" : "bonus"}
          targetRef={round.showReveal ? mediaRef : bonusRef}
        />
      )}

      {!round.ended && (
        <div className="mb-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <GuessRemaining used={round.turnsUsed} cap={MAX_GUESSES} />
            <span className="utility-label text-[10px] text-ink-faint">
              {round.snippetDuration.toFixed(1)}s clip ·{" "}
              {round.skipLocked ? "make it count" : "skip costs a guess"}
            </span>
          </div>
          <HeroCombobox
            heroes={HEROES}
            excludeKeys={round.excludeKeys}
            onSelect={round.handleGuess}
          />
        </div>
      )}

      {round.won && round.bonusEligible && (
        <div
          ref={bonusRef}
          className="mb-8 space-y-4 scroll-mt-6 sm:scroll-mt-8"
        >
          <BonusRound
            heroName={answer.name}
            options={round.bonusOptions}
            saved={state.bonus}
            onSelect={round.handleBonus}
          />
        </div>
      )}

      {reveal}

      <div className="space-y-4">
        <AnimatePresence initial={false}>
          {[...round.guessedHeroes].reverse().map((hero, revIdx) => {
            const originalIdx = round.guessedHeroes.length - 1 - revIdx;
            const isLatest = originalIdx === round.guessedHeroes.length - 1;
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
    </>
  );
}

// Plays the full source MP4 once the puzzle is over (won or lost). Native
// controls are dropped so the clip shows chrome-free while it plays. We
// attempt autoplay WITH sound on mount: desktop (and Android, after the
// player's in-game interaction) honors it; iOS blocks unmuted autoplay
// outside a direct gesture, so play() rejects and we surface a tap-to-play
// glyph instead. The glyph appears only while paused, so nothing overlays the
// video during playback. It's a real <button>, so it stays keyboard- and
// screen-reader-accessible despite the missing native controls.
//
// The clip is primed into the browser cache the moment the round is won (see
// the prefetch effect in SoundBoard), so mounting here at reveal loads from
// cache instead of opening a cold cross-origin connection.
function RevealPlayer({
  videoUrl,
  posterUrl,
  boost = 1,
}: {
  videoUrl: string;
  posterUrl?: string;
  boost?: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Optimistic: assume autoplay will take so desktop never flashes the glyph.
  // The mount attempt flips this to false if the browser blocks it.
  const [playing, setPlaying] = useState(true);
  // Hard load failure for the reveal MP4 (a 404 / dropped fetch / codec
  // miss). The hero is already named in the result card below, so this is
  // cosmetic — but a dead black box reads as broken. Auto-retry the load once,
  // then fall back to the hero portrait + an explicit retry.
  const [errored, setErrored] = useState(false);
  const errorRetriesRef = useRef(0);
  // Volume is global across modes (shared with the waveform snippet). Lazy-
  // read the saved level: RevealPlayer only mounts client-side after a win or
  // loss, so there's no SSR/hydration pass to mismatch, and loadVolume() is
  // window-guarded regardless. iOS ignores HTMLMediaElement.volume, so the
  // slider is a no-op there — harmless, and desktop gets a real control.
  const [volume, setVolume] = useState<number>(() => loadVolume());

  // Apply the level to the element on mount and whenever the slider moves.
  // Defined before the autoplay effect so it runs first (mount-phase effects
  // fire in definition order) — the first audible frame is already at the
  // user's volume.
  useEffect(() => {
    const el = videoRef.current;
    if (el) el.volume = Math.max(0, Math.min(1, volume * boost));
  }, [volume, boost]);

  // Autoplay-with-sound on reveal.
  useEffect(() => {
    videoRef.current
      ?.play()
      .then(() => setPlaying(true))
      .catch(() => setPlaying(false));
  }, []);

  const handleVolumeChange = (v: number) => {
    setVolume(v);
    saveVolume(v);
  };

  // A media-element load error fires for transient reasons too (a dropped
  // connection, a CDN blip). Re-issue load() once before giving up so the
  // common case self-heals; only then fall back to the portrait.
  const handleVideoError = () => {
    const el = videoRef.current;
    if (el && errorRetriesRef.current < 1) {
      errorRetriesRef.current += 1;
      el.load();
      el.play()
        .then(() => setPlaying(true))
        .catch(() => setPlaying(false));
      return;
    }
    setErrored(true);
    setPlaying(false);
  };

  const handleRetry = () => {
    errorRetriesRef.current = 0;
    setErrored(false);
    const el = videoRef.current;
    if (!el) return;
    el.load();
    el.play()
      .then(() => setPlaying(true))
      .catch(() => setPlaying(false));
  };

  return (
    <div className="w-full max-w-2xl">
      <div className="relative">
        {/* Kept mounted even when errored (just hidden) so handleRetry can
            re-issue load() against the live element. */}
        <video
          ref={videoRef}
          src={media(videoUrl)}
          playsInline
          preload="auto"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onError={handleVideoError}
          className={
            errored ? "hidden" : "block w-full rounded-(--radius-card) bg-black"
          }
        />
        {errored && (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-(--radius-card) border border-line bg-muted p-6 text-center">
            {posterUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={posterUrl}
                alt=""
                className="h-16 w-16 rounded-(--radius-card) bg-muted object-cover"
              />
            )}
            <div className="utility-label text-[10px] text-ink-faint">
              Reveal clip didn&apos;t load
            </div>
            <button
              type="button"
              onClick={handleRetry}
              className="rounded-(--radius-card) border border-line bg-muted px-4 py-2 utility-label text-[10px] text-ink-soft transition-colors hover:border-edge hover:text-accent"
            >
              ⟳ Retry
            </button>
          </div>
        )}
        {!playing && !errored && (
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
      {/* Volume mirrors sound mode's own slider (same global setting). On iOS
          it's a no-op — media volume is hardware-controlled there — but it's
          the real control on desktop. */}
      <div className="mt-3 flex justify-center">
        <VolumeSlider value={volume} onChange={handleVolumeChange} />
      </div>
      <p className="mt-2 text-center utility-label text-[10px] text-info">
        Source clip · full audio + video
      </p>
    </div>
  );
}
