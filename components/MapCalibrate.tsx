"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MAPS } from "@/lib/maps";
import {
  applyProjection,
  fitProjection,
  inverseProjection,
  projectionResidual,
  type CalibrationPoint,
  type Projection,
} from "@/lib/affine";
import {
  CALIBRATION_MODE_OPTIONS,
  readCalibrationMode,
  SPOT_TIER2_WEIGHT,
  writeCalibrationMode,
  type CalibrationMode,
  type EditedSpotSource,
} from "@/lib/calibration-mode";
import spotsData from "@/data/spots.json";
import { media } from "@/lib/media";

const SPOTS_BY_MAP = spotsData as unknown as Record<
  string,
  EditedSpotSource[]
>;

type Point = {
  id: string;
  worldX: number;
  worldY: number;
  worldZ: number;
  pixelX: number;
  pixelY: number;
};

type CalibrationData = {
  overheadW: number;
  overheadH: number;
  // Object URL of the dropped image; not persisted across reloads.
  // We persist only points + dimensions in localStorage.
  points: Point[];
};

type StoredCalibration = {
  overheadW: number;
  overheadH: number;
  points: Point[];
};

const STORAGE_KEY = "owdle:map:calibrate:v1";

function loadStored(): Record<string, StoredCalibration> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveStored(data: Record<string, StoredCalibration>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore (quota / private mode)
  }
}

const emptyData = (): CalibrationData => ({
  overheadW: 0,
  overheadH: 0,
  points: [],
});

function newId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
}

// ─────────────────────────────────────────────────────────────────────────
// Geometry helpers for the coverage overlay.
//
// Convex hull (Andrew's monotone chain): the boundary that separates
// "interpolation safe" (inside) from "extrapolation risk" (outside).
// TPS is well-behaved inside the hull and unstable outside.
//
// Point-in-polygon (ray casting): classify a sample point against the
// hull. Used by the heatmap to decide which color regime to apply.
// ─────────────────────────────────────────────────────────────────────────

type Vec2 = [number, number];

function convexHull(points: Vec2[]): Vec2[] {
  if (points.length <= 1) return [...points];
  const pts = points
    .slice()
    .sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]));
  const cross = (O: Vec2, A: Vec2, B: Vec2) =>
    (A[0] - O[0]) * (B[1] - O[1]) - (A[1] - O[1]) * (B[0] - O[0]);
  const lower: Vec2[] = [];
  for (const p of pts) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
    ) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Vec2[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
    ) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function pointInPolygon(pt: Vec2, polygon: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    const intersect =
      yi > pt[1] !== yj > pt[1] &&
      pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function MapCalibrate() {
  const [mapKey, setMapKey] = useState<string>(MAPS[0]?.key ?? "");
  const [byMap, setByMap] = useState<Record<string, CalibrationData>>({});
  // Object URL keyed by mapKey. Lives in component state only — re-drop
  // required after a reload because data URLs blow past localStorage quota
  // for high-res overheads.
  const [overheadUrls, setOverheadUrls] = useState<Record<string, string>>({});
  const [worldX, setWorldX] = useState("");
  const [worldY, setWorldY] = useState("");
  const [worldZ, setWorldZ] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Diagnostic overlay: a uniform world-coord grid projected onto the
  // overhead. Lines should look straight + evenly spaced if the fit is
  // accurate. Bowing or pinching in regions surfaces non-projective
  // distortion the model can't represent (rare with TPS, common with
  // homography on stretched/tilted overheads).
  const [showGrid, setShowGrid] = useState(false);
  // Coverage overlay: convex hull boundary (safe-interpolation region) +
  // density heatmap (distance to nearest control point, mapped to
  // alpha) + suggested-next-point markers (where adding a point would
  // improve coverage the most). Independent toggle from the grid.
  const [showCoverage, setShowCoverage] = useState(false);
  // Calibration mode — controls whether edited spots from spots.json
  // feed back into the live fit, and at what weight. Hydrated from
  // localStorage on mount, persisted on every change. Listens for
  // same-tab change events so flipping the mode here reflects in
  // MapEdit (and vice versa) without a page reload.
  const [mode, setMode] = useState<CalibrationMode>("manual");
  const overheadInputRef = useRef<HTMLInputElement | null>(null);
  const coverageCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    setMode(readCalibrationMode());
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<CalibrationMode>).detail;
      if (detail) setMode(detail);
    };
    window.addEventListener("owdle-calibration-mode-change", onChange);
    return () =>
      window.removeEventListener("owdle-calibration-mode-change", onChange);
  }, []);

  const changeMode = (next: CalibrationMode) => {
    setMode(next);
    writeCalibrationMode(next);
  };

  // Hydrate dimensions + points from localStorage on mount. Image needs
  // re-drop unless the map has a static overheadFile (then we auto-load).
  useEffect(() => {
    const stored = loadStored();
    const next: Record<string, CalibrationData> = {};
    for (const [k, v] of Object.entries(stored)) {
      next[k] = { ...v };
    }
    setByMap(next);
  }, []);

  // Auto-load the static overhead from public/maps/overhead/{key}.{ext}
  // when the selected map has one and we don't already have a URL for it
  // (drag-dropped or previously auto-loaded).
  useEffect(() => {
    if (overheadUrls[mapKey]) return;
    const m = MAPS.find((x) => x.key === mapKey);
    if (!m?.overheadFile) return;
    setOverheadUrls((prev) => {
      if (prev[mapKey]) return prev;
      return { ...prev, [mapKey]: m.overheadFile as string };
    });
  }, [mapKey, overheadUrls]);

  useEffect(() => {
    const stored: Record<string, StoredCalibration> = {};
    for (const [k, d] of Object.entries(byMap)) {
      stored[k] = {
        overheadW: d.overheadW,
        overheadH: d.overheadH,
        points: d.points,
      };
    }
    saveStored(stored);
  }, [byMap]);

  // Revoke object URLs on unmount.
  useEffect(() => {
    return () => {
      for (const url of Object.values(overheadUrls)) {
        URL.revokeObjectURL(url);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const data = byMap[mapKey] ?? emptyData();
  const overheadUrl = overheadUrls[mapKey] ?? null;
  const map = MAPS.find((m) => m.key === mapKey);

  // OW2 coord convention: Y is VERTICAL (height above ground); X and Z
  // are the horizontal plane. The fit maps (X, Z) → (px, py); Y is
  // metadata only (used to disambiguate vertically-stacked spots post-
  // launch). We pass worldZ to the math's `worldY` parameter — the lib
  // is axis-agnostic, the param name is just a label.
  //
  // Auto-picks homography (8 params) when ≥4 points are available;
  // falls back to affine (6 params) at exactly 3.
  // Edited spots for this map, mode-eligible. Manual mode = none;
  // tier-two = downweighted; unconditional = full weight. Recomputes
  // when mode or mapKey changes; spots.json itself is static at bundle
  // time so its identity doesn't change between renders.
  const editedSpotContributors = useMemo<CalibrationPoint[]>(() => {
    if (mode === "manual") return [];
    const list = SPOTS_BY_MAP[mapKey] ?? [];
    const weight = mode === "tier-two" ? SPOT_TIER2_WEIGHT : 1;
    return list
      .filter((s) => s.editedAt != null)
      .map((s) => ({
        worldX: s.worldX,
        worldY: s.worldZ,
        worldZ: s.worldY,
        pixelX: s.pixelX,
        pixelY: s.pixelY,
        weight,
      }));
  }, [mapKey, mode]);

  const projection = useMemo<Projection | null>(() => {
    if (data.points.length < 3) return null;
    // Axis mapping: math worldX ← OW worldX, math worldY ← OW worldZ,
    // math worldZ ← OW worldY (vertical/elevation). For TPS only the
    // 3rd axis is consumed; affine + homography ignore it.
    const formal: CalibrationPoint[] = data.points.map((p) => ({
      worldX: p.worldX,
      worldY: p.worldZ,
      worldZ: p.worldY,
      pixelX: p.pixelX,
      pixelY: p.pixelY,
      weight: 1,
    }));
    return fitProjection([...formal, ...editedSpotContributors]);
  }, [data.points, editedSpotContributors]);

  const updateData = (updater: (d: CalibrationData) => CalibrationData) => {
    setByMap((prev) => ({
      ...prev,
      [mapKey]: updater(prev[mapKey] ?? emptyData()),
    }));
  };

  const ingestOverhead = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Drop an image file (PNG/JPG).");
      return;
    }
    const url = URL.createObjectURL(file);
    setOverheadUrls((prev) => {
      const old = prev[mapKey];
      if (old && old.startsWith("blob:")) URL.revokeObjectURL(old);
      return { ...prev, [mapKey]: url };
    });
    // Reset dimensions; the rendered <img>'s onLoad will fill them in.
    updateData((d) => ({ ...d, overheadW: 0, overheadH: 0 }));
    setError(null);
  };

  const handleOverheadDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) ingestOverhead(f);
  };

  const handleOverheadClick = (e: React.MouseEvent<HTMLImageElement>) => {
    const wx = parseFloat(worldX);
    const wy = parseFloat(worldY);
    const wz = parseFloat(worldZ);
    if (!isFinite(wx) || !isFinite(wy)) {
      setError("Type X and Y world coords first, then click on the overhead.");
      return;
    }
    const img = e.currentTarget;
    const rect = img.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * data.overheadW;
    const py = ((e.clientY - rect.top) / rect.height) * data.overheadH;
    updateData((d) => ({
      ...d,
      points: [
        ...d.points,
        {
          id: newId(),
          worldX: wx,
          worldY: wy,
          worldZ: isFinite(wz) ? wz : 0,
          pixelX: px,
          pixelY: py,
        },
      ],
    }));
    setWorldX("");
    setWorldY("");
    setWorldZ("");
    setError(null);
  };

  const removePoint = (id: string) => {
    updateData((d) => ({
      ...d,
      points: d.points.filter((p) => p.id !== id),
    }));
  };

  // Patch an existing point's world coords in place. Used by the
  // editable row inputs in the points list — lets the user correct a
  // mistyped X/Y/Z without having to delete and re-click the overhead.
  // Pixel position is intentionally left alone.
  const updatePointWorld = (
    id: string,
    patch: { worldX?: number; worldY?: number; worldZ?: number },
  ) => {
    updateData((d) => ({
      ...d,
      points: d.points.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
  };

  const clearMap = () => {
    if (!data.points.length) return;
    if (
      !window.confirm(
        `Discard ${data.points.length} calibration point${
          data.points.length === 1 ? "" : "s"
        } for ${map?.label ?? mapKey}?`,
      )
    ) {
      return;
    }
    // Clear points but keep the loaded overhead. The next session can
    // pick up where this left off without re-loading the image.
    updateData((d) => ({
      overheadW: d.overheadW,
      overheadH: d.overheadH,
      points: [],
    }));
  };

  const exportJson = () => {
    const out: Record<string, unknown> = {};
    for (const [key, d] of Object.entries(byMap)) {
      if (d.points.length < 3) continue;
      const proj = fitProjection(
        d.points.map((p) => ({
          worldX: p.worldX,
          worldY: p.worldZ,
          worldZ: p.worldY,
          pixelX: p.pixelX,
          pixelY: p.pixelY,
        })),
      );
      if (!proj) continue;
      const mapDef = MAPS.find((m) => m.key === key);
      const entry: Record<string, unknown> = {
        overheadFile:
          mapDef?.overheadFile ?? `/maps/overhead/${key}.webp`,
        overheadW: d.overheadW,
        overheadH: d.overheadH,
        // Transform maps (worldX, worldZ) → (pixelX, pixelY). worldY is
        // vertical and not used in the projection — it's stored on each
        // calibrationPoint as elevation metadata only.
        transformAxes: ["worldX", "worldZ"],
        // `kind` is "affine" / "homography" / "tps". The runtime projector
        // (MapReview's buildProjection) dispatches on this.
        projection: proj.kind,
        calibrationPoints: d.points.map((p) => ({
          world: [p.worldX, p.worldY, p.worldZ],
          pixel: [p.pixelX, p.pixelY],
        })),
        calibratedAt: new Date().toISOString(),
      };
      if (proj.kind === "tps") {
        // TPS weights are derived from calibrationPoints + λ at load
        // time, so we don't serialize them — keeps the JSON compact and
        // avoids precision drift if we ever change the fit code.
        entry.lambda = proj.coeffs.lambda;
      } else {
        entry.transform = proj.coeffs;
      }
      out[key] = entry;
    }
    if (Object.keys(out).length === 0) {
      setError("No map has 3+ calibration points yet.");
      return;
    }
    const blob = new Blob([JSON.stringify(out, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "map-calibrations.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const residuals = useMemo(() => {
    if (!projection) return null;
    return data.points.map((p) =>
      projectionResidual(projection, {
        worldX: p.worldX,
        worldY: p.worldZ,
        pixelX: p.pixelX,
        pixelY: p.pixelY,
      }),
    );
  }, [data.points, projection]);

  // Leave-one-out cross-validation residuals. For each point, refit
  // the projection with that point excluded and measure the prediction
  // error at the held-out location. Critical for TPS where the in-fit
  // residual is ~0 at every control point by construction: a misclicked
  // landmark would hide in the in-fit residual but jump out in LOO.
  //
  // For homography/affine, LOO is also informative but adds little
  // beyond the in-fit residual (those models can't bend to absorb a
  // bad click). We compute it uniformly to keep the UI consistent.
  //
  // Only attempted when we have at least N+1 points so the leave-one-out
  // fit still has enough points to be non-degenerate.
  const looResiduals = useMemo<(number | null)[] | null>(() => {
    if (!projection) return null;
    if (data.points.length < 4) return null;
    // Formal points (the ones the user clicked) — these are the points
    // we LOO-test. Edited spot contributors are extra data the fit
    // uses but we don't measure their LOO (they're not authoritative
    // landmarks; their LOO would measure the wrong thing).
    const formal: CalibrationPoint[] = data.points.map((p) => ({
      worldX: p.worldX,
      worldY: p.worldZ,
      worldZ: p.worldY,
      pixelX: p.pixelX,
      pixelY: p.pixelY,
      weight: 1,
    }));
    // For each formal point i, refit on (formal − {i}) ∪ contributors.
    // Mode-aware: in tier-two / unconditional, the extra data helps the
    // refit; in manual mode `editedSpotContributors` is empty and this
    // degenerates to the formal-only LOO.
    return formal.map((_, i) => {
      const subset = [
        ...formal.filter((_, j) => j !== i),
        ...editedSpotContributors,
      ];
      const fit = fitProjection(subset);
      if (!fit) return null;
      return projectionResidual(fit, formal[i]);
    });
  }, [data.points, projection, editedSpotContributors]);

  const meanResidual = residuals
    ? residuals.reduce((a, b) => a + b, 0) / residuals.length
    : 0;
  const maxResidual = residuals ? Math.max(...residuals) : 0;
  // LOO summary — averaged over only the points where LOO succeeded
  // (very small calibrations may have a few nulls).
  const looValid = looResiduals
    ? (looResiduals.filter((r): r is number => r != null))
    : [];
  const meanLooResidual =
    looValid.length > 0
      ? looValid.reduce((a, b) => a + b, 0) / looValid.length
      : 0;
  const maxLooResidual = looValid.length > 0 ? Math.max(...looValid) : 0;
  // Residual color thresholds scale with overhead size — 30 px on a
  // 2500-wide image vs a 5000-wide image are very different relative
  // errors. Express them as fractions of the long edge.
  const longEdge = Math.max(data.overheadW, data.overheadH) || 1;
  const T_PER_POINT_FAR = longEdge * 0.015;
  const T_PER_POINT_OK = longEdge * 0.005;
  const T_MEAN_FAR = longEdge * 0.01;
  const T_MEAN_OK = longEdge * 0.004;
  const T_MAX_FAR = longEdge * 0.015;
  const T_MAX_OK = longEdge * 0.006;

  // World-coord grid for the diagnostic overlay. Each grid line is a
  // polyline sampled along its world-space extent — straight in world
  // space, projected pixel-by-pixel through whatever projection we've
  // fit. A homography keeps lines mathematically straight in pixel
  // space (it preserves lines by construction). TPS bends them — and
  // the bend is exactly the warp the overhead requires for accurate
  // projection. If the bends look reasonable, the fit is healthy. If
  // lines pinch sharply or pile up outside the convex hull of points,
  // that region is being extrapolated and shouldn't be trusted.
  const gridPaths = useMemo(() => {
    if (!projection || data.points.length < 3) return null;
    const step = 20; // world units per cell
    const samples = 32; // samples per polyline (smooth enough for TPS curves)
    const padding = 30; // extend slightly beyond calibration extent
    const xs = data.points.map((p) => p.worldX);
    const zs = data.points.map((p) => p.worldZ);
    const minX = Math.floor((Math.min(...xs) - padding) / step) * step;
    const maxX = Math.ceil((Math.max(...xs) + padding) / step) * step;
    const minZ = Math.floor((Math.min(...zs) - padding) / step) * step;
    const maxZ = Math.ceil((Math.max(...zs) + padding) / step) * step;
    // Grid slice elevation. For TPS the projection depends on Y as a
    // third input; rendering the grid at the mean OW Y of calibration
    // points shows the most representative slice. Affine/homography
    // ignore it.
    const meanY =
      data.points.reduce((s, p) => s + p.worldY, 0) / data.points.length;

    const lines: string[] = [];
    // Constant-X lines (varying Z).
    for (let x = minX; x <= maxX; x += step) {
      const segs: string[] = [];
      for (let i = 0; i <= samples; i++) {
        const z = minZ + ((maxZ - minZ) * i) / samples;
        const [px, py] = applyProjection(projection, x, z, meanY);
        segs.push(`${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`);
      }
      lines.push(segs.join(" "));
    }
    // Constant-Z lines (varying X).
    for (let z = minZ; z <= maxZ; z += step) {
      const segs: string[] = [];
      for (let i = 0; i <= samples; i++) {
        const x = minX + ((maxX - minX) * i) / samples;
        const [px, py] = applyProjection(projection, x, z, meanY);
        segs.push(`${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`);
      }
      lines.push(segs.join(" "));
    }
    return { lines, step, range: { minX, maxX, minZ, maxZ } };
  }, [projection, data.points]);

  // Convex hull of control points in pixel space. Defines the boundary
  // of the "interpolation-safe" region — TPS extrapolates outside this
  // hull and predictions degrade rapidly. Anything you want the answer
  // pin to project to during gameplay should be INSIDE this polygon.
  const hullPx = useMemo<Vec2[] | null>(() => {
    if (data.points.length < 3) return null;
    return convexHull(
      data.points.map((p) => [p.pixelX, p.pixelY] as Vec2),
    );
  }, [data.points]);

  // Suggested next calibration points: locations inside the hull (and
  // within a slight padding of the points' bounding box) that are
  // farthest from any existing control point. Adding a point at one of
  // these spots gives the biggest local coverage gain.
  //
  // Algorithm: sample a coarse grid, keep only candidates inside the
  // hull, sort by min-distance-to-nearest-existing, then non-max-
  // suppress so we don't suggest 3 candidates within the same gap.
  //
  // Estimated world coords come from inverseProjection on the current
  // fit — approximate (the fit IS the thing we're improving), but
  // close enough to tell the user roughly where to fly in free-cam.
  const suggestedPoints = useMemo(() => {
    if (!hullPx || !projection || data.points.length < 3) return null;
    const longEdge = Math.max(data.overheadW, data.overheadH);
    const xs = data.points.map((p) => p.pixelX);
    const ys = data.points.map((p) => p.pixelY);
    const pad = longEdge * 0.04;
    const minX = Math.max(0, Math.min(...xs) - pad);
    const maxX = Math.min(data.overheadW, Math.max(...xs) + pad);
    const minY = Math.max(0, Math.min(...ys) - pad);
    const maxY = Math.min(data.overheadH, Math.max(...ys) + pad);
    const G = 24;
    type Candidate = { x: number; y: number; d: number };
    const candidates: Candidate[] = [];
    for (let gy = 0; gy < G; gy++) {
      for (let gx = 0; gx < G; gx++) {
        const x = minX + ((maxX - minX) * (gx + 0.5)) / G;
        const y = minY + ((maxY - minY) * (gy + 0.5)) / G;
        if (!pointInPolygon([x, y], hullPx)) continue;
        let dMin = Infinity;
        for (const p of data.points) {
          const dx = x - p.pixelX;
          const dy = y - p.pixelY;
          const d = dx * dx + dy * dy;
          if (d < dMin) dMin = d;
        }
        candidates.push({ x, y, d: Math.sqrt(dMin) });
      }
    }
    candidates.sort((a, b) => b.d - a.d);
    const minSep = longEdge * 0.12;
    const picked: Candidate[] = [];
    for (const c of candidates) {
      if (picked.length >= 3) break;
      if (
        picked.every((p) => Math.hypot(p.x - c.x, p.y - c.y) >= minSep)
      ) {
        picked.push(c);
      }
    }
    // For the inverse: use the mean OW worldY of calibration points as
    // the fixedZ. Approximate but good enough for "fly here in free-cam"
    // hints — the user reads precise coords from the in-game HUD when
    // they get there.
    const meanY =
      data.points.reduce((s, p) => s + p.worldY, 0) / data.points.length;
    return picked.map((p, i) => {
      const inv = inverseProjection(projection, p.x, p.y, meanY);
      return {
        id: `suggest-${i}`,
        x: p.x,
        y: p.y,
        dist: p.d,
        estWorldX: inv?.[0] ?? null,
        estWorldZ: inv?.[1] ?? null,
      };
    });
  }, [
    hullPx,
    projection,
    data.points,
    data.overheadW,
    data.overheadH,
  ]);

  // Coverage heatmap rendered imperatively into a canvas. Two regimes:
  //   - Inside hull: orange tint, alpha ramps with distance to nearest
  //     control point. Invisible near points (alpha 0), peaks at ~30%
  //     when distance > 15% of long edge.
  //   - Outside hull: solid red overlay (~30% alpha) — extrapolation
  //     warning, independent of distance.
  //
  // 200×200 internal resolution, CSS-upscaled. Cheap (~40K cells × 8
  // points = 320K ops per redraw, sub-50ms in practice). Redraws on
  // any state change that affects coverage.
  useEffect(() => {
    if (!showCoverage) return;
    const canvas = coverageCanvasRef.current;
    if (!canvas) return;
    const W = 200;
    const H = 200;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const longEdge = Math.max(data.overheadW, data.overheadH);
    if (longEdge <= 0) return;
    const goodDist = longEdge * 0.05;
    const badDist = longEdge * 0.18;
    const imgData = ctx.createImageData(W, H);
    const buf = imgData.data;
    for (let cy = 0; cy < H; cy++) {
      for (let cx = 0; cx < W; cx++) {
        const px = ((cx + 0.5) * data.overheadW) / W;
        const py = ((cy + 0.5) * data.overheadH) / H;
        const idx = (cy * W + cx) * 4;
        const inside = hullPx ? pointInPolygon([px, py], hullPx) : true;
        if (!inside) {
          // Outside hull — extrapolation. Red overlay.
          buf[idx] = 220;
          buf[idx + 1] = 50;
          buf[idx + 2] = 50;
          buf[idx + 3] = 78;
          continue;
        }
        let dMin = Infinity;
        for (const p of data.points) {
          const dx = px - p.pixelX;
          const dy = py - p.pixelY;
          const d = dx * dx + dy * dy;
          if (d < dMin) dMin = d;
        }
        const dist = Math.sqrt(dMin);
        const t = Math.max(
          0,
          Math.min(1, (dist - goodDist) / (badDist - goodDist)),
        );
        const alpha = Math.round(t * 95);
        buf[idx] = 230;
        buf[idx + 1] = 150;
        buf[idx + 2] = 40;
        buf[idx + 3] = alpha;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }, [
    showCoverage,
    data.points,
    hullPx,
    data.overheadW,
    data.overheadH,
  ]);

  const canExport = useMemo(() => {
    return Object.values(byMap).some((d) => d.points.length >= 3);
  }, [byMap]);

  return (
    <main className="min-h-screen bg-bg text-ink">
      <div className="mx-auto max-w-[1800px] px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
        <header className="mb-6 flex items-baseline justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-info">
              OWdle dev tool · map mode
            </p>
            <h1 className="mt-1 font-display text-3xl text-ink sm:text-4xl">
              Calibrate
            </h1>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
            world (X, Y) → overhead pixel (px, py)
          </span>
        </header>

        {error && (
          <div className="mb-4 rounded-(--radius-card) border border-far/40 bg-far/10 px-4 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-far">
              {error}
            </p>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="flex min-w-0 flex-col gap-4">
            {!overheadUrl ? (
              <div
                className="grid h-72 place-items-center rounded-(--radius-card) border-2 border-dashed border-line bg-inset/30 text-center"
                onDrop={handleOverheadDrop}
                onDragOver={(e) => e.preventDefault()}
              >
                <div>
                  <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-soft">
                    Drop overhead PNG for {map?.label ?? "—"}
                  </p>
                  <label className="mt-3 inline-block cursor-pointer rounded-(--radius-card) border border-line px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink transition-colors hover:border-accent hover:text-accent">
                    or choose file
                    <input
                      ref={overheadInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) ingestOverhead(f);
                      }}
                    />
                  </label>
                  <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">
                    statbanana / fandom top-down · processed in-browser
                  </p>
                  {data.points.length > 0 && (
                    <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-accent-soft">
                      {data.points.length} point{data.points.length === 1 ? "" : "s"} saved for this map · re-drop the overhead to keep working
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div
                className="relative overflow-hidden rounded-(--radius-card) border border-line bg-inset/40"
                onDrop={handleOverheadDrop}
                onDragOver={(e) => e.preventDefault()}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={media(overheadUrl)}
                  alt={`${map?.label ?? mapKey} overhead`}
                  onClick={handleOverheadClick}
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    const w = img.naturalWidth;
                    const h = img.naturalHeight;
                    updateData((d) => {
                      if (d.overheadW === w && d.overheadH === h) return d;
                      // Re-running build-overheads at a new resolution
                      // (e.g. 2500 → 5000) shouldn't invalidate prior pin
                      // placements — same image, just more pixels. Rescale
                      // existing points proportionally so they stay locked
                      // to the same landmarks.
                      if (
                        d.overheadW > 0 &&
                        d.overheadH > 0 &&
                        d.points.length > 0
                      ) {
                        const sx = w / d.overheadW;
                        const sy = h / d.overheadH;
                        return {
                          overheadW: w,
                          overheadH: h,
                          points: d.points.map((p) => ({
                            ...p,
                            pixelX: p.pixelX * sx,
                            pixelY: p.pixelY * sy,
                          })),
                        };
                      }
                      return { ...d, overheadW: w, overheadH: h };
                    });
                  }}
                  onError={() => {
                    setError(
                      "Couldn't load the overhead from public/maps/overhead/. Re-run `npm run build-overheads` or drop a PNG.",
                    );
                    setOverheadUrls((prev) => {
                      const next = { ...prev };
                      delete next[mapKey];
                      return next;
                    });
                  }}
                  className="block w-full cursor-crosshair select-none"
                  draggable={false}
                />
                {showCoverage && data.overheadW > 0 && (
                  <canvas
                    ref={coverageCanvasRef}
                    aria-hidden
                    className="pointer-events-none absolute inset-0 h-full w-full"
                    style={{ imageRendering: "pixelated" }}
                  />
                )}
                {data.points.map((p, i) => (
                  <span
                    key={p.id}
                    className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
                    style={{
                      left: `${(p.pixelX / data.overheadW) * 100}%`,
                      top: `${(p.pixelY / data.overheadH) * 100}%`,
                    }}
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent font-mono text-[9px] font-bold text-on-accent shadow-[0_0_0_2px_var(--bg-default)]">
                      {i + 1}
                    </span>
                  </span>
                ))}
                {/* Edited-spot contributors. Smaller, info-colored, no
                    number — visually distinct from formal calibration
                    clicks so it's clear which constraints are which.
                    Tooltip surfaces the underlying world coords + weight. */}
                {editedSpotContributors.map((c, ci) => (
                  <span
                    key={`spot-${ci}`}
                    className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
                    style={{
                      left: `${(c.pixelX / data.overheadW) * 100}%`,
                      top: `${(c.pixelY / data.overheadH) * 100}%`,
                    }}
                    title={`Edited spot · world (${c.worldX.toFixed(1)}, ${(c.worldZ ?? 0).toFixed(1)}, ${c.worldY.toFixed(1)}) · weight ${c.weight ?? 1}`}
                  >
                    <span
                      className="block h-2.5 w-2.5 rounded-full border-2"
                      style={{
                        background: "var(--info)",
                        borderColor: "var(--bg-default)",
                        opacity: (c.weight ?? 1) * 0.6 + 0.4,
                      }}
                    />
                  </span>
                ))}
                {projection && data.overheadW > 0 && data.overheadH > 0 && (
                  <svg
                    className="pointer-events-none absolute inset-0 h-full w-full"
                    viewBox={`0 0 ${data.overheadW} ${data.overheadH}`}
                    preserveAspectRatio="none"
                  >
                    {showGrid && gridPaths && (
                      <g
                        stroke="var(--accent)"
                        strokeOpacity={0.35}
                        strokeWidth={1.2}
                        fill="none"
                        vectorEffect="non-scaling-stroke"
                      >
                        {gridPaths.lines.map((d, gi) => (
                          <path key={`grid-${gi}`} d={d} />
                        ))}
                      </g>
                    )}
                    {showCoverage && hullPx && hullPx.length >= 3 && (
                      <polygon
                        points={hullPx
                          .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
                          .join(" ")}
                        stroke="var(--correct)"
                        strokeWidth={2.5}
                        strokeOpacity={0.85}
                        strokeDasharray="14 8"
                        fill="none"
                        vectorEffect="non-scaling-stroke"
                      />
                    )}
                    {showCoverage &&
                      suggestedPoints &&
                      suggestedPoints.map((sp, si) => {
                        // Marker size in image-pixel space — scales with
                        // overhead long edge so the cross is similarly
                        // sized regardless of map resolution.
                        const r = Math.max(data.overheadW, data.overheadH) * 0.012;
                        return (
                          <g key={sp.id}>
                            <title>
                              {sp.estWorldX != null && sp.estWorldZ != null
                                ? `Suggested point ${si + 1} — fly free-cam to roughly worldX ${sp.estWorldX.toFixed(0)}, worldZ ${sp.estWorldZ.toFixed(0)}, then click the matching landmark here.`
                                : `Suggested point ${si + 1} — coverage gap.`}
                            </title>
                            <circle
                              cx={sp.x}
                              cy={sp.y}
                              r={r * 1.5}
                              fill="var(--info)"
                              fillOpacity={0.15}
                              stroke="var(--info)"
                              strokeWidth={2}
                              strokeDasharray="6 4"
                              vectorEffect="non-scaling-stroke"
                            />
                            <line
                              x1={sp.x - r}
                              y1={sp.y}
                              x2={sp.x + r}
                              y2={sp.y}
                              stroke="var(--info)"
                              strokeWidth={2.5}
                              vectorEffect="non-scaling-stroke"
                            />
                            <line
                              x1={sp.x}
                              y1={sp.y - r}
                              x2={sp.x}
                              y2={sp.y + r}
                              stroke="var(--info)"
                              strokeWidth={2.5}
                              vectorEffect="non-scaling-stroke"
                            />
                          </g>
                        );
                      })}
                    {data.points.map((p, i) => {
                      const [predX, predY] = applyProjection(
                        projection,
                        p.worldX,
                        p.worldZ,
                        p.worldY,
                      );
                      // Color by the most-informative residual: LOO when
                      // available (catches misclicks even on TPS), else
                      // the in-fit residual.
                      const r =
                        looResiduals?.[i] != null
                          ? (looResiduals[i] as number)
                          : (residuals?.[i] ?? 0);
                      const color =
                        r > T_PER_POINT_FAR
                          ? "var(--tile-far)"
                          : r > T_PER_POINT_OK
                            ? "var(--accent-soft)"
                            : "var(--tile-correct)";
                      return (
                        <g key={`pred-${p.id}`}>
                          <line
                            x1={p.pixelX}
                            y1={p.pixelY}
                            x2={predX}
                            y2={predY}
                            stroke={color}
                            strokeWidth={2}
                            strokeOpacity={0.85}
                            vectorEffect="non-scaling-stroke"
                            strokeLinecap="round"
                          />
                          <circle
                            cx={predX}
                            cy={predY}
                            r={4}
                            fill={color}
                            stroke="var(--bg-base)"
                            strokeWidth={1}
                            vectorEffect="non-scaling-stroke"
                          />
                        </g>
                      );
                    })}
                  </svg>
                )}
              </div>
            )}

            <div className="rounded-(--radius-card) border border-line bg-inset/30 p-3 font-mono text-[10px] leading-relaxed tracking-[0.14em] text-ink-faint">
              <span className="text-ink-soft">How to calibrate:</span> in
              Overwatch free-cam, fly to a recognizable landmark (gate, statue,
              health pack). Read the <span className="text-accent-soft">POS (X, Y, Z)</span>{" "}
              from the top-right HUD. Type X / Y / Z below, then click the
              same spot on the overhead. Repeat 4+ times, spread across the
              map. <span className="text-ink-soft">Y is vertical (height)</span>;
              the affine fit uses X and Z. Y is stored as elevation metadata
              for vertically-stacked spots.
            </div>
          </div>

          <aside className="flex h-fit flex-col gap-3 rounded-(--radius-card) border border-line bg-inset/40 p-4">
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">
                Map
              </span>
              <select
                value={mapKey}
                onChange={(e) => setMapKey(e.target.value)}
                className="rounded-(--radius-card) border border-line bg-inset/60 px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              >
                {MAPS.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>

            {/* Calibration mode — folds edit-page corrections into the
                live fit at the chosen weight. Shared with MapEdit and
                MapReview via localStorage. */}
            <div className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">
                Mode
              </span>
              <div className="flex overflow-hidden rounded-(--radius-card) border border-line">
                {CALIBRATION_MODE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => changeMode(opt.value)}
                    title={opt.description}
                    aria-pressed={mode === opt.value}
                    className={
                      "flex-1 px-2 py-1.5 font-mono text-[9px] uppercase tracking-[0.16em] transition-colors " +
                      (mode === opt.value
                        ? "bg-accent text-on-accent"
                        : "bg-inset/40 text-ink-faint hover:text-ink")
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {editedSpotContributors.length > 0 && (
                <p className="font-mono text-[9px] tracking-[0.16em] text-info">
                  + {editedSpotContributors.length} edited spot
                  {editedSpotContributors.length === 1 ? "" : "s"} feeding the
                  fit
                  {mode === "tier-two" ? ` @ ${SPOT_TIER2_WEIGHT}×` : ""}{" "}
                  · shown as small blue dots on the overhead
                </p>
              )}
              {mode !== "manual" && editedSpotContributors.length === 0 && (
                <p className="font-mono text-[9px] leading-tight tracking-[0.16em] text-ink-faint">
                  No edited spots for {map?.label ?? mapKey} yet.{" "}
                  {(SPOTS_BY_MAP[mapKey] ?? []).length > 0 ? (
                    <span className="text-accent-soft">
                      {(SPOTS_BY_MAP[mapKey] ?? []).length} spot
                      {(SPOTS_BY_MAP[mapKey] ?? []).length === 1 ? "" : "s"}{" "}
                      exist but none have an editedAt timestamp — drag a pin
                      on /labeler/map/edit and save to mark one.
                    </span>
                  ) : (
                    <span>
                      Capture spots via MapReview first, then edit on
                      /labeler/map/edit.
                    </span>
                  )}
                </p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <label className="flex flex-col gap-1">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">
                  X
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={worldX}
                  onChange={(e) => setWorldX(e.target.value)}
                  placeholder="-60.37"
                  className="rounded-(--radius-card) border border-line bg-inset/60 px-2 py-2 text-sm text-ink outline-none focus:border-accent"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">
                  Y
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={worldY}
                  onChange={(e) => setWorldY(e.target.value)}
                  placeholder="5.71"
                  className="rounded-(--radius-card) border border-line bg-inset/60 px-2 py-2 text-sm text-ink outline-none focus:border-accent"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">
                  Z
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={worldZ}
                  onChange={(e) => setWorldZ(e.target.value)}
                  placeholder="-33.57"
                  className="rounded-(--radius-card) border border-line bg-inset/60 px-2 py-2 text-sm text-ink outline-none focus:border-accent"
                />
              </label>
            </div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
              Then click the matching spot on the overhead.
            </p>

            <div className="border-t border-line pt-3">
              <div className="flex items-baseline justify-between">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-info">
                  Points
                </p>
                <span className="font-mono text-[10px] tracking-[0.18em] text-ink-faint">
                  {data.points.length}
                  {projection ? (
                    <span
                      className={
                        "ml-1 " +
                        (projection.kind === "tps"
                          ? "text-correct"
                          : "text-accent-soft")
                      }
                      title={
                        projection.kind === "tps"
                          ? "Regularized thin-plate spline. Smoothly bends to follow non-projective distortion in the overhead. In-fit residuals are ~0 by construction (with λ=1, sub-pixel) — read the LOO residuals to spot misclicks. Extrapolation outside the convex hull of points is unreliable, so spread your points to cover the playable area."
                          : projection.kind === "homography"
                            ? "8-param projective fit. Lines stay straight under the projection. Handles uniform tilt + scale; can't capture regional stretching."
                            : "6-param affine fit. Translation + rotation + scale + shear. Exact at 3 points — add more to start validating."
                      }
                    >
                      · {projection.kind}
                      {projection.kind === "affine" &&
                        data.points.length === 3 &&
                        ", exact"}
                      {projection.kind === "homography" &&
                        data.points.length === 4 &&
                        ", exact"}
                      {projection.kind !== "affine" &&
                        data.points.length >= 5 &&
                        ", fit ok"}
                    </span>
                  ) : null}
                  {data.points.length > 0 && data.points.length < 3 && (
                    <span className="ml-1 text-accent-soft">
                      · need {3 - data.points.length} more
                    </span>
                  )}
                </span>
              </div>

              {data.points.length === 0 ? (
                <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
                  None yet.
                </p>
              ) : (
                <ul className="mt-2 flex max-h-[40vh] flex-col gap-1 overflow-y-auto pr-1">
                  {data.points.map((p, i) => (
                    <CalibrationPointRow
                      key={p.id}
                      point={p}
                      index={i}
                      residual={residuals?.[i] ?? null}
                      looResidual={looResiduals?.[i] ?? null}
                      showInFitResidual={projection?.kind !== "tps"}
                      tFar={T_PER_POINT_FAR}
                      tOk={T_PER_POINT_OK}
                      onUpdate={(patch) => updatePointWorld(p.id, patch)}
                      onRemove={() => removePoint(p.id)}
                    />
                  ))}
                </ul>
              )}

              {projection && residuals && (
                <div className="mt-2 space-y-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
                  {projection.kind !== "tps" && (
                    <div>
                      Fit residual mean{" "}
                      <span
                        className={
                          meanResidual > T_MEAN_FAR
                            ? "text-far"
                            : meanResidual > T_MEAN_OK
                              ? "text-accent-soft"
                              : "text-correct"
                        }
                      >
                        {meanResidual.toFixed(1)}px
                      </span>{" "}
                      · max{" "}
                      <span
                        className={
                          maxResidual > T_MAX_FAR
                            ? "text-far"
                            : maxResidual > T_MAX_OK
                              ? "text-accent-soft"
                              : "text-correct"
                        }
                      >
                        {maxResidual.toFixed(1)}px
                      </span>
                    </div>
                  )}
                  {looValid.length > 0 && (
                    <div>
                      LOO residual mean{" "}
                      <span
                        className={
                          meanLooResidual > T_MEAN_FAR
                            ? "text-far"
                            : meanLooResidual > T_MEAN_OK
                              ? "text-accent-soft"
                              : "text-correct"
                        }
                      >
                        {meanLooResidual.toFixed(1)}px
                      </span>{" "}
                      · max{" "}
                      <span
                        className={
                          maxLooResidual > T_MAX_FAR
                            ? "text-far"
                            : maxLooResidual > T_MAX_OK
                              ? "text-accent-soft"
                              : "text-correct"
                        }
                      >
                        {maxLooResidual.toFixed(1)}px
                      </span>
                      <span className="ml-1 text-ink-faint/60 normal-case tracking-[0.05em]">
                        — refit each point without it &amp; measure prediction
                      </span>
                    </div>
                  )}
                </div>
              )}

              {projection && (gridPaths || hullPx) && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {gridPaths && (
                    <button
                      type="button"
                      onClick={() => setShowGrid((g) => !g)}
                      className={
                        "rounded-(--radius-card) border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors " +
                        (showGrid
                          ? "border-accent bg-accent/15 text-accent"
                          : "border-line text-ink-faint hover:border-accent hover:text-accent")
                      }
                      title="Overlay a world-coord grid on the overhead. Lines should look smooth and evenly spaced if the fit is healthy; sharp bowing/pinching = warp the model can't represent."
                    >
                      Grid {showGrid ? "on" : "off"} · step {gridPaths.step} w.u.
                    </button>
                  )}
                  {hullPx && (
                    <button
                      type="button"
                      onClick={() => setShowCoverage((c) => !c)}
                      className={
                        "rounded-(--radius-card) border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors " +
                        (showCoverage
                          ? "border-info bg-info/15 text-info"
                          : "border-line text-ink-faint hover:border-info hover:text-info")
                      }
                      title="Show calibration coverage. Green dashed outline = convex hull (interpolation-safe region). Orange tint = sparse coverage inside the hull. Solid red tint = outside the hull (extrapolation, projection unreliable). Blue '+' markers = suggested next points; hover for estimated world coords to fly free-cam to."
                    >
                      Coverage {showCoverage ? "on" : "off"}
                    </button>
                  )}
                </div>
              )}
              {showCoverage && suggestedPoints && suggestedPoints.length > 0 && (
                <ul className="mt-2 space-y-0.5 font-mono text-[10px] tracking-[0.16em] text-ink-faint">
                  {suggestedPoints.map((sp, si) => (
                    <li key={sp.id}>
                      <span className="text-info">+ {si + 1}</span>{" "}
                      {sp.estWorldX != null && sp.estWorldZ != null ? (
                        <>
                          fly to approx{" "}
                          <span className="text-ink-soft">
                            ({sp.estWorldX.toFixed(0)}, ?,{" "}
                            {sp.estWorldZ.toFixed(0)})
                          </span>
                        </>
                      ) : (
                        <span className="text-ink-faint">coverage gap</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex flex-col gap-2 border-t border-line pt-3">
              <button
                type="button"
                onClick={exportJson}
                disabled={!canExport}
                className="rounded-(--radius-card) bg-accent px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Export map-calibrations.json
              </button>
              {data.points.length > 0 && (
                <button
                  type="button"
                  onClick={clearMap}
                  className="self-start font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint hover:text-far"
                >
                  Clear this map
                </button>
              )}
            </div>

            <div className="mt-2 border-t border-line pt-3 font-mono text-[9px] leading-relaxed tracking-[0.14em] text-ink-faint">
              Points persist in localStorage. Overhead image needs re-drop
              after reload (too heavy for storage). Drop the exported JSON
              into <code className="text-ink-soft">data/map-calibrations.json</code>.
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// One row in the calibration points list — inline-editable X / Y / Z.
//
// Draft state lives per-row so a half-typed value doesn't churn the fit
// on every keystroke. Commit on blur or Enter; revert on Escape or on
// parse failure. Re-syncs from props whenever the underlying point
// changes (e.g. a different point's edit propagated, or the rescale-on-
// load adjusted coords) so the visible numbers stay accurate.
// ─────────────────────────────────────────────────────────────────────────
function CalibrationPointRow(props: {
  point: Point;
  index: number;
  residual: number | null;
  looResidual: number | null;
  showInFitResidual: boolean;
  tFar: number;
  tOk: number;
  onUpdate: (patch: { worldX?: number; worldY?: number; worldZ?: number }) => void;
  onRemove: () => void;
}) {
  const {
    point,
    index,
    residual,
    looResidual,
    showInFitResidual,
    tFar,
    tOk,
    onUpdate,
    onRemove,
  } = props;

  const [draftX, setDraftX] = useState(point.worldX.toFixed(2));
  const [draftY, setDraftY] = useState(point.worldY.toFixed(2));
  const [draftZ, setDraftZ] = useState(point.worldZ.toFixed(2));

  useEffect(() => {
    setDraftX(point.worldX.toFixed(2));
    setDraftY(point.worldY.toFixed(2));
    setDraftZ(point.worldZ.toFixed(2));
  }, [point.id, point.worldX, point.worldY, point.worldZ]);

  const colorFor = (r: number | null): string => {
    if (r == null) return "text-ink-faint";
    if (r > tFar) return "text-far";
    if (r > tOk) return "text-accent-soft";
    return "text-correct";
  };

  // Commit one axis. Parse the draft; revert if invalid.
  const commit = (
    axis: "worldX" | "worldY" | "worldZ",
    draft: string,
    setter: (v: string) => void,
  ) => {
    const v = parseFloat(draft);
    if (!isFinite(v)) {
      // Bad input — restore the canonical value and bail.
      setter(point[axis].toFixed(2));
      return;
    }
    if (v === point[axis]) return; // no-op
    onUpdate({ [axis]: v });
  };

  const inputCls =
    "w-16 rounded-sm border border-line/60 bg-bg/60 px-1 py-0.5 font-mono text-[10px] tracking-[0.08em] text-ink outline-none focus:border-accent";

  return (
    <li className="flex items-start justify-between gap-2 rounded-sm border border-line/60 px-2 py-1.5 transition-colors hover:border-accent/40">
      <div className="flex min-w-0 items-start gap-2">
        <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent font-mono text-[9px] font-bold text-on-accent">
          {index + 1}
        </span>
        <div className="flex min-w-0 flex-col gap-1 font-mono text-[10px] tracking-[0.14em] text-ink-soft">
          <div className="flex items-center gap-1">
            <input
              type="text"
              inputMode="decimal"
              aria-label={`Point ${index + 1} world X`}
              value={draftX}
              onChange={(e) => setDraftX(e.target.value)}
              onBlur={() => commit("worldX", draftX, setDraftX)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  (e.target as HTMLInputElement).blur();
                } else if (e.key === "Escape") {
                  setDraftX(point.worldX.toFixed(2));
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className={inputCls}
            />
            <input
              type="text"
              inputMode="decimal"
              aria-label={`Point ${index + 1} world Y`}
              value={draftY}
              onChange={(e) => setDraftY(e.target.value)}
              onBlur={() => commit("worldY", draftY, setDraftY)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  (e.target as HTMLInputElement).blur();
                } else if (e.key === "Escape") {
                  setDraftY(point.worldY.toFixed(2));
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className={inputCls}
            />
            <input
              type="text"
              inputMode="decimal"
              aria-label={`Point ${index + 1} world Z`}
              value={draftZ}
              onChange={(e) => setDraftZ(e.target.value)}
              onBlur={() => commit("worldZ", draftZ, setDraftZ)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  (e.target as HTMLInputElement).blur();
                } else if (e.key === "Escape") {
                  setDraftZ(point.worldZ.toFixed(2));
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className={inputCls}
            />
          </div>
          <div className="text-ink-faint">
            → ({Math.round(point.pixelX)}, {Math.round(point.pixelY)})
            {showInFitResidual && residual != null && (
              <span className={"ml-2 " + colorFor(residual)}>
                err {residual.toFixed(1)}px
              </span>
            )}
            {looResidual != null && (
              <span
                className={"ml-2 " + colorFor(looResidual)}
                title="Leave-one-out residual: refit without this point and measure prediction error. Surfaces misclicks that the in-fit residual would absorb."
              >
                loo {looResidual.toFixed(1)}px
              </span>
            )}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="font-mono text-base leading-none text-ink-faint hover:text-far"
        aria-label="Delete point"
      >
        ×
      </button>
    </li>
  );
}
