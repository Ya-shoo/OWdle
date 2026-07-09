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

export type Mode =
  | "classic"
  | "quote"
  | "sound"
  | "ability"
  | "splash"
  | "melee";

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
  // True for BONUS modes (Melee) — completions OUTSIDE the canonical
  // daily. Canonical modes send false. Lets dashboards segment daily vs
  // bonus play; the rank query already excludes bonus by mode allowlist,
  // so this is purely a segmentation dimension, not a scoring input.
  bonus?: boolean;
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
    bonus: opts.bonus ?? false,
    ability_index: opts.abilityIndex ?? null,
    skin_key: opts.skinKey ?? null,
    conversation_id: opts.conversationId ?? null,
  });
  // Announce the completion to same-page listeners — HeaderProgress pops
  // the matching daily-progress dot. Piggybacks on this helper's per-day
  // dedup so the animation fires exactly once per completion (never on
  // re-mounts), and covers the final mode of the day too: the older
  // `feedback:refresh` signal is dispatched from NextModeCTA's mount,
  // which never happens on the last mode because DailyCompleteResultCard
  // replaces the per-mode result card.
  window.dispatchEvent(
    new CustomEvent("mode:completed", {
      detail: { mode: opts.mode, outcome: opts.outcome },
    }),
  );
}

// Archive mode: a past daily replayed from /archive/<mode>. Fired once per
// completed archive round, on the terminal transition (won/lost) — driven
// from the guess/hint handler, NOT an effect, so a reload or resume of an
// already-finished round never re-fires, while a fresh Play Again → finish
// does. Deliberately NOT deduped per day: replays are the point, and a
// later `outcome:"won"` after an earlier loss IS the redemption signal.
//
// There is intentionally NO archive_started counterpart, and the daily
// funnel events (mode_started / mode_completed) must NEVER fire from archive
// play — the daily funnel stays pristine. Prop names are network-identical
// across sites (see the file header): document this so the siblings mirror
// it if/when they add archives.
export function trackArchiveRoundCompleted(opts: {
  mode: Mode;
  // The past Pacific puzzle day being replayed (YYYY-MM-DD), NOT the
  // current daily_id — kept a distinct prop so archive play never pollutes
  // daily_id-keyed funnels.
  day: string;
  outcome: "won" | "lost";
  guesses: number;
  hints: number;
}): void {
  posthog.capture("archive_round_completed", {
    mode: opts.mode,
    day: opts.day,
    outcome: opts.outcome,
    guesses: opts.guesses,
    hints: opts.hints,
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

// Post-win bonus question answered (Spotlight's "which skin is this?").
// Distinct from the Quote rescue funnel above (bonus_offered/used/outcome
// track a save attempt) and from Classic's bonus_correct field on
// mode_completed (which fires before the post-win bonus can be answered).
// Idempotent per mode+day — the answer locks on first pick.
export function trackBonusAnswered(opts: {
  mode: Mode;
  dailyId: string;
  correct: boolean;
  answerId: string;
  selectedId: string;
}): void {
  if (alreadyFired(`bonus_answered.${opts.mode}.${opts.dailyId}`)) return;
  posthog.capture("bonus_answered", {
    mode: opts.mode,
    daily_id: opts.dailyId,
    correct: opts.correct,
    answer_id: opts.answerId,
    selected_id: opts.selectedId,
  });
}

// Post-completion "next mode" handoff funnel. `shown` fires when the
// first-day auto-advance countdown becomes visible and armed; `cancelled`
// when a user gesture stops it (cancel_gesture says which kind);
// `auto_fired` when the timer elapses and navigation happens; `clicked`
// on any manual CTA click — countdown line or the regular pill, with
// `first_day` separating the cohorts. Not idempotent: the pill can
// legitimately be clicked more than once in a day (back-navigation);
// dashboards dedupe as needed. from/to use plain strings rather than the
// Mode union so future built modes don't need a type change here.
export function trackNextModeCta(opts: {
  action: "shown" | "cancelled" | "auto_fired" | "clicked";
  fromMode: string;
  toMode: string;
  context: "win" | "loss";
  firstDay: boolean;
  cancelGesture?: "touch" | "scroll" | "tap" | "key" | "stay" | null;
}): void {
  posthog.capture("next_mode_cta", {
    action: opts.action,
    from_mode: opts.fromMode,
    to_mode: opts.toMode,
    context: opts.context,
    first_day: opts.firstDay,
    cancel_gesture: opts.cancelGesture ?? null,
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
// the homepage support panel, the legacy "Copy share text" button on Map
// mode's result screen, or the link-share buttons on each round + daily
// summary. Not idempotent: every click counts, since the same person may
// re-share or copy-then-tweet. `surface` is where they clicked from;
// `method` is how the share happens. "clipboard-link" is the link-first
// modal's copy action ("clipboard-image" died with the multi-mime
// clipboard path — paste targets only ever honored one flavor).
export function trackShareClicked(opts: {
  surface:
    | "support_panel"
    | "map_result"
    | "round_result"
    | "daily_complete"
    | "streak_rank";
  method:
    | "twitter_intent"
    | "clipboard"
    | "native"
    | "clipboard-link"
    | "clipboard-text"
    | "download"
    | "canceled"
    | "error";
  dailyId?: string;
  mode?: string;
}): void {
  posthog.capture("share_clicked", {
    surface: opts.surface,
    method: opts.method,
    daily_id: opts.dailyId ?? null,
    mode: opts.mode ?? null,
  });
}

// Fired when a visitor lands from a shared /r/[code] link — the redirect
// appends ?c=<code> and the destination page reports it here, closing
// the share → visit funnel that share_clicked opens. The middle beat,
// share_link_unfurled, is captured SERVER-side in functions/r/[code].ts
// when a platform bot (Discord, iMessage, Slack…) fetches the link
// shell — bots don't run JS, so it can't live in this file; its
// shared_* props mirror this event's. shared_* props
// describe the SHARER's result (decoded from the code), not the
// visitor's; landing_mode is where the visitor arrived ("home" for
// daily codes). Not idempotent by design — every inbound click counts —
// but the caller strips ?c= from the URL after firing so a reload
// doesn't re-fire.
export function trackShareLinkVisited(opts: {
  landingMode: string;
  code: string;
  sharedDate: string;
  sharedMode?: string;
  sharedOutcome?: "won" | "lost";
}): void {
  posthog.capture("share_link_visited", {
    landing_mode: opts.landingMode,
    code: opts.code,
    shared_date: opts.sharedDate,
    shared_mode: opts.sharedMode ?? null,
    shared_outcome: opts.sharedOutcome ?? null,
  });
}

// One-time "you can share now" release announcement modal. `shown`
// fires when it pops; `dismissed` carries how it was closed so we can
// see whether people actually read it.
export function trackShareAnnounce(opts: {
  action: "shown" | "dismissed";
}): void {
  posthog.capture("share_announce", { action: opts.action });
}

// Fired once when a player is promoted to a new, higher streak-rank tier
// (Grandmaster → Champion → Top 500). StreakRankBadge gates this behind a
// persistent localStorage ratchet, so it fires at most once per tier ever
// reached — no per-day dedup needed here.
export function trackStreakRankPromoted(opts: {
  tier: "top500" | "champion" | "grandmaster";
  streak: number;
  poolN: number;
}): void {
  posthog.capture("streak_rank_promoted", {
    tier: opts.tier,
    streak: opts.streak,
    pool_n: opts.poolN,
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

// Ghost-rail ad-inventory measurement (components/AdRails.tsx). Events are
// cumulative snapshots per pageview: pv_id identifies the pageview, seq
// orders its snapshots, so dashboards take argMax(seq) per pv_id and never
// double-count a pageview that flushed more than once (hidden → shown →
// pagehide). `beacon` switches transport for the unload-adjacent flushes
// that would otherwise race tab teardown and silently drop. Props carry both
// inventory stacks: desktop side rails (rail_tier / slots_* /
// est_impressions_total) and the mobile stack that serves when no rail fit
// (anchor_eligible / anchor_imps / incontent_fit / incontent_viewed /
// mobile_imps_total, plus doc_scroll_h / max_scroll_px for the scroll model).
// The two are mutually exclusive per pageview — mobile props are 0 whenever
// rail_tier !== "none".
export function trackAdInventory(
  props: Record<string, unknown>,
  opts?: { beacon?: boolean },
): void {
  posthog.capture(
    "ad_inventory",
    props,
    opts?.beacon ? { transport: "sendBeacon" } : undefined,
  );
}
