"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { archiveFillStatus, nextUnfilledDay } from "@/lib/archive";

// Shared chrome for a mode's archive replay view — the pieces that are
// identical across every mode's /archive/<mode> play page. Each mode's
// ArchivePlay component owns its own header + board and injects mode-specific
// content into ArchiveResultCard; everything here (the off-the-record banner,
// the win/loss card shell, the play-again / next-day actions) is generic and
// parameterized only by the mode slug. Factored out of the Classic archive
// when Sound became the second mode.

export function weekdayOf(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    weekday: "long",
    timeZone: "UTC",
  });
}

// Persistent reassurance that this replay is off the record. Always visible in
// the play view (not just on completion) so a player never worries that
// replaying an old day will overwrite their live daily or streak.
//
// Same panel language as ArchiveCta: an opaque bg-card body with a solid
// saturated chip — a deliberate raised strip, not a faint tinted box.
export function ArchiveBanner() {
  return (
    <div className="mb-6 flex items-center gap-3 rounded-(--radius-card) border border-line bg-card px-4 py-2.5 shadow-card">
      <span
        aria-hidden
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-info text-base text-on-info"
      >
        ↺
      </span>
      <p className="utility-label text-[11px] text-ink-soft">
        Archive mode: your daily record won&apos;t be overwritten.
      </p>
    </div>
  );
}

// The win/loss result-card shell. Carries the outcome in the body via the
// solid bg-win / bg-loss tokens (the sanctioned result-card exception to the
// no-tint rule). Mode-specific content — portrait, name, guess count — is
// injected as children.
export function ArchiveResultCard({
  tone,
  children,
}: {
  tone: "won" | "lost";
  children: ReactNode;
}) {
  const toneClass =
    tone === "won" ? "border-correct bg-win" : "border-loss-edge bg-loss";
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
//
// `next` is the nearest OTHER unfilled past day (excludes `day` itself, so it
// never links back to the round just played). When there's no other one left,
// the message depends on THIS day's outcome: a win means the past week is
// fully caught up; a loss means this is the last red day to redeem.
export function ArchiveOutcomeActions({
  mode,
  day,
  onReplay,
}: {
  mode: string;
  day: string;
  onReplay: () => void;
}) {
  const next = nextUnfilledDay(mode, day);
  const currentWon = archiveFillStatus(mode, day).outcome === "won";
  return (
    <div className="mx-auto mb-8 flex w-full max-w-md flex-col items-center gap-3">
      <div className="flex w-full flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={onReplay}
          className="inline-flex items-center gap-2 rounded-(--radius-card) border border-line bg-muted px-4 py-2 utility-label text-[11px] text-ink-soft transition-colors hover:border-edge hover:text-ink"
        >
          <span aria-hidden>↺</span> Play again
        </button>
        {next ? (
          <Link
            href={`/archive/${mode}/?d=${next}`}
            className="inline-flex items-center gap-2 rounded-(--radius-card) border border-edge bg-card px-4 py-2 utility-label text-[11px] text-accent transition-colors hover:border-accent-soft"
          >
            Next: {weekdayOf(next)} <span aria-hidden>→</span>
          </Link>
        ) : currentWon ? (
          <Link
            href={`/archive/${mode}/`}
            className="inline-flex items-center gap-2 rounded-(--radius-card) border border-correct bg-card px-4 py-2 utility-label text-[11px] text-correct transition-colors hover:brightness-110"
          >
            <span aria-hidden>✓</span> Caught up for the week
          </Link>
        ) : (
          <span className="inline-flex items-center px-1 utility-label text-[11px] text-ink-faint">
            Last unsolved day. Win it to catch up
          </span>
        )}
      </div>
    </div>
  );
}
