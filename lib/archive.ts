// Archive mode — a private, client-only replay of recent daily puzzles.
// Retention feature, NOT SEO (all routes noindex). Classic first; the other
// modes reuse the same pattern later.
//
// STREAK-NEUTRALITY IS LOAD-BEARING. Archive rounds persist under
// `owdle.archive.<mode>.<day>` via storage.ts's key() (`owdle.${mode}.${day}`
// with the double-segment mode `archive.<mode>`). That key deliberately does
// NOT match streak.ts's MODE_KEY_RE (`/^owdle\.[a-z]+\.\d{4}-…/` — a single
// `[a-z]+` can't span the dot), so isDayComplete / bumpStreakIfNeeded never
// see archive play. Never write the live `owdle.<mode>.<day>` key from here.

import { dayString } from "./daily";
import { BAG_CUTOVER_DAY } from "./dailyBag";
import { loadModeState, saveModeState, type ModeState } from "./storage";

// Rolling window: today + previous 6 Pacific puzzle days.
export const ARCHIVE_WINDOW_DAYS = 7;

// The storage-mode segment for a mode's archive namespace. Passing this to
// loadModeState/saveModeState yields `owdle.archive.<mode>.<day>`.
export function archiveMode(mode: string): string {
  return `archive.${mode}`;
}

export function loadArchiveState(mode: string, day: string): ModeState {
  return loadModeState(archiveMode(mode), day);
}

export function saveArchiveState(mode: string, state: ModeState): void {
  saveModeState(archiveMode(mode), state);
}

export type FillOutcome = "won" | "lost" | "none";

export type DayFill = {
  day: string;
  // Best-outcome union of the live daily key and the archive key. Ranked
  // won > lost > none, so a live LOSS (red) flips to WON (green) the moment
  // the player redeems it by replaying + winning in the archive. A green is
  // never downgraded — this redemption is the feature's core hook.
  outcome: FillOutcome;
  // A resumable, not-yet-terminal round exists (archive round part-played,
  // or — for today — the live daily is mid-round). Drives a subtle "resume"
  // affordance; never overrides a won/lost color.
  inProgress: boolean;
};

function isTerminal(st: ModeState): boolean {
  return st.won || st.lost === true || st.gaveUp === true;
}

function hasProgress(st: ModeState): boolean {
  return (st.guesses?.length ?? 0) > 0 || (st.hintsUsed?.length ?? 0) > 0;
}

// Fill status for one day, unioning the live daily record with the archive
// record. `mode` is the live mode slug (e.g. "classic"); the archive record
// is read from its sibling `archive.<mode>` namespace.
export function archiveFillStatus(mode: string, day: string): DayFill {
  const live = loadModeState(mode, day);
  const arch = loadArchiveState(mode, day);

  let outcome: FillOutcome = "none";
  if (live.won || arch.won) {
    outcome = "won";
  } else if (isTerminal(live) || isTerminal(arch)) {
    outcome = "lost";
  }

  const inProgress =
    outcome !== "won" &&
    ((hasProgress(arch) && !isTerminal(arch)) ||
      (hasProgress(live) && !isTerminal(live)));

  return { day, outcome, inProgress };
}

// Shift a YYYY-MM-DD Pacific puzzle-day string by whole days. UTC math on the
// date-only value is safe because puzzle-day strings are already normalized
// (see dayString) — no clock component to drift.
function addDays(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

// The rolling window ending today (default: the current Pacific puzzle day),
// oldest → newest. Floor-clamped at BAG_CUTOVER_DAY so it never surfaces a
// day that predates the shuffle-bag era. Lexicographic compare is chronological
// for YYYY-MM-DD.
export function archiveWindow(today: string = dayString()): string[] {
  const days: string[] = [];
  for (let i = ARCHIVE_WINDOW_DAYS - 1; i >= 0; i--) {
    const d = addDays(today, -i);
    if (d < BAG_CUTOVER_DAY) continue;
    days.push(d);
  }
  return days;
}

// The next OTHER past day that isn't already green (won) — an empty or red
// day the player can go fill in. Used by the round-complete CTA to drive an
// all-green week. Searches forward from `after` (EXCLUSIVE of `after` itself),
// then wraps to the start, so it lands on the nearest unfilled day and never
// links back to the day just played. Excludes today (played live) and won
// days. Returns null when every OTHER past day is green — the caller decides
// what to show based on whether `after` itself was won.
export function nextUnfilledDay(
  mode: string,
  after: string,
  today: string = dayString(),
): string | null {
  const past = archiveWindow(today).filter((d) => d < today);
  if (past.length === 0) return null;
  const start = past.findIndex((d) => d === after);
  // Rotate so the search begins just after `after` and wraps around, with
  // `after` itself excluded from both ends (slice(0, start), not start + 1).
  const ordered =
    start === -1 ? past : [...past.slice(start + 1), ...past.slice(0, start)];
  for (const d of ordered) {
    if (archiveFillStatus(mode, d).outcome !== "won") return d;
  }
  return null;
}
