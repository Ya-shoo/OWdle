// Shared state + projection helper for the calibration-feedback loop.
//
// The user can toggle a global "mode" that controls whether — and how
// strongly — manually-edited spots from the edit page feed back into
// each map's calibration fit:
//
//   • manual         — only formal calibration points (the
//                      `calibrationPoints` array per map). The default,
//                      and the safest: calibration is deterministic.
//   • tier-two       — edited spots are pulled in as extra fit
//                      constraints, but at SPOT_TIER2_WEIGHT (= 0.25)
//                      so the spline is nudged, not pulled, by them.
//                      Useful when you want fine corrections to refine
//                      the fit without dominating it.
//   • unconditional  — every edited spot is a full-weight calibration
//                      point. Maximum data → potentially tightest fit,
//                      but corrupts the calibration if any edit is
//                      lower-quality (e.g. world coords came from
//                      imperfect OCR).
//
// Mode is persisted in localStorage and read by every page that builds
// a Projection — MapCalibrate (residual + grid view), MapEdit (answer-
// pin projection), MapReview (new-spot projection). All three respect
// the same toggle so the calibration model is consistent everywhere.

import {
  fitTPS,
  TPS_DEFAULT_LAMBDA,
  type AffineTransform,
  type CalibrationPoint,
  type Homography,
  type Projection,
} from "@/lib/affine";

export type CalibrationMode = "manual" | "tier-two" | "unconditional";

export const CALIBRATION_MODE_STORAGE = "owdle:calibration-mode:v1";
export const SPOT_TIER2_WEIGHT = 0.25;

export const CALIBRATION_MODE_OPTIONS: ReadonlyArray<{
  value: CalibrationMode;
  label: string;
  description: string;
}> = [
  {
    value: "manual",
    label: "Manual only",
    description:
      "Just formal calibration points. Edit-page corrections do not feed back.",
  },
  {
    value: "tier-two",
    label: "Tier-two corrections",
    description: `Edited spots added at ${SPOT_TIER2_WEIGHT}× weight — nudges the fit without dominating.`,
  },
  {
    value: "unconditional",
    label: "Unconditional",
    description: "Every edited spot is a full-weight calibration constraint.",
  },
];

export function readCalibrationMode(): CalibrationMode {
  if (typeof window === "undefined") return "manual";
  try {
    const raw = localStorage.getItem(CALIBRATION_MODE_STORAGE);
    if (raw === "tier-two" || raw === "unconditional") return raw;
  } catch {
    // ignore quota / private mode
  }
  return "manual";
}

export function writeCalibrationMode(mode: CalibrationMode) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CALIBRATION_MODE_STORAGE, mode);
    // Custom event lets components on the same tab react without
    // listening for a cross-tab `storage` event (which doesn't fire
    // for same-tab writes).
    window.dispatchEvent(
      new CustomEvent("owdle-calibration-mode-change", { detail: mode }),
    );
  } catch {
    // ignore
  }
}

// JSON shape consumed by the projection builders. Mirrors the entry
// shape in data/map-calibrations.json plus the optional new TPS fields.
export type CalibrationEntry = {
  overheadFile?: string;
  overheadW: number;
  overheadH: number;
  projection: "affine" | "homography" | "tps";
  transform?: number[];
  lambda?: number;
  calibrationPoints?: Array<{
    world: number[]; // [x, y, z]
    pixel: number[]; // [px, py]
  }>;
  transformAxes?: string[];
};

// Just enough of a spot to pull a (world, pixel, weight) constraint out
// of it. Mirrors MapSpot but the dependency points inward so this lib
// stays free of UI-layer types.
export type EditedSpotSource = {
  mapKey: string;
  worldX: number;
  worldY: number;
  worldZ: number;
  pixelX: number;
  pixelY: number;
  editedAt?: string;
};

// Pull edited spots for the given map out of a SpotsByMap-like object.
// Returns the (world, pixel) pairs that are eligible to feed the fit
// under `mode`. Each entry's weight is set by mode.
function eligibleSpotPoints(
  mapKey: string,
  spotsByMap: Record<string, EditedSpotSource[]> | null | undefined,
  mode: CalibrationMode,
): CalibrationPoint[] {
  if (mode === "manual") return [];
  if (!spotsByMap) return [];
  const list = spotsByMap[mapKey] ?? [];
  const weight = mode === "tier-two" ? SPOT_TIER2_WEIGHT : 1;
  return list
    .filter((s) => s.editedAt != null)
    .map((s) => ({
      // Axis convention: MapCalibrate / MapReview / MapEdit all push
      // OW worldX → math worldX, OW worldZ → math worldY, OW worldY →
      // math worldZ. Match it here.
      worldX: s.worldX,
      worldY: s.worldZ,
      worldZ: s.worldY,
      pixelX: s.pixelX,
      pixelY: s.pixelY,
      weight,
    }));
}

// Build a runtime Projection from a calibration entry, optionally
// folding in edited-spot contributions per the active mode.
//
//   - For TPS calibrations: refits the spline with the formal points
//     plus the mode-eligible spot points. Cost: O((N+M)³) Gauss solve;
//     a few ms at N+M ≤ 50.
//   - For affine/homography: the formal transform is used as-is. We
//     don't refit those models to include spots because they wouldn't
//     gain accuracy (they can't bend) and would change the closed-form
//     coefficients in ways that complicate the JSON export.
export function buildProjection(
  cal: CalibrationEntry,
  options: {
    mapKey: string;
    spotsByMap?: Record<string, EditedSpotSource[]> | null;
    mode?: CalibrationMode;
  },
): Projection | null {
  const { mapKey, spotsByMap, mode = "manual" } = options;
  if (cal.projection === "tps") {
    if (!cal.calibrationPoints) return null;
    const formal: CalibrationPoint[] = cal.calibrationPoints.map((cp) => ({
      worldX: cp.world[0],
      worldY: cp.world[2],
      worldZ: cp.world[1],
      pixelX: cp.pixel[0],
      pixelY: cp.pixel[1],
      weight: 1,
    }));
    const extras = eligibleSpotPoints(mapKey, spotsByMap, mode);
    const all = [...formal, ...extras];
    const t = fitTPS(all, cal.lambda ?? TPS_DEFAULT_LAMBDA);
    return t ? { kind: "tps", coeffs: t } : null;
  }
  if (cal.projection === "homography") {
    if (!cal.transform) return null;
    return {
      kind: "homography",
      coeffs: cal.transform as unknown as Homography,
    };
  }
  if (cal.projection === "affine") {
    if (!cal.transform) return null;
    return {
      kind: "affine",
      coeffs: cal.transform as unknown as AffineTransform,
    };
  }
  return null;
}

// Surface the count of contributing edited spots per map so the UI can
// show "+ N spot contributions" badges. Mode-aware: returns 0 in manual.
export function countEditedSpotContributions(
  mapKey: string,
  spotsByMap: Record<string, EditedSpotSource[]> | null | undefined,
  mode: CalibrationMode,
): number {
  return eligibleSpotPoints(mapKey, spotsByMap, mode).length;
}
