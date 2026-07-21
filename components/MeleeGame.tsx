"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import { HEROES, HEROES_BY_KEY, type Hero, type Role } from "@/lib/heroes";
import {
  dayString,
  getMeleeForDay,
  prettyDay,
  resolveMeleeClip,
} from "@/lib/daily";
import { loadModeState, saveModeState, type ModeState } from "@/lib/storage";
import { MELEE_AUDIO_BOOST, loadVolume, saveVolume } from "@/lib/audio";
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
// Five chances, then the answer (and its source clip) are revealed. The
// whole melee sound is playable from the first tap; every miss also scores
// the guessed hero's ROLE against the answer, so that role feedback carries
// the hint work rather than a lengthening snippet like Sound mode.
const MAX_GUESSES = 5;

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
        <div className="utility-label text-xs text-ink-faint">
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
          <p className="utility-label text-xs text-info">
            <span suppressHydrationWarning>{prettyDay(day)}</span>
          </p>
          <h1 className="mt-3 font-display display-headline uppercase text-5xl text-ink sm:text-6xl">
            Melee
          </h1>
          <p className="mt-3 max-w-md text-ink-soft">
            Guess the Overwatch hero from their melee sound. Listen to the hit.
            Five guesses.
          </p>
        </div>
        <div className="hidden flex-col items-end utility-label text-xs text-ink-faint sm:flex">
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
            boost={MELEE_AUDIO_BOOST}
          />
        ) : (
          <WaveformPlayer
            variant="melee"
            audioUrl={audioUrl}
            revealDuration={playDuration}
            boost={MELEE_AUDIO_BOOST}
          />
        )}
      </div>
      {reveal && <ScrollIntoViewOnMount targetRef={mediaRef} />}

      {!reveal && (
        <div className="mb-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <GuessRemaining used={guessCount} cap={MAX_GUESSES} />
            <span className="utility-label text-[10px] text-ink-faint">
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
              "result-card mx-auto mb-8 w-full max-w-xs rounded-(--radius-card) border p-4 sm:p-5",
              state.won
                ? "border-correct bg-win"
                : "border-loss-edge bg-loss",
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
                      "utility-label text-[10px]",
                      state.won ? "text-info" : "text-far",
                    )}
                  >
                    {state.won ? "Solved" : "Out of guesses"}
                  </div>
                  <div className="mt-1 font-display text-2xl font-bold text-ink sm:text-3xl">
                    {answer.name}
                    <span className="ml-2 text-ink-soft">· Melee</span>
                  </div>
                  <div className="mt-1 utility-label text-xs text-ink-faint">
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
                answerRole={answer.role}
                isCorrect={hero.key === answer.key}
                isLatest={isLatest}
              />
            );
          })}
        </AnimatePresence>
      </div>

      {state.guesses.length === 0 && !reveal && (
        <div className="mt-10 rounded-(--radius-card) border border-dashed border-line bg-muted p-8 text-center">
          <p className="utility-label text-xs text-ink-faint">
            Tap the waveform to hear the melee. You get {MAX_GUESSES} guesses.
            The source clip reveals when you solve it or run out.
          </p>
        </div>
      )}
    </main>
  );
}

// Portrait + name card, right or wrong. Beyond the hero identity it
// carries a ROLE chip: the guessed hero's role scored against the answer's,
// which is the miss's hint — narrow the pool by role even when the hero is
// wrong. Borderless with the app's standard rounded-card corners; state
// lives in the body FILL (the sanctioned result-card exception applied to a
// guess card): a solid bg-loss red for a wrong hero, navy bg-card for the
// correct one. The role chip sits on top of either — a green chip on the red
// body is exactly the "right role, wrong hero" tell.
function MeleeGuessCard({
  hero,
  answerRole,
  isCorrect,
  isLatest,
}: {
  hero: Hero;
  answerRole: Role;
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
        "mx-auto flex w-full max-w-xs flex-col items-center justify-center gap-3 rounded-(--radius-card) px-5 py-6",
        isCorrect ? "bg-card" : "bg-loss",
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
      <div className="font-display text-2xl uppercase tracking-wide font-bold text-ink sm:text-3xl">
        {hero.name}
      </div>
      {/* Role verdict — solid green when the guessed hero shares the answer's
          role, dark navy otherwise (never a translucent tint; the fill IS the
          signal). Only the latest card animates, matching the card body. */}
      <RoleChip
        role={hero.role}
        match={hero.role === answerRole}
        animate={isLatest}
      />
    </motion.div>
  );
}

// Solid role chip beneath the name. Reuses the canonical status fills from
// AttributeTile (bg-correct / bg-wrong) so a role match reads identically to
// a correct attribute tile. For the latest guess it flips in like a Classic
// tile — rotateX + a beat's delay after the card lands; earlier cards render
// it flat since the card itself only animates when latest.
function RoleChip({
  role,
  match,
  animate,
}: {
  role: Role;
  match: boolean;
  animate: boolean;
}) {
  const label = role.charAt(0).toUpperCase() + role.slice(1);
  return (
    <motion.div
      initial={animate ? { rotateX: -90, opacity: 0 } : false}
      animate={{ rotateX: 0, opacity: 1 }}
      transition={
        animate
          ? { duration: 0.35, delay: 0.15, ease: [0.22, 1, 0.36, 1] }
          : { duration: 0 }
      }
      style={{ transformOrigin: "top center" }}
      className={clsx(
        "tile-shape inline-flex items-center gap-1.5 px-3 py-1.5 utility-label text-[10px]",
        match ? "bg-correct text-on-correct" : "bg-wrong text-on-wrong",
      )}
    >
      <RoleGlyph role={role} />
      {label}
    </motion.div>
  );
}

// Tiny Overwatch-flavored role glyph. fill-current so it inherits the chip's
// text-on-* color; aria-hidden since the adjacent label carries the meaning.
// Shapes echo the in-game role icons: tank = shield, damage = crosshair,
// support = plus/cross.
function RoleGlyph({ role }: { role: Role }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={14}
      height={14}
      aria-hidden
      className="fill-current"
    >
      {role === "tank" && (
        // Shield outline.
        <path d="M12 2 4 5v6c0 4.4 3.1 8.3 8 11 4.9-2.7 8-6.6 8-11V5l-8-3Zm0 2.3 6 2.2v4.5c0 3.3-2.2 6.4-6 8.7-3.8-2.3-6-5.4-6-8.7V6.5l6-2.2Z" />
      )}
      {role === "damage" && (
        // Crosshair — ring plus four ticks.
        <path d="M11 2h2v4h-2V2Zm0 16h2v4h-2v-4ZM2 11h4v2H2v-2Zm16 0h4v2h-4v-2Zm-6-6a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z" />
      )}
      {role === "support" && (
        // Rounded plus / cross.
        <path d="M10 3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v6h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-6v6a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-6H4a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1h6V3Z" />
      )}
    </svg>
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
      <div className="mt-3 flex justify-center">
        <VolumeSlider value={volume} onChange={handleVolumeChange} />
      </div>
      <p className="mt-2 text-center utility-label text-[10px] text-info">
        Source clip · full melee audio + video
      </p>
    </div>
  );
}
