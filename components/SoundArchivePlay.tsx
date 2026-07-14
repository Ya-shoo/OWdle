"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AnimatePresence } from "motion/react";
import {
  getSoundForDay,
  prettyDay,
  resolveLabeledSoundClip,
} from "@/lib/daily";
import { loadModeState } from "@/lib/storage";
import { archiveMode, loadArchiveState } from "@/lib/archive";
import { trackArchiveRoundCompleted } from "@/lib/tracking";
import { SoundBoard, useSoundRound } from "./SoundBoard";
import {
  ArchiveBanner,
  ArchiveOutcomeActions,
  ArchiveResultCard,
} from "./ArchivePlayChrome";

// The archive play view for one past Sound day. Reuses the shared board
// (waveform + snippet ladder + skips + bonus round + video reveal), but every
// daily-only affordance is stripped: no NextModeCTA, no DailyComplete card, no
// streak bump, no TryDeadlockle, no ModeStatsLine, no dev tools, and NO
// share/copy at all — archive play is private. Progress persists under the
// archive namespace (owdle.archive.sound.<day>), so the live daily key and the
// streak are never touched. The only analytics event is
// archive_round_completed. Mirrors ClassicArchivePlay.

const MODE = "sound";

export function SoundArchivePlay({ day }: { day: string }) {
  // Sticky answer: once a round is played, it's pinned to the (hero, clip)
  // stamped in storage, so a later sound-bag reshuffle (a new clip shipping)
  // can't swap the clue under a stored result. Sound's clue is a specific
  // (hero, clip) pair — the bonus options and reveal video are keyed to the
  // clip — so both the hero key AND the clip slug are pinned. A fresh,
  // never-played day falls back to the live derivation and gets stamped on
  // first save. Client-only subtree (behind the ?d= Suspense boundary), so
  // reading storage in render is safe.
  const clip = useMemo(() => {
    const stored = loadArchiveState(MODE, day);
    const pinned =
      stored.answerKey && stored.answerClip
        ? resolveLabeledSoundClip(stored.answerKey, stored.answerClip)
        : null;
    return pinned ?? getSoundForDay(day);
  }, [day]);

  const round = useSoundRound({
    day,
    clip,
    // Double-segment namespace → owdle.archive.sound.<day>. Streak-neutral by
    // construction (see lib/archive.ts).
    storageMode: archiveMode(MODE),
    persist: true,
    stampAnswer: true,
    // Fired from the terminating action, so a resume/reload never re-counts; a
    // fresh Play Again → finish does. Skips map to the `hints` prop — sound's
    // analog of Classic's burned non-guess slots — so `guesses` stays the real
    // hero-pick count, mirroring the Classic archive event exactly.
    onTerminal: ({ outcome, heroGuesses, skips }) => {
      trackArchiveRoundCompleted({
        mode: MODE,
        day,
        outcome,
        guesses: heroGuesses,
        hints: skips,
      });
    },
  });

  if (!round) {
    return (
      <div className="utility-label text-xs text-ink-faint">Loading…</div>
    );
  }

  const { answer, turnsUsed, skipsUsed, heroGuessKeys, bonusPending } = round;
  const { label } = round.clip;

  // Redemption: this past day was LOST when played live, and the player has
  // now won it in the archive — the grid cell flips red → green. The hook
  // behind the feature, called out in the win copy.
  const live = loadModeState(MODE, day);
  const redeemedLiveLoss =
    round.won && (live.lost === true || live.gaveUp === true);

  const reveal = (
    <>
      <AnimatePresence>
        {round.won && (
          <ArchiveResultCard key="win" tone="won">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={answer.portrait}
              alt=""
              className="h-16 w-16 rounded-(--radius-card) bg-muted object-cover sm:h-20 sm:w-20"
            />
            <div className="flex-1">
              <div className="utility-label text-[10px] text-info">
                {redeemedLiveLoss ? "Redeemed" : "Solved"}
              </div>
              <div className="mt-1 font-display text-2xl font-bold text-ink sm:text-3xl">
                {answer.name}
                {label && !bonusPending && (
                  <span className="text-ink-soft"> · {label}</span>
                )}{" "}
                <span className="text-ink-soft">in {turnsUsed}</span>
              </div>
              {skipsUsed > 0 && (
                <div className="mt-1 utility-label text-[10px] text-accent">
                  ⏭ {skipsUsed} {skipsUsed === 1 ? "skip" : "skips"}
                </div>
              )}
              {redeemedLiveLoss && (
                <div className="mt-1 text-sm text-correct">
                  Turned a red day green. Your record for this day now shows a
                  win.
                </div>
              )}
            </div>
          </ArchiveResultCard>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {round.lost && !round.won && (
          <ArchiveResultCard key="loss" tone="lost">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={answer.portrait}
              alt=""
              className="h-16 w-16 rounded-(--radius-card) bg-muted object-cover sm:h-20 sm:w-20"
            />
            <div className="flex-1">
              <div className="utility-label text-[10px] text-on-wrong">
                Missed
              </div>
              <div className="mt-1 font-display text-2xl font-bold text-ink sm:text-3xl">
                {answer.name}
                {label && (
                  <span className="text-ink-soft"> · {label}</span>
                )}
              </div>
              <div className="mt-1 utility-label text-xs text-ink-faint">
                {heroGuessKeys.length}{" "}
                {heroGuessKeys.length === 1 ? "guess" : "guesses"}
                {skipsUsed > 0 &&
                  ` · ${skipsUsed} ${skipsUsed === 1 ? "skip" : "skips"}`}
              </div>
            </div>
          </ArchiveResultCard>
        )}
      </AnimatePresence>

      {round.ended && (
        <ArchiveOutcomeActions
          mode={MODE}
          day={day}
          onReplay={round.resetRound}
        />
      )}
    </>
  );

  return (
    <div>
      <ArchiveBanner />

      <header className="mb-8">
        <Link
          href="/archive/sound/"
          className="inline-flex items-center gap-1.5 utility-label text-[11px] text-ink-faint transition-colors hover:text-accent"
        >
          <span aria-hidden>←</span> Archive
        </Link>
        <p className="mt-4 utility-label text-xs text-info">{prettyDay(day)}</p>
        <h1 className="mt-2 font-display display-headline uppercase text-4xl text-ink sm:text-5xl">
          Sound
        </h1>
        <p className="mt-2 max-w-md text-ink-soft">
          Replaying a past clip. Guess the hero from the sound.
        </p>
      </header>

      <SoundBoard round={round} reveal={reveal} />
    </div>
  );
}
