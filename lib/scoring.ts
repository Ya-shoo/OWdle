// Tiered scoring for OWdle Map Mode.
//
// Per round: max 5000 = mapBonus (1000 if right map) + distancePoints
// (0–4000, interpolated within the player's accuracy tier).
//
// "Source of truth" = the spot's stored pixel position on the overhead
// (set at capture time: homography projects the world coords, then the
// labeler's Nudge step lets the operator drag the pin to the visually
// correct landmark before saving). Calibration math error doesn't enter
// the player's score — it's already corrected out at capture.
//
// Each tier exposes an accuracy RANGE rather than a single payout.
// The score interpolates within the range based on how close the
// player's pin landed inside the tier's fraction-of-long-edge band.
// The result badge can then read "97.4% accuracy" instead of always
// snapping to 100/75/50/35/15/2.5/0. Conversion is exact and lossless:
//
//   accuracy = distancePoints / 40       (and so % out of 4000)
//
// Tier brackets — the OK→Wrong-area boundary is a deliberate CLIFF,
// not a smooth interpolation. Crossing into "wrong area" should hurt
// because the tier name is itself the message: you missed the arena.
// Upper-four tiers stay continuous and player-friendly (a pin in the
// right building reads ~70%); the lower three steeply punish.
//
//   Bullseye   0–3%   off  →  100–95% accuracy  (4000–3800 pts)
//   Excellent  3–10%        →   94–80%         (3760–3200 pts)
//   Good       10–20%       →   79–65%         (3160–2600 pts)
//   OK         20–30%       →   64–50%         (2560–2000 pts)
//   ┄ cliff at 30% off ┄
//   Wrong area 30–60%       →   19– 5%         ( 760– 200 pts)
//   Way off    60–100%      →    4– 1%         ( 160–  40 pts)
//   Wrong map  100%+        →    0%            (   0 pts)
//
// The 50%→19% drop at fractionOff = 0.30 means a near-OK guess earns
// ~3000 total (2000 distance + 1000 map bonus), but cross the line
// and a near-wrong-area guess earns ~1760 — same map bonus, much
// less distance reward. Mirror behaviour at the Wrong-area→Way-off
// boundary (5%→4%) for symmetry, though it's a much smaller step.
//
// Wrong-map (picker) guesses still score 0 — you can't be "close" on
// a different map. Skipped rounds (no click) score 0 with no map bonus.

export type ScoreTier = {
  /** Display name for UI / share cards. */
  name: string;
  /**
   * Upper bound (exclusive) as a fraction of the overhead's long edge.
   * e.g. 0.05 = "click within 5% of long edge of true position".
   * Use Number.POSITIVE_INFINITY for the catch-all "wrong-map" tier so
   * any distance still finds a home.
   */
  maxFraction: number;
  /** Accuracy at the tight end of the tier (smallest fraction). */
  maxAccuracy: number;
  /** Accuracy at the loose end of the tier (largest fraction). */
  minAccuracy: number;
};

/**
 * Default 7-tier ladder. The accuracy band per tier is the player-
 * facing contract — `scoreClick` interpolates linearly between
 * `maxAccuracy` and `minAccuracy` based on where the pin sits in the
 * tier's fraction band, then converts to distance points (pts = round(
 * accuracy × 40)).
 *
 * To override per map, pass a different `tiers` array to scoreClick.
 */
export const DEFAULT_TIERS: ReadonlyArray<ScoreTier> = [
  { name: "Bullseye", maxFraction: 0.03, maxAccuracy: 100, minAccuracy: 95 },
  { name: "Excellent", maxFraction: 0.1, maxAccuracy: 94, minAccuracy: 80 },
  { name: "Good", maxFraction: 0.2, maxAccuracy: 79, minAccuracy: 65 },
  { name: "OK", maxFraction: 0.3, maxAccuracy: 64, minAccuracy: 50 },
  { name: "Wrong area", maxFraction: 0.6, maxAccuracy: 19, minAccuracy: 5 },
  { name: "Way off", maxFraction: 1.0, maxAccuracy: 4, minAccuracy: 1 },
  {
    name: "Wrong map",
    maxFraction: Number.POSITIVE_INFINITY,
    maxAccuracy: 0,
    minAccuracy: 0,
  },
];

export const MAP_BONUS_POINTS = 1000;
export const MAX_ROUND_SCORE = MAP_BONUS_POINTS + 4000;

const SKIP_TIER: ScoreTier = {
  name: "Skipped",
  maxFraction: Number.POSITIVE_INFINITY,
  maxAccuracy: 0,
  minAccuracy: 0,
};

const WRONG_MAP_TIER: ScoreTier = {
  name: "Wrong map",
  maxFraction: Number.POSITIVE_INFINITY,
  maxAccuracy: 0,
  minAccuracy: 0,
};

export type ScoreInput = {
  guessedMap: string;
  actualMap: string;
  /** null when the player skipped the round without clicking. */
  guessedPx: [number, number] | null;
  actualPx: [number, number];
  overheadW: number;
  overheadH: number;
  /** Optional per-map override of the default 7-tier ladder. */
  tiers?: ReadonlyArray<ScoreTier>;
};

export type ScoreResult = {
  /** Click distance from the true spot, in overhead pixels. */
  pixelDistance: number;
  /** Same distance as a fraction of the overhead's long edge. */
  fraction: number;
  tier: ScoreTier;
  /** Interpolated 0–4000 from the tier's accuracy range. */
  distancePoints: number;
  mapBonus: number;
  totalScore: number;
  wrongMap: boolean;
  skipped: boolean;
};

/**
 * Score a single round's click. Returns 0 / 0 / 0 for either skipped
 * rounds or wrong-map guesses; both surface the reason via the
 * `skipped` / `wrongMap` flags so the UI can label the result.
 */
export function scoreClick(input: ScoreInput): ScoreResult {
  if (input.guessedPx == null) {
    return {
      pixelDistance: Number.POSITIVE_INFINITY,
      fraction: Number.POSITIVE_INFINITY,
      tier: SKIP_TIER,
      distancePoints: 0,
      mapBonus: 0,
      totalScore: 0,
      wrongMap: false,
      skipped: true,
    };
  }

  if (input.guessedMap !== input.actualMap) {
    return {
      pixelDistance: Number.POSITIVE_INFINITY,
      fraction: Number.POSITIVE_INFINITY,
      tier: WRONG_MAP_TIER,
      distancePoints: 0,
      mapBonus: 0,
      totalScore: 0,
      wrongMap: true,
      skipped: false,
    };
  }

  const tiers = input.tiers ?? DEFAULT_TIERS;
  const longEdge = Math.max(input.overheadW, input.overheadH) || 1;
  const dx = input.guessedPx[0] - input.actualPx[0];
  const dy = input.guessedPx[1] - input.actualPx[1];
  const pixelDistance = Math.sqrt(dx * dx + dy * dy);
  const fraction = pixelDistance / longEdge;
  // Find the tier this fraction falls inside. tiers.findIndex returns
  // -1 if every tier's maxFraction is finite and fraction exceeds them
  // all — that's the catch-all Wrong-map case, so we fall back to the
  // last entry (which we expect to be infinite-maxFraction Wrong map).
  const foundIndex = tiers.findIndex((t) => fraction < t.maxFraction);
  const tierIndex = foundIndex >= 0 ? foundIndex : tiers.length - 1;
  const tier = tiers[tierIndex];
  const tierStart = tierIndex > 0 ? tiers[tierIndex - 1].maxFraction : 0;
  const tierEnd = tier.maxFraction;
  // Linear interpolation within the tier's accuracy band. The catch-
  // all Wrong-map tier has infinite span; for it, just emit the floor
  // accuracy (typically 0).
  let accuracy: number;
  if (!Number.isFinite(tierEnd) || tierEnd <= tierStart) {
    accuracy = tier.minAccuracy;
  } else {
    const t = Math.max(0, Math.min(1, (fraction - tierStart) / (tierEnd - tierStart)));
    accuracy = tier.maxAccuracy + t * (tier.minAccuracy - tier.maxAccuracy);
  }
  accuracy = Math.max(0, Math.min(100, accuracy));
  // pts and accuracy are perfectly linked (pts = round(accuracy × 40))
  // so the badge can re-derive accuracy from stored points without
  // round-trip drift.
  const distancePoints = Math.round(accuracy * 40);

  return {
    pixelDistance,
    fraction,
    tier,
    distancePoints,
    mapBonus: MAP_BONUS_POINTS,
    totalScore: distancePoints + MAP_BONUS_POINTS,
    wrongMap: false,
    skipped: false,
  };
}

/**
 * Sum a multi-round daily into a single score. Use this for the day's
 * shareable result line. Rounds without scores (e.g. unplayed) contribute
 * 0; pass only completed rounds to keep the average meaningful.
 */
export function totalDailyScore(rounds: ReadonlyArray<ScoreResult>): number {
  return rounds.reduce((sum, r) => sum + r.totalScore, 0);
}
