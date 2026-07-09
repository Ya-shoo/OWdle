"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { dayString } from "@/lib/daily";
import {
  archiveFillStatus,
  archiveWindow,
  type DayFill,
} from "@/lib/archive";

// The rolling-week grid for a mode's archive. Seven solid cells (today +
// the previous six puzzle days), read as a habit-tracker week strip so
// "filling out the week" feels tangible. Deliberately spoiler-free: solid
// colors only, NO hero portraits and NO opacity tints — a cell tells you
// won / lost / unplayed and nothing about the answer.
//
//   won   → deep green + white ✓   (the reward; a green run IS the "streak")
//   lost  → muted solid red + white ✕  (present but recessed — and redeemable:
//           replaying + winning flips it green via the best-outcome union)
//   none  → empty recessed slot
//   today → accent ring; links to the LIVE /classic (played live, not here)
//
// No streak number is shown — the visual green run carries that.

// Deepened, theme-aware fills. Blending the bright tile tokens toward the
// dark "wrong" surface keeps them solid (opaque, not alpha) and mutes the
// red while leaving both readable under a white glyph.
const WON_FILL = "color-mix(in oklab, var(--color-correct) 60%, var(--color-wrong))";
const LOST_FILL = "color-mix(in oklab, var(--color-far) 52%, var(--color-wrong))";

type Cell = DayFill & { isToday: boolean };

function useArchiveCells(mode: string): { cells: Cell[]; mounted: boolean } {
  // localStorage is client-only; compute after mount so the static-export
  // prerender (all-"none") doesn't fight hydration. Recomputes on mount and
  // whenever the route re-renders this component (e.g. returning from a
  // round), so a freshly won day shows green without a manual refresh.
  const [state, setState] = useState<{ cells: Cell[]; mounted: boolean }>(
    () => ({ cells: skeleton(), mounted: false }),
  );
  useEffect(() => {
    const today = dayString();
    const cells = archiveWindow(today).map((day) => ({
      ...archiveFillStatus(mode, day),
      isToday: day === today,
    }));
    setState({ cells, mounted: true });
  }, [mode]);
  return state;
}

// Pre-mount placeholder: the same 7-day window rendered as empty cells so
// the strip's dimensions are stable before localStorage fills the statuses.
function skeleton(): Cell[] {
  return archiveWindow().map((day, i, arr) => ({
    day,
    outcome: "none" as const,
    inProgress: false,
    isToday: i === arr.length - 1,
  }));
}

function cellLabel(day: string): { weekday: string; date: string } {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return {
    weekday: dt.toLocaleDateString(undefined, {
      weekday: "short",
      timeZone: "UTC",
    }),
    date: dt.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }),
  };
}

export function ArchiveGrid({ mode }: { mode: "classic" }) {
  const { cells, mounted } = useArchiveCells(mode);
  const wonCount = cells.filter((c) => c.outcome === "won").length;
  const perfectWeek = mounted && wonCount === cells.length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-7 gap-1.5 sm:gap-3">
        {cells.map((cell, i) => (
          <ArchiveCell key={cell.day} cell={cell} mode={mode} index={i} />
        ))}
      </div>

      {/* Quiet tally — reinforces the "fill the week" goal without a streak
          number (the green run is the visual streak). Flips to a celebration
          when every day in the window is green. */}
      <p className="text-center font-mono text-[11px] uppercase tracking-[0.22em]">
        {!mounted ? (
          <span className="opacity-0">loading</span>
        ) : perfectWeek ? (
          <span className="text-correct">
            <span aria-hidden>✓</span> Perfect week — every day solved
          </span>
        ) : (
          <span className="text-ink-faint">
            <span className="text-correct">{wonCount}</span> of {cells.length}{" "}
            solved this week
          </span>
        )}
      </p>
    </div>
  );
}

function ArchiveCell({
  cell,
  mode,
  index,
}: {
  cell: Cell;
  mode: "classic";
  index: number;
}) {
  const { weekday, date } = cellLabel(cell.day);
  const { outcome, isToday, inProgress } = cell;

  // Today is played on the live mode page, never replayed in the archive.
  const href = isToday ? "/classic/" : `/archive/${mode}/?d=${cell.day}`;

  const glyph =
    outcome === "won" ? (
      <CheckGlyph />
    ) : outcome === "lost" ? (
      <CrossGlyph />
    ) : null;

  const solidStyle =
    outcome === "won"
      ? { backgroundColor: WON_FILL }
      : outcome === "lost"
        ? { backgroundColor: LOST_FILL }
        : undefined;

  const baseTile =
    "relative flex aspect-square w-full items-center justify-center rounded-(--radius-card) transition-transform duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.05] group-focus-visible:scale-[1.05]";
  const emptyTile =
    outcome === "none"
      ? inProgress
        ? "border border-line-accent bg-inset"
        : "border border-line bg-inset"
      : "";
  const ring = isToday
    ? " ring-2 ring-accent ring-offset-2 ring-offset-canvas"
    : "";

  const status =
    outcome === "won"
      ? "solved"
      : outcome === "lost"
        ? "missed"
        : inProgress
          ? "in progress"
          : "not played";

  return (
    <Link
      href={href}
      aria-label={`${weekday} ${date}${isToday ? " (today)" : ""} — ${status}`}
      className="group flex flex-col items-center gap-1.5 outline-none"
    >
      <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-faint sm:text-[10px]">
        {weekday}
      </span>
      <motion.span
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: 0.35,
          delay: 0.03 * index,
          ease: [0.22, 1, 0.36, 1],
        }}
        className={`${baseTile} ${emptyTile}${ring} text-white`}
        style={solidStyle}
      >
        {glyph}
        {/* Resume hint on a part-played past day (never over a won/lost). */}
        {outcome === "none" && inProgress && (
          <span
            aria-hidden
            className="absolute bottom-1 h-1 w-1 rounded-full bg-accent"
          />
        )}
        {isToday && outcome === "none" && (
          <span
            aria-hidden
            className="font-mono text-[8px] uppercase tracking-[0.1em] text-accent sm:text-[9px]"
          >
            Today
          </span>
        )}
      </motion.span>
      <span className="font-mono text-[9px] tabular-nums tracking-tight text-ink-faint sm:text-[10px]">
        {date}
      </span>
    </Link>
  );
}

function CheckGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 sm:h-6 sm:w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 12.5l5 5L20 6.5" />
    </svg>
  );
}

function CrossGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 sm:h-5 sm:w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
