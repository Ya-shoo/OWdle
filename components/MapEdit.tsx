"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import Link from "next/link";
import calibrationsData from "@/data/map-calibrations.json";
import { MAPS } from "@/lib/maps";
import { MapPin } from "@/components/MapPin";
import { applyProjection, inverseProjection } from "@/lib/affine";
import {
  buildProjection,
  CALIBRATION_MODE_OPTIONS,
  readCalibrationMode,
  writeCalibrationMode,
  type CalibrationEntry,
  type CalibrationMode,
  type EditedSpotSource,
} from "@/lib/calibration-mode";
import { media } from "@/lib/media";
import type { MapSpot } from "@/lib/daily";

export type SpotsByMap = Record<string, MapSpot[]>;

// ─────────────────────────────────────────────────────────────────────────
// Calibration parsing — delegates to lib/calibration-mode's shared
// buildProjection so the active mode (manual / tier-two / unconditional)
// can fold in edited spots from spots.json as additional fit constraints.
// ─────────────────────────────────────────────────────────────────────────

const CALIBRATIONS = calibrationsData as unknown as Record<
  string,
  CalibrationEntry
>;

// ─────────────────────────────────────────────────────────────────────────
// MapEdit — pick a map, edit every spot's pin + facing, save back.
// ─────────────────────────────────────────────────────────────────────────

export function MapEdit({ initialSpots }: { initialSpots: SpotsByMap }) {
  // Defensive copy of the server-passed initial state — we mutate this
  // freely as the user drags and we don't want to alias the prop.
  const [spotsByMap, setSpotsByMap] = useState<SpotsByMap>(() => {
    const copy: SpotsByMap = {};
    for (const [k, v] of Object.entries(initialSpots)) {
      copy[k] = v.map((s) => ({ ...s }));
    }
    return copy;
  });
  const [dirtyMaps, setDirtyMaps] = useState<Set<string>>(new Set());

  const mapsWithSpots = useMemo(
    () =>
      Object.entries(spotsByMap)
        .filter(([, v]) => v.length > 0)
        .map(([k]) => k),
    [spotsByMap],
  );

  // Honor a deep-link hash like `#map=<key>&spot=<id>` from the game's
  // dev "fix spot" shortcut so the requested spot is pre-selected on
  // mount. Computed during render (NOT in an effect) so the initial
  // state is correct before the auto-pick effect below runs — without
  // this the auto-pick effect would race ahead and overwrite the
  // requested spot with list[0] of whatever map happened to be the
  // initial selection. Pure client-side; SSR path falls through to
  // the default first map and no preselected spot.
  const initialFromHash = useMemo(() => {
    if (typeof window === "undefined") {
      return { map: mapsWithSpots[0] ?? null, spot: null as string | null };
    }
    const raw = window.location.hash.replace(/^#/, "");
    if (raw) {
      const params = new URLSearchParams(raw);
      const wantMap = params.get("map");
      const wantSpot = params.get("spot");
      if (wantMap && spotsByMap[wantMap]?.length) {
        return { map: wantMap, spot: wantSpot };
      }
    }
    return { map: mapsWithSpots[0] ?? null, spot: null as string | null };
    // Only on mount — subsequent in-page map switches shouldn't be
    // overridden by a stale hash from the deep-link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [selectedMapKey, setSelectedMapKey] = useState<string | null>(
    initialFromHash.map,
  );
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(
    initialFromHash.spot,
  );

  // Calibration mode — controls whether edits (this very page's output)
  // feed back into the projection used to render answer pins. Shared
  // with MapCalibrate via localStorage + same-tab custom event.
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

  // Per-map projection cache. Invalidates whenever the mode or the
  // working spotsByMap state changes — so dragging a pin updates the
  // projection used to display every OTHER spot's answer pin in the
  // current mode (only meaningful for tier-two / unconditional).
  const projectionByMap = useMemo(() => {
    const cache = new Map<string, ReturnType<typeof buildProjection>>();
    return cache;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, spotsByMap]);
  const getProj = (mapKey: string) => {
    if (projectionByMap.has(mapKey)) {
      return projectionByMap.get(mapKey) ?? null;
    }
    const calForMap = CALIBRATIONS[mapKey];
    const p = calForMap
      ? buildProjection(calForMap, {
          mapKey,
          spotsByMap: spotsByMap as Record<string, EditedSpotSource[]>,
          mode,
        })
      : null;
    projectionByMap.set(mapKey, p);
    return p;
  };

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const currentSpots = useMemo(
    () => (selectedMapKey ? (spotsByMap[selectedMapKey] ?? []) : []),
    [selectedMapKey, spotsByMap],
  );
  const selectedSpot = useMemo(
    () => currentSpots.find((s) => s.id === selectedSpotId) ?? null,
    [currentSpots, selectedSpotId],
  );
  const cal = selectedMapKey ? CALIBRATIONS[selectedMapKey] : undefined;
  const mapLabel =
    MAPS.find((m) => m.key === selectedMapKey)?.label ?? selectedMapKey ?? "";

  // Auto-pick the first spot when the map changes (or the prior pick
  // gets deleted) so the inspector pane isn't empty by default.
  useEffect(() => {
    if (!selectedMapKey) {
      setSelectedSpotId(null);
      return;
    }
    const list = spotsByMap[selectedMapKey] ?? [];
    if (list.length === 0) {
      setSelectedSpotId(null);
    } else if (!list.some((s) => s.id === selectedSpotId)) {
      setSelectedSpotId(list[0].id);
    }
  }, [selectedMapKey, spotsByMap, selectedSpotId]);

  const markDirty = (mapKey: string) => {
    setDirtyMaps((prev) => {
      if (prev.has(mapKey)) return prev;
      const next = new Set(prev);
      next.add(mapKey);
      return next;
    });
    setSavedAt(null);
  };

  const updateSpot = (
    id: string,
    mapKey: string,
    patch: Partial<MapSpot>,
  ) => {
    // Stamp editedAt on any patch that touches geometry — pin position,
    // world coords, or facing. Lets the calibrate page's feedback modes
    // tell which spots came from human review vs. raw OCR output.
    const touchesGeometry =
      patch.pixelX !== undefined ||
      patch.pixelY !== undefined ||
      patch.worldX !== undefined ||
      patch.worldY !== undefined ||
      patch.worldZ !== undefined ||
      patch.facingDeg !== undefined;
    const stampedPatch = touchesGeometry
      ? { ...patch, editedAt: new Date().toISOString() }
      : patch;
    setSpotsByMap((prev) => {
      const list = prev[mapKey] ?? [];
      return {
        ...prev,
        [mapKey]: list.map((s) =>
          s.id === id ? { ...s, ...stampedPatch } : s,
        ),
      };
    });
    markDirty(mapKey);
  };

  const deleteSelected = () => {
    if (!selectedSpot || !selectedMapKey) return;
    const idx = currentSpots.findIndex((s) => s.id === selectedSpot.id);
    setSpotsByMap((prev) => ({
      ...prev,
      [selectedMapKey]: (prev[selectedMapKey] ?? []).filter(
        (s) => s.id !== selectedSpot.id,
      ),
    }));
    markDirty(selectedMapKey);
    const after = currentSpots.filter((s) => s.id !== selectedSpot.id);
    if (after.length === 0) setSelectedSpotId(null);
    else setSelectedSpotId(after[Math.min(idx, after.length - 1)].id);
  };

  // ─── Drag + rotate ────────────────────────────────────────────────────

  // overheadRef = outer (fixed-aspect-ratio container). innerRef = the
  // transformed div holding the image + pins. We read innerRef's
  // bounding rect for click ↔ image-natural conversions so all the
  // existing math works unchanged under zoom + pan.
  const overheadRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const rotationDragRef = useRef<{
    spotId: string;
    pinClientX: number;
    pinClientY: number;
  } | null>(null);
  const panDragRef = useRef<{
    startCursorX: number;
    startCursorY: number;
    startPanX: number;
    startPanY: number;
  } | null>(null);

  const MIN_ZOOM = 1;
  const MAX_ZOOM = 8;
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Clamp pan so the (scaled) image never panes off-screen on its own
  // axis. At zoom z, the image's half-extent past the container edge is
  // W*(z-1)/2 (same for height); pan can shift it that much before the
  // opposite edge enters the container.
  const clampPan = (
    p: { x: number; y: number },
    z: number,
    W: number,
    H: number,
  ) => {
    if (z <= 1) return { x: 0, y: 0 };
    const limX = (W * (z - 1)) / 2;
    const limY = (H * (z - 1)) / 2;
    return {
      x: Math.max(-limX, Math.min(limX, p.x)),
      y: Math.max(-limY, Math.min(limY, p.y)),
    };
  };

  const resetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const eventToImagePx = (
    clientX: number,
    clientY: number,
  ): [number, number] | null => {
    const el = innerRef.current;
    if (!el || !cal) return null;
    const rect = el.getBoundingClientRect();
    return [
      ((clientX - rect.left) / rect.width) * cal.overheadW,
      ((clientY - rect.top) / rect.height) * cal.overheadH,
    ];
  };

  const pinClientCenter = (): { x: number; y: number } | null => {
    const el = innerRef.current;
    if (!el || !cal || !selectedSpot) return null;
    const rect = el.getBoundingClientRect();
    return {
      x: rect.left + (selectedSpot.pixelX / cal.overheadW) * rect.width,
      y: rect.top + (selectedSpot.pixelY / cal.overheadH) * rect.height,
    };
  };

  // Move the selected pin to (px, py) — image-natural coords — and
  // inverse-project to keep world coords in sync. Y is elevation and
  // not part of the 2D projection, so we leave it alone.
  const setSelectedPin = (px: number, py: number) => {
    if (!selectedSpot) return;
    const proj = getProj(selectedSpot.mapKey);
    let derivedX: number | null = null;
    let derivedZ: number | null = null;
    if (proj) {
      // Fix the elevation slice at the spot's stored worldY so TPS
      // inverse stays on the right floor of multi-level maps.
      const inv = inverseProjection(proj, px, py, selectedSpot.worldY);
      if (inv) {
        derivedX = inv[0];
        derivedZ = inv[1];
      }
    }
    updateSpot(selectedSpot.id, selectedSpot.mapKey, {
      pixelX: px,
      pixelY: py,
      worldX: derivedX ?? selectedSpot.worldX,
      worldZ: derivedZ ?? selectedSpot.worldZ,
    });
  };

  const setSelectedFacing = (deg: number) => {
    if (!selectedSpot) return;
    updateSpot(selectedSpot.id, selectedSpot.mapKey, { facingDeg: deg });
  };

  const handleOverheadMouseDown = (e: React.MouseEvent) => {
    if (!cal) return;
    if (e.button !== 0) return;
    // Zoomed in: drag the empty overhead to pan. Click-to-teleport-pin
    // is disabled at zoom > 1 — the user is panning to inspect, not to
    // place. They can still drag the pin itself, or zoom back out.
    if (zoom > 1) {
      panDragRef.current = {
        startCursorX: e.clientX,
        startCursorY: e.clientY,
        startPanX: pan.x,
        startPanY: pan.y,
      };
      return;
    }
    if (!selectedSpot) return;
    const pos = eventToImagePx(e.clientX, e.clientY);
    if (!pos) return;
    setSelectedPin(pos[0], pos[1]);
    draggingRef.current = true;
  };

  const handleOverheadMouseMove = (e: React.MouseEvent) => {
    if (rotationDragRef.current) {
      const { pinClientX, pinClientY } = rotationDragRef.current;
      const dx = e.clientX - pinClientX;
      const dy = e.clientY - pinClientY;
      // atan2(dx, -dy): 0° = cursor above pin, 90° = right. Matches
      // MapPin's arrow which points up at facingDeg=0.
      const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
      setSelectedFacing(deg);
      return;
    }
    if (panDragRef.current) {
      const el = overheadRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const newPan = {
        x: panDragRef.current.startPanX + (e.clientX - panDragRef.current.startCursorX),
        y: panDragRef.current.startPanY + (e.clientY - panDragRef.current.startCursorY),
      };
      setPan(clampPan(newPan, zoom, rect.width, rect.height));
      return;
    }
    if (!draggingRef.current || !selectedSpot) return;
    const pos = eventToImagePx(e.clientX, e.clientY);
    if (!pos) return;
    setSelectedPin(pos[0], pos[1]);
  };

  const handlePinMouseDown = (e: React.MouseEvent) => {
    if (!selectedSpot) return;
    if (e.button === 2) {
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

  // Global mouseup so a release outside the overhead (e.g. over the
  // inspector pane) still ends every drag cleanly.
  useEffect(() => {
    const onUp = () => {
      draggingRef.current = false;
      rotationDragRef.current = null;
      panDragRef.current = null;
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, []);

  // Wheel-to-zoom around the cursor. React's synthetic onWheel is
  // passive in modern React, so preventDefault() inside it is a no-op
  // and the page would scroll under us — attach a non-passive listener
  // directly to the DOM node instead. Re-attach whenever zoom/pan/cal
  // change so the handler closure has fresh values.
  useEffect(() => {
    const el = overheadRef.current;
    if (!el || !cal) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const W = rect.width;
      const H = rect.height;
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor));
      if (newZoom === zoom) return;
      // Keep the image pixel under the cursor fixed across the zoom
      // change. Closed-form: newPan = (cursor - center) * (1 - r) +
      // r * oldPan, where r = newZoom / oldZoom.
      const ratio = newZoom / zoom;
      const newPanRaw = {
        x: (cx - W / 2) * (1 - ratio) + ratio * pan.x,
        y: (cy - H / 2) * (1 - ratio) + ratio * pan.y,
      };
      setZoom(newZoom);
      setPan(
        newZoom === 1
          ? { x: 0, y: 0 }
          : clampPan(newPanRaw, newZoom, W, H),
      );
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoom, pan, cal]);

  // ─── Keyboard nav ─────────────────────────────────────────────────────

  const orderedIds = useMemo(
    () => currentSpots.map((s) => s.id),
    [currentSpots],
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      if (!selectedSpotId || orderedIds.length === 0) return;
      const idx = orderedIds.indexOf(selectedSpotId);
      if (idx < 0) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setSelectedSpotId(orderedIds[(idx + 1) % orderedIds.length]);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setSelectedSpotId(
          orderedIds[(idx - 1 + orderedIds.length) % orderedIds.length],
        );
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [orderedIds, selectedSpotId]);

  // ─── Save ─────────────────────────────────────────────────────────────

  // Posts to the standalone spots-server (scripts/spots-server.mjs).
  // The Next.js app is built with `output: "export"` which forbids API
  // routes, so the writeback lives in a separate Node process the user
  // runs alongside `next dev`. If the connection is refused, the most
  // common cause is that the server isn't running — we hint at that.
  const SPOTS_SERVER_URL = "http://localhost:3030/spots";
  const save = async () => {
    if (dirtyMaps.size === 0) return;
    setSaving(true);
    setSaveError(null);
    const payload: SpotsByMap = {};
    for (const k of dirtyMaps) {
      payload[k] = spotsByMap[k] ?? [];
    }
    try {
      const res = await fetch(SPOTS_SERVER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spots: payload }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      setDirtyMaps(new Set());
      setSavedAt(Date.now());
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // `TypeError: Failed to fetch` is the canonical browser-side
      // signal for "connection refused / DNS / CORS". The user almost
      // always just needs to start the helper script.
      if (msg.toLowerCase().includes("failed to fetch")) {
        setSaveError(
          "Can't reach spots-server. Run `npm run spots-server` in a second terminal, then try again.",
        );
      } else {
        setSaveError(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  // Warn on tab close with unsaved edits — protects against accidental
  // ⌘W / Ctrl+W mid-pass. Doesn't gate in-app navigation.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyMaps.size > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirtyMaps]);

  // Render the selected pin LAST so it draws on top of any clustered
  // unselected ones — otherwise it can disappear under neighbors.
  const pinsToRender = useMemo(() => {
    const sel = currentSpots.find((s) => s.id === selectedSpotId) ?? null;
    const others = currentSpots.filter((s) => s.id !== selectedSpotId);
    return sel ? [...others, sel] : others;
  }, [currentSpots, selectedSpotId]);

  return (
    // h-screen + flex column locks the whole tool to the viewport so
    // overhead, POV, inspector, and thumbnail strip all stay visible
    // without page scroll. Each region uses shrink-0 except the main
    // images row, which absorbs the remaining vertical space.
    <main className="flex h-screen flex-col overflow-hidden bg-bg text-ink">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <Link
            href="/labeler"
            className="font-mono text-[10px] uppercase tracking-[0.24em] text-info hover:text-accent"
            title="Back to dev hub"
          >
            ← Hub
          </Link>
          <h1 className="font-display text-xl text-ink leading-tight">
            Edit spots
          </h1>
          <p className="hidden font-mono text-[9px] uppercase tracking-[0.18em] text-ink-faint md:block">
            data/spots.json · saves via spots-server
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Calibration mode toggle — same state MapCalibrate reads,
              shared via localStorage. Controls whether THIS page's
              edits feed back into the projection used to render answer
              pins. Flip to compare how the fit changes. */}
          <div
            className="flex overflow-hidden rounded-(--radius-card) border border-line"
            title="Calibration mode — controls whether edited spots feed back into the projection"
          >
            {CALIBRATION_MODE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setMode(opt.value);
                  writeCalibrationMode(opt.value);
                }}
                aria-pressed={mode === opt.value}
                title={opt.description}
                className={
                  "px-2 py-1.5 font-mono text-[9px] uppercase tracking-[0.16em] transition-colors " +
                  (mode === opt.value
                    ? "bg-accent text-on-accent"
                    : "bg-inset/40 text-ink-faint hover:text-ink")
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">
              Map
            </span>
            <select
              value={selectedMapKey ?? ""}
              onChange={(e) => {
                setSelectedMapKey(e.target.value || null);
                setSelectedSpotId(null);
              }}
              className="rounded-(--radius-card) border border-line bg-inset/60 px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
            >
              {mapsWithSpots.length === 0 && (
                <option value="" disabled>
                  no spots in data/spots.json
                </option>
              )}
              {mapsWithSpots.map((k) => {
                const label = MAPS.find((m) => m.key === k)?.label ?? k;
                const n = (spotsByMap[k] ?? []).length;
                const dirty = dirtyMaps.has(k) ? " ●" : "";
                return (
                  <option key={k} value={k}>
                    {label} · {n} spots{dirty}
                  </option>
                );
              })}
            </select>
          </label>
          <button
            type="button"
            onClick={save}
            disabled={saving || dirtyMaps.size === 0}
            className="rounded-(--radius-card) bg-accent px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving
              ? "Saving…"
              : dirtyMaps.size === 0
                ? savedAt
                  ? "Saved ✓"
                  : "No changes"
                : `Save ${dirtyMaps.size} map${dirtyMaps.size === 1 ? "" : "s"}`}
          </button>
        </div>
      </header>

      {saveError && (
        <p className="shrink-0 border-b border-far/60 bg-far/10 px-4 py-1.5 font-mono text-[10px] text-far">
          Save failed: {saveError}
        </p>
      )}

      {!selectedMapKey ? (
        <p className="grid flex-1 place-items-center font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
          Pick a map to begin.
        </p>
      ) : !cal ? (
        <p className="grid flex-1 place-items-center px-4 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-far">
          {mapLabel} has no calibration in data/map-calibrations.json. Calibrate
          it first, then come back.
        </p>
      ) : (
        <>
          {/* Main row: overhead | POV side-by-side. min-h-0 lets the row
              actually shrink to fit; place-items-center lets each pane
              size to its image's intrinsic aspect ratio without spilling. */}
          <div className="grid min-h-0 flex-1 gap-3 px-3 py-3 sm:px-6 lg:grid-cols-2 lg:px-8">
            <div
              className="grid min-h-0 min-w-0 place-items-center"
              style={{ containerType: "size" }}
            >
              {/* Size the overhead to the LARGEST rectangle of the
                  calibration's aspect ratio that fits inside the grid
                  cell. `100cqw`/`100cqh` query the size of the container
                  that has `container-type: size`. We pick whichever
                  bound (width-from-cell-width or width-from-cell-height)
                  is smaller; symmetric for height. This replaces the
                  earlier maxWidth/maxHeight approach which collapsed to
                  0 under `place-items-center`. */}
              <div
                ref={overheadRef}
                onMouseDown={handleOverheadMouseDown}
                onMouseMove={handleOverheadMouseMove}
                onContextMenu={(e) => e.preventDefault()}
                className="relative overflow-hidden rounded-(--radius-card) border border-line bg-inset/40 select-none"
                style={{
                  aspectRatio: `${cal.overheadW} / ${cal.overheadH}`,
                  width: `min(100cqw, calc(100cqh * ${cal.overheadW} / ${cal.overheadH}))`,
                  height: `min(100cqh, calc(100cqw * ${cal.overheadH} / ${cal.overheadW}))`,
                  cursor: panDragRef.current
                    ? "grabbing"
                    : zoom > 1
                      ? "grab"
                      : !selectedSpot
                        ? "default"
                        : draggingRef.current
                          ? "grabbing"
                          : "crosshair",
                  touchAction: "none",
                }}
              >
                {/* Inner div carries the zoom + pan transform; the
                    outer container clips. Reading bounding rects off
                    `innerRef` makes click ↔ image-natural conversions
                    transform-aware without any explicit inverse math. */}
                <div
                  ref={innerRef}
                  className="absolute inset-0"
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    transformOrigin: "center center",
                    // No animation — the wheel handler is the user's
                    // own input loop; CSS transitions would lag behind
                    // and make pan-drag feel rubbery.
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={media(cal.overheadFile)}
                    alt={`${mapLabel} overhead`}
                    className="pointer-events-none block h-full w-full select-none"
                    draggable={false}
                  />
                  {pinsToRender.map((s) => {
                    const isSelected = s.id === selectedSpotId;
                    const dispX = Math.max(
                      0,
                      Math.min(cal.overheadW, s.pixelX),
                    );
                    const dispY = Math.max(
                      0,
                      Math.min(cal.overheadH, s.pixelY),
                    );
                    // Counter-scale so pins stay constant visual size
                    // regardless of zoom. translate(-50%,-50%) uses the
                    // pin's LAYOUT size (transform-invariant), so the
                    // pin's center stays anchored to (pixelX, pixelY)
                    // through any zoom.
                    const pinTransform = `translate(-50%, -50%) scale(${1 / zoom})`;
                    const wrapStyle: CSSProperties = {
                      left: `${(dispX / cal.overheadW) * 100}%`,
                      top: `${(dispY / cal.overheadH) * 100}%`,
                      transform: pinTransform,
                    };
                    if (isSelected) {
                      return (
                        <span
                          key={s.id}
                          className="absolute"
                          style={{
                            ...wrapStyle,
                            cursor: draggingRef.current
                              ? "grabbing"
                              : rotationDragRef.current
                                ? "ew-resize"
                                : "grab",
                          }}
                        >
                          <MapPin
                            facingDeg={s.facingDeg}
                            variant="guess-large"
                            onMouseDown={handlePinMouseDown}
                            onContextMenu={(e) => e.preventDefault()}
                            title="Drag to reposition · click overhead to teleport · right-click drag to rotate"
                          />
                        </span>
                      );
                    }
                    return (
                      <span
                        key={s.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSpotId(s.id);
                        }}
                        className="absolute cursor-pointer opacity-70 transition-opacity hover:opacity-100"
                        style={wrapStyle}
                        title={`Click to select · ${s.sourceFilename ?? s.id}`}
                      >
                        <MapPin facingDeg={s.facingDeg} variant="answer" />
                      </span>
                    );
                  })}
                </div>

                {/* Zoom HUD — small overlay so the user always knows
                    they're zoomed in and has a one-click escape. */}
                <div className="pointer-events-none absolute right-2 top-2 z-10 flex items-center gap-1 rounded-(--radius-card) border border-line bg-bg/80 px-2 py-1 font-mono text-[10px] tracking-[0.16em] text-ink-soft backdrop-blur">
                  <span>{zoom.toFixed(1)}×</span>
                  {zoom > 1 && (
                    <button
                      type="button"
                      onClick={resetZoom}
                      className="pointer-events-auto rounded-(--radius-card) border border-line/60 px-1.5 py-0.5 text-ink-faint transition-colors hover:border-accent hover:text-accent"
                      title="Reset zoom (1×)"
                    >
                      reset
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="grid min-h-0 min-w-0 place-items-center overflow-hidden rounded-(--radius-card) border border-line bg-inset/40">
              {selectedSpot ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={media(selectedSpot.screenshot)}
                  alt={selectedSpot.sourceFilename ?? selectedSpot.id}
                  className="max-h-full max-w-full object-contain"
                  draggable={false}
                />
              ) : (
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
                  Pick a spot below to compare to the overhead
                </p>
              )}
            </div>
          </div>

          {/* Compact inspector row: identity, X/Y/Z editor, readouts,
              delete. Keep it one row so the thumbnail strip below stays
              above the fold. */}
          <div className="shrink-0 border-t border-line bg-inset/30 px-3 py-2 sm:px-6 lg:px-8">
            {selectedSpot ? (
              <InspectorStrip
                spot={selectedSpot}
                overheadW={cal.overheadW}
                overheadH={cal.overheadH}
                onPatch={(patch) =>
                  updateSpot(selectedSpot.id, selectedSpot.mapKey, patch)
                }
                onDelete={deleteSelected}
                getProj={getProj}
              />
            ) : (
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
                No spot selected · click a green pin or a thumbnail · ← →
                arrow keys to navigate
              </p>
            )}
          </div>

          {/* Thumbnail strip — horizontal scroll, fixed height so it
              stays in view. */}
          <div className="shrink-0 border-t border-line bg-inset/30 px-3 py-2 sm:px-6 lg:px-8">
            <div className="mb-1 flex items-baseline justify-between">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-info">
                All spots · {currentSpots.length}
              </p>
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-faint">
                drag pin · right-click drag to rotate · ← → to navigate
              </p>
            </div>
            {currentSpots.length === 0 ? (
              <p className="py-3 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
                No spots on this map yet.
              </p>
            ) : (
              <ul className="-mx-1 flex gap-2 overflow-x-auto pb-1 [scrollbar-color:var(--accent)_transparent] [scrollbar-width:thin]">
                {currentSpots.map((s) => (
                  <li key={s.id} className="shrink-0">
                    <button
                      type="button"
                      onClick={() => setSelectedSpotId(s.id)}
                      className={
                        "flex w-28 flex-col gap-1 rounded-sm border p-1 text-left transition-colors " +
                        (s.id === selectedSpotId
                          ? "border-accent bg-accent/10"
                          : "border-line/60 bg-bg/30 hover:border-accent/40")
                      }
                    >
                      <div className="relative aspect-video w-full overflow-hidden rounded-sm bg-bg/60">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={media(s.screenshot)}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <span className="truncate font-mono text-[9px] tracking-[0.14em] text-ink-faint">
                        {s.sourceFilename ?? s.id}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// InspectorStrip — compact single-row editor that sits between the
// images and the thumbnail strip. Identity, X/Y/Z editor, live pin +
// facing readouts, and the delete button, all on one line so the
// thumbnail strip below stays in view without scrolling.
// ─────────────────────────────────────────────────────────────────────────

function InspectorStrip(props: {
  spot: MapSpot;
  overheadW: number;
  overheadH: number;
  onPatch: (patch: Partial<MapSpot>) => void;
  onDelete: () => void;
  // Mode-aware projection lookup from the parent — closes over the live
  // spotsByMap state so re-projection after a coord edit reflects the
  // current calibration mode + any in-flight edits.
  getProj: (mapKey: string) => ReturnType<typeof buildProjection> | null;
}) {
  const { spot, overheadW, overheadH, onPatch, onDelete, getProj } = props;

  // Draft state for manual coord entry. Syncs from props whenever the
  // selected spot changes OR a drag mutates the underlying world coords,
  // so the visible numbers stay accurate without thrashing while the
  // user is mid-typing.
  const [draftX, setDraftX] = useState(spot.worldX.toFixed(2));
  const [draftY, setDraftY] = useState(spot.worldY.toFixed(2));
  const [draftZ, setDraftZ] = useState(spot.worldZ.toFixed(2));
  useEffect(() => {
    setDraftX(spot.worldX.toFixed(2));
    setDraftY(spot.worldY.toFixed(2));
    setDraftZ(spot.worldZ.toFixed(2));
  }, [spot.id, spot.worldX, spot.worldY, spot.worldZ]);

  const submitCoords = () => {
    const x = parseFloat(draftX);
    const y = parseFloat(draftY);
    const z = parseFloat(draftZ);
    if (!isFinite(x) || !isFinite(y) || !isFinite(z)) return;
    const proj = getProj(spot.mapKey);
    if (!proj) {
      onPatch({ worldX: x, worldY: y, worldZ: z });
      return;
    }
    // Pass the OW vertical Y as the 3rd input — TPS consumes it,
    // affine/homography ignore it.
    const [pX, pY] = applyProjection(proj, x, z, y);
    onPatch({ worldX: x, worldY: y, worldZ: z, pixelX: pX, pixelY: pY });
  };

  const numCls =
    "w-20 rounded-(--radius-card) border border-line bg-bg/60 px-2 py-1 font-mono text-[11px] text-ink outline-none focus:border-accent";

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[10px] tracking-[0.12em]">
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-ink-soft" title={spot.id}>
          {spot.id}
        </span>
        <span
          className="truncate text-ink-faint"
          title={spot.sourceFilename}
        >
          {spot.sourceFilename ?? "—"}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {(
          [
            ["X", draftX, setDraftX],
            ["Y", draftY, setDraftY],
            ["Z", draftZ, setDraftZ],
          ] as const
        ).map(([label, val, setter]) => (
          <label key={label} className="flex items-center gap-1">
            <span className="text-ink-faint">{label}</span>
            <input
              type="text"
              inputMode="decimal"
              value={val}
              onChange={(e) => setter(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitCoords();
              }}
              className={numCls}
            />
          </label>
        ))}
        <button
          type="button"
          onClick={submitCoords}
          title="Re-project pin from these world coords"
          className="rounded-(--radius-card) border border-line px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-ink transition-colors hover:border-accent hover:text-accent"
        >
          Re-project
        </button>
      </div>

      <div className="flex flex-col leading-tight text-ink-soft">
        <span>
          <span className="text-ink-faint">pin</span> ({Math.round(spot.pixelX)},{" "}
          {Math.round(spot.pixelY)}) of {overheadW}×{overheadH}
        </span>
        <span>
          <span className="text-ink-faint">facing</span>{" "}
          {spot.facingDeg != null ? `${spot.facingDeg.toFixed(1)}°` : "—"}
        </span>
      </div>

      <button
        type="button"
        onClick={onDelete}
        className="ml-auto rounded-(--radius-card) border border-line px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint transition-colors hover:border-far hover:text-far"
      >
        Delete
      </button>
    </div>
  );
}
