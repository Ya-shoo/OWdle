"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { HEROES_BY_KEY } from "@/lib/heroes";
import { getHeroForDay, prettyDay } from "@/lib/daily";
import { loadModeState } from "@/lib/storage";
import {
  archiveFillStatus,
  archiveMode,
  loadArchiveState,
  nextUnfilledDay,
} from "@/lib/archive";
import { trackArchiveRoundCompleted } from "@/lib/tracking";
import { ClassicBoard, useClassicRound } from "./ClassicBoard";

// The archive play view for one past Classic day. Reuses the shared board
// (combobox + hint system + timeline), but every daily-only affordance is
// stripped: no NextModeCTA, no DailyComplete card, no streak bump, no
// TryDeadlockle, no ModeStatsLine, and NO share/copy at all — archive play
// is private. Progress persists under the archive namespace
// (owdle.archive.classic.<day>), so the live daily key and the streak are
// never touched. The only analytics event is archive_round_completed.

const MODE = "classic";

function weekdayOf(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    weekday: "long",
    timeZone: "UTC",
  });
}

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
      <div className="font-mono text-xs uppercase tracking-[0.2em] text-ink-faint">
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
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-info">
                {redeemedLiveLoss ? "Redeemed" : "Solved"}
              </div>
              <div className="mt-1 font-display text-3xl text-ink">
                {hero.name} <span className="text-ink-soft">in {effectiveUsed}</span>
              </div>
              {hintsUsed.length > 0 && (
                <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
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
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-on-wrong">
                Missed
              </div>
              <div className="mt-1 font-display text-3xl text-ink">
                {hero.name}
              </div>
              <div className="mt-1 font-mono text-xs uppercase tracking-[0.18em] text-ink-faint">
                {state.guesses.length} guesses
                {hintsUsed.length > 0 &&
                  ` · ${hintsUsed.length} hint${hintsUsed.length === 1 ? "" : "s"}`}
              </div>
            </div>
          </ArchiveResultCard>
        )}
      </AnimatePresence>

      {round.ended && (
        <ArchiveOutcomeActions day={day} onReplay={round.resetRound} />
      )}
    </>
  );

  return (
    <div>
      <ArchiveBanner />

      <header className="mb-8">
        <Link
          href="/archive/classic/"
          className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-ink-faint transition-colors hover:text-accent"
        >
          <span aria-hidden>←</span> Archive
        </Link>
        <p className="mt-4 font-mono text-xs uppercase tracking-[0.2em] text-info">
          {prettyDay(day)}
        </p>
        <h1 className="mt-2 font-display display-headline text-4xl text-ink sm:text-5xl">
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

// Persistent reassurance that this replay is off the record. Always visible
// in the play view (not just on completion) so a player never worries that
// replaying an old day will overwrite their live daily or streak.
//
// Same panel language as ArchiveCta: an opaque bg-card body with a solid
// saturated chip — a deliberate raised strip, not a faint tinted box.
function ArchiveBanner() {
  return (
    <div className="mb-6 flex items-center gap-3 rounded-(--radius-card) border border-line bg-card px-4 py-2.5 shadow-card">
      <span
        aria-hidden
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-info text-base text-on-info"
      >
        ↺
      </span>
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">
        Archive mode: your daily record won&apos;t be overwritten.
      </p>
    </div>
  );
}

function ArchiveResultCard({
  tone,
  children,
}: {
  tone: "won" | "lost";
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "won"
      ? "border-line-correct bg-tint-correct"
      : "border-wrong bg-tint-wrong";
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={`result-card mx-auto mb-6 flex w-full max-w-md flex-col items-center gap-4 rounded-(--radius-card) border p-4 text-center sm:flex-row sm:items-center sm:p-5 sm:text-left ${toneClass}`}
    >
      {children}
    </motion.div>
  );
}

// One-tap replay + a nudge to the next unfilled day, driving an all-green
// week. No share button (archive is private) and no streak — deliberately.
function ArchiveOutcomeActions({
  day,
  onReplay,
}: {
  day: string;
  onReplay: () => void;
}) {
  // `next` is the nearest OTHER unfilled past day (excludes `day` itself, so
  // it never links back to the round just played). When there's no other one
  // left, the message depends on THIS day's outcome: a win means the past
  // week is fully caught up; a loss means this is the last red day to redeem.
  const next = nextUnfilledDay(MODE, day);
  const currentWon = archiveFillStatus(MODE, day).outcome === "won";
  return (
    <div className="mx-auto mb-8 flex w-full max-w-md flex-col items-center gap-3">
      <div className="flex w-full flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={onReplay}
          className="inline-flex items-center gap-2 rounded-(--radius-card) border border-line bg-inset px-4 py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-ink-soft transition-colors hover:border-edge hover:text-ink"
        >
          <span aria-hidden>↺</span> Play again
        </button>
        {next ? (
          <Link
            href={`/archive/classic/?d=${next}`}
            className="inline-flex items-center gap-2 rounded-(--radius-card) border border-line-accent bg-tint-accent px-4 py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-accent transition-colors hover:bg-tint-accent-strong"
          >
            Next: {weekdayOf(next)} <span aria-hidden>→</span>
          </Link>
        ) : currentWon ? (
          <Link
            href="/archive/classic/"
            className="inline-flex items-center gap-2 rounded-(--radius-card) border border-line-correct bg-tint-correct px-4 py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-correct transition-colors hover:bg-tint-correct-strong"
          >
            <span aria-hidden>✓</span> Caught up for the week
          </Link>
        ) : (
          <span className="inline-flex items-center px-1 font-mono text-[11px] uppercase tracking-[0.2em] text-ink-faint">
            Last unsolved day. Win it to catch up
          </span>
        )}
      </div>
    </div>
  );
}
