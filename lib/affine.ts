// 2D world (X, Y) → overhead (pixelX, pixelY) projection.
//
// Three flavors:
//
//   AFFINE (6 params; needs ≥3 points to solve, ≥4 to get a non-zero residual):
//     pixelX = a·X + b·Y + c
//     pixelY = d·X + e·Y + f
//   Captures rotation + non-uniform scale + shear + translation. Mathematically
//   exact for any orthographic top-down. Falls short on perspective.
//
//   HOMOGRAPHY (8 params; needs ≥4 to solve, ≥5 for a non-zero residual):
//     pixelX = (a·X + b·Y + c) / (g·X + h·Y + 1)
//     pixelY = (d·X + e·Y + f) / (g·X + h·Y + 1)
//   Adds projective foreshortening — handles a render shot from a slightly
//   tilted overhead camera. Strictly more general than affine; reduces to
//   affine when g=h=0.
//
//   TPS (regularized thin-plate spline; needs ≥6 points to be meaningful):
//     pixelX = a0 + a1·X + a2·Y + Σ wi · φ(||(X,Y) - (xi,yi)||)
//     pixelY = b0 + b1·X + b2·Y + Σ vi · φ(||(X,Y) - (xi,yi)||)
//   where φ(r) = r²·log(r) is the biharmonic kernel. Handles smooth
//   non-linear warps: the regional stretching + tilt artifacts in
//   Liquipedia overheads that homography can't represent. λ > 0 leaves
//   small residuals at control points so misclicks stay diagnostic;
//   exact-fit (λ=0) interpolates control points exactly and hides bad
//   clicks. We default to a small λ for diagnostic safety.
//
// Auto-pick: ≥6 points use TPS, ≥4 use homography, exactly 3 fall back
// to affine. All three go through least-squares normal equations +
// Gaussian elimination — no external matrix library. Ill-conditioning
// isn't an issue at our scales (5–15 points, world coords in tens,
// pixel coords in thousands).

export type AffineTransform = readonly [
  number, number, number,
  number, number, number,
];

// Eight parameters. Implied 9th element is 1 (h33), the standard
// normalization for the projective matrix.
export type Homography = readonly [
  number, number, number,
  number, number, number,
  number, number,
];

// Fitted TPS state. 3D-input: the kernel runs in (worldX, worldY, worldZ)
// and the affine block has 4 terms per output (a0 + a1·x + a2·y + a3·z).
// We carry the original control point coordinates alongside the solved
// weights because evaluating φ() at runtime needs distances from every
// control point. `lambda` is echoed so callers can serialize and re-fit
// deterministically.
//
// Why 3D: tilted overhead renders (Statbanana/Liquipedia outputs are
// rarely perfectly orthographic) produce a Y-dependent pixel shift on
// elevated landmarks. The affine block captures the bulk of that shift
// linearly; the kernel handles the smaller non-linear residuals.
//
// Caller convention: OWdle maps OW's worldY (vertical/elevation) onto
// the math library's `worldZ` slot. The library itself is axis-agnostic.
export type TPSCoeffs = {
  controlX: number[];                            // length N
  controlY: number[];                            // length N
  controlZ: number[];                            // length N — third input axis
  wX: number[];                                  // kernel weights for output pixelX
  wY: number[];                                  // kernel weights for output pixelY
  aX: readonly [number, number, number, number]; // a0 + a1·x + a2·y + a3·z
  aY: readonly [number, number, number, number];
  lambda: number;
};

export type Projection =
  | { kind: "affine"; coeffs: AffineTransform }
  | { kind: "homography"; coeffs: Homography }
  | { kind: "tps"; coeffs: TPSCoeffs };

// Default regularization. Small positive λ keeps fit nearly-interpolating
// at control points (sub-pixel residuals at ~50-world-unit spacing) while
// preserving a diagnostic signal — see drawback #1 in the TPS comment.
export const TPS_DEFAULT_LAMBDA = 1.0;

// Minimum points before TPS is preferred over homography. 3D TPS needs
// ≥5 to be over-determined (4 affine + ≥1 kernel) but we want some
// margin so the kernel block has multiple constraints in each axis
// direction. Below this, homography is the safer default.
export const TPS_MIN_POINTS = 7;

export type CalibrationPoint = {
  worldX: number;
  worldY: number;
  // Third input axis. Optional so legacy 2D callers (affine + homography
  // fits, which ignore the 3rd dim) don't need to thread it through.
  // Required for TPS fits — caller convention is to put OW's vertical Y
  // here. Treated as 0 if absent.
  worldZ?: number;
  pixelX: number;
  pixelY: number;
  // Per-point fit weight. Default = 1.0. Used by TPS to downweight
  // lower-quality contributors (e.g. spots that the user dragged on the
  // edit page — they're real (world, pixel) constraints but not as
  // authoritative as deliberate landmark calibration clicks). Affects
  // the least-squares row scale: row · sqrt(weight), so a 0.25 weight
  // gives the point half the pull of a regular calibration point.
  weight?: number;
};

// ─────────────────────────────────────────────────────────────────────────
// Linear algebra primitives
// ─────────────────────────────────────────────────────────────────────────

// Gaussian elimination with partial pivoting. Solves M·x = y in place
// (on copies). Returns null on singular systems.
function solveLinear(M: number[][], y: number[]): number[] | null {
  const n = M.length;
  if (n === 0) return [];
  const m = M.map((row, i) => [...row, y[i]]);
  for (let i = 0; i < n; i++) {
    let pivot = i;
    for (let r = i + 1; r < n; r++) {
      if (Math.abs(m[r][i]) > Math.abs(m[pivot][i])) pivot = r;
    }
    if (Math.abs(m[pivot][i]) < 1e-12) return null;
    [m[i], m[pivot]] = [m[pivot], m[i]];
    for (let r = i + 1; r < n; r++) {
      const factor = m[r][i] / m[i][i];
      for (let c = i; c <= n; c++) m[r][c] -= factor * m[i][c];
    }
  }
  const x: number[] = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = m[i][n];
    for (let c = i + 1; c < n; c++) s -= m[i][c] * x[c];
    x[i] = s / m[i][i];
  }
  return x;
}

// ─────────────────────────────────────────────────────────────────────────
// Affine
// ─────────────────────────────────────────────────────────────────────────

function leastSquares3(
  rows: number[][],
  targets: number[],
): [number, number, number] | null {
  const ATA: number[][] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const ATb: number[] = [0, 0, 0];
  for (let i = 0; i < rows.length; i++) {
    for (let r = 0; r < 3; r++) {
      ATb[r] += rows[i][r] * targets[i];
      for (let c = 0; c < 3; c++) {
        ATA[r][c] += rows[i][r] * rows[i][c];
      }
    }
  }
  const sol = solveLinear(ATA, ATb);
  if (!sol) return null;
  return [sol[0], sol[1], sol[2]];
}

export function fitAffine(
  points: CalibrationPoint[],
): AffineTransform | null {
  if (points.length < 3) return null;
  const A = points.map((p) => [p.worldX, p.worldY, 1]);
  const xCoeffs = leastSquares3(
    A,
    points.map((p) => p.pixelX),
  );
  const yCoeffs = leastSquares3(
    A,
    points.map((p) => p.pixelY),
  );
  if (!xCoeffs || !yCoeffs) return null;
  return [
    xCoeffs[0], xCoeffs[1], xCoeffs[2],
    yCoeffs[0], yCoeffs[1], yCoeffs[2],
  ];
}

export function applyAffine(
  t: AffineTransform,
  worldX: number,
  worldY: number,
): [number, number] {
  return [
    t[0] * worldX + t[1] * worldY + t[2],
    t[3] * worldX + t[4] * worldY + t[5],
  ];
}

export function residual(
  t: AffineTransform,
  point: CalibrationPoint,
): number {
  const [px, py] = applyAffine(t, point.worldX, point.worldY);
  const dx = px - point.pixelX;
  const dy = py - point.pixelY;
  return Math.sqrt(dx * dx + dy * dy);
}

// ─────────────────────────────────────────────────────────────────────────
// Homography
// ─────────────────────────────────────────────────────────────────────────

export function fitHomography(
  points: CalibrationPoint[],
): Homography | null {
  const n = points.length;
  if (n < 4) return null;

  // Direct Linear Transformation. For each point, the homography
  //   pX = (a·x + b·y + c) / (g·x + h·y + 1)
  //   pY = (d·x + e·y + f) / (g·x + h·y + 1)
  // cross-multiplies to two linear equations in [a..h]:
  //   a·x + b·y + c           - g·x·pX - h·y·pX = pX
  //              d·x + e·y + f - g·x·pY - h·y·pY = pY
  // Stack them into a 2N×8 system, then solve via the normal equations.

  const SIZE = 8;
  const ATA: number[][] = Array.from({ length: SIZE }, () =>
    new Array<number>(SIZE).fill(0),
  );
  const ATb: number[] = new Array<number>(SIZE).fill(0);

  const accumulate = (row: number[], target: number) => {
    for (let i = 0; i < SIZE; i++) {
      ATb[i] += row[i] * target;
      for (let j = 0; j < SIZE; j++) {
        ATA[i][j] += row[i] * row[j];
      }
    }
  };

  for (const p of points) {
    accumulate(
      [
        p.worldX, p.worldY, 1, 0, 0, 0,
        -p.worldX * p.pixelX, -p.worldY * p.pixelX,
      ],
      p.pixelX,
    );
    accumulate(
      [
        0, 0, 0, p.worldX, p.worldY, 1,
        -p.worldX * p.pixelY, -p.worldY * p.pixelY,
      ],
      p.pixelY,
    );
  }

  const sol = solveLinear(ATA, ATb);
  if (!sol) return null;
  return [
    sol[0], sol[1], sol[2],
    sol[3], sol[4], sol[5],
    sol[6], sol[7],
  ];
}

export function applyHomography(
  t: Homography,
  worldX: number,
  worldY: number,
): [number, number] {
  const denom = t[6] * worldX + t[7] * worldY + 1;
  if (Math.abs(denom) < 1e-12) return [0, 0];
  return [
    (t[0] * worldX + t[1] * worldY + t[2]) / denom,
    (t[3] * worldX + t[4] * worldY + t[5]) / denom,
  ];
}

export function homographyResidual(
  t: Homography,
  point: CalibrationPoint,
): number {
  const [px, py] = applyHomography(t, point.worldX, point.worldY);
  const dx = px - point.pixelX;
  const dy = py - point.pixelY;
  return Math.sqrt(dx * dx + dy * dy);
}

// ─────────────────────────────────────────────────────────────────────────
// Thin-plate spline (regularized)
//
// Solves a (N+3)×(N+3) linear system per output dimension:
//   [ K + λ·I   P ] [w]   [target]
//   [ Pᵀ        0 ] [a] = [  0   ]
// where K[i,j] = φ(‖pᵢ − pⱼ‖²), P[i,:] = (1, xᵢ, yᵢ), and the bottom-3
// constraint rows enforce affine compatibility (Σwᵢ = 0, Σwᵢ·xᵢ = 0,
// Σwᵢ·yᵢ = 0) so the spline doesn't grow unboundedly at infinity.
//
// λ > 0 perturbs the diagonal of K, which loosens the exact-interpolation
// constraint: small residuals at control points become possible, which
// preserves the per-point error as a diagnostic. λ = 0 collapses back to
// exact interpolation (residual is identically zero at every control
// point, regardless of click accuracy).
// ─────────────────────────────────────────────────────────────────────────

// Biharmonic kernel evaluated at squared distance.
// φ(r) = r²·log(r) = ½·r²·log(r²). The squared-distance form avoids a
// sqrt and is numerically friendlier near r=0.
function tpsKernel(r2: number): number {
  if (r2 < 1e-12) return 0;
  return 0.5 * r2 * Math.log(r2);
}

export function fitTPS(
  points: CalibrationPoint[],
  lambda: number = TPS_DEFAULT_LAMBDA,
): TPSCoeffs | null {
  const N = points.length;
  // 3D TPS needs at least 5 points to be over-determined (4 affine + 1
  // kernel). Below that the system is under-constrained.
  if (N < 5) return null;

  // Build the (N+4)×(N+4) coefficient matrix shared by both output
  // dimensions. Same M, different RHS for X and Y.
  const size = N + 4;
  const buildM = (): number[][] => {
    const M: number[][] = Array.from({ length: size }, () =>
      new Array<number>(size).fill(0),
    );
    // Top-left N×N: K + λI. K is the 3D radial kernel evaluated on
    // squared Euclidean distance between control points.
    //
    // Per-point weighting: the diagonal regularization at row i is
    // λ / wᵢ instead of λ. wᵢ = 1 (default) gives the standard fit;
    // wᵢ < 1 inflates the diagonal so the fit applies more local
    // smoothing there → the point contributes a softer nudge rather
    // than an exact pull. Used by the spot-feedback pipeline to fold
    // edit-page corrections into the calibration at a chosen weight.
    for (let i = 0; i < N; i++) {
      const wi = points[i].weight ?? 1;
      M[i][i] = lambda / (wi > 0 ? wi : 1);
      for (let j = 0; j < N; j++) {
        if (i === j) continue;
        const dx = points[i].worldX - points[j].worldX;
        const dy = points[i].worldY - points[j].worldY;
        const dz = (points[i].worldZ ?? 0) - (points[j].worldZ ?? 0);
        M[i][j] = tpsKernel(dx * dx + dy * dy + dz * dz);
      }
    }
    // P (top-right N×4) and Pᵀ (bottom-left 4×N). [1, xᵢ, yᵢ, zᵢ] per
    // row enforces the affine compatibility constraints — without
    // them, the kernel weights have no constraint and the spline can
    // grow unboundedly at infinity along any axis.
    for (let i = 0; i < N; i++) {
      const z = points[i].worldZ ?? 0;
      M[i][N] = 1;
      M[i][N + 1] = points[i].worldX;
      M[i][N + 2] = points[i].worldY;
      M[i][N + 3] = z;
      M[N][i] = 1;
      M[N + 1][i] = points[i].worldX;
      M[N + 2][i] = points[i].worldY;
      M[N + 3][i] = z;
    }
    return M;
  };

  const rhsX: number[] = new Array<number>(size).fill(0);
  const rhsY: number[] = new Array<number>(size).fill(0);
  for (let i = 0; i < N; i++) {
    rhsX[i] = points[i].pixelX;
    rhsY[i] = points[i].pixelY;
  }

  // Two independent solves — solveLinear mutates so build M twice.
  const solX = solveLinear(buildM(), rhsX);
  const solY = solveLinear(buildM(), rhsY);
  if (!solX || !solY) return null;

  return {
    controlX: points.map((p) => p.worldX),
    controlY: points.map((p) => p.worldY),
    controlZ: points.map((p) => p.worldZ ?? 0),
    wX: solX.slice(0, N),
    wY: solY.slice(0, N),
    aX: [solX[N], solX[N + 1], solX[N + 2], solX[N + 3]] as const,
    aY: [solY[N], solY[N + 1], solY[N + 2], solY[N + 3]] as const,
    lambda,
  };
}

export function applyTPS(
  t: TPSCoeffs,
  worldX: number,
  worldY: number,
  worldZ: number = 0,
): [number, number] {
  let px =
    t.aX[0] + t.aX[1] * worldX + t.aX[2] * worldY + t.aX[3] * worldZ;
  let py =
    t.aY[0] + t.aY[1] * worldX + t.aY[2] * worldY + t.aY[3] * worldZ;
  for (let i = 0; i < t.controlX.length; i++) {
    const dx = worldX - t.controlX[i];
    const dy = worldY - t.controlY[i];
    const dz = worldZ - t.controlZ[i];
    const k = tpsKernel(dx * dx + dy * dy + dz * dz);
    px += t.wX[i] * k;
    py += t.wY[i] * k;
  }
  return [px, py];
}

export function tpsResidual(
  t: TPSCoeffs,
  point: CalibrationPoint,
): number {
  const [px, py] = applyTPS(
    t,
    point.worldX,
    point.worldY,
    point.worldZ ?? 0,
  );
  const dx = px - point.pixelX;
  const dy = py - point.pixelY;
  return Math.sqrt(dx * dx + dy * dy);
}

// Inverse: pixel → world via Newton's method. No closed form for TPS.
// 2D pixel → 3D world is underdetermined, so the caller fixes the third
// axis (`fixedZ`) and we solve for (worldX, worldY) along the worldZ =
// fixedZ slice. For OWdle the caller passes the spot's known OW worldY
// (vertical/elevation) since that's available from the OCR'd POS HUD.
//
// Initialize at the centroid of control points. Converges in 5-10
// iterations for typical query points; bail at 12 with whatever we've
// got.
//
// Derivative of the kernel (same as 2D — only depends on the squared
// distance to a control point, which now includes a Δz² term that's
// constant during the X/Y solve):
//   φ(r²) = ½·r²·log(r²)
//   ∂φ/∂(r²) = ½·(log(r²) + 1)
//   ∂(r²)/∂x = 2·(x − xᵢ)
//   ⇒ ∂φ/∂x = (log(r²) + 1)·(x − xᵢ)
export function inverseTPS(
  t: TPSCoeffs,
  pixelX: number,
  pixelY: number,
  fixedZ: number = 0,
  init?: [number, number],
): [number, number] | null {
  const N = t.controlX.length;
  if (N === 0) return null;

  let wx: number;
  let wy: number;
  if (init) {
    [wx, wy] = init;
  } else {
    // Centroid of control points along X and Y only — fixedZ is the
    // independent variable here.
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < N; i++) {
      cx += t.controlX[i];
      cy += t.controlY[i];
    }
    wx = cx / N;
    wy = cy / N;
  }

  // Precompute the Z-term contribution to the affine part — it's
  // constant during the Newton iteration.
  const affineZx = t.aX[3] * fixedZ;
  const affineZy = t.aY[3] * fixedZ;

  for (let iter = 0; iter < 12; iter++) {
    let px = t.aX[0] + t.aX[1] * wx + t.aX[2] * wy + affineZx;
    let py = t.aY[0] + t.aY[1] * wx + t.aY[2] * wy + affineZy;
    let dpxdx = t.aX[1];
    let dpxdy = t.aX[2];
    let dpydx = t.aY[1];
    let dpydy = t.aY[2];
    for (let i = 0; i < N; i++) {
      const dx = wx - t.controlX[i];
      const dy = wy - t.controlY[i];
      const dz = fixedZ - t.controlZ[i];
      const r2 = dx * dx + dy * dy + dz * dz;
      if (r2 < 1e-12) continue;
      const log_r2 = Math.log(r2);
      const k = 0.5 * r2 * log_r2;
      const dk_d = log_r2 + 1; // ∂φ/∂x = dk_d · dx (and same with dy)
      px += t.wX[i] * k;
      py += t.wY[i] * k;
      dpxdx += t.wX[i] * dk_d * dx;
      dpxdy += t.wX[i] * dk_d * dy;
      dpydx += t.wY[i] * dk_d * dx;
      dpydy += t.wY[i] * dk_d * dy;
    }
    const fx = px - pixelX;
    const fy = py - pixelY;
    if (Math.abs(fx) < 0.05 && Math.abs(fy) < 0.05) break;
    const det = dpxdx * dpydy - dpxdy * dpydx;
    if (Math.abs(det) < 1e-12) return null;
    const stepX = (fx * dpydy - dpxdy * fy) / det;
    const stepY = (dpxdx * fy - fx * dpydx) / det;
    wx -= stepX;
    wy -= stepY;
  }

  return [wx, wy];
}

// Leave-one-out cross-validation residual at a given control point
// index. Re-fits TPS with that point excluded, applies the re-fit to
// the held-out point, returns the error. Surfaces clicks that the rest
// of the fit "disagrees with" — i.e. likely misplaced.
//
// O(N) re-fits per call; the calibration UI calls this for each point,
// so the total cost is O(N²) per refresh. For N ≤ 20 (our regime) it's
// a few ms — fine to recompute on every point edit.
export function looResidual(
  points: CalibrationPoint[],
  index: number,
  lambda: number = TPS_DEFAULT_LAMBDA,
): number | null {
  if (index < 0 || index >= points.length) return null;
  const subset = points.filter((_, i) => i !== index);
  if (subset.length < 4) return null; // can't fit TPS without enough points
  const fit = fitTPS(subset, lambda);
  if (!fit) return null;
  return tpsResidual(fit, points[index]);
}

// ─────────────────────────────────────────────────────────────────────────
// Auto-dispatch — TPS when we have enough data, homography next, affine last.
// ─────────────────────────────────────────────────────────────────────────

export function fitProjection(
  points: CalibrationPoint[],
  options: { tpsLambda?: number } = {},
): Projection | null {
  if (points.length < 3) return null;
  if (points.length >= TPS_MIN_POINTS) {
    const t = fitTPS(points, options.tpsLambda ?? TPS_DEFAULT_LAMBDA);
    if (t) return { kind: "tps", coeffs: t };
    // Fall through to homography if TPS solve was singular.
  }
  if (points.length >= 4) {
    const h = fitHomography(points);
    if (h) return { kind: "homography", coeffs: h };
  }
  const a = fitAffine(points);
  if (a) return { kind: "affine", coeffs: a };
  return null;
}

export function applyProjection(
  p: Projection,
  worldX: number,
  worldY: number,
  worldZ: number = 0,
): [number, number] {
  if (p.kind === "tps") {
    return applyTPS(p.coeffs, worldX, worldY, worldZ);
  }
  // Affine and homography ignore the third axis — kept for API symmetry
  // so callers don't have to dispatch themselves.
  if (p.kind === "homography") {
    return applyHomography(p.coeffs, worldX, worldY);
  }
  return applyAffine(p.coeffs, worldX, worldY);
}

export function projectionResidual(
  p: Projection,
  point: CalibrationPoint,
): number {
  if (p.kind === "tps") {
    return tpsResidual(p.coeffs, point);
  }
  if (p.kind === "homography") {
    return homographyResidual(p.coeffs, point);
  }
  return residual(p.coeffs, point);
}

// ─────────────────────────────────────────────────────────────────────────
// Inverse projection: overhead pixel → world (X, Y).
//
// Used by the validate-mode pin drag — when the user repositions the
// answer pin on the overhead, we want the world coords to follow so a
// subsequent forward re-projection (Save) doesn't snap the pin back to
// the homography-derived original.
//
// Affine inverse is a 2×2 linear solve. Homography inverse is the same
// 2×2 solve after collapsing the projective denominator into the LHS.
// Both return null if the system is degenerate (parallel rows).
// ─────────────────────────────────────────────────────────────────────────

export function inverseAffine(
  t: AffineTransform,
  pixelX: number,
  pixelY: number,
): [number, number] | null {
  // pixelX = a·X + b·Y + c
  // pixelY = d·X + e·Y + f
  // → solve [a b; d e] · [X; Y] = [px-c; py-f]
  const [a, b, c, d, e, f] = t;
  const det = a * e - b * d;
  if (Math.abs(det) < 1e-12) return null;
  const px = pixelX - c;
  const py = pixelY - f;
  return [(px * e - b * py) / det, (a * py - px * d) / det];
}

export function inverseHomography(
  t: Homography,
  pixelX: number,
  pixelY: number,
): [number, number] | null {
  // Cross-multiply the homography to get a linear 2×2 system:
  //   (a - pX·g)·X + (b - pX·h)·Y = pX - c
  //   (d - pY·g)·X + (e - pY·h)·Y = pY - f
  const [a, b, c, d, e, f, g, h] = t;
  const A = a - pixelX * g;
  const B = b - pixelX * h;
  const D = d - pixelY * g;
  const E = e - pixelY * h;
  const det = A * E - B * D;
  if (Math.abs(det) < 1e-12) return null;
  const C = pixelX - c;
  const F = pixelY - f;
  return [(C * E - B * F) / det, (A * F - C * D) / det];
}

// For TPS, pixel → world is underdetermined (2 equations, 3 unknowns).
// Caller supplies a `fixedZ` constraint — the OW vertical Y for that
// spot. Affine and homography ignore it.
export function inverseProjection(
  p: Projection,
  pixelX: number,
  pixelY: number,
  fixedZ: number = 0,
): [number, number] | null {
  if (p.kind === "tps") {
    return inverseTPS(p.coeffs, pixelX, pixelY, fixedZ);
  }
  if (p.kind === "homography") {
    return inverseHomography(p.coeffs, pixelX, pixelY);
  }
  return inverseAffine(p.coeffs, pixelX, pixelY);
}
