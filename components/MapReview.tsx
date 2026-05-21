"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import {
  createWorker,
  type Worker as TesseractWorker,
} from "tesseract.js";
import { MAPS } from "@/lib/maps";
import {
  applyProjection,
  inverseProjection,
  type Projection,
} from "@/lib/affine";
import { media } from "@/lib/media";
import {
  buildProjection as buildProjectionShared,
  CALIBRATION_MODE_OPTIONS,
  readCalibrationMode,
  SPOT_TIER2_WEIGHT,
  writeCalibrationMode,
  type CalibrationEntry,
  type CalibrationMode,
  type EditedSpotSource,
} from "@/lib/calibration-mode";
import {
  detectMap,
  type DetectionMethod,
} from "@/lib/mapDetection";
import { MapPin } from "@/components/MapPin";
import calibrationsData from "@/data/map-calibrations.json";
import spotsData from "@/data/spots.json";

const SPOTS_BY_MAP = spotsData as unknown as Record<
  string,
  EditedSpotSource[]
>;

// Sentinel for the batch dropdown: "auto-detect per screenshot" rather
// than locking the whole batch to one map.
const AUTO_DETECT_KEY = "__auto__";

// localStorage key for persisting the last-selected batch lock. The
// typical workflow is one-map-per-session, so restoring the previous
// pick across reloads kills the "MAP not detected" failure mode for
// free without forcing the user to remember to switch the dropdown.
const MAP_KEY_STORAGE = "owdle:map:review:lastMapKey";

// ─────────────────────────────────────────────────────────────────────────
// Calibration data (one entry per calibrated map)
// ─────────────────────────────────────────────────────────────────────────

const CALIBRATIONS = calibrationsData as unknown as Record<
  string,
  CalibrationEntry
>;

// Per-mapKey cache keyed by the active calibration mode. TPS fits are
// expensive enough (~few ms at N≤30) that we don't want to refit on
// every render — but cheap enough that re-fitting once per mode flip
// is fine. The cache key is `${mode}::${mapKey}` so manual / tier-two /
// unconditional fits coexist.
let CACHED_MODE: CalibrationMode | null = null;
const PROJECTION_CACHE = new Map<string, Projection | null>();

function getProjection(mapKey: string): Projection | null {
  const mode = readCalibrationMode();
  if (mode !== CACHED_MODE) {
    PROJECTION_CACHE.clear();
    CACHED_MODE = mode;
  }
  if (PROJECTION_CACHE.has(mapKey)) {
    return PROJECTION_CACHE.get(mapKey) ?? null;
  }
  const cal = CALIBRATIONS[mapKey];
  const p = cal
    ? buildProjectionShared(cal, {
        mapKey,
        spotsByMap: SPOTS_BY_MAP,
        mode,
      })
    : null;
  PROJECTION_CACHE.set(mapKey, p);
  return p;
}

// OW worldX, worldZ are the horizontal axes (mapped to math worldX +
// worldY). worldY is the vertical/elevation (mapped to math worldZ as
// the 3rd input). For affine/homography projections worldY is ignored;
// for TPS it informs the Y-induced perspective shift on tilted overheads.
function projectWorld(
  mapKey: string,
  worldX: number,
  worldZ: number,
  worldY: number = 0,
): [number, number] | null {
  const p = getProjection(mapKey);
  if (!p) return null;
  return applyProjection(p, worldX, worldZ, worldY);
}

// ─────────────────────────────────────────────────────────────────────────
// HUD regions to OCR / mask. Fractions of image dimensions so they
// auto-scale across resolutions. The free-cam mode prints the POS
// line in the top-right; OW's "WAITING FOR PLAYERS" banner sits top-
// center when a custom-game match hasn't formally started.
// ─────────────────────────────────────────────────────────────────────────

// Three separate HUD regions. Each gets masked on the player-facing
// image; only POS and MAP get OCR'd.
//   - HUD_TOP_LEFT  : the workshop rule's "MAP: <name>" line. OCR'd
//                     for name-based auto-detection.
//   - HUD_TOP_CENTER: OW's built-in "WAITING FOR PLAYERS / NOT ENOUGH
//                     PLAYERS" banner. Mask only.
//   - HUD_TOP_RIGHT : the free-cam mode's "POS / ROT" line. OCR'd
//                     for world coordinates.
// Region widths are slightly generous on the right and bottom so OCR
// doesn't have to deal with HUD text clipping at the crop boundary —
// previously POS lines with a leading minus sign would occasionally
// have the sign cropped, projecting the spot off-overhead. Top-center
// stays the same; it's mask-only, no OCR.
const HUD_TOP_LEFT = { left: 0.0, top: 0.0, width: 0.35, height: 0.1 };
const HUD_TOP_CENTER = { left: 0.4, top: 0.0, width: 0.25, height: 0.07 };
const HUD_TOP_RIGHT = { left: 0.65, top: 0.02, width: 0.35, height: 0.11 };

// Number-capture group used by both POS and ROT regexes. Tolerates the
// usual Tesseract misreads INSIDE the captured number — letters that
// look like digits — so we can clean them up after the match instead
// of failing parse outright. Allowed chars in a number: optional sign,
// digits, decimal separator (period or comma), and the OCR-confused
// letters O Q (→0), I l L (→1), S (→5), B (→8), Z (→2).
const NUM_GROUP = "(-?[\\d.,OoQIilLSsBbZz]+)";
const POS_RE = new RegExp(
  // P[O0]S handles "POS" misread as "P0S".
  `P[O0]S\\s*\\(?\\s*${NUM_GROUP}\\s*[,\\s]+\\s*${NUM_GROUP}\\s*[,\\s]+\\s*${NUM_GROUP}\\s*\\)?`,
  "i",
);
// ROT (rx, ry, rz) — forward unit vector. Same lenient capture style.
const ROT_RE = new RegExp(
  `R[O0]T\\s*\\(?\\s*${NUM_GROUP}\\s*[,\\s]+\\s*${NUM_GROUP}\\s*[,\\s]+\\s*${NUM_GROUP}\\s*\\)?`,
  "i",
);

// Map ambiguous letters → digits inside a captured number. Done AFTER
// regex match so it doesn't corrupt keyword tokens like "POS" or "ROT".
function fixDigitChars(s: string): string {
  return s
    .replace(/[OoQ]/g, "0")
    .replace(/[IilL]/g, "1")
    .replace(/[Ss]/g, "5")
    .replace(/[Bb]/g, "8")
    .replace(/[Zz]/g, "2");
}
// Matches "MAP: <name>" — name is alphanumerics, apostrophes, hyphens,
// colons (Watchpoint: Gibraltar), and spaces. Stops at end of line or
// at a known sibling-HUD keyword (POS, ROT, FREE CAMERA, WAITING).
const MAP_LINE_RE =
  /MAP\s*[:\s]+\s*([A-Za-z][A-Za-z0-9'\- :]+?)\s*(?:[\r\n]|POS|ROT|FREE\s+CAMERA|WAITING|$)/i;

function parseNumber(raw: string): number {
  // Order: dedigit-letters first (S→5 etc), then normalize comma to
  // decimal point (1,23 → 1.23), then parseFloat.
  return parseFloat(fixDigitChars(raw).replace(",", "."));
}

// Loose number matcher used by the fallback path — same digit-tolerance
// character class as the strict POS regex, but unanchored.
const FALLBACK_NUM_RE = /-?[\d.,OoQIilLSsBbZz]+/g;

function parsePos(
  text: string,
): { x: number; y: number; z: number } | null {
  // Primary: anchored at the "POS" prefix (with O→0 tolerance). Strict
  // form rejects spurious 3-tuples elsewhere in the crop.
  const m = text.match(POS_RE);
  if (m) {
    const x = parseNumber(m[1]);
    const y = parseNumber(m[2]);
    const z = parseNumber(m[3]);
    if (isFinite(x) && isFinite(y) && isFinite(z)) return { x, y, z };
  }
  // Fallback: the strict regex failed — usually because OCR mangled
  // the "POS" prefix into something the digit-tolerance class doesn't
  // cover (e.g. "P0$", "FOS", "P05"). The HUD prints POS first in the
  // top-right crop, so the first 3 plausible numbers in reading order
  // should still be the POS triplet. To avoid scraping ROT's numbers
  // when the POS line is fully unreadable, we clip the search window
  // at the "ROT" keyword if it's still legible.
  const rotIdx = text.search(/R[O0]T/i);
  const window = rotIdx >= 0 ? text.slice(0, rotIdx) : text;
  const nums = [...window.matchAll(FALLBACK_NUM_RE)]
    .map((mm) => parseNumber(mm[0]))
    .filter((n) => isFinite(n));
  if (nums.length >= 3) {
    return { x: nums[0], y: nums[1], z: nums[2] };
  }
  return null;
}

function parseMapName(text: string): string | null {
  const m = text.match(MAP_LINE_RE);
  if (!m) return null;
  return m[1].trim();
}

function parseRot(
  text: string,
): { x: number; y: number; z: number } | null {
  const m = text.match(ROT_RE);
  if (!m) return null;
  const x = parseNumber(m[1]);
  const y = parseNumber(m[2]);
  const z = parseNumber(m[3]);
  if (!isFinite(x) || !isFinite(y) || !isFinite(z)) return null;
  return { x, y, z };
}

// Compute the pin's pixel-space facing angle (degrees, CSS convention
// where 0° = up, 90° = right) from a world position + forward vector.
// We do this by projecting two points — the position itself and a small
// step along the forward vector — through the same homography that
// places the pin. The pixel-space delta tells us which way to rotate.
function computeFacingDeg(
  mapKey: string,
  worldX: number,
  worldZ: number,
  rotX: number,
  rotZ: number,
  worldY: number = 0,
): number | null {
  // Skip when there's no horizontal facing (e.g. camera pointed
  // straight down). atan2 would still give a value but it'd be noise.
  const horizMag = Math.hypot(rotX, rotZ);
  if (horizMag < 1e-3) return null;
  const eps = 1; // one world-unit step along the forward direction
  // Both probe points stay at the same OW worldY since the camera-
  // facing step is horizontal — only X and Z move.
  const p1 = projectWorld(mapKey, worldX, worldZ, worldY);
  const p2 = projectWorld(
    mapKey,
    worldX + (eps * rotX) / horizMag,
    worldZ + (eps * rotZ) / horizMag,
    worldY,
  );
  if (!p1 || !p2) return null;
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  // atan2(x, -y): 0 = up, 90 = right, 180 = down, -90 = left.
  // Matches CSS rotation direction.
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
}

// ─────────────────────────────────────────────────────────────────────────
// Image processing helpers
// ─────────────────────────────────────────────────────────────────────────

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

function makeCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

async function maskAndExport(
  img: HTMLImageElement,
  quality = 0.85,
): Promise<Blob | null> {
  const c = makeCanvas(img.naturalWidth, img.naturalHeight);
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  ctx.fillStyle = "black";
  for (const r of [HUD_TOP_LEFT, HUD_TOP_CENTER, HUD_TOP_RIGHT]) {
    ctx.fillRect(
      Math.round(r.left * img.naturalWidth),
      Math.round(r.top * img.naturalHeight),
      Math.round(r.width * img.naturalWidth),
      Math.round(r.height * img.naturalHeight),
    );
  }
  return new Promise((resolve) =>
    c.toBlob((b) => resolve(b), "image/jpeg", quality),
  );
}

// Crop a region from the source image, upscale it, then binarise +
// invert so we end up with crisp dark text on a white background —
// Tesseract's preferred input. The OW HUD prints bright text on a
// dark/varying background; without this step Tesseract has to deal
// with anti-aliasing and contrast variation that confuses small
// number glyphs (the leading "-" sign is the most common casualty,
// which is why we see so many off-overhead projections).
function preprocessRegionForOcr(
  img: HTMLImageElement,
  region: { left: number; top: number; width: number; height: number },
  options: { scale?: number; lightThreshold?: number } = {},
): HTMLCanvasElement {
  const scale = options.scale ?? 3;
  const threshold = options.lightThreshold ?? 150;
  const sx = Math.max(0, Math.round(region.left * img.naturalWidth));
  const sy = Math.max(0, Math.round(region.top * img.naturalHeight));
  const sw = Math.round(region.width * img.naturalWidth);
  const sh = Math.round(region.height * img.naturalHeight);
  const c = makeCanvas(sw * scale, sh * scale);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return c;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);

  // Luminance threshold + invert in a single pass.
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const lum = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
    const v = lum > threshold ? 0 : 255;
    px[i] = v;
    px[i + 1] = v;
    px[i + 2] = v;
    px[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  return c;
}

async function makeThumbnail(
  img: HTMLImageElement,
  maxW = 320,
): Promise<string> {
  const scale = Math.min(1, maxW / img.naturalWidth);
  const c = makeCanvas(
    Math.round(img.naturalWidth * scale),
    Math.round(img.naturalHeight * scale),
  );
  const ctx = c.getContext("2d");
  ctx?.drawImage(img, 0, 0, c.width, c.height);
  // Apply the same masking logic to the thumbnail so the user sees
  // the player-facing version, not the HUD-leaking original.
  if (ctx) {
    ctx.fillStyle = "black";
    for (const r of [HUD_TOP_LEFT, HUD_TOP_CENTER, HUD_TOP_RIGHT]) {
      ctx.fillRect(
        Math.round(r.left * c.width),
        Math.round(r.top * c.height),
        Math.round(r.width * c.width),
        Math.round(r.height * c.height),
      );
    }
  }
  return c.toDataURL("image/jpeg", 0.7);
}

// ─────────────────────────────────────────────────────────────────────────
// Spot model
// ─────────────────────────────────────────────────────────────────────────

type SpotStatus =
  | "ok"
  | "ocr-failed"
  | "out-of-bounds"
  | "no-calibration"
  | "no-map-detected";

type ProcessedSpot = {
  id: string;
  mapKey: string;
  filename: string;
  worldX: number | null;
  worldY: number | null;
  worldZ: number | null;
  pixelX: number | null;
  pixelY: number | null;
  // Aggregate OCR signal — kept for the existing spot-card display.
  // The diag panel below uses the structured POS/MAP fields instead.
  ocrText: string;
  ocrConfidence: number;
  // Structured per-region OCR output for the diag panel. ocrPosText is
  // the raw Tesseract output (pre-regex) for the top-right HUD strip;
  // ocrMapText is the same for the top-left "MAP: <name>" line.
  // Confidence is Tesseract's own per-region score (0-100); useful as
  // a quick eyeball even before reading the raw text.
  ocrPosText: string;
  ocrPosConfidence: number;
  ocrMapText: string;
  ocrMapConfidence: number;
  // If the primary POS OCR pass missed and a fallback variant (different
  // upscale / threshold) recovered the triplet, this names the variant
  // that succeeded — surfaced in the diag panel so we can see which
  // preprocessing actually does work for failing screenshots and tune
  // the primary defaults later. Undefined on the happy path.
  posVariant?: string;
  thumbnailUrl: string;
  maskedBlob: Blob | null;
  // Original (unmasked) source file. Kept in memory so the validate
  // view can render it at full resolution — the user reads the POS
  // HUD off this when fixing OCR failures or sanity-checking pins.
  originalFile: File;
  status: SpotStatus;
  // How the map was assigned: "name" = OCR'd MAP: line, "coords" =
  // coord-bbox fingerprint, "manual" = batch dropdown locked or user
  // override, null = couldn't decide and the spot is in limbo.
  detectionMethod: DetectionMethod | "manual" | null;
  // Camera facing direction. worldRot* are the raw forward-vector
  // components OCR'd from the workshop ROT HUD line. facingDeg is the
  // precomputed pixel-space rotation for the pin (0° = up, CSS-style).
  // Either may be missing for older spots / failed OCR; reviewer can
  // right-click drag the selected pin to set facingDeg manually.
  worldRotX?: number;
  worldRotY?: number;
  worldRotZ?: number;
  facingDeg?: number;
};

const STATUS_COPY: Record<SpotStatus, string> = {
  ok: "ok",
  "ocr-failed": "OCR failed",
  "out-of-bounds": "off-overhead",
  "no-calibration": "no calibration",
  "no-map-detected": "no map detected",
};

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 6)}`;
}

// ─────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────

export function MapReview() {
  // Batch map selector. Default is AUTO_DETECT_KEY which means
  // "decide per-screenshot via OCR + bbox". Selecting a specific map
  // locks every newly-dropped screenshot to that map (useful when you
  // know you only have one map's screenshots in this batch and want
  // to skip detection overhead).
  const [mapKey, setMapKey] = useState<string>(AUTO_DETECT_KEY);

  // Hydrate the batch lock from the previous session's choice. Runs
  // once after mount — we don't read in the useState initializer
  // because the component renders on the server first (Next.js App
  // Router) where localStorage is undefined, and a mismatched initial
  // value would trip a hydration warning.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = localStorage.getItem(MAP_KEY_STORAGE);
      if (saved) setMapKey(saved);
    } catch {
      // ignore quota / private mode
    }
  }, []);

  // Persist on every change.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(MAP_KEY_STORAGE, mapKey);
    } catch {
      // ignore quota / private mode
    }
  }, [mapKey]);

  // Calibration mode — same global state MapCalibrate + MapEdit read.
  // Determines whether incoming spots project through the formal-only
  // fit (manual), or a fit that includes edited spots at 0.25×
  // (tier-two), or full weight (unconditional). Toggling here flips
  // the mode everywhere, and the module-level PROJECTION_CACHE clears
  // on next access so the next file dropped uses the new fit.
  const [mode, setMode] = useState<CalibrationMode>("manual");
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

  // Active calibration summary — exposed in the UI so the user can
  // verify what projection a dropped batch will use before dropping.
  // Counts edited spots feeding the fit for the locked map (or "all
  // maps" when in auto-detect).
  const activeEditedSpots = useMemo(() => {
    if (mode === "manual") return 0;
    if (mapKey === AUTO_DETECT_KEY) {
      let total = 0;
      for (const list of Object.values(SPOTS_BY_MAP)) {
        total += list.filter((s) => s.editedAt != null).length;
      }
      return total;
    }
    return (SPOTS_BY_MAP[mapKey] ?? []).filter((s) => s.editedAt != null)
      .length;
  }, [mode, mapKey]);

  const [spots, setSpots] = useState<ProcessedSpot[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [workerState, setWorkerState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const workerRef = useRef<TesseractWorker | null>(null);

  // Validate-vs-grid view mode + the spot the user is currently
  // inspecting on the overhead. selectedOriginalUrl is an object URL
  // for the unmasked source File so we can show the user the HUD they
  // need to read coords from.
  const [viewMode, setViewMode] = useState<"validate" | "grid">("validate");
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);
  const [selectedOriginalUrl, setSelectedOriginalUrl] = useState<string | null>(
    null,
  );

  const isAuto = mapKey === AUTO_DETECT_KEY;
  const selectedSpot =
    spots.find((s) => s.id === selectedSpotId) ?? null;

  // Which map's overhead is showing in the validate pane? With auto-
  // detect on we follow the selected spot; the sidebar can mix maps,
  // and the big overhead retunes to whichever spot you click. Without
  // a selection, default to the batch lock (or the first calibrated
  // map if we're in pure auto mode and nothing is picked yet).
  const calibratedKeys = Object.keys(CALIBRATIONS);
  const activeOverheadMapKey = selectedSpot?.mapKey
    ? selectedSpot.mapKey
    : !isAuto
      ? mapKey
      : (calibratedKeys[0] ?? MAPS[0]?.key ?? "");
  const cal = activeOverheadMapKey
    ? CALIBRATIONS[activeOverheadMapKey]
    : undefined;
  const map = MAPS.find((m) => m.key === activeOverheadMapKey);

  // Spots whose map matches the active overhead. The sidebar lists
  // these as pins on the overhead pane; spots tagged to other maps
  // surface as a small "N on other maps" hint at the top of the
  // sidebar so the user knows to click one to switch views.
  const currentMapSpots = spots.filter(
    (s) => s.mapKey === activeOverheadMapKey,
  );
  const attentionSpots = currentMapSpots.filter((s) => s.status !== "ok");
  const okSpots = currentMapSpots.filter((s) => s.status === "ok");

  // Only clear selection on hard batch-lock change. In auto-mode
  // selecting a spot from a different map shifts the overhead but the
  // selection itself stays valid, so we don't nuke it.
  useEffect(() => {
    if (!isAuto) setSelectedSpotId(null);
  }, [mapKey, isAuto]);

  // Manage the object URL for the currently-selected spot's unmasked
  // source. We only ever hold one URL at a time to keep memory bounded
  // — for a 200-spot session, materialising URLs for all of them at
  // once would peg the GPU on dozens of decoded full-res images.
  useEffect(() => {
    if (!selectedSpot) {
      setSelectedOriginalUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }
    const url = URL.createObjectURL(selectedSpot.originalFile);
    setSelectedOriginalUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
    return () => URL.revokeObjectURL(url);
    // Only depend on the id — not the spot object — so coord edits
    // don't churn the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSpotId]);

  // Move the selected spot's pin to a specific (image-natural) pixel
  // position AND inverse-project to update the world coords so the
  // editor's X / Z inputs stay in sync with where the pin lives.
  // Without the inverse step, hitting Save Coords after a drag would
  // forward-project the unchanged world coords and snap the pin back
  // to its pre-drag location.
  //
  // Y (vertical, elevation) is metadata only; we don't touch it on a
  // drag since the projection is 2D in the (X, Z) plane.
  const setSelectedPin = (px: number, py: number) => {
    if (!selectedSpot) return;
    const proj = getProjection(selectedSpot.mapKey);
    let derivedX: number | null = null;
    let derivedZ: number | null = null;
    if (proj) {
      // For TPS, pixel→world is underdetermined; fix the third axis at
      // the spot's known OW worldY (vertical) so the solve stays on the
      // spot's actual elevation slice. Affine/homography ignore it.
      const inv = inverseProjection(
        proj,
        px,
        py,
        selectedSpot.worldY ?? 0,
      );
      if (inv) {
        derivedX = inv[0];
        derivedZ = inv[1];
      }
    }
    setSpots((prev) =>
      prev.map((s) =>
        s.id === selectedSpot.id
          ? {
              ...s,
              pixelX: px,
              pixelY: py,
              worldX: derivedX ?? s.worldX,
              worldZ: derivedZ ?? s.worldZ,
              status: "ok",
            }
          : s,
      ),
    );
  };

  // Boot Tesseract once. ~10MB language data downloads on first run.
  useEffect(() => {
    let cancelled = false;
    setWorkerState("loading");
    (async () => {
      try {
        const w = await createWorker("eng");
        // PSM 6 = "uniform block of text". Better than the default
        // PSM 3 (automatic) for our case because each OCR region is a
        // small fixed-layout HUD strip — Tesseract doesn't need to
        // hunt for layout, just read the lines.
        await w.setParameters({
          tessedit_pageseg_mode: "6" as never,
        });
        if (cancelled) {
          await w.terminate();
          return;
        }
        workerRef.current = w;
        setWorkerState("ready");
      } catch (e) {
        if (!cancelled) {
          setWorkerState("error");
          setError(
            `OCR worker failed: ${e instanceof Error ? e.message : e}`,
          );
        }
      }
    })();
    return () => {
      cancelled = true;
      const w = workerRef.current;
      workerRef.current = null;
      w?.terminate().catch(() => {});
    };
  }, []);

  const processFile = async (file: File): Promise<ProcessedSpot> => {
    const w = workerRef.current;
    if (!w) throw new Error("OCR worker not ready");
    const img = await loadImage(file);

    // Two OCR passes against the same worker, but each fed a hand-
    // preprocessed canvas (cropped + 3× upscale + binarise + invert)
    // instead of the raw file + rectangle option. Preprocessing roughly
    // halves the failure rate on white-text-on-game-backdrop HUD strips
    // — the most common failure mode was Tesseract losing the leading
    // "-" sign on dark backgrounds, which projects spots off-overhead.
    const posCanvas = preprocessRegionForOcr(img, HUD_TOP_RIGHT);
    const mapCanvas = preprocessRegionForOcr(img, HUD_TOP_LEFT);
    const [posOcr, mapOcr] = await Promise.all([
      w.recognize(posCanvas),
      w.recognize(mapCanvas),
    ]);

    const mapText = mapOcr.data.text.trim();
    const mapConfidence = mapOcr.data.confidence;
    const parsedMapName = parseMapName(mapText);

    // Primary POS pass. The preprocessor's default (3× upscale,
    // threshold 150) is tuned for the common case. If that misses we
    // try variants — only on the residual failures, so the happy path
    // pays nothing extra.
    let posText = posOcr.data.text.trim();
    let posConfidence = posOcr.data.confidence;
    let parsedPos = parsePos(posText);
    let parsedRot = parseRot(posText);
    let posVariant: string | undefined;
    if (!parsedPos) {
      const variants: Array<{
        name: string;
        options: { scale?: number; lightThreshold?: number };
      }> = [
        { name: "5x", options: { scale: 5 } },
        { name: "thr-100", options: { lightThreshold: 100 } },
        { name: "thr-200", options: { lightThreshold: 200 } },
        { name: "5x-100", options: { scale: 5, lightThreshold: 100 } },
        { name: "5x-200", options: { scale: 5, lightThreshold: 200 } },
      ];
      for (const v of variants) {
        const canvas = preprocessRegionForOcr(img, HUD_TOP_RIGHT, v.options);
        const r = await w.recognize(canvas);
        const text = r.data.text.trim();
        const candidate = parsePos(text);
        if (candidate) {
          parsedPos = candidate;
          parsedRot = parseRot(text);
          posText = text;
          posConfidence = r.data.confidence;
          posVariant = v.name;
          break;
        }
      }
    }

    const ocrConfidence = posConfidence; // legacy single-value
    const ocrText = mapText
      ? `${posText}\n--MAP--\n${mapText}`
      : posText;

    const id = newId();
    const thumb = await makeThumbnail(img);
    const masked = await maskAndExport(img);

    const base = {
      id,
      filename: file.name,
      worldX: parsedPos?.x ?? null,
      worldY: parsedPos?.y ?? null,
      worldZ: parsedPos?.z ?? null,
      ocrText,
      ocrConfidence,
      ocrPosText: posText,
      ocrPosConfidence: posConfidence,
      ocrMapText: mapText,
      ocrMapConfidence: mapConfidence,
      posVariant,
      thumbnailUrl: thumb,
      maskedBlob: masked,
      originalFile: file,
      worldRotX: parsedRot?.x,
      worldRotY: parsedRot?.y,
      worldRotZ: parsedRot?.z,
    };

    if (!parsedPos) {
      return {
        ...base,
        mapKey: isAuto ? "" : mapKey,
        pixelX: null,
        pixelY: null,
        status: "ocr-failed",
        detectionMethod: isAuto ? null : "manual",
      };
    }

    // Decide the spot's map. Manual batch lock wins over detection so
    // the user always has an escape hatch when they know what they're
    // dropping.
    let chosenMapKey: string;
    let detectionMethod: DetectionMethod | "manual";
    if (!isAuto) {
      chosenMapKey = mapKey;
      detectionMethod = "manual";
    } else {
      const det = detectMap(parsedMapName, parsedPos.x, parsedPos.z);
      if (!det) {
        return {
          ...base,
          mapKey: "",
          pixelX: null,
          pixelY: null,
          status: "no-map-detected",
          detectionMethod: null,
        };
      }
      chosenMapKey = det.mapKey;
      detectionMethod = det.method;
    }

    const calForSpot = CALIBRATIONS[chosenMapKey];
    if (!calForSpot) {
      return {
        ...base,
        mapKey: chosenMapKey,
        pixelX: null,
        pixelY: null,
        status: "no-calibration",
        detectionMethod,
      };
    }

    const proj = projectWorld(
      chosenMapKey,
      parsedPos.x,
      parsedPos.z,
      parsedPos.y,
    );
    if (!proj) {
      return {
        ...base,
        mapKey: chosenMapKey,
        pixelX: null,
        pixelY: null,
        status: "no-calibration",
        detectionMethod,
      };
    }
    const [pX, pY] = proj;
    const inBounds =
      pX >= 0 &&
      pX <= calForSpot.overheadW &&
      pY >= 0 &&
      pY <= calForSpot.overheadH;
    const facingDeg = parsedRot
      ? (computeFacingDeg(
          chosenMapKey,
          parsedPos.x,
          parsedPos.z,
          parsedRot.x,
          parsedRot.z,
          parsedPos.y,
        ) ?? undefined)
      : undefined;
    return {
      ...base,
      mapKey: chosenMapKey,
      pixelX: pX,
      pixelY: pY,
      status: inBounds ? "ok" : "out-of-bounds",
      detectionMethod,
      facingDeg,
    };
  };

  const handleFiles = async (files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) {
      setError("Drop image files (PNG/JPG).");
      return;
    }
    if (workerState !== "ready") {
      setError("OCR worker still loading — try again in a moment.");
      return;
    }
    setError(null);
    setProcessing(true);
    setProgress({ done: 0, total: imageFiles.length });
    const results: ProcessedSpot[] = [];
    for (let i = 0; i < imageFiles.length; i++) {
      try {
        results.push(await processFile(imageFiles[i]));
      } catch (e) {
        const id = newId();
        results.push({
          id,
          mapKey: isAuto ? "" : mapKey,
          filename: imageFiles[i].name,
          worldX: null,
          worldY: null,
          worldZ: null,
          pixelX: null,
          pixelY: null,
          ocrText: e instanceof Error ? e.message : String(e),
          ocrConfidence: 0,
          ocrPosText: "",
          ocrPosConfidence: 0,
          ocrMapText: "",
          ocrMapConfidence: 0,
          thumbnailUrl: "",
          maskedBlob: null,
          originalFile: imageFiles[i],
          status: "ocr-failed",
          detectionMethod: isAuto ? null : "manual",
        });
      }
      setProgress({ done: i + 1, total: imageFiles.length });
    }
    setSpots((prev) => [...prev, ...results]);
    setProcessing(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    void handleFiles(files);
  };

  const removeSpot = (id: string) => {
    setSpots((prev) => prev.filter((s) => s.id !== id));
  };

  const clearAll = () => {
    if (spots.length === 0) return;
    if (!window.confirm(`Discard all ${spots.length} processed spots?`))
      return;
    setSpots([]);
  };

  const fixManually = (
    id: string,
    worldX: number,
    worldY: number,
    worldZ: number,
  ) => {
    setSpots((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const calForSpot = CALIBRATIONS[s.mapKey];
        if (!calForSpot) {
          return {
            ...s,
            worldX,
            worldY,
            worldZ,
            status: "no-calibration",
          };
        }
        const proj = projectWorld(s.mapKey, worldX, worldZ, worldY);
        if (!proj) {
          return {
            ...s,
            worldX,
            worldY,
            worldZ,
            status: "no-calibration",
          };
        }
        const [pX, pY] = proj;
        const inBounds =
          pX >= 0 &&
          pX <= calForSpot.overheadW &&
          pY >= 0 &&
          pY <= calForSpot.overheadH;
        return {
          ...s,
          worldX,
          worldY,
          worldZ,
          pixelX: pX,
          pixelY: pY,
          status: inBounds ? "ok" : "out-of-bounds",
        };
      }),
    );
  };

  // Manually set the camera-facing direction on a spot (degrees,
  // CSS rotation convention: 0 = up, 90 = right). Used when the
  // reviewer right-click-drags the selected pin. We DON'T update
  // worldRot* here — the manual override stores only the rendered
  // angle since it's the player-visible signal.
  const setSpotFacing = (id: string, deg: number) => {
    setSpots((prev) =>
      prev.map((s) => (s.id === id ? { ...s, facingDeg: deg } : s)),
    );
  };

  // Override the auto-detected map. Re-projects the pin via the new
  // map's calibration if world coords are known. Used when:
  //  - the spot has status "no-map-detected" (user picks manually)
  //  - the auto-detection guessed wrong
  const setSpotMap = (id: string, newMapKey: string) => {
    setSpots((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const calForSpot = CALIBRATIONS[newMapKey];
        // No coords yet — assign the map, leave the pin null.
        if (s.worldX == null || s.worldZ == null) {
          return {
            ...s,
            mapKey: newMapKey,
            detectionMethod: "manual",
            status: calForSpot ? "ocr-failed" : "no-calibration",
          };
        }
        if (!calForSpot) {
          return {
            ...s,
            mapKey: newMapKey,
            detectionMethod: "manual",
            pixelX: null,
            pixelY: null,
            status: "no-calibration",
          };
        }
        const proj = projectWorld(
          newMapKey,
          s.worldX,
          s.worldZ,
          s.worldY ?? 0,
        );
        if (!proj) {
          return {
            ...s,
            mapKey: newMapKey,
            detectionMethod: "manual",
            pixelX: null,
            pixelY: null,
            status: "no-calibration",
          };
        }
        const [pX, pY] = proj;
        const inBounds =
          pX >= 0 &&
          pX <= calForSpot.overheadW &&
          pY >= 0 &&
          pY <= calForSpot.overheadH;
        return {
          ...s,
          mapKey: newMapKey,
          detectionMethod: "manual",
          pixelX: pX,
          pixelY: pY,
          status: inBounds ? "ok" : "out-of-bounds",
        };
      }),
    );
  };

  const exportZip = async () => {
    const ok = spots.filter((s) => s.status === "ok" && s.maskedBlob);
    if (ok.length === 0) {
      setError("No OK spots to export. Fix or delete the flagged ones first.");
      return;
    }
    const zip = new JSZip();
    const grouped: Record<string, unknown[]> = {};
    for (const s of ok) {
      if (!s.maskedBlob) continue;
      if (!grouped[s.mapKey]) grouped[s.mapKey] = [];
      grouped[s.mapKey].push({
        id: s.id,
        mapKey: s.mapKey,
        worldX: s.worldX,
        worldY: s.worldY,
        worldZ: s.worldZ,
        pixelX: s.pixelX,
        pixelY: s.pixelY,
        // Camera-facing direction. Optional — omit if neither OCR
        // picked up ROT nor the reviewer manually rotated.
        ...(s.worldRotX != null && { worldRotX: s.worldRotX }),
        ...(s.worldRotY != null && { worldRotY: s.worldRotY }),
        ...(s.worldRotZ != null && { worldRotZ: s.worldRotZ }),
        ...(s.facingDeg != null && { facingDeg: s.facingDeg }),
        screenshot: `/maps/spots/${s.mapKey}/${s.id}.jpg`,
        capturedAt: new Date().toISOString(),
        sourceFilename: s.filename,
      });
      zip.file(`spots/${s.mapKey}/${s.id}.jpg`, s.maskedBlob);
    }
    zip.file("spots.json", JSON.stringify(grouped, null, 2));
    const blob = await zip.generateAsync({
      type: "blob",
      compression: "STORE",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `owdle-spots-${Date.now().toString(36)}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const counts = {
    total: spots.length,
    ok: spots.filter((s) => s.status === "ok").length,
    failed: spots.filter((s) => s.status !== "ok").length,
  };

  return (
    <main className="min-h-screen bg-bg text-ink">
      <div className="mx-auto max-w-[1800px] px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
        <header className="mb-6 flex items-baseline justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-info">
              OWdle dev tool · map mode
            </p>
            <h1 className="mt-1 font-display text-3xl text-ink sm:text-4xl">
              Review
            </h1>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
              drop screenshots → OCR coords → project via calibration → mask HUD → save
            </p>
          </div>
          <div className="flex items-center gap-3">
            {spots.length > 0 && (
              <div className="flex overflow-hidden rounded-(--radius-card) border border-line">
                {(["validate", "grid"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setViewMode(m)}
                    className={
                      "px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] transition-colors " +
                      (viewMode === m
                        ? "bg-accent text-on-accent"
                        : "bg-inset/40 text-ink-faint hover:text-ink")
                    }
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
            <span
              className={
                "font-mono text-[10px] uppercase tracking-[0.18em] " +
                (workerState === "ready"
                  ? "text-correct"
                  : workerState === "error"
                    ? "text-far"
                    : "text-ink-faint")
              }
            >
              tesseract · {workerState}
            </span>
          </div>
        </header>

        {error && (
          <div className="mb-4 rounded-(--radius-card) border border-far/40 bg-far/10 px-4 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-far">
              {error}
            </p>
          </div>
        )}

        {/* Active calibration banner — what projection will be used to
            place pins for the next dropped batch. Visible before drop
            so the user can flip mode if needed. */}
        <div
          className="mb-4 rounded-(--radius-card) border border-line px-4 py-3"
          style={{ backgroundColor: "var(--bg-inset)" }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
              <span className="text-ink-soft">Active calibration:</span>{" "}
              <span className="text-accent">
                {mode === "manual"
                  ? "manual only"
                  : mode === "tier-two"
                    ? `tier-two (${SPOT_TIER2_WEIGHT}×)`
                    : "unconditional"}
              </span>
              {" · "}
              <span className="text-ink-soft">
                {isAuto
                  ? "auto-detect"
                  : `lock: ${map?.label ?? mapKey}`}
              </span>
              {mode !== "manual" && (
                <>
                  {" · "}
                  <span className="text-correct">
                    +{activeEditedSpots} edited spot
                    {activeEditedSpots === 1 ? "" : "s"} folded into fit
                  </span>
                </>
              )}
            </div>
            <div
              className="flex overflow-hidden rounded-(--radius-card) border border-line"
              title="Calibration mode. Determines whether edited spots from /labeler/map/edit are folded into the projection used to place new pins."
            >
              {CALIBRATION_MODE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => changeMode(opt.value)}
                  aria-pressed={mode === opt.value}
                  title={opt.description}
                  className={
                    "px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors " +
                    (mode === opt.value
                      ? "bg-accent text-on-accent"
                      : "bg-inset/40 text-ink-faint hover:text-ink")
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-[260px_1fr_auto] sm:items-end">
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">
              Map · session label
            </span>
            <select
              value={mapKey}
              onChange={(e) => setMapKey(e.target.value)}
              className="rounded-(--radius-card) border border-line bg-inset/60 px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            >
              <option value={AUTO_DETECT_KEY}>
                Auto-detect per screenshot (recommended)
              </option>
              <option value="" disabled>
                ──── lock batch to one map ────
              </option>
              {MAPS.map((m) => (
                <option
                  key={m.key}
                  value={m.key}
                  disabled={!CALIBRATIONS[m.key]}
                >
                  {m.label}
                  {!CALIBRATIONS[m.key] ? " · no calibration" : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
            {isAuto ? (
              <>
                <span className="text-info">auto-detect on.</span>{" "}
                <span className="text-ink-soft">
                  reads MAP HUD line or falls back to coord-bbox fingerprint.
                </span>
              </>
            ) : (
              <>
                {map?.label ?? "—"}{" "}
                {cal ? (
                  <span className="text-correct">
                    · {cal.projection} fit · {cal.overheadW}×{cal.overheadH}
                  </span>
                ) : (
                  <span className="text-far">
                    · no calibration. Run Calibrate first.
                  </span>
                )}
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-2 justify-self-end">
            <button
              type="button"
              onClick={exportZip}
              disabled={counts.ok === 0}
              className="rounded-(--radius-card) bg-accent px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Export {counts.ok > 0 ? `${counts.ok} ok` : ""} → ZIP
            </button>
            {spots.length > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="rounded-(--radius-card) border border-line px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint transition-colors hover:border-far hover:text-far"
              >
                Clear all
              </button>
            )}
          </div>
        </div>

        <div
          className={
            "grid place-items-center rounded-(--radius-card) border-2 border-dashed transition-colors " +
            (processing
              ? "border-accent bg-accent/5"
              : "border-line bg-inset/30") +
            " p-8"
          }
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          {processing ? (
            <div className="text-center">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
                Processing {progress.done} / {progress.total}…
              </p>
              <div className="mt-2 h-1 w-64 overflow-hidden rounded-full bg-inset">
                <div
                  className="h-full bg-accent transition-all"
                  style={{
                    width: `${
                      (progress.done / Math.max(1, progress.total)) * 100
                    }%`,
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="text-center">
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-soft">
                Drop a folder of screenshots from{" "}
                <code className="text-accent-soft">
                  Documents/Overwatch/ScreenShots/
                </code>
              </p>
              <label className="mt-3 inline-block cursor-pointer rounded-(--radius-card) border border-line px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink transition-colors hover:border-accent hover:text-accent">
                or choose files
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    if (files.length > 0) void handleFiles(files);
                    e.target.value = "";
                  }}
                />
              </label>
              <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">
                processed entirely in-browser · OCR ~1–2s per image after warmup
              </p>
            </div>
          )}
        </div>

        {spots.length > 0 && viewMode === "validate" && (
          <ValidateView
            mapLabel={map?.label ?? mapKey}
            cal={cal}
            currentMapSpots={currentMapSpots}
            attentionSpots={attentionSpots}
            okSpots={okSpots}
            otherMapCount={spots.length - currentMapSpots.length}
            counts={counts}
            selectedSpot={selectedSpot}
            selectedOriginalUrl={selectedOriginalUrl}
            onSelect={setSelectedSpotId}
            onSetPin={setSelectedPin}
            onSetFacing={setSpotFacing}
            onFixCoords={fixManually}
            onSetMap={setSpotMap}
            onRemove={removeSpot}
          />
        )}

        {spots.length > 0 && viewMode === "grid" && (
          <div className="mt-6">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-info">
                Processed spots
              </p>
              <span className="font-mono text-[10px] tracking-[0.18em] text-ink-faint">
                {counts.total} total ·{" "}
                <span className="text-correct">{counts.ok} ok</span>
                {counts.failed > 0 && (
                  <>
                    {" · "}
                    <span className="text-far">{counts.failed} need attention</span>
                  </>
                )}
              </span>
            </div>
            <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
              {spots.map((s) => (
                <SpotCard
                  key={s.id}
                  spot={s}
                  cal={CALIBRATIONS[s.mapKey]}
                  onRemove={() => removeSpot(s.id)}
                  onManualFix={(x, y, z) => fixManually(s.id, x, y, z)}
                />
              ))}
            </ul>
          </div>
        )}

        <details className="mt-6 rounded-(--radius-card) border border-line bg-inset/30 p-3">
          <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.2em] text-ink-soft">
            Pipeline notes
          </summary>
          <ul className="mt-2 space-y-1 font-mono text-[10px] tracking-[0.14em] text-ink-faint">
            <li>· OCR window: top-right 30% × top 9% of each screenshot.</li>
            <li>· Mask regions: top-right (POS / ROT) + top-center (WAITING banner).</li>
            <li>
              · Projection from <code>data/map-calibrations.json</code> ·{" "}
              homography when available, affine fallback.
            </li>
            <li>
              · Export ZIP contains <code>spots.json</code> plus{" "}
              <code>spots/{`{mapKey}`}/{`{id}`}.jpg</code> files. Drop into{" "}
              <code>public/maps/</code> + merge JSON manually (sync script TBD).
            </li>
            <li>
              · Failures are surfaced inline; OK spots need no approval.
              Misclick a coord? Type the correct one in the spot card and the
              pin re-projects.
            </li>
          </ul>
        </details>
      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Validate view — overhead with pins on left, spot sidebar on right,
// selected spot's full screenshot + coord editor below.
// ─────────────────────────────────────────────────────────────────────────

function ValidateView(props: {
  mapLabel: string;
  cal: CalibrationEntry | undefined;
  currentMapSpots: ProcessedSpot[];
  attentionSpots: ProcessedSpot[];
  okSpots: ProcessedSpot[];
  otherMapCount: number;
  counts: { total: number; ok: number; failed: number };
  selectedSpot: ProcessedSpot | null;
  selectedOriginalUrl: string | null;
  onSelect: (id: string) => void;
  // Move the selected spot's pin to (pixelX, pixelY) in image-natural
  // coords. Called by both click-on-overhead and drag-the-pin.
  onSetPin: (px: number, py: number) => void;
  // Set the camera-facing direction (degrees) for a specific spot.
  // Used by right-click-drag on the selected pin.
  onSetFacing: (id: string, deg: number) => void;
  onFixCoords: (id: string, x: number, y: number, z: number) => void;
  onSetMap: (id: string, mapKey: string) => void;
  onRemove: (id: string) => void;
}) {
  const {
    mapLabel,
    cal,
    currentMapSpots,
    attentionSpots,
    okSpots,
    otherMapCount,
    selectedSpot,
    selectedOriginalUrl,
    onSelect,
    onSetPin,
    onSetFacing,
    onFixCoords,
    onSetMap,
    onRemove,
  } = props;

  // Flat ordered list for Prev/Next navigation. Attention spots first
  // so the user walks through failures before reviewing OK spots.
  const orderedSpots = useMemo(
    () => [...attentionSpots, ...okSpots],
    [attentionSpots, okSpots],
  );
  const selectedIdx = selectedSpot
    ? orderedSpots.findIndex((s) => s.id === selectedSpot.id)
    : -1;

  const goPrev = () => {
    if (orderedSpots.length < 2) return;
    const base = selectedIdx < 0 ? 0 : selectedIdx;
    const target =
      orderedSpots[(base - 1 + orderedSpots.length) % orderedSpots.length];
    if (target) onSelect(target.id);
  };
  const goNext = () => {
    if (orderedSpots.length < 2) return;
    const base = selectedIdx < 0 ? -1 : selectedIdx;
    const target = orderedSpots[(base + 1) % orderedSpots.length];
    if (target) onSelect(target.id);
  };

  // Arrow-key navigation. Ignored while typing in form fields so it
  // doesn't fight cursor movement in inputs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)
      ) {
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderedSpots, selectedIdx]);

  // Two independent drag modes on the overhead:
  //   - position drag (left-click on overhead or pin): pin follows
  //     cursor across the image
  //   - rotation drag (right-click + drag on the selected pin): angle
  //     between cursor and pin center sets facingDeg
  // Only one is active at a time; rotationDragRef being non-null wins.
  const overheadRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const rotationDragRef = useRef<{
    spotId: string;
    pinClientX: number;
    pinClientY: number;
  } | null>(null);

  const eventToImagePx = (
    clientX: number,
    clientY: number,
  ): [number, number] | null => {
    const el = overheadRef.current;
    if (!el || !cal) return null;
    const rect = el.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * cal.overheadW;
    const py = ((clientY - rect.top) / rect.height) * cal.overheadH;
    return [px, py];
  };

  // Convert the pin's image-pixel position to viewport client coords
  // — needed as the rotation anchor when the user holds right-click.
  // Uses the CLAMPED display position so off-map pins (from bad OCR
  // projections) still rotate around the visible handle, not their
  // hidden off-screen position.
  const pinClientCenter = (): { x: number; y: number } | null => {
    const el = overheadRef.current;
    if (!el || !cal || !selectedSpot) return null;
    if (selectedSpot.pixelX == null || selectedSpot.pixelY == null)
      return null;
    const rect = el.getBoundingClientRect();
    const dispX = Math.max(0, Math.min(cal.overheadW, selectedSpot.pixelX));
    const dispY = Math.max(0, Math.min(cal.overheadH, selectedSpot.pixelY));
    return {
      x: rect.left + (dispX / cal.overheadW) * rect.width,
      y: rect.top + (dispY / cal.overheadH) * rect.height,
    };
  };

  const handlePinMouseDown = (e: React.MouseEvent) => {
    if (!selectedSpot) return;
    if (e.button === 2) {
      // Right-click: rotate. Anchor at the pin's center so the angle
      // is independent of where on the pin the user clicked.
      e.stopPropagation();
      e.preventDefault();
      const c = pinClientCenter();
      if (!c) return;
      rotationDragRef.current = {
        spotId: selectedSpot.id,
        pinClientX: c.x,
        pinClientY: c.y,
      };
      return;
    }
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    draggingRef.current = true;
  };

  const handleOverheadMouseDown = (e: React.MouseEvent) => {
    if (!selectedSpot || !cal) return;
    if (e.button !== 0) return; // ignore right-click on empty space
    // Click-anywhere-to-nudge: place the pin at the clicked pixel and
    // arm a drag in one motion (user can release immediately or keep
    // dragging to refine).
    const pos = eventToImagePx(e.clientX, e.clientY);
    if (!pos) return;
    onSetPin(pos[0], pos[1]);
    draggingRef.current = true;
  };

  const handleOverheadMouseMove = (e: React.MouseEvent) => {
    // Rotation drag takes priority over position drag.
    if (rotationDragRef.current) {
      const { spotId, pinClientX, pinClientY } = rotationDragRef.current;
      const dx = e.clientX - pinClientX;
      const dy = e.clientY - pinClientY;
      // atan2(dx, -dy): 0° = cursor above pin, 90° = right, matches
      // the MapPin SVG which draws the arrow pointing up at 0°.
      const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
      onSetFacing(spotId, deg);
      return;
    }
    if (!draggingRef.current || !selectedSpot) return;
    const pos = eventToImagePx(e.clientX, e.clientY);
    if (!pos) return;
    onSetPin(pos[0], pos[1]);
  };

  const endDrag = () => {
    draggingRef.current = false;
    rotationDragRef.current = null;
  };

  return (
    <div className="mt-6 flex flex-col gap-4">
      {/* Top row: overhead on the left, source screenshot on the
          right. Side-by-side comparison is the whole point of this
          mode — eyes flick left ↔ right rather than scrolling. */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Overhead pane */}
        <div className="flex min-w-0 flex-col gap-2">
          <div
            ref={overheadRef}
            onMouseDown={handleOverheadMouseDown}
            onMouseMove={handleOverheadMouseMove}
            onMouseUp={endDrag}
            onMouseLeave={endDrag}
            onContextMenu={(e) => e.preventDefault()}
            className="relative overflow-hidden rounded-(--radius-card) border border-line bg-inset/40 select-none"
            style={{
              cursor: !selectedSpot
                ? "default"
                : draggingRef.current
                  ? "grabbing"
                  : "crosshair",
            }}
          >
            {cal ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={media(cal.overheadFile)}
                  alt={`${mapLabel} overhead`}
                  className="pointer-events-none block w-full select-none"
                  draggable={false}
                />
                {currentMapSpots.map((s) => {
                  if (s.pixelX == null || s.pixelY == null) return null;
                  const isSelected = s.id === selectedSpot?.id;
                  // Clamp the display position to overhead bounds so
                  // off-map pins (status "out-of-bounds" from a bad OCR
                  // projection) still surface inside the visible
                  // container as a draggable handle. Their actual
                  // pixelX/pixelY stay off-map until the user drags
                  // them back into bounds.
                  const dispX = Math.max(0, Math.min(cal.overheadW, s.pixelX));
                  const dispY = Math.max(0, Math.min(cal.overheadH, s.pixelY));
                  const offMap = dispX !== s.pixelX || dispY !== s.pixelY;
                  if (isSelected) {
                    return (
                      <span
                        key={s.id}
                        className="absolute -translate-x-1/2 -translate-y-1/2"
                        style={{
                          left: `${(dispX / cal.overheadW) * 100}%`,
                          top: `${(dispY / cal.overheadH) * 100}%`,
                          cursor: draggingRef.current
                            ? "grabbing"
                            : rotationDragRef.current
                              ? "ew-resize"
                              : "grab",
                        }}
                      >
                        {offMap && (
                          <span
                            aria-hidden
                            className="pointer-events-none absolute top-1/2 left-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full border-2 border-dashed"
                            style={{ borderColor: "var(--tile-far)" }}
                          />
                        )}
                        <MapPin
                          facingDeg={s.facingDeg}
                          variant="guess-large"
                          onMouseDown={handlePinMouseDown}
                          onContextMenu={(e) => e.preventDefault()}
                          title={
                            offMap
                              ? `Pin is OFF-MAP at (${Math.round(s.pixelX)}, ${Math.round(s.pixelY)}). Drag this handle to a real location.`
                              : "Drag to reposition · click overhead to teleport · right-click drag to rotate"
                          }
                        />
                      </span>
                    );
                  }
                  const dotClass =
                    s.status === "ok"
                      ? "h-2 w-2 bg-correct/80 shadow-[0_0_0_1px_var(--bg-base)]"
                      : "h-2 w-2 bg-far/80 shadow-[0_0_0_1px_var(--bg-base)]";
                  return (
                    <span
                      key={s.id}
                      className={
                        "pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full " +
                        dotClass
                      }
                      style={{
                        left: `${(dispX / cal.overheadW) * 100}%`,
                        top: `${(dispY / cal.overheadH) * 100}%`,
                      }}
                    />
                  );
                })}
              </>
            ) : (
              <div className="grid h-72 place-items-center font-mono text-[10px] uppercase tracking-[0.18em] text-far">
                No calibration for {mapLabel}. Calibrate it first.
              </div>
            )}
          </div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
            {selectedSpot ? (
              <>
                <span className="text-accent-soft">Drag the pin</span> to
                reposition.{" "}
                <span className="text-accent-soft">Right-click drag</span>{" "}
                to rotate the camera-facing arrow.
              </>
            ) : (
              <>Pick a spot below to inspect / drag its pin.</>
            )}
          </p>
        </div>

        {/* Screenshot pane — the unmasked source so the user can read
            the in-game POS HUD and cross-check the pin's location. */}
        <div className="flex min-w-0 flex-col gap-2">
          {selectedSpot && selectedOriginalUrl ? (
            <a
              href={selectedOriginalUrl}
              target="_blank"
              rel="noreferrer"
              className="block overflow-hidden rounded-(--radius-card) border border-line bg-inset/40"
              title="Open at full resolution in new tab"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedOriginalUrl}
                alt={selectedSpot.filename}
                className="block w-full select-none object-contain"
                style={{ maxHeight: "min(70vh, 700px)" }}
                draggable={false}
              />
            </a>
          ) : selectedSpot ? (
            <div className="grid h-72 place-items-center rounded-(--radius-card) border border-line bg-inset/40 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
              (no source image)
            </div>
          ) : (
            <div className="grid h-72 place-items-center rounded-(--radius-card) border border-dashed border-line bg-inset/30 p-6 text-center">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
                Pick a spot below to load its screenshot here.
              </p>
            </div>
          )}
          {selectedSpot && (
            <p className="font-mono text-[10px] tracking-[0.14em] text-ink-faint">
              <span className="text-ink-soft">{selectedSpot.filename}</span>{" "}
              ·{" "}
              <span
                className={
                  selectedSpot.status === "ok"
                    ? "text-correct"
                    : selectedSpot.status === "out-of-bounds"
                      ? "text-far"
                      : "text-accent-soft"
                }
              >
                {STATUS_COPY[selectedSpot.status]}
              </span>
              {selectedSpot.ocrConfidence > 0 && (
                <span className="ml-2 text-ink-faint/70">
                  ocr {Math.round(selectedSpot.ocrConfidence)}%
                </span>
              )}
              {" · click image for full res"}
            </p>
          )}
          {selectedSpot && (
            <OCRDiagPanel key={selectedSpot.id} spot={selectedSpot} />
          )}
        </div>
      </div>

      {/* Editor strip — only when a spot is selected. */}
      {selectedSpot && (
        <EditorStrip
          spot={selectedSpot}
          cal={cal}
          position={selectedIdx >= 0 ? selectedIdx + 1 : 0}
          total={orderedSpots.length}
          canNavigate={orderedSpots.length > 1}
          onFixCoords={(x, y, z) =>
            onFixCoords(selectedSpot.id, x, y, z)
          }
          onSetMap={(mk) => onSetMap(selectedSpot.id, mk)}
          onRemove={() => onRemove(selectedSpot.id)}
          onPrev={goPrev}
          onNext={goNext}
        />
      )}

      {/* Bottom: horizontal spot list. Attention spots first so
          the user encounters failures while scrolling left → right. */}
      <div className="rounded-(--radius-card) border border-line bg-inset/30 p-3">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-info">
            Spots
          </p>
          <span className="font-mono text-[10px] tracking-[0.18em] text-ink-faint">
            {attentionSpots.length > 0 && (
              <span className="text-far">
                ⚠ {attentionSpots.length} need attention
              </span>
            )}
            {attentionSpots.length > 0 && okSpots.length > 0 && " · "}
            {okSpots.length > 0 && (
              <span className="text-correct">✓ {okSpots.length} ok</span>
            )}
            {otherMapCount > 0 && (
              <span className="ml-2 text-ink-faint">
                · {otherMapCount} on other maps
              </span>
            )}
          </span>
        </div>
        {currentMapSpots.length === 0 ? (
          <p className="py-6 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
            No spots for this map yet. Drop screenshots above.
          </p>
        ) : (
          <ul className="-mx-1 flex gap-2 overflow-x-auto pb-1 [scrollbar-color:var(--accent)_transparent] [scrollbar-width:thin]">
            {orderedSpots.map((s) => (
              <HorizontalSpotCard
                key={s.id}
                spot={s}
                selected={s.id === selectedSpot?.id}
                onSelect={() => onSelect(s.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// Horizontal scrolling card used in the spot list at the bottom of
// the validate view. Fixed-width so the strip can have a stable
// scroll feel and the user's eye lands on the thumbnail consistently.
function HorizontalSpotCard(props: {
  spot: ProcessedSpot;
  selected: boolean;
  onSelect: () => void;
}) {
  const { spot, selected, onSelect } = props;
  const statusColor =
    spot.status === "ok"
      ? "text-correct"
      : spot.status === "out-of-bounds"
        ? "text-far"
        : "text-accent-soft";
  const mapLabel = spot.mapKey
    ? (MAPS.find((m) => m.key === spot.mapKey)?.label ?? spot.mapKey)
    : "—";
  return (
    <li className="shrink-0">
      <button
        type="button"
        onClick={onSelect}
        className={
          "flex w-36 flex-col gap-1 rounded-sm border p-1.5 text-left transition-colors " +
          (selected
            ? "border-accent bg-accent/10"
            : "border-line/60 bg-bg/30 hover:border-accent/40")
        }
      >
        <div className="relative aspect-video w-full overflow-hidden rounded-sm bg-bg/60">
          {spot.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={spot.thumbnailUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : null}
        </div>
        <span
          className={
            "font-mono text-[9px] uppercase tracking-[0.16em] " +
            statusColor
          }
        >
          {STATUS_COPY[spot.status]}
        </span>
        <span
          className="truncate font-mono text-[9px] uppercase tracking-[0.14em] text-ink-soft"
          title={
            spot.detectionMethod
              ? `Map assigned via ${spot.detectionMethod}`
              : "Map not yet assigned"
          }
        >
          {mapLabel}
          {spot.detectionMethod === "name" && (
            <span className="ml-1 text-info">·n</span>
          )}
          {spot.detectionMethod === "coords" && (
            <span className="ml-1 text-info">·c</span>
          )}
        </span>
        <span className="truncate font-mono text-[9px] tracking-[0.14em] text-ink-faint">
          {spot.filename}
        </span>
      </button>
    </li>
  );
}

// Compact horizontal editor with Map dropdown, X/Y/Z fields, save,
// delete, and Prev/Next nav. Sits between the overhead+screenshot row
// and the horizontal spot list.
function EditorStrip(props: {
  spot: ProcessedSpot;
  cal: CalibrationEntry | undefined;
  position: number;
  total: number;
  canNavigate: boolean;
  onFixCoords: (x: number, y: number, z: number) => void;
  onSetMap: (mapKey: string) => void;
  onRemove: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const {
    spot,
    cal,
    position,
    total,
    canNavigate,
    onFixCoords,
    onSetMap,
    onRemove,
    onPrev,
    onNext,
  } = props;
  const [draftX, setDraftX] = useState(spot.worldX?.toFixed(2) ?? "");
  const [draftY, setDraftY] = useState(spot.worldY?.toFixed(2) ?? "");
  const [draftZ, setDraftZ] = useState(spot.worldZ?.toFixed(2) ?? "");

  // Reset drafts when the selected spot changes.
  useEffect(() => {
    setDraftX(spot.worldX?.toFixed(2) ?? "");
    setDraftY(spot.worldY?.toFixed(2) ?? "");
    setDraftZ(spot.worldZ?.toFixed(2) ?? "");
  }, [spot.id, spot.worldX, spot.worldY, spot.worldZ]);

  const submit = () => {
    const x = parseFloat(draftX);
    const y = parseFloat(draftY);
    const z = parseFloat(draftZ);
    if (!isFinite(x) || !isFinite(y) || !isFinite(z)) return;
    onFixCoords(x, y, z);
  };

  return (
    <div className="flex flex-col gap-2 rounded-(--radius-card) border border-line bg-inset/40 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-[200px] flex-1 flex-col gap-0.5">
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-faint">
            Map
            {spot.detectionMethod && (
              <span className="ml-1 text-ink-faint/70 normal-case tracking-normal">
                · auto: {spot.detectionMethod}
              </span>
            )}
          </span>
          <select
            value={spot.mapKey || ""}
            onChange={(e) => onSetMap(e.target.value)}
            className="rounded-(--radius-card) border border-line bg-inset/60 px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
          >
            {!spot.mapKey && (
              <option value="" disabled>
                pick a map…
              </option>
            )}
            {MAPS.map((m) => (
              <option
                key={m.key}
                value={m.key}
                disabled={!CALIBRATIONS[m.key]}
              >
                {m.label}
                {!CALIBRATIONS[m.key] ? " · no calibration" : ""}
              </option>
            ))}
          </select>
        </label>
        {(
          [
            ["X", draftX, setDraftX],
            ["Y", draftY, setDraftY],
            ["Z", draftZ, setDraftZ],
          ] as const
        ).map(([label, val, setter]) => (
          <label
            key={label}
            className="flex w-[88px] flex-col gap-0.5"
          >
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-faint">
              {label}
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={val}
              onChange={(e) => setter(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              className="rounded-(--radius-card) border border-line bg-inset/60 px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
            />
          </label>
        ))}
        <button
          type="button"
          onClick={submit}
          title="Re-project pin from these world coords"
          className="rounded-(--radius-card) bg-accent px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-on-accent transition-opacity hover:opacity-90"
        >
          Save coords
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="rounded-(--radius-card) border border-line px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint transition-colors hover:border-far hover:text-far"
        >
          Delete
        </button>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="font-mono text-[10px] tracking-[0.18em] text-ink-faint">
            {position} / {total}
          </span>
          <button
            type="button"
            onClick={onPrev}
            disabled={!canNavigate}
            title="Previous spot (← arrow key)"
            className="rounded-(--radius-card) border border-line px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            ← Prev
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={!canNavigate}
            title="Next spot (→ arrow key)"
            className="rounded-(--radius-card) bg-info px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-info-on transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-t border-line/60 pt-2">
        <p className="font-mono text-[9px] leading-relaxed tracking-[0.14em] text-ink-faint">
          Save = re-project from coords. To place visually, leave coords
          and drag/click on the overhead instead.{" "}
          {cal && spot.pixelX != null && spot.pixelY != null && (
            <span className="text-ink-soft">
              Pin · ({Math.round(spot.pixelX)}, {Math.round(spot.pixelY)}){" "}
              of {cal.overheadW}×{cal.overheadH}
            </span>
          )}
        </p>
        <details className="font-mono text-[10px] tracking-[0.14em] text-ink-faint">
          <summary className="cursor-pointer">raw OCR text</summary>
          <pre className="mt-1 max-h-32 max-w-[600px] overflow-auto whitespace-pre-wrap break-all rounded-sm border border-line/50 bg-bg/60 p-2 text-ink-faint">
            {spot.ocrText || "(empty)"}
          </pre>
        </details>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Spot card — thumbnail + status + manual override fields
// ─────────────────────────────────────────────────────────────────────────

function SpotCard(props: {
  spot: ProcessedSpot;
  cal: CalibrationEntry | undefined;
  onRemove: () => void;
  onManualFix: (worldX: number, worldY: number, worldZ: number) => void;
}) {
  const { spot, cal, onRemove, onManualFix } = props;
  const [editing, setEditing] = useState(false);
  const [draftX, setDraftX] = useState<string>(spot.worldX?.toFixed(2) ?? "");
  const [draftY, setDraftY] = useState<string>(spot.worldY?.toFixed(2) ?? "");
  const [draftZ, setDraftZ] = useState<string>(spot.worldZ?.toFixed(2) ?? "");

  const statusColor =
    spot.status === "ok"
      ? "text-correct"
      : spot.status === "out-of-bounds"
        ? "text-far"
        : "text-accent-soft";

  const submitFix = () => {
    const x = parseFloat(draftX);
    const y = parseFloat(draftY);
    const z = parseFloat(draftZ);
    if (!isFinite(x) || !isFinite(y) || !isFinite(z)) return;
    onManualFix(x, y, z);
    setEditing(false);
  };

  return (
    <li className="flex flex-col gap-2 rounded-(--radius-card) border border-line bg-inset/40 p-3">
      <div className="relative aspect-video w-full overflow-hidden rounded-sm bg-bg/60">
        {spot.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={spot.thumbnailUrl}
            alt={spot.filename}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full place-items-center font-mono text-[10px] tracking-[0.18em] text-ink-faint">
            no preview
          </div>
        )}
        {spot.pixelX != null && spot.pixelY != null && cal && (
          <div
            className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_0_2px_var(--bg-base)]"
            style={{
              left: `${(spot.pixelX / cal.overheadW) * 100}%`,
              top: `${(spot.pixelY / cal.overheadH) * 100}%`,
            }}
            title="Auto-projected pixel position (relative to thumbnail isn't 1:1 with overhead — preview only)"
          />
        )}
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={
            "font-mono text-[10px] uppercase tracking-[0.16em] " + statusColor
          }
        >
          {STATUS_COPY[spot.status]}
          {spot.ocrConfidence > 0 && spot.status === "ok" && (
            <span className="ml-2 text-ink-faint">
              · ocr {Math.round(spot.ocrConfidence)}%
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="font-mono text-base leading-none text-ink-faint hover:text-far"
          aria-label="Delete spot"
        >
          ×
        </button>
      </div>
      <div className="font-mono text-[10px] tracking-[0.14em] text-ink-faint">
        {spot.filename}
      </div>
      {spot.worldX != null && spot.worldY != null && spot.worldZ != null && !editing && (
        <div className="font-mono text-[10px] tracking-[0.14em] text-ink-soft">
          ({spot.worldX.toFixed(2)}, {spot.worldY.toFixed(2)}, {spot.worldZ.toFixed(2)})
          {spot.pixelX != null && spot.pixelY != null && (
            <span className="ml-2 text-ink-faint">
              → ({Math.round(spot.pixelX)}, {Math.round(spot.pixelY)})
            </span>
          )}
        </div>
      )}
      {(spot.status !== "ok" || editing) && (
        <div className="flex flex-col gap-2">
          {!editing ? (
            <div className="flex flex-col gap-1">
              <p className="font-mono text-[9px] tracking-[0.14em] text-ink-faint">
                {spot.status === "ocr-failed"
                  ? "OCR couldn't parse a POS line. Type coords manually:"
                  : spot.status === "out-of-bounds"
                    ? "Auto-projected pin landed outside the overhead. Coord typo?"
                    : "Pick a calibrated map for this spot, or type coords manually."}
              </p>
              <button
                type="button"
                onClick={() => {
                  setDraftX(spot.worldX?.toFixed(2) ?? "");
                  setDraftY(spot.worldY?.toFixed(2) ?? "");
                  setDraftZ(spot.worldZ?.toFixed(2) ?? "");
                  setEditing(true);
                }}
                className="self-start rounded-(--radius-card) border border-accent-soft/60 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-accent-soft transition-colors hover:bg-accent-soft/10"
              >
                Edit coords
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <div className="grid grid-cols-3 gap-1">
                {(
                  [
                    ["X", draftX, setDraftX],
                    ["Y", draftY, setDraftY],
                    ["Z", draftZ, setDraftZ],
                  ] as const
                ).map(([label, val, setter]) => (
                  <label key={label} className="flex flex-col gap-0.5">
                    <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-faint">
                      {label}
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={val}
                      onChange={(e) => setter(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") submitFix();
                        if (e.key === "Escape") setEditing(false);
                      }}
                      className="rounded-(--radius-card) border border-line bg-inset/60 px-1.5 py-1 text-xs text-ink outline-none focus:border-accent"
                    />
                  </label>
                ))}
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={submitFix}
                  className="rounded-(--radius-card) bg-accent px-2 py-1 font-mono text-[9px] uppercase tracking-[0.18em] text-on-accent"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="rounded-(--radius-card) border border-line px-2 py-1 font-mono text-[9px] uppercase tracking-[0.18em] text-ink-faint"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {spot.ocrText && (
            <details className="font-mono text-[9px] tracking-[0.14em] text-ink-faint">
              <summary className="cursor-pointer">raw OCR text</summary>
              <pre className="mt-1 max-h-20 overflow-auto whitespace-pre-wrap break-all rounded-sm border border-line/50 bg-bg/60 p-1.5 text-ink-faint">
                {spot.ocrText}
              </pre>
            </details>
          )}
        </div>
      )}
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// OCR diag panel
//
// Per-spot debug surface for the validate view. Shows the raw Tesseract
// output for each OCR'd region (POS top-right, MAP top-left), the
// confidence per region, the parsed values, and — on demand — a preview
// of the preprocessed crop so the user can see exactly what pixels
// Tesseract was looking at.
//
// Defaults to open when the spot status is not "ok" (so failures are
// surfaced without an extra click); collapses for healthy spots.
// ─────────────────────────────────────────────────────────────────────────
function OCRDiagPanel({ spot }: { spot: ProcessedSpot }) {
  const [open, setOpen] = useState(spot.status !== "ok");
  const [posCropUrl, setPosCropUrl] = useState<string | null>(null);
  const [mapCropUrl, setMapCropUrl] = useState<string | null>(null);

  // Generate the preprocessed crop previews on demand. We re-run the
  // SAME preprocessing the OCR pass saw so what's shown matches what
  // Tesseract actually read. Lazy — only fires once the panel is open
  // for this spot to avoid loading + canvas work for every spot the
  // user clicks past.
  useEffect(() => {
    if (!open) return;
    if (posCropUrl && mapCropUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const img = await loadImage(spot.originalFile);
        if (cancelled) return;
        const posCanvas = preprocessRegionForOcr(img, HUD_TOP_RIGHT);
        const mapCanvas = preprocessRegionForOcr(img, HUD_TOP_LEFT);
        if (cancelled) return;
        setPosCropUrl(posCanvas.toDataURL("image/jpeg", 0.7));
        setMapCropUrl(mapCanvas.toDataURL("image/jpeg", 0.7));
      } catch {
        // ignore — preview is best-effort
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, spot.id, posCropUrl, mapCropUrl, spot.originalFile]);

  const posParsed =
    spot.worldX != null && spot.worldZ != null
      ? `(${spot.worldX.toFixed(2)}, ${
          spot.worldY != null ? spot.worldY.toFixed(2) : "?"
        }, ${spot.worldZ.toFixed(2)})`
      : null;

  return (
    <details
      open={open}
      onToggle={(e) =>
        setOpen((e.currentTarget as HTMLDetailsElement).open)
      }
      className="rounded-(--radius-card) border border-line/60 bg-bg/40 px-3 py-2"
    >
      <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.2em] text-info">
        OCR debug
      </summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <DiagRegion
          label={
            `POS · top-right · ${Math.round(spot.ocrPosConfidence)}%` +
            (spot.posVariant ? ` · recovered via ${spot.posVariant}` : "")
          }
          cropUrl={posCropUrl}
          rawText={spot.ocrPosText}
          parsedHint={
            posParsed ? (
              <>
                parsed: <span className="text-ink-soft">{posParsed}</span>
              </>
            ) : (
              <span className="text-far">regex did not match</span>
            )
          }
        />
        <DiagRegion
          label={`MAP · top-left · ${Math.round(spot.ocrMapConfidence)}%`}
          cropUrl={mapCropUrl}
          rawText={spot.ocrMapText}
          parsedHint={
            spot.detectionMethod === null ? (
              <span className="text-far">no map detected</span>
            ) : (
              <>
                detected:{" "}
                <span className="text-ink-soft">
                  {spot.mapKey || "?"}
                </span>{" "}
                <span className="text-ink-faint">
                  (via {spot.detectionMethod})
                </span>
              </>
            )
          }
        />
      </div>
    </details>
  );
}

function DiagRegion(props: {
  label: string;
  cropUrl: string | null;
  rawText: string;
  parsedHint: React.ReactNode;
}) {
  const { label, cropUrl, rawText, parsedHint } = props;
  return (
    <div>
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-faint">
        {label}
      </p>
      {cropUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cropUrl}
          alt=""
          className="mt-1 block w-full rounded-sm border border-line/60 bg-bg"
          style={{ imageRendering: "pixelated" }}
        />
      ) : (
        <div className="mt-1 grid h-12 place-items-center rounded-sm border border-dashed border-line/40">
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-faint">
            loading…
          </p>
        </div>
      )}
      <pre className="mt-1 max-h-28 overflow-y-auto rounded-sm bg-bg/60 px-2 py-1 font-mono text-[10px] leading-tight tracking-[0.04em] whitespace-pre-wrap break-words text-ink-soft">
        {rawText || "(empty)"}
      </pre>
      <p className="mt-1 font-mono text-[9px] tracking-[0.14em] text-ink-faint">
        {parsedHint}
      </p>
    </div>
  );
}
