// Daily-completion streak. A "complete day" is any Pacific puzzle day on
// which the player has finished every built mode — won, lost, or (legacy)
// given up. Mirrors HomeContent's `allDone` derivation so the streak stays
// in lockstep with what the UI calls a finished day.
//
// State lives in a single localStorage key. On first read after this
// feature shipped, we backfill from existing per-mode localStorage so
// established daily players don't get reset to 0 just because the streak
// key didn't exist yet. The same scan also seeds `longest` from history.

import { dayString } from "./daily";
import { BUILT_MODE_SLUGS } from "./modes";
import { trackDailyCompleted } from "./tracking";

const STREAK_KEY = "owdle.streak";
const MODE_KEY_RE = /^owdle\.[a-z]+\.(\d{4}-\d{2}-\d{2})$/;
// Safety bound for the backfill walk — well past any plausible play history.
const MAX_BACKFILL_DAYS = 730;

export type StreakState = {
  current: number;
  longest: number;
  /** YYYY-MM-DD of the last Pacific puzzle day all modes were completed. */
  lastCompletedDay: string | null;
};

const EMPTY: StreakState = { current: 0, longest: 0, lastCompletedDay: null };

function readRaw(): StreakState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STREAK_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (typeof p !== "object" || p === null) return null;
    return {
      current: Number.isFinite(p.current) ? Math.max(0, Math.floor(p.current)) : 0,
      longest: Number.isFinite(p.longest) ? Math.max(0, Math.floor(p.longest)) : 0,
      lastCompletedDay:
        typeof p.lastCompletedDay === "string" ? p.lastCompletedDay : null,
    };
  } catch {
    return null;
  }
}

function writeRaw(s: StreakState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STREAK_KEY, JSON.stringify(s));
  } catch {
    // ignore quota / private-mode errors
  }
}

function prevDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

// A day counts as complete if every built mode's stored state ended in
// some terminal status: won, lost (Phase-1 cap-hit), or gaveUp (legacy
// Sound "Show answer"). Both ConversationState (Quote) and ModeState
// shapes include these top-level fields so a raw JSON probe works for
// either.
function isDayComplete(day: string): boolean {
  if (typeof window === "undefined") return false;
  for (const slug of BUILT_MODE_SLUGS) {
    try {
      const raw = window.localStorage.getItem(`owdle.${slug}.${day}`);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      const finished =
        parsed?.won === true ||
        parsed?.lost === true ||
        parsed?.gaveUp === true;
      if (!finished) return false;
    } catch {
      return false;
    }
  }
  return true;
}

// Snapshot of how today's built modes resolved. Walks each per-mode
// localStorage key once; cheap relative to the consecutiveEndingAt walk
// already happening in this module. Used to populate daily_completed
// analytics at the moment the streak ticks over.
function summarizeDay(day: string): {
  wonCount: number;
  lostCount: number;
  totalGuesses: number;
} {
  if (typeof window === "undefined") {
    return { wonCount: 0, lostCount: 0, totalGuesses: 0 };
  }
  let wonCount = 0;
  let lostCount = 0;
  let totalGuesses = 0;
  for (const slug of BUILT_MODE_SLUGS) {
    try {
      const raw = window.localStorage.getItem(`owdle.${slug}.${day}`);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (parsed?.won === true) {
        wonCount++;
      } else if (parsed?.lost === true || parsed?.gaveUp === true) {
        lostCount++;
      }
      if (Array.isArray(parsed?.guesses)) {
        totalGuesses += parsed.guesses.length;
      }
    } catch {
      // ignore malformed entries — they just won't contribute to the
      // summary, which is acceptable for analytics rollups.
    }
  }
  return { wonCount, lostCount, totalGuesses };
}

function consecutiveEndingAt(day: string): {
  count: number;
  lastDay: string | null;
} {
  let count = 0;
  let cursor = day;
  let lastDay: string | null = null;
  while (isDayComplete(cursor)) {
    count++;
    lastDay = cursor;
    cursor = prevDay(cursor);
    if (count >= MAX_BACKFILL_DAYS) break;
  }
  return { count, lastDay };
}

// Longest contiguous run of completed days anywhere in this browser's
// history. Pulls candidate days from every `owdle.<mode>.<day>` key
// rather than walking the full calendar — O(localStorage size) regardless
// of how far back the player started.
function longestRunInHistory(): number {
  if (typeof window === "undefined") return 0;
  const days = new Set<string>();
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (!k) continue;
    const m = MODE_KEY_RE.exec(k);
    if (m) days.add(m[1]);
  }
  const completeSorted = Array.from(days).filter(isDayComplete).sort();
  let longest = 0;
  let run = 0;
  let last: string | null = null;
  for (const d of completeSorted) {
    run = last != null && prevDay(d) === last ? run + 1 : 1;
    if (run > longest) longest = run;
    last = d;
  }
  return longest;
}

// Seed initial state from history. If today is complete the streak ends
// at today; otherwise it ends at the most recent complete day, which is
// usually yesterday for a returning daily player.
function backfillFromHistory(today: string): StreakState {
  const todayComplete = isDayComplete(today);
  const seed = todayComplete ? today : prevDay(today);
  const { count, lastDay } = consecutiveEndingAt(seed);
  const longest = Math.max(longestRunInHistory(), count);
  return {
    current: count,
    longest,
    lastCompletedDay: lastDay,
  };
}

// Idempotent. Reads the persisted state (running backfill the first
// time), then bumps if today just became complete and we haven't already
// recorded it. Safe to call from multiple consumers on the same render
// — only the first call observes the transition.
export function bumpStreakIfNeeded(): StreakState {
  if (typeof window === "undefined") return EMPTY;
  const today = dayString();
  let state = readRaw();
  if (state == null) {
    state = backfillFromHistory(today);
    writeRaw(state);
  }
  if (state.lastCompletedDay === today) return state;
  if (!isDayComplete(today)) return state;
  const continuing = state.lastCompletedDay === prevDay(today);
  const current = continuing ? state.current + 1 : 1;
  const longest = Math.max(state.longest, current);
  const next: StreakState = { current, longest, lastCompletedDay: today };
  writeRaw(next);
  // Daily completion is exactly-once: writeRaw above just flipped
  // lastCompletedDay to today, so we'll never re-enter this branch for
  // today. The tracker also dedupes via localStorage as belt + braces.
  const summary = summarizeDay(today);
  trackDailyCompleted({
    dailyId: today,
    wonCount: summary.wonCount,
    lostCount: summary.lostCount,
    totalGuesses: summary.totalGuesses,
    streakCurrent: current,
    streakLongest: longest,
  });
  return next;
}
