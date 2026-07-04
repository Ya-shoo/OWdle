"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import { HEROES, HEROES_BY_KEY, type Hero } from "@/lib/heroes";
import {
  dayString,
  getMeleeForDay,
  prettyDay,
  resolveMeleeClip,
} from "@/lib/daily";
import { loadModeState, saveModeState, type ModeState } from "@/lib/storage";
import { audioBoostFor, loadVolume, saveVolume } from "@/lib/audio";
import { media } from "@/lib/media";
import {
  trackGuessSubmitted,
  trackModeCompleted,
  trackModeStarted,
} from "@/lib/tracking";
import { roundShareLinks } from "@/lib/shareLinks";
import { useShareLinkVisit } from "@/lib/useShareLinkVisit";
import { HeroCombobox } from "./HeroCombobox";
import { Brand } from "./Brand";
import { NextModeCTA } from "./NextModeCTA";
import { ShareButton } from "./ShareButton";
import { ModeStatsLine } from "./ModeStatsLine";
import { ScrollIntoViewOnMount } from "./ScrollIntoViewOnMount";
import { GuessRemaining } from "./GuessRemaining";
import { WaveformPlayer } from "./WaveformPlayer";
import { VolumeSlider } from "./VolumeSlider";
import { DevViewToggle, useDevViewState } from "./DevViewToggle";
import { DevMeleePicker } from "./DevMeleePicker";

const IS_DEV = process.env.NODE_ENV !== "production";

const MODE = "melee";
// Three chances, then the answer (and its source clip) are revealed. The
// whole melee sound is playable from the first tap — the pressure here is
// the tight guess cap, not a lengthening snippet like Sound mode.
const MAX_GUESSES = 3;

export function MeleeGame() {
  // Inbound share-link attribution — a Melee round /r/[code] link redirects
  // here with ?c= appended so the visit closes the share funnel.
  useShareLinkVisit("melee");
  const [day, setDay] = useState<string | null>(null);
  const [state, setState] = useState<ModeState | null>(null);
  // Dev-only view toggle (hides every dev panel when set to User) + a
  // hero override that serves a specific clip and skips localStorage so
  // test plays don't pollute real daily progress.
  const [devView, setDevView] = useDevViewState("melee");
  const [overrideHero, setOverrideHero] = useState<string | null>(null);
  const isOverride = overrideHero !== null;

  // Scroll anchor: on completion bring the media column (by then the
  // reveal video) to the top so it frames with the result card.
  const mediaRef = useRef<HTMLDivElement>(null);

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

  // mode_started — once per Pacific day, skipped for dev overrides so test
  // plays don't emit real analytics. Melee fires the SAME events every mode
  // fires; keeping bonus play out of the daily rank is the server query's
  // job (canonical mode allowlist), not a matter of firing fewer events.
  useEffect(() => {
    if (!day || isOverride) return;
    const pick = getMeleeForDay(day);
    trackModeStarted({ mode: MODE, dailyId: day, answerId: pick.hero.key });
  }, [day, isOverride]);

  // mode_completed — fires on the terminal transition (win or loss). The
  // `lost` flag is persisted in handleGuess (see below), so this effect can
  // observe a loss the same way SoundGame does. bonus:true marks the
  // completion as OUTSIDE the canonical daily for dashboard segmentation.
  const stateWon = state?.won === true;
  const stateLost = state?.lost === true;
  useEffect(() => {
    if (!day || isOverride) return;
    if (!stateWon && !stateLost) return;
    const pick = getMeleeForDay(day);
    trackModeCompleted({
      mode: MODE,
      dailyId: day,
      outcome: stateWon ? "won" : "lost",
      totalGuesses: state?.guesses.length ?? 0,
      cap: MAX_GUESSES,
      answerId: pick.hero.key,
      bonus: true,
    });
  }, [day, isOverride, stateWon, stateLost, state?.guesses.length]);

  // Warm the reveal MP4 the instant the round is won, so the <video> mounts
  // from browser cache instead of a cold cross-origin fetch. Mirrors
  // SoundGame's prefetch — Melee especially benefits because it mounts cold
  // with no bonus round to buy warming time. Skipped during dev overrides
  // (getMeleeForDay returns the DAILY hero, not the override). Deduped per
  // clip; a miss just falls back to the cold fetch, so no regression.
  const prefetchedVideoRef = useRef<string | null>(null);
  useEffect(() => {
    if (!day || !stateWon || isOverride) return;
    const pick = getMeleeForDay(day);
    if (!pick.videoUrl) return;
    const src = media(pick.videoUrl);
    if (prefetchedVideoRef.current === src) return;
    prefetchedVideoRef.current = src;
    void fetch(src, { mode: "no-cors" })
      .then((r) => r.blob())
      .catch(() => {});
  }, [day, stateWon, isOverride]);

  if (!day || !state) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <div className="font-mono text-xs uppercase tracking-[0.2em] text-ink-faint">
          Loading…
        </div>
      </main>
    );
  }

  const resolved =
    (isOverride ? resolveMeleeClip(overrideHero) : null) ?? getMeleeForDay(day);
  const { hero: answer, audioUrl, videoUrl, duration: clipDuration } = resolved;

  const guessedHeroes = state.guesses
    .map((k) => HEROES_BY_KEY[k])
    .filter(Boolean);
  const excludeKeys = new Set(state.guesses);
  const guessCount = state.guesses.length;
  const lost = !state.won && guessCount >= MAX_GUESSES;
  const reveal = state.won || lost;

  const persist = (next: ModeState) => {
    setState(next);
    if (!isOverride) saveModeState(MODE, next);
  };

  const handleGuess = (hero: Hero) => {
    if (reveal) return;
    const nextGuesses = [...state.guesses, hero.key];
    const won = hero.key === answer.key;
    // Persist `lost` at the 3rd miss. Previously it was only derived at
    // render and never written, which corrupted the loss reveal on reload,
    // the loss analytics, and the home bonus-card's "Missed" status.
    const lostNow = !won && nextGuesses.length >= MAX_GUESSES;
    if (!isOverride) {
      trackGuessSubmitted({
        mode: MODE,
        dailyId: day,
        guessNumber: state.guesses.length + 1,
        isCorrect: won,
        guessId: hero.key,
        answerId: answer.key,
      });
    }
    persist({ ...state, guesses: nextGuesses, won, lost: lostNow });
  };

  const applyOverride = (heroKey: string | null) => {
    setOverrideHero(heroKey);
    if (heroKey) {
      setState({ day, guesses: [], won: false });
    } else {
      setState(loadModeState(MODE, day));
    }
  };

  // Full clip is playable from the first tap. Fall back to a generous
  // duration if the manifest somehow lacks one.
  const playDuration = clipDuration && clipDuration > 0 ? clipDuration : 30;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:py-16">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-info">
            <span suppressHydrationWarning>{prettyDay(day)}</span>
          </p>
          <h1 className="mt-3 font-display display-headline text-5xl text-ink sm:text-6xl">
            Melee
          </h1>
          <p className="mt-3 max-w-md text-ink-soft">
            Guess the Overwatch hero from their melee sound. Listen to the hit.
            Three guesses.
          </p>
        </div>
        <div className="hidden flex-col items-end font-mono text-xs uppercase tracking-[0.2em] text-ink-faint sm:flex">
          <Brand size="sm" />
          <span className="mt-1 text-info">melee mode</span>
        </div>
      </header>

      {IS_DEV && (
        <div className="mb-4 flex justify-center">
          <DevViewToggle mode="melee" active={devView} onChange={setDevView} />
        </div>
      )}
      {IS_DEV && devView && (
        <DevMeleePicker
          currentHeroKey={answer.key}
          overrideActive={isOverride}
          onApply={applyOverride}
        />
      )}

      <div
        ref={mediaRef}
        className="mb-6 flex scroll-mt-6 flex-col items-center gap-3 sm:scroll-mt-8"
      >
        {reveal && videoUrl ? (
          <MeleeRevealPlayer
            videoUrl={videoUrl}
            posterUrl={answer.portrait}
            boost={audioBoostFor(answer)}
          />
        ) : (
          <WaveformPlayer
            variant="melee"
            audioUrl={audioUrl}
            revealDuration={playDuration}
            boost={audioBoostFor(answer)}
          />
        )}
      </div>
      {reveal && <ScrollIntoViewOnMount targetRef={mediaRef} />}

      {!reveal && (
        <div className="mb-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <GuessRemaining used={guessCount} cap={MAX_GUESSES} />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">
              full clip · {MAX_GUESSES} guesses
            </span>
          </div>
          <HeroCombobox
            heroes={HEROES}
            excludeKeys={excludeKeys}
            onSelect={handleGuess}
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
            className={clsx(
              "result-card mx-auto mb-8 w-full max-w-md rounded-(--radius-card) border p-4 sm:p-5",
              state.won
                ? "border-correct/40 bg-correct/10"
                : "border-far/40 bg-far/10",
            )}
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
                  <div
                    className={clsx(
                      "font-mono text-[10px] uppercase tracking-[0.2em]",
                      state.won ? "text-info" : "text-far",
                    )}
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
                  <ModeStatsLine mode="melee" />
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <NextModeCTA current="melee" scrollIntoViewOnMount={false} />
                <ShareButton
                  {...roundShareLinks({
                    day,
                    slug: "melee",
                    outcome: state.won ? "won" : "lost",
                    guesses: guessCount,
                  })}
                  filename={`owdle-melee-${day}.png`}
                  surface="round_result"
                  mode="melee"
                  dailyId={day}
                />
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
                isCorrect={hero.key === answer.key}
                isLatest={isLatest}
              />
            );
          })}
        </AnimatePresence>
      </div>

      {state.guesses.length === 0 && !reveal && (
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

// Portrait + name card, right or wrong — no attribute breakdown. Matches
// Ability mode's guess card so the two icon/audio modes read the same.
function MeleeGuessCard({
  hero,
  isCorrect,
  isLatest,
}: {
  hero: Hero;
  isCorrect: boolean;
  isLatest: boolean;
}) {
  return (
    <motion.div
      layout
      initial={isLatest ? { opacity: 0, y: -10 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className={clsx(
        "tile-shape mx-auto flex w-full max-w-xs flex-col items-center justify-center gap-3 border px-5 py-6",
        isCorrect
          ? "border-correct/40 bg-correct/15"
          : "border-far/40 bg-far/15",
      )}
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

// Plays the full source MP4 once the round is over (won or out of guesses).
// Mirrors Sound mode's reveal: autoplay WITH sound on mount (desktop/Android
// honor it after the player's in-game interaction; iOS blocks unmuted
// autoplay outside a gesture, so we surface a tap-to-play glyph), a shared
// volume slider, and a load-error retry so a dropped fetch never strands the
// reveal on a dead black box.
function MeleeRevealPlayer({
  videoUrl,
  posterUrl,
  boost = 1,
}: {
  videoUrl: string;
  posterUrl?: string;
  boost?: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(true);
  const [errored, setErrored] = useState(false);
  const errorRetriesRef = useRef(0);
  const [volume, setVolume] = useState<number>(() => loadVolume());

  useEffect(() => {
    const el = videoRef.current;
    if (el) el.volume = Math.max(0, Math.min(1, volume * boost));
  }, [volume, boost]);

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
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-(--radius-card) border border-line bg-inset/60 p-6 text-center">
            {posterUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={posterUrl}
                alt=""
                className="h-16 w-16 rounded-(--radius-card) bg-muted object-cover"
              />
            )}
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">
              Reveal clip didn&apos;t load
            </div>
            <button
              type="button"
              onClick={handleRetry}
              className="rounded-(--radius-card) border border-line bg-inset/60 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-soft transition-colors hover:border-accent/60 hover:text-accent"
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
      <div className="mt-3 flex justify-center">
        <VolumeSlider value={volume} onChange={handleVolumeChange} />
      </div>
      <p className="mt-2 text-center font-mono text-[10px] uppercase tracking-[0.22em] text-info">
        Source clip · full melee audio + video
      </p>
    </div>
  );
}
