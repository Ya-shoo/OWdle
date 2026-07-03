// Rewarded-ad provider — the opt-in "watch an ad for an extra guess / extra
// hint" reward. It AUGMENTS the existing free hint system; it never replaces
// it and never auto-rolls. The player only ever sees it after they've used
// what the game gives for free (out of hints, or out of guesses).
//
// GHOST PHASE (current): no ad network is wired yet — Monumetric is display-
// only and still in onboarding, and rewarded VIDEO would be a separate
// provider (likely Google H5 rewarded). So `showRewardedAd` is a PLACEHOLDER
// that simulates a rewarded roll and resolves as completed. Everything
// downstream — the game-state grant, the "assisted" flag, the analytics — is
// real and measurable now. When a provider is plugged in, ONLY the body of
// `showRewardedAd` changes; call sites depend solely on the Promise<
// RewardedResult> contract and on REWARDED_IS_GHOST for honest labelling.

export type RewardedPlacement = "extra_guess" | "extra_hint";

export type RewardedResult = {
  // Did the user watch to completion (did the reward get earned)? Real
  // providers resolve `false` when the ad is dismissed early or fails to fill.
  completed: boolean;
  // True while this is the ghost placeholder rather than a real network ad.
  // Lets the UI label it honestly and lets analysis exclude ghost grants from
  // any revenue math.
  ghost: boolean;
};

// While true, no real ad serves — `showRewardedAd` is the simulated roll
// below. Flipping this to false is the seam for a real provider (implement it
// in `showRewardedAd`); call sites read it only to label the placeholder.
export const REWARDED_IS_GHOST = true;

// Simulated watch time for the ghost roll — long enough that the "rolling…"
// state registers as a deliberate beat, short enough not to drag in testing.
const GHOST_ROLL_MS = 900;

// Resolve the rewarded roll. Ghost phase: always "watched" after a short
// simulated delay. The real provider replaces the body here (load → show →
// resolve on the network's reward callback, or `completed: false` on dismiss/
// no-fill). The placement is passed through for the eventual provider (slot
// targeting / reporting) — unused by the ghost.
export function showRewardedAd(
  placement: RewardedPlacement,
): Promise<RewardedResult> {
  void placement;
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve({ completed: false, ghost: true });
      return;
    }
    window.setTimeout(
      () => resolve({ completed: true, ghost: true }),
      GHOST_ROLL_MS,
    );
  });
}
