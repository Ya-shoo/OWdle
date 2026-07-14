"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AnimatePresence } from "motion/react";
import { HEROES_BY_KEY } from "@/lib/heroes";
import { getHeroForDay, prettyDay } from "@/lib/daily";
import { loadModeState } from "@/lib/storage";
import { archiveMode, loadArchiveState } from "@/lib/archive";
import { trackArchiveRoundCompleted } from "@/lib/tracking";
import { ClassicBoard, useClassicRound } from "./ClassicBoard";
import {
  ArchiveBanner,
  ArchiveOutcomeActions,
  ArchiveResultCard,
} from "./ArchivePlayChrome";

// The archive play view for one past Classic day. Reuses the shared board
// (combobox + hint system + timeline), but every daily-only affordance is
// stripped: no NextModeCTA, no DailyComplete card, no streak bump, no
// TryDeadlockle, no ModeStatsLine, and NO share/copy at all — archive play
// is private. Progress persists under the archive namespace
// (owdle.archive.classic.<day>), so the live daily key and the streak are
// never touched. The only analytics event is archive_round_completed.

const MODE = "classic";

export function ClassicArchivePlay({ day }: { day: string }) {
  // Sticky answer: once a round is played, it's pinned to the hero stamped in
  // storage, so a later daily-bag reshuffle (a new hero shipping) can't swap
  // the answer under a stored result. A fresh, never-played day falls back to
  // the live derivation and gets stamped on first save. Client-only subtree
  // (behind the ?d= Suspense boundary), so reading storage in render is safe.
  const answer = useMemo(() => {
    const stored = loadArchiveState(MODE, day);
    if (stored.answerKey && HEROES_BY_KEY[stored.answerKey]) {
      return HEROES_BY_KEY[stored.answerKey];
    }
    return getHeroForDay(day);
  }, [day]);

  const round = useClassicRound({
    day,
    answer,
    // Double-segment namespace → owdle.archive.classic.<day>. Streak-neutral
    // by construction (see lib/archive.ts).
    storageMode: archiveMode(MODE),
    persist: true,
    stampAnswerKey: true,
    // Fired from the terminating action, so a resume/reload never re-counts;
    // a fresh Play Again → finish does. No archive_started counterpart, and
    // the daily funnel events never fire here.
    onTerminal: ({ outcome, guesses, hints }) => {
      trackArchiveRoundCompleted({ mode: MODE, day, outcome, guesses, hints });
    },
  });

  if (!round) {
    return (
      <div className="utility-label text-xs text-ink-faint">
        Loading…
      </div>
    );
  }

  const { answer: hero, state, effectiveUsed, hintsUsed } = round;

  // Redemption: this past day was LOST when played live, and the player has
  // now won it in the archive — the grid cell flips red → green. The hook
  // behind the feature, called out in the win copy.
  const redeemedLiveLoss =
    state.won && loadModeState(MODE, day).lost === true;

  const reveal = (
    <>
      <AnimatePresence>
        {state.won && (
          <ArchiveResultCard key="win" tone="won">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={hero.portrait}
              alt=""
              className="h-16 w-16 rounded-(--radius-card) bg-muted object-cover sm:h-20 sm:w-20"
            />
            <div className="flex-1">
              <div className="utility-label text-[10px] text-info">
                {redeemedLiveLoss ? "Redeemed" : "Solved"}
              </div>
              <div className="mt-1 font-display text-3xl font-bold text-ink">
                {hero.name} <span className="text-ink-soft">in {effectiveUsed}</span>
              </div>
              {hintsUsed.length > 0 && (
                <div className="mt-1 utility-label text-[10px] text-accent">
                  💡 used {hintsUsed.length}{" "}
                  {hintsUsed.length === 1 ? "hint" : "hints"}
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
        {state.lost && !state.won && (
          <ArchiveResultCard key="loss" tone="lost">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={hero.portrait}
              alt=""
              className="h-16 w-16 rounded-(--radius-card) bg-muted object-cover sm:h-20 sm:w-20"
            />
            <div className="flex-1">
              <div className="utility-label text-[10px] text-on-wrong">
                Missed
              </div>
              <div className="mt-1 font-display text-3xl font-bold text-ink">
                {hero.name}
              </div>
              <div className="mt-1 utility-label text-xs text-ink-faint">
                {state.guesses.length} guesses
                {hintsUsed.length > 0 &&
                  ` · ${hintsUsed.length} hint${hintsUsed.length === 1 ? "" : "s"}`}
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
          href="/archive/classic/"
          className="inline-flex items-center gap-1.5 utility-label text-[11px] text-ink-faint transition-colors hover:text-accent"
        >
          <span aria-hidden>←</span> Archive
        </Link>
        <p className="mt-4 utility-label text-xs text-info">
          {prettyDay(day)}
        </p>
        <h1 className="mt-2 font-display display-headline uppercase text-4xl text-ink sm:text-5xl">
          Classic
        </h1>
        <p className="mt-2 max-w-md text-ink-soft">
          Replaying a past puzzle. Match the eight attributes.
        </p>
      </header>

      <ClassicBoard round={round} reveal={reveal} />
    </div>
  );
}
