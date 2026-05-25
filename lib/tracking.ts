// PostHog analytics wrappers for daily-quiz modes. The same event names
// and prop names ship to the Deadlockle repo so the shared DailyDles
// PostHog project can build one set of dashboards across both sites.
//
// Idempotency: the *_started, mode_completed, and daily_completed helpers
// guard against duplicate fires within the same Pacific puzzle day by
// stashing a marker in localStorage. guess_submitted and hint_used are
// fired from user-interaction handlers (not effects) so they don't need
// the same protection.

import posthog from "posthog-js";

export type Mode = "classic" | "quote" | "sound" | "ability" | "splash";

// Returns true if the event has already fired for this day; otherwise
// records the marker and returns false. Markers are per Pacific puzzle
// day so re-mounts within a day don't double-fire while a new day
// always re-fires once. SSR returns true to short-circuit safely.
function alreadyFired(eventKey: string): boolean {
  if (typeof window === "undefined") return true;
  const k = `owdle.tracked.${eventKey}`;
  try {
    if (window.localStorage.getItem(k) === "1") return true;
    window.localStorage.setItem(k, "1");
    return false;
  } catch {
    // If localStorage is unavailable we err on the side of firing — a
    // duplicate event is better than a missed one for these dashboards.
    return false;
  }
}

export function trackModeStarted(opts: {
  mode: Mode;
  dailyId: string;
  answerId: string;
}): void {
  if (alreadyFired(`mode_started.${opts.mode}.${opts.dailyId}`)) return;
  posthog.capture("mode_started", {
    mode: opts.mode,
    daily_id: opts.dailyId,
    answer_id: opts.answerId,
  });
}

export function trackGuessSubmitted(opts: {
  mode: Mode;
  dailyId: string;
  guessNumber: number;
  isCorrect: boolean;
  guessId: string;
  answerId: string;
}): void {
  posthog.capture("guess_submitted", {
    mode: opts.mode,
    daily_id: opts.dailyId,
    guess_number: opts.guessNumber,
    is_correct: opts.isCorrect,
    guess_id: opts.guessId,
    answer_id: opts.answerId,
  });
}

export function trackModeCompleted(opts: {
  mode: Mode;
  dailyId: string;
  outcome: "won" | "lost" | "gaveUp";
  totalGuesses: number;
  cap: number;
  hintsUsed?: number;
  answerId: string;
  // Classic-only: whether the player answered the bonus question
  // correctly. true / false / null (unanswered). Surfaces in the daily
  // tier-badge composite as a small sub-point credit.
  bonusCorrect?: boolean | null;
  // Mode-specific extras. Null when not applicable to this mode.
  abilityIndex?: number | null;
  skinKey?: string | null;
  conversationId?: string | null;
}): void {
  if (alreadyFired(`mode_completed.${opts.mode}.${opts.dailyId}`)) return;
  posthog.capture("mode_completed", {
    mode: opts.mode,
    daily_id: opts.dailyId,
    outcome: opts.outcome,
    total_guesses: opts.totalGuesses,
    cap: opts.cap,
    hints_used: opts.hintsUsed ?? 0,
    answer_id: opts.answerId,
    bonus_correct: opts.bonusCorrect ?? null,
    ability_index: opts.abilityIndex ?? null,
    skin_key: opts.skinKey ?? null,
    conversation_id: opts.conversationId ?? null,
  });
}

export function trackHintUsed(opts: {
  mode: Mode;
  dailyId: string;
  hintIndex: number;
  atGuessNumber: number;
  attributeRevealed: string;
}): void {
  posthog.capture("hint_used", {
    mode: opts.mode,
    daily_id: opts.dailyId,
    hint_index: opts.hintIndex,
    at_guess_number: opts.atGuessNumber,
    attribute_revealed: opts.attributeRevealed,
  });
}

// Quote mode's last-life bonus: when the cap-th guess lands one speaker
// but the other is still unsolved, the player gets exactly one extra
// guess to nail the missing speaker. Three discrete events let us
// measure the rescue funnel — offered (eligible cap-th finish), used
// (took the shot), outcome (won/lost on that shot). All three are
// per-dailyId idempotent so a re-mount within a day doesn't double-fire.
// Distinct from Classic's `bonus_correct` field on mode_completed,
// which tracks a post-win sub-question, not a save attempt.

export function trackBonusOffered(opts: {
  mode: Mode;
  dailyId: string;
  missingTarget: 0 | 1;
}): void {
  if (alreadyFired(`bonus_offered.${opts.mode}.${opts.dailyId}`)) return;
  posthog.capture("bonus_offered", {
    mode: opts.mode,
    daily_id: opts.dailyId,
    missing_target: opts.missingTarget,
  });
}

export function trackBonusUsed(opts: {
  mode: Mode;
  dailyId: string;
  missingTarget: 0 | 1;
}): void {
  if (alreadyFired(`bonus_used.${opts.mode}.${opts.dailyId}`)) return;
  posthog.capture("bonus_used", {
    mode: opts.mode,
    daily_id: opts.dailyId,
    missing_target: opts.missingTarget,
  });
}

export function trackBonusOutcome(opts: {
  mode: Mode;
  dailyId: string;
  outcome: "won" | "lost";
}): void {
  if (alreadyFired(`bonus_outcome.${opts.mode}.${opts.dailyId}`)) return;
  posthog.capture("bonus_outcome", {
    mode: opts.mode,
    daily_id: opts.dailyId,
    outcome: opts.outcome,
  });
}

// Fired when the feedback dialog opens. Doubles as a PostHog session-
// recording trigger (configured in project settings): the moment this
// event fires, the recorder is force-started for that session so the
// reviewer can see what the user does inside the dialog even if they
// hadn't started a mode. Also returns the current session_id so the
// caller can ship it along with the feedback POST.
export function trackFeedbackOpened(): string | null {
  posthog.capture("feedback_opened");
  try {
    return posthog.get_session_id() ?? null;
  } catch {
    return null;
  }
}

// Fired when a user clicks a share affordance — the Twitter/X intent on
// the homepage support panel, or the "Copy share text" button on Map
// mode's result screen. Not idempotent: every click counts, since the
// same person may re-share or copy-then-tweet. `surface` is where they
// clicked from; `method` is how the share happens.
export function trackShareClicked(opts: {
  surface: "support_panel" | "map_result";
  method: "twitter_intent" | "clipboard";
  dailyId?: string;
}): void {
  posthog.capture("share_clicked", {
    surface: opts.surface,
    method: opts.method,
    daily_id: opts.dailyId ?? null,
  });
}

export function trackDailyCompleted(opts: {
  dailyId: string;
  wonCount: number;
  lostCount: number;
  totalGuesses: number;
  streakCurrent: number;
  streakLongest: number;
}): void {
  if (alreadyFired(`daily_completed.${opts.dailyId}`)) return;
  posthog.capture("daily_completed", {
    daily_id: opts.dailyId,
    won_count: opts.wonCount,
    lost_count: opts.lostCount,
    total_guesses: opts.totalGuesses,
    streak_current: opts.streakCurrent,
    streak_longest: opts.streakLongest,
    // sweep = won every built mode. We only call this when the day is
    // complete (so wonCount + lostCount === N built modes), making
    // lostCount === 0 a sufficient sweep signal.
    sweep: opts.lostCount === 0,
  });
}
