// Tiered scoring for OWdle Map Mode.
//
// Per round: max 5000 = mapBonus (1000 if right map) + distancePoints
// (0–4000 from which accuracy tier the click lands in).
//
// "Source of truth" = the spot's stored pixel position on the overhead
// (set at capture time: homography projects the world coords, then the
// labeler's Nudge step lets the operator drag the pin to the visually
// correct landmark before saving). Calibration math error doesn't enter
// the player's score — it's already corrected out at capture.
//
// Tier boundaries are expressed as a fraction of the overhead's long
// edge so they scale across map sizes (5% on King's Row 5000-wide =
// 250 px, 5% on an Ilios sub-arena ~1600 wide = 80 px). Boundary list
// per spec discussion: 5 / 10 / 20 / 30 / 50 / 75 / 100 %.
//
// Wrong-map guesses score 0 — you can't be "close" on a different map.
// Skipped rounds (no click) score 0 with no map bonus.

export type ScoreTier = {
  /** Display name for UI / share cards. */
  name: string;
  /**
   * Upper bound (exclusive) as a fraction of the overhead's long edge.
   * e.g. 0.05 = "click within 5% of long edge of true position".
   * Use Number.POSITIVE_INFINITY for the catch-all "off-map" tier so
   * any distance still finds a home.
   */
  maxFraction: number;
  /** Distance-points awarded for landing in this tier (max 4000). */
  distancePoints: number;
};

/**
 * Default 8-tier ladder. Boundaries match the canonical spec; point
 * values roughly halve per tier (4000 → 0) to feel rewarding for
 * close guesses without crushing players who land in the right
 * neighborhood.
 *
 * To override per map, pass a different `tiers` array to scoreClick —
 * e.g. tighter bands on small Control sub-arenas, looser on Push maps
 * where landmark density is lower.
 */
export const DEFAULT_TIERS: ReadonlyArray<ScoreTier> = [
  // Bullseye tightened from 0.05 → 0.03 — on a 5000-wide overhead
  // that's a 150 px radius instead of 250, so a perfect score requires
  // landing within roughly a building's footprint of the true spot
  // rather than the right block. Excellent now absorbs the old
  // Bullseye band, so a close-but-not-perfect click still scores 3000
  // — perfects feel earned without crushing near-misses.
  { name: "Bullseye", maxFraction: 0.03, distancePoints: 4000 },
  { name: "Excellent", maxFraction: 0.1, distancePoints: 3000 },
  { name: "Good", maxFraction: 0.2, distancePoints: 2000 },
  { name: "OK", maxFraction: 0.3, distancePoints: 1200 },
  { name: "Far", maxFraction: 0.5, distancePoints: 600 },
  { name: "Wrong area", maxFraction: 0.75, distancePoints: 250 },
  { name: "Way off", maxFraction: 1.0, distancePoints: 100 },
  {
    name: "Off map",
    maxFraction: Number.POSITIVE_INFINITY,
    distancePoints: 0,
  },
];

export const MAP_BONUS_POINTS = 1000;
export const MAX_ROUND_SCORE = MAP_BONUS_POINTS + 4000;

const SKIP_TIER: ScoreTier = {
  name: "Skipped",
  maxFraction: Number.POSITIVE_INFINITY,
  distancePoints: 0,
};

const WRONG_MAP_TIER: ScoreTier = {
  name: "Wrong map",
  maxFraction: Number.POSITIVE_INFINITY,
  distancePoints: 0,
};

export type ScoreInput = {
  guessedMap: string;
  actualMap: string;
  /** null when the player skipped the round without clicking. */
  guessedPx: [number, number] | null;
  actualPx: [number, number];
  overheadW: number;
  overheadH: number;
  /** Optional per-map override of the default 8-tier ladder. */
  tiers?: ReadonlyArray<ScoreTier>;
};

export type ScoreResult = {
  /** Click distance from the true spot, in overhead pixels. */
  pixelDistance: number;
  /** Same distance as a fraction of the overhead's long edge. */
  fraction: number;
  tier: ScoreTier;
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
  const tier =
    tiers.find((t) => fraction < t.maxFraction) ?? tiers[tiers.length - 1];

  return {
    pixelDistance,
    fraction,
    tier,
    distancePoints: tier.distancePoints,
    mapBonus: MAP_BONUS_POINTS,
    totalScore: tier.distancePoints + MAP_BONUS_POINTS,
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
