"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { type Hero } from "@/lib/heroes";
import {
  dayString,
  getSoundForDay,
  prettyDay,
  type ResolvedSoundClip,
} from "@/lib/daily";
import { isDailyComplete } from "@/lib/storage";
import {
  trackGuessSubmitted,
  trackModeCompleted,
  trackModeStarted,
} from "@/lib/tracking";
import { Brand } from "./Brand";
import { NextModeCTA } from "./NextModeCTA";
import { DevSoundPicker } from "./DevSoundPicker";
import { DevSoundTrimmer } from "./DevSoundTrimmer";
import { DevViewToggle, useDevViewState } from "./DevViewToggle";
import { saveSoundClipTrim, type SavedTrim } from "@/lib/soundTrims";
import { LossReveal } from "./LossReveal";
import { ModeStatsLine } from "./ModeStatsLine";
import { ShareButton } from "./ShareButton";
import { computeWaveformPeaks } from "@/lib/waveformPeaks";
import { roundShareLinks } from "@/lib/shareLinks";
import { useShareLinkVisit } from "@/lib/useShareLinkVisit";
import { DailyCompleteResultCard } from "./DailyCompleteResultCard";
import { TryDeadlockleCard } from "./TryDeadlockleCard";
import { BUILT_MODE_SLUGS } from "@/lib/modes";
import { MAX_GUESSES, SKIP_MARKER, SoundBoard, useSoundRound } from "./SoundBoard";
import { ArchiveCta } from "./ArchiveCta";

const IS_DEV = process.env.NODE_ENV !== "production";

export function SoundGame() {
  // Inbound share-link attribution (?c= from /r/[code] redirects).
  useShareLinkVisit("sound");
  const [day, setDay] = useState<string | null>(null);
  // Static waveform peaks for the share card, decoded once the round ends
  // (see WaveformPeaksLoader below).
  const [wavePeaks, setWavePeaks] = useState<number[] | null>(null);
  // Dev-only "view" toggle. Hides every dev panel when set to User so we can
  // preview the shipping game without ceremony.
  const [devView, setDevView] = useDevViewState("sound");
  // Dev-only override. When set, the picker has chosen a specific clip; we
  // serve it instead of the daily seed and skip localStorage (persist:false)
  // so test playthroughs don't pollute the user's real progress for that day.
  const [overrideClip, setOverrideClip] = useState<ResolvedSoundClip | null>(
    null,
  );
  const isOverride = overrideClip !== null;

  // Dev-only trim state.
  //
  // `trimDraft` holds the values the trim editor is currently showing for the
  // active clip. It resets when the active slug changes so switching clips
  // doesn't carry over an unsaved edit. Null means "no live edit."
  //
  // `trimOverrides` holds successfully-saved values that haven't yet been
  // picked up by the static JSON import (which only refreshes on reload).
  // Keyed by `${hero}:${slug}`.
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

  useEffect(() => {
    setDay(dayString());
  }, []);

  // Resolved answer clip — a dev override, or the daily seed. Memoized so its
  // identity is stable per (override, day): the shared round keys its
  // hydration on the clip, and the bag pick shouldn't recompute every render.
  const resolved = useMemo(
    () => overrideClip ?? (day ? getSoundForDay(day) : null),
    [overrideClip, day],
  );

  // Dev trim plumbing — the effective playback window handed to the board's
  // snippet ladder. Defensive against a not-yet-resolved clip.
  const slug = resolved?.slug ?? null;
  const answerKey = resolved?.hero.key ?? null;
  const overrideKey = slug && answerKey ? `${answerKey}:${slug}` : null;
  const sessionOverride =
    overrideKey != null ? trimOverrides[overrideKey] : undefined;
  const persistedStart =
    sessionOverride !== undefined
      ? sessionOverride.start
      : resolved?.startOffset ?? null;
  const persistedEnd =
    sessionOverride !== undefined
      ? sessionOverride.end
      : resolved?.endOffset ?? null;
  const draftMatches = trimDraft != null && trimDraft.slug === slug;
  const activeStart = draftMatches ? trimDraft!.start : persistedStart;
  const activeEnd = draftMatches ? trimDraft!.end : persistedEnd;

  const round = useSoundRound({
    day,
    clip: resolved,
    storageMode: "sound",
    // Dev override plays a throwaway round — no writes to the real daily key,
    // and no rotation-reset (the override clip is what it is).
    persist: !isOverride,
    resetIfStale: !isOverride,
    // Stamp the answer hero key onto saved daily states so the reload
    // rotation-guard (resetIfStale) can tell a genuine mid-day seed rotation
    // from an ordinary same-day loss, which must survive reload.
    stampAnswer: !isOverride,
    activeStart,
    activeEnd,
    onGuessSubmitted: isOverride
      ? undefined
      : ({ guessNumber, isCorrect, hero }) => {
          if (!day || !resolved) return;
          trackGuessSubmitted({
            mode: "sound",
            dailyId: day,
            guessNumber,
            isCorrect,
            // hero:null is a skip — recorded with the skip sentinel so the
            // guess funnel still counts the burned turn.
            guessId: hero ? hero.key : SKIP_MARKER,
            answerId: resolved.hero.key,
          });
        },
  });

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
  // count as the third outcome bucket so old states still roll in correctly.
  const rWon = round?.won === true;
  const rLost = round?.state.lost === true;
  const rGaveUp = round?.state.gaveUp === true;
  const rGuessCount = round?.state.guesses.length ?? 0;
  useEffect(() => {
    if (!day || isOverride) return;
    if (!rWon && !rLost && !rGaveUp) return;
    const pick = getSoundForDay(day);
    const outcome = rWon ? "won" : rGaveUp ? "gaveUp" : "lost";
    trackModeCompleted({
      mode: "sound",
      dailyId: day,
      outcome,
      totalGuesses: rGuessCount,
      cap: MAX_GUESSES,
      answerId: pick.hero.key,
    });
  }, [day, isOverride, rWon, rLost, rGaveUp, rGuessCount]);

  const applyOverride = (clip: ResolvedSoundClip | null) => {
    // Setting overrideClip flips the resolved clip and the persist flag; the
    // shared round re-hydrates itself (fresh under override, reloaded on
    // clear). We only reset the dev trim/audio scratch state here.
    setOverrideClip(clip);
    setTrimDraft(null);
    setAudioMeta(null);
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
    if (!slug || !overrideKey || !answerKey) return;
    await saveSoundClipTrim(answerKey, slug, next);
    // Promote the saved values into the in-session override map so the
    // editor's "saved" indicator reflects the write without a reload.
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
    if (!resolved) return;
    setAudioMeta({ audioUrl: resolved.audioUrl, ...info });
  };

  if (!round) {
    return (
      <main className="mx-auto w-full max-w-4xl px-6 py-16">
        <div className="utility-label text-xs text-ink-faint">Loading…</div>
      </main>
    );
  }

  const { clip, answer, turnsUsed, skipsUsed, heroGuessKeys, bonusPending } =
    round;
  const { label } = clip;
  const won = round.won;
  const lost = round.lost;

  // Reset the audio metadata snapshot when the underlying file changes, so
  // the trimmer doesn't briefly display the prior clip's duration.
  const audioMetaForCurrent =
    audioMeta && audioMeta.audioUrl === clip.audioUrl ? audioMeta : null;

  const dailyComplete = isDailyComplete({
    day: round.day,
    currentMode: "sound",
    currentDone: true,
    builtSlugs: BUILT_MODE_SLUGS,
  });

  // Dev-only trim editor, slotted under the waveform (only shown while the
  // clip is still masked, i.e. not on the reveal). Passed to the board so the
  // shared view stays oblivious to dev vs production.
  const mediaFooter =
    IS_DEV && devView && slug ? (
      <DevSoundTrimmer
        heroKey={answer.key}
        slug={slug}
        fileDuration={audioMetaForCurrent?.fileDuration ?? null}
        autoStartOffset={audioMetaForCurrent?.autoStartOffset ?? null}
        fullPeaks={audioMetaForCurrent?.fullPeaks ?? null}
        persistedStart={persistedStart}
        persistedEnd={persistedEnd}
        draftStart={activeStart}
        draftEnd={activeEnd}
        onChange={handleTrimChange}
        onSave={handleTrimSave}
      />
    ) : undefined;

  // Daily-only reveal chrome, injected into the shared board between the bonus
  // round and the guess history. On the final mode of the day the per-mode
  // card is replaced by SoundDailyComplete (score recap + streak). Everything
  // here — NextModeCTA, share, stats, TryDeadlockle — is deliberately absent
  // from the archive variant.
  const reveal = (
    <>
      <AnimatePresence>
        {won &&
          !lost &&
          (dailyComplete ? (
            <SoundDailyComplete
              key="win-daily"
              answer={answer}
              label={label && !bonusPending ? label : null}
              guesses={turnsUsed}
              outcome="won"
              day={round.day}
            />
          ) : (
            <motion.div
              key="win"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="result-card mx-auto mb-8 w-full max-w-md rounded-(--radius-card) border border-correct bg-win p-4 sm:p-5"
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
                    <div className="utility-label text-[10px] text-info">
                      Solved
                    </div>
                    <div className="mt-1 font-display text-2xl font-bold text-ink sm:text-3xl">
                      {answer.name}
                      {label && !bonusPending && (
                        <span className="ml-2 text-ink-soft">· {label}</span>
                      )}
                    </div>
                    <div className="mt-1 utility-label text-xs text-ink-faint">
                      in {turnsUsed} {turnsUsed === 1 ? "guess" : "guesses"}
                    </div>
                    {skipsUsed > 0 && (
                      <div className="mt-1 utility-label text-[10px] text-accent">
                        ⏭ {skipsUsed} {skipsUsed === 1 ? "skip" : "skips"}
                      </div>
                    )}
                    <ModeStatsLine mode="sound" />
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <NextModeCTA current="sound" scrollIntoViewOnMount={false} />
                  <ShareButton
                    {...roundShareLinks({
                      day: round.day,
                      slug: "sound",
                      outcome: "won",
                      guesses: heroGuessKeys.length,
                      skips: skipsUsed,
                    })}
                    filename={`owdle-sound-${round.day}.png`}
                    surface="round_result"
                    mode="sound"
                    dailyId={round.day}
                  />
                </div>
              </div>
            </motion.div>
          ))}
      </AnimatePresence>

      <AnimatePresence>
        {lost &&
          !won &&
          (dailyComplete ? (
            <SoundDailyComplete
              key="loss-daily"
              answer={answer}
              label={label && !bonusPending ? label : null}
              guesses={heroGuessKeys.length}
              outcome="lost"
              day={round.day}
            />
          ) : (
            <LossReveal
              current="sound"
              scrollIntoViewOnMount={false}
              share={
                <ShareButton
                  {...roundShareLinks({
                    day: round.day,
                    slug: "sound",
                    outcome: "lost",
                    guesses: heroGuessKeys.length,
                    skips: skipsUsed,
                  })}
                  filename={`owdle-sound-${round.day}.png`}
                  surface="round_result"
                  mode="sound"
                  dailyId={round.day}
                />
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
                  <div className="font-display text-2xl font-bold text-ink sm:text-3xl">
                    {answer.name}
                    {label && !bonusPending && (
                      <span className="ml-2 text-ink-soft">· {label}</span>
                    )}
                  </div>
                  <div className="mt-1 utility-label text-xs text-ink-faint">
                    after {heroGuessKeys.length} wrong{" "}
                    {heroGuessKeys.length === 1 ? "guess" : "guesses"}
                    {skipsUsed > 0 &&
                      ` · ${skipsUsed} ${skipsUsed === 1 ? "skip" : "skips"}`}
                  </div>
                  <ModeStatsLine mode="sound" />
                </div>
              </div>
            </LossReveal>
          ))}
      </AnimatePresence>
    </>
  );

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 lg:py-16">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="utility-label text-xs text-info">
            <span suppressHydrationWarning>{prettyDay(round.day)}</span>
          </p>
          <h1 className="mt-3 font-display display-headline uppercase text-5xl text-ink sm:text-6xl">
            Sound
          </h1>
          <p className="mt-3 max-w-md text-ink-soft">
            Listen to the ability sound. Each wrong guess extends the clip.
          </p>
        </div>
        <div className="flex flex-col items-start gap-3 sm:items-end">
          <div className="hidden flex-col items-end utility-label text-xs text-ink-faint sm:flex">
            <Brand size="sm" />
          </div>
          {/* Entry to the past-week replay. Quiet mono utility while a round
              is in progress; once it's won or lost it upgrades to a prominent
              button — finishing the puzzle is the natural moment to send a
              player to replay or redeem past days. */}
          {won || lost ? (
            <ArchiveCta />
          ) : (
            <Link
              href="/archive/"
              className="inline-flex items-center gap-1.5 utility-label text-[11px] text-ink-faint transition-colors hover:text-accent"
            >
              <span aria-hidden>↺</span> Archive
            </Link>
          )}
        </div>
      </header>

      {IS_DEV && (
        <div className="mb-4 flex justify-center">
          <DevViewToggle mode="sound" active={devView} onChange={setDevView} />
        </div>
      )}
      {IS_DEV && devView && (
        <DevSoundPicker
          currentClip={clip}
          overrideActive={isOverride}
          onApply={applyOverride}
        />
      )}

      {round.ended && wavePeaks == null && (
        <WaveformPeaksLoader
          audioUrl={clip.audioUrl}
          startOffset={activeStart}
          endOffset={activeEnd}
          onPeaks={setWavePeaks}
        />
      )}

      <SoundBoard
        round={round}
        reveal={reveal}
        onAudioMetadata={IS_DEV ? handleAudioMetadata : undefined}
        mediaFooter={mediaFooter}
      />
    </main>
  );
}

// Sound-specific wrapper around DailyCompleteResultCard. Owns the mode-
// specific confirmation row + TryDeadlockleCard sibling.
function SoundDailyComplete({
  answer,
  label,
  guesses,
  outcome,
  day,
}: {
  answer: Hero;
  label: string | null;
  guesses: number;
  outcome: "won" | "lost";
  day: string;
}) {
  const summary = (
    <div className="flex items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={answer.portrait}
        alt=""
        className="h-14 w-14 rounded-(--radius-card) bg-muted object-cover sm:h-16 sm:w-16"
      />
      <div className="min-w-0 flex-1">
        <div className="utility-label text-[10px] text-info">
          Sound {outcome === "won" ? "Solved" : "Missed"}
        </div>
        <div className="mt-0.5 truncate font-display text-xl font-bold text-ink sm:text-2xl">
          {answer.name}
          {label && <span className="text-ink-soft"> · {label}</span>}
          {outcome === "won" && (
            <span className="text-ink-soft"> in {guesses}</span>
          )}
        </div>
      </div>
    </div>
  );
  return (
    <>
      <DailyCompleteResultCard
        mode="sound"
        guesses={guesses}
        outcome={outcome}
        day={day}
        summary={summary}
      />
      <div className="mx-auto mt-8 mb-10 flex w-full max-w-lg justify-center">
        <TryDeadlockleCard />
      </div>
    </>
  );
}

// Invisible helper: decodes the day's clip into share-card waveform peaks
// once the round ends. Lives as a component (not an effect in SoundGame
// proper) because the audio/trim values it needs are computed after
// SoundGame's loading early-return, where hooks can't follow. Renders
// nothing; unmounts as soon as the peaks land in parent state.
function WaveformPeaksLoader({
  audioUrl,
  startOffset,
  endOffset,
  onPeaks,
}: {
  audioUrl: string;
  startOffset: number | null;
  endOffset: number | null;
  onPeaks: (peaks: number[]) => void;
}) {
  // Pin the callback so a parent re-render can't retrigger the decode.
  const onPeaksRef = useRef(onPeaks);
  useEffect(() => {
    onPeaksRef.current = onPeaks;
  }, [onPeaks]);
  useEffect(() => {
    let cancelled = false;
    computeWaveformPeaks({ audioUrl, startOffset, endOffset })
      .then((peaks) => {
        if (!cancelled) onPeaksRef.current(peaks);
      })
      .catch(() => {
        // Silent: the share card falls back to splash art when peaks are
        // missing — not worth surfacing an error for.
      });
    return () => {
      cancelled = true;
    };
  }, [audioUrl, startOffset, endOffset]);
  return null;
}
