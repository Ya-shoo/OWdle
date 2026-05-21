// Auto-detect which OW map a screenshot belongs to. Two strategies,
// tried in order:
//
//   1. NAME — OCR'd from the workshop HUD's "MAP: {Current Map}" line.
//      Fuzzy-matched against data/maps.json labels (normalizing case +
//      punctuation, then substring fallback to tolerate OCR artifacts
//      like "KING5 ROW VV" → "King's Row"). Most reliable, works from
//      day 1 if the workshop rule includes the MAP line.
//
//   2. COORDS — every map has a distinctive (worldX, worldZ) playable
//      range. We compute per-map bounding boxes from existing spots in
//      data/spots.json (plus padding for boundary spots), then check
//      which one contains the new POS. Bootstrap-only for new maps —
//      the first spot of an empty map can't be auto-detected this way.
//
// If both strategies fail, the spot lands in the review page's
// "needs map" bucket with a manual-pick dropdown.

import spotsData from "@/data/spots.json";
import { MAPS } from "@/lib/maps";

type SpotLite = { worldX: number; worldZ: number };

type MapBbox = {
  mapKey: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

// Padding around the observed spot range. 30 world-units lets a new
// capture near the playable-area edge still match. If we ever see two
// maps' bboxes overlapping, tighten this.
const BBOX_PADDING = 30;

function computeBboxes(): MapBbox[] {
  const grouped = spotsData as Record<string, SpotLite[]>;
  const out: MapBbox[] = [];
  for (const [mapKey, spots] of Object.entries(grouped)) {
    if (!spots || spots.length === 0) continue;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const s of spots) {
      if (s.worldX < minX) minX = s.worldX;
      if (s.worldX > maxX) maxX = s.worldX;
      if (s.worldZ < minZ) minZ = s.worldZ;
      if (s.worldZ > maxZ) maxZ = s.worldZ;
    }
    out.push({
      mapKey,
      minX: minX - BBOX_PADDING,
      maxX: maxX + BBOX_PADDING,
      minZ: minZ - BBOX_PADDING,
      maxZ: maxZ + BBOX_PADDING,
    });
  }
  return out;
}

// Cached at module load. spots.json is bundled at build time so it
// doesn't change at runtime; the dev page needs a reload to pick up
// newly-synced spots, which is fine for the labeler workflow.
const BBOXES = computeBboxes();

export type DetectionMethod = "name" | "coords";

export type MapDetection = {
  mapKey: string;
  method: DetectionMethod;
  /**
   * For coord-based detection: all map keys whose bboxes contain the
   * point. Length 1 means unambiguous; length >1 means we picked the
   * closest by centroid and the caller should consider asking the
   * user to confirm.
   */
  candidates: string[];
};

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function detectMapByName(rawName: string): string | null {
  const target = norm(rawName);
  if (!target || target.length < 3) return null;
  // Exact-normalized match.
  for (const m of MAPS) {
    if (norm(m.label) === target) return m.key;
  }
  // Substring tolerance — OCR sometimes drops trailing chars or
  // attaches junk from neighbouring HUD lines.
  for (const m of MAPS) {
    const labelNorm = norm(m.label);
    if (labelNorm.length < 4) continue;
    if (target.includes(labelNorm) || labelNorm.includes(target)) {
      return m.key;
    }
  }
  return null;
}

export function detectMapByCoords(
  worldX: number,
  worldZ: number,
): { mapKey: string; candidates: string[] } | null {
  const matches = BBOXES.filter(
    (b) =>
      worldX >= b.minX &&
      worldX <= b.maxX &&
      worldZ >= b.minZ &&
      worldZ <= b.maxZ,
  );
  if (matches.length === 0) return null;
  if (matches.length === 1) {
    return { mapKey: matches[0].mapKey, candidates: [matches[0].mapKey] };
  }
  // Ambiguous — pick by centroid distance, expose all candidates.
  let best = matches[0];
  let bestDist = Infinity;
  for (const m of matches) {
    const cx = (m.minX + m.maxX) / 2;
    const cz = (m.minZ + m.maxZ) / 2;
    const d = (worldX - cx) ** 2 + (worldZ - cz) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = m;
    }
  }
  return { mapKey: best.mapKey, candidates: matches.map((m) => m.mapKey) };
}

export function detectMap(
  ocrMapName: string | null,
  worldX: number | null,
  worldZ: number | null,
): MapDetection | null {
  if (ocrMapName) {
    const byName = detectMapByName(ocrMapName);
    if (byName) return { mapKey: byName, method: "name", candidates: [byName] };
  }
  if (worldX != null && worldZ != null) {
    const byCoords = detectMapByCoords(worldX, worldZ);
    if (byCoords && byCoords.candidates.length === 1) {
      return {
        mapKey: byCoords.mapKey,
        method: "coords",
        candidates: byCoords.candidates,
      };
    }
  }
  return null;
}

// For diagnostics / debug surfacing in the UI ("can't decide between
// King's Row and Hanamura because your bboxes overlap").
export function debugAmbiguousCoords(
  worldX: number,
  worldZ: number,
): string[] {
  const matches = BBOXES.filter(
    (b) =>
      worldX >= b.minX &&
      worldX <= b.maxX &&
      worldZ >= b.minZ &&
      worldZ <= b.maxZ,
  );
  return matches.map((m) => m.mapKey);
}
