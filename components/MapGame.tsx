"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  dayString,
  getAllMapSpots,
  getMapRoundsForDay,
  getMapSpotsByIds,
  type MapSpot,
} from "@/lib/daily";
import { MAPS, type Gamemode } from "@/lib/maps";
import {
  loadMapState,
  saveMapState,
  getSpotFeedback,
  updateSpotFeedback,
  type MapRoundResult,
  type MapState,
  type SpotDifficulty,
  type SpotFeedback,
} from "@/lib/storage";
import { scoreClick, MAX_ROUND_SCORE } from "@/lib/scoring";
import { media } from "@/lib/media";
import { MapPin } from "@/components/MapPin";
import calibrationsData from "@/data/map-calibrations.json";
import bannersData from "@/data/banners.json";
import gamemodeIconsData from "@/data/gamemodes.json";

type Calibration = {
  overheadFile: string;
  overheadW: number;
  overheadH: number;
};
const CALIBRATIONS = calibrationsData as Record<string, Calibration>;

// Cinematic banner art per map, sourced from OverFast `/maps` and
// preprocessed into public/banners/maps/{key}.jpg by scripts/
// build-banners.mjs. Each entry: { key, label, file }. Three maps
// (horizon-lunar-colony, temple-of-anubis, volskaya-industries) are
// missing from OverFast's catalog; for those the picker falls back to
// the overhead thumbnail.
const BANNER_BY_KEY: Record<string, string> = Object.fromEntries(
  (bannersData.maps as Array<{ key: string; file: string }>).map((m) => [
    m.key,
    m.file,
  ]),
);

function mapPreview(
  mapKey: string,
  overheadFallback?: string | null,
): string | null {
  const raw = BANNER_BY_KEY[mapKey] ?? overheadFallback ?? null;
  return raw ? media(raw) : null;
}

// Official Overwatch gamemode icons fetched from the Fandom wiki by
// scripts/build-gamemodes.mjs and stored under public/gamemodes/.
// Lookup keyed by lower-case gamemode (matches data/maps.json).
const GAMEMODE_ICON_BY_KEY: Record<string, string> = Object.fromEntries(
  (gamemodeIconsData as Array<{ key: string; file: string }>).map((g) => [
    g.key,
    g.file,
  ]),
);

const ROUNDS_PER_DAY = 5;

// Wrong-map penalty: the second guess can only earn distance points
// (no map bonus) and at half rate. Configurable so we can tune later
// without touching the scoring lib.
const SECOND_GUESS_DISTANCE_FACTOR = 0.5;

type Phase = "guessing" | "wrong-map" | "result" | "done";

export function MapGame() {
  const [day, setDay] = useState<string | null>(null);
  const [spots, setSpots] = useState<MapSpot[]>([]);
  const [state, setState] = useState<MapState | null>(null);

  // POV image zoom/pan. Separate from the minimap's zoom (which is the
  // existing `zoom`/`pan` state below). Auto-resets when the round
  // advances — handled by passing the current spot's id as the resetKey.
  // currentSpot is defined further down; we use state.currentRound as a
  // stable signal that's available here.
  const povZoom = useImageZoomPan({ resetKey: state?.currentRound });

  // Active round transient state. Reset on round transition.
  const [phase, setPhase] = useState<Phase>("guessing");
  const [selectedMap, setSelectedMap] = useState<string | null>(null);
  const [pin, setPin] = useState<[number, number] | null>(null);
  const [pendingFirstGuess, setPendingFirstGuess] = useState<{
    guessedMap: string;
    guessedPx: [number, number] | null;
  } | null>(null);
  const [committedRound, setCommittedRound] = useState<MapRoundResult | null>(
    null,
  );
  const [minimapHovered, setMinimapHovered] = useState(false);
  // Map picker open/closed. Defaults to closed; opens when the player
  // hasn't picked yet (or hits "Change map"), closes when they pick.
  const [pickerOpen, setPickerOpen] = useState(false);
  // Auto-open the picker when a fresh round starts with no pick yet.
  useEffect(() => {
    setPickerOpen(selectedMap == null && phase === "guessing");
  }, [selectedMap, phase]);

  // Minimap zoom/pan. zoom is a multiplier (1 = fit). pan is in CSS
  // pixels relative to the viewport center, applied as a CSS translate.
  // Reset on map / round change so the player starts each pin task at
  // the same neutral state.
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const overheadRef = useRef<HTMLDivElement | null>(null);
  // Drag tracking — distinguishes a drag-to-pan from a click-to-pin.
  // We commit the pin on mouseup only when the cursor barely moved.
  const dragRef = useRef<{
    startCx: number;
    startCy: number;
    startPanX: number;
    startPanY: number;
    moved: boolean;
  } | null>(null);
  // True while the user is mid-drag on the GUESS PIN itself (separate
  // from dragging the overhead to pan). Set on pin mousedown, cleared
  // on mouseup. Takes priority over pan-drag and over the click-to-
  // teleport path. We track the start position + a moved flag so we
  // can tell a deliberate drag from a tap that happens to land on the
  // pin's bbox — at any zoom the pin counter-scales to a fixed 34×34
  // CSS-px hit area, so "tap a few pixels away" still lands on the
  // pin and would otherwise be a no-op.
  const pinDragRef = useRef<{
    startCx: number;
    startCy: number;
    moved: boolean;
  } | null>(null);

  // Hydrate spots + persisted state on mount.
  useEffect(() => {
    const today = dayString();
    setDay(today);
    // Dev randomize-picks override. When the DevRandomize button has
    // written a list of spot IDs to `owdle.map.${day}.override`, use
    // those instead of the deterministic daily picks so testers can
    // cycle through fresh selections without waiting for a new day.
    // Falls through to the daily picks if parsing fails, the override
    // is empty, or the listed IDs no longer resolve to real spots.
    let picks: MapSpot[] = [];
    if (typeof window !== "undefined") {
      const overrideRaw = window.localStorage.getItem(
        `owdle.map.${today}.override`,
      );
      if (overrideRaw) {
        try {
          const ids = JSON.parse(overrideRaw);
          if (Array.isArray(ids)) {
            const resolved = getMapSpotsByIds(ids.filter((x): x is string => typeof x === "string"));
            if (resolved.length === ROUNDS_PER_DAY) picks = resolved;
          }
        } catch {
          /* fall through to daily picks */
        }
      }
    }
    if (picks.length === 0) picks = getMapRoundsForDay(today, ROUNDS_PER_DAY);
    setSpots(picks);

    let saved = loadMapState(today);
    const sameDayAndShape =
      saved.spotIds.length === picks.length &&
      saved.spotIds.every((id, i) => picks[i] && id === picks[i].id);
    if (!sameDayAndShape) {
      saved = {
        day: today,
        spotIds: picks.map((p) => p.id),
        rounds: [],
        currentRound: 0,
      };
    }
    setState(saved);

    // Resume into a fresh-guess phase for the active round, or done if
    // all rounds were already played.
    if (saved.currentRound >= picks.length) {
      setPhase("done");
    } else {
      setPhase("guessing");
    }
  }, []);

  // Persist on every state change.
  useEffect(() => {
    if (!state) return;
    saveMapState(state);
  }, [state]);

  // Clear active-round state when the round index advances.
  useEffect(() => {
    setSelectedMap(null);
    setPin(null);
    setPendingFirstGuess(null);
    setCommittedRound(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [state?.currentRound]);

  // Derived references used by the hooks below. Computed with null
  // safety so they exist on early renders before spots have hydrated.
  const currentSpot = spots[state?.currentRound ?? 0];
  const currentCal: Calibration | undefined = currentSpot
    ? CALIBRATIONS[currentSpot.mapKey]
    : undefined;
  const activeMapKey: string | null =
    phase === "wrong-map" && currentSpot
      ? currentSpot.mapKey
      : selectedMap;
  const activeCal: Calibration | null = activeMapKey
    ? CALIBRATIONS[activeMapKey] ?? null
    : null;

  // Reset zoom/pan when the active overhead changes (round → next, or
  // wrong-map auto-flip to the correct map). Hook must run before any
  // early return — Rules of Hooks.
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [activeMapKey]);

  // ResizeObserver: scale pan proportionally as the minimap card
  // grows/shrinks on hover. Pan is stored in CSS pixels of the OUTER
  // container — when the outer resizes, the same pan in pixels would
  // point to a different fraction of the image. Scaling pan by
  // newWidth/oldWidth preserves the visible image area (within rounding),
  // so zoom state survives the hover transition without the image
  // sliding out of the viewport.
  useEffect(() => {
    const el = overheadRef.current;
    if (!el) return;
    let lastW = el.getBoundingClientRect().width;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (!w || !lastW || w === lastW) {
        lastW = w || lastW;
        return;
      }
      const scale = w / lastW;
      lastW = w;
      setPan((p) => ({ x: p.x * scale, y: p.y * scale }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [activeCal]);

  // Anchored zoom helper. vx/vy are CSS-px inside the overhead element.
  // Used by wheel, Safari gesture, and pinch-touch paths so all three
  // input modalities feel identical.
  const overheadZoomAt = useCallback(
    (vx: number, vy: number, factor: number) => {
      const el = overheadRef.current;
      if (!el || !activeCal) return;
      const rect = el.getBoundingClientRect();
      const vpW = rect.width;
      const vpH = rect.height;
      setZoom((curZoom) => {
        const newZoom = Math.max(1, Math.min(16, curZoom * factor));
        if (newZoom === curZoom) return curZoom;
        setPan((curPan) => {
          // The inner wrapper is uniformly scaled: width: 100%
          // (= vpW), height: vpW * overheadH/overheadW. So the
          // CSS-px→image-px ratio is `overheadW/vpW` on BOTH axes.
          const cssToImage = activeCal.overheadW / vpW;
          const innerH = vpW * (activeCal.overheadH / activeCal.overheadW);
          // Image-pixel under cursor at the OLD zoom/pan.
          const ix =
            activeCal.overheadW / 2 +
            ((vx - vpW / 2 - curPan.x) / curZoom) * cssToImage;
          const iy =
            activeCal.overheadH / 2 +
            ((vy - vpH / 2 - curPan.y) / curZoom) * cssToImage;
          // Solve for newPan that keeps (ix, iy) under the cursor.
          const newPanX =
            vx - vpW / 2 - ((ix - activeCal.overheadW / 2) * newZoom) / cssToImage;
          const newPanY =
            vy - vpH / 2 - ((iy - activeCal.overheadH / 2) * newZoom) / cssToImage;
          const maxPanX = ((newZoom - 1) * vpW) / 2;
          const maxPanY = Math.max(0, (newZoom * innerH - vpH) / 2);
          return {
            x: Math.max(-maxPanX, Math.min(maxPanX, newPanX)),
            y: Math.max(-maxPanY, Math.min(maxPanY, newPanY)),
          };
        });
        return newZoom;
      });
    },
    [activeCal],
  );

  // Wheel zoom — anchored at the cursor. addEventListener with
  // `passive: false` because React's synthetic wheel handler is
  // passive and can't preventDefault the page scroll. Trackpad pinch
  // on Chrome/Firefox/Edge fires wheel events with `ctrlKey: true`
  // and small deltaY; a tighter divisor lets pinch feel responsive
  // without overshooting in the regular-scroll path.
  useEffect(() => {
    const el = overheadRef.current;
    if (!el || !activeCal) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const vx = e.clientX - rect.left;
      const vy = e.clientY - rect.top;
      const factor = e.ctrlKey
        ? Math.exp(-e.deltaY / 100)
        : Math.exp(-e.deltaY / 400);
      overheadZoomAt(vx, vy, factor);
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [activeCal, activeMapKey, overheadZoomAt]);

  // Safari trackpad pinch — fires gesturestart / gesturechange /
  // gestureend instead of ctrlKey-wheel. Route through the same
  // anchored-zoom helper so the feel matches Chrome.
  useEffect(() => {
    const el = overheadRef.current;
    if (!el || !activeCal) return;
    let lastScale = 1;
    let anchorX = 0;
    let anchorY = 0;
    type GestureEv = Event & { scale: number; clientX: number; clientY: number };
    const onStart = (raw: Event) => {
      const e = raw as GestureEv;
      e.preventDefault();
      lastScale = 1;
      const rect = el.getBoundingClientRect();
      anchorX = e.clientX - rect.left;
      anchorY = e.clientY - rect.top;
    };
    const onChange = (raw: Event) => {
      const e = raw as GestureEv;
      e.preventDefault();
      const factor = e.scale / lastScale;
      lastScale = e.scale;
      overheadZoomAt(anchorX, anchorY, factor);
    };
    const onEnd = (raw: Event) => raw.preventDefault();
    el.addEventListener("gesturestart", onStart as EventListener);
    el.addEventListener("gesturechange", onChange as EventListener);
    el.addEventListener("gestureend", onEnd as EventListener);
    return () => {
      el.removeEventListener("gesturestart", onStart as EventListener);
      el.removeEventListener("gesturechange", onChange as EventListener);
      el.removeEventListener("gestureend", onEnd as EventListener);
    };
  }, [activeCal, activeMapKey, overheadZoomAt]);

  // Touch gestures. One finger = pan (when zoomed) or tap-to-pin.
  // Two fingers = pinch zoom anchored at the midpoint. Touch
  // bookkeeping is separate from the mouse path so a touch device
  // doesn't fire phantom mouse events that confuse the drag refs.
  const overheadTouchRef = useRef<
    | { mode: "pan"; startX: number; startY: number; startPanX: number; startPanY: number; moved: boolean }
    | { mode: "pinch"; lastDist: number }
    | { mode: "tap"; startX: number; startY: number }
    | null
  >(null);
  useEffect(() => {
    const el = overheadRef.current;
    if (!el || !activeCal) return;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const t = e.touches[0];
        // At zoom > 1 a single finger pans. Otherwise it's a tap that
        // ends in placing the pin (or moving the existing pin).
        if (zoom > 1) {
          overheadTouchRef.current = {
            mode: "pan",
            startX: t.clientX,
            startY: t.clientY,
            startPanX: pan.x,
            startPanY: pan.y,
            moved: false,
          };
        } else {
          overheadTouchRef.current = {
            mode: "tap",
            startX: t.clientX,
            startY: t.clientY,
          };
        }
        e.preventDefault();
      } else if (e.touches.length === 2) {
        const [t1, t2] = [e.touches[0], e.touches[1]];
        const d = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        overheadTouchRef.current = { mode: "pinch", lastDist: d };
        e.preventDefault();
      }
    };

    const onMove = (e: TouchEvent) => {
      const st = overheadTouchRef.current;
      if (!st) return;
      if (st.mode === "pinch" && e.touches.length === 2) {
        const [t1, t2] = [e.touches[0], e.touches[1]];
        const rect = el.getBoundingClientRect();
        const d = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const factor = d / st.lastDist;
        st.lastDist = d;
        const midX = (t1.clientX + t2.clientX) / 2 - rect.left;
        const midY = (t1.clientY + t2.clientY) / 2 - rect.top;
        overheadZoomAt(midX, midY, factor);
        e.preventDefault();
      } else if (st.mode === "pan" && e.touches.length === 1) {
        const t = e.touches[0];
        const rect = el.getBoundingClientRect();
        const innerH = rect.width * (activeCal.overheadH / activeCal.overheadW);
        const dx = t.clientX - st.startX;
        const dy = t.clientY - st.startY;
        if (!st.moved && Math.hypot(dx, dy) > 4) st.moved = true;
        if (!st.moved) return;
        const maxPanX = ((zoom - 1) * rect.width) / 2;
        const maxPanY = Math.max(0, (zoom * innerH - rect.height) / 2);
        setPan({
          x: Math.max(-maxPanX, Math.min(maxPanX, st.startPanX + dx)),
          y: Math.max(-maxPanY, Math.min(maxPanY, st.startPanY + dy)),
        });
        e.preventDefault();
      } else if (st.mode === "tap" && e.touches.length === 1) {
        // If finger drifts too far, treat as cancelled tap.
        const t = e.touches[0];
        const dx = t.clientX - st.startX;
        const dy = t.clientY - st.startY;
        if (Math.hypot(dx, dy) > 8) overheadTouchRef.current = null;
      }
    };

    const onEnd = (e: TouchEvent) => {
      const st = overheadTouchRef.current;
      if (!st) return;
      if (e.touches.length === 0) {
        // Tap → place pin at touch position, mirroring click-to-pin.
        if (st.mode === "tap" && phase !== "result" && phase !== "done") {
          const last = e.changedTouches[0];
          if (last && activeCal) {
            const rect = el.getBoundingClientRect();
            const vx = last.clientX - rect.left;
            const vy = last.clientY - rect.top;
            const vpW = rect.width;
            const vpH = rect.height;
            const px =
              activeCal.overheadW / 2 +
              ((vx - vpW / 2 - pan.x) / zoom) * (activeCal.overheadW / vpW);
            const py =
              activeCal.overheadH / 2 +
              ((vy - vpH / 2 - pan.y) / zoom) * (activeCal.overheadH / vpW);
            setPin([px, py]);
          }
        }
        overheadTouchRef.current = null;
      }
    };

    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [activeCal, activeMapKey, zoom, pan, phase, overheadZoomAt]);

  if (!state || !day) {
    return (
      <main className="grid min-h-screen place-items-center bg-bg text-ink">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">
          Loading…
        </p>
      </main>
    );
  }

  if (spots.length === 0) {
    return (
      <main className="grid min-h-screen place-items-center bg-bg text-ink">
        <div className="text-center">
          <h1 className="font-display text-3xl text-ink">Map mode</h1>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">
            No spots captured yet. Check back soon.
          </p>
        </div>
      </main>
    );
  }

  const totalScoreSoFar = state.rounds.reduce(
    (sum, r) => sum + r.pointsTotal,
    0,
  );

  // ── Submit a guess ─────────────────────────────────────────────────────
  const submitGuess = () => {
    if (phase === "guessing") {
      if (!selectedMap || !pin) return;
      const isRight = selectedMap === currentSpot.mapKey;
      if (isRight) {
        const result = scoreClick({
          guessedMap: selectedMap,
          actualMap: currentSpot.mapKey,
          guessedPx: pin,
          actualPx: [currentSpot.pixelX, currentSpot.pixelY],
          overheadW: currentCal?.overheadW ?? 5000,
          overheadH: currentCal?.overheadH ?? 5000,
        });
        const round: MapRoundResult = {
          spotId: currentSpot.id,
          mapKey: currentSpot.mapKey,
          firstGuess: { guessedMap: selectedMap, guessedPx: pin },
          secondGuess: null,
          pointsMap: result.mapBonus,
          pointsDistance: result.distancePoints,
          pointsTotal: result.totalScore,
          wrongMapFirst: false,
          skipped: false,
        };
        commitRound(round);
      } else {
        // Wrong map — record the first guess and surface the
        // forced-second-guess phase.
        setPendingFirstGuess({
          guessedMap: selectedMap,
          guessedPx: pin,
        });
        setPhase("wrong-map");
        setPin(null); // clear pin for the new map
      }
      return;
    }

    if (phase === "wrong-map") {
      if (!pin) return;
      // Second guess. Score on distance only, halved, no map bonus.
      const inner = scoreClick({
        guessedMap: currentSpot.mapKey,
        actualMap: currentSpot.mapKey,
        guessedPx: pin,
        actualPx: [currentSpot.pixelX, currentSpot.pixelY],
        overheadW: currentCal?.overheadW ?? 5000,
        overheadH: currentCal?.overheadH ?? 5000,
      });
      const halvedDistance = Math.round(
        inner.distancePoints * SECOND_GUESS_DISTANCE_FACTOR,
      );
      const round: MapRoundResult = {
        spotId: currentSpot.id,
        mapKey: currentSpot.mapKey,
        firstGuess: pendingFirstGuess
          ? {
              guessedMap: pendingFirstGuess.guessedMap,
              guessedPx: pendingFirstGuess.guessedPx ?? [0, 0],
            }
          : null,
        secondGuess: {
          guessedMap: currentSpot.mapKey,
          guessedPx: pin,
        },
        pointsMap: 0,
        pointsDistance: halvedDistance,
        pointsTotal: halvedDistance,
        wrongMapFirst: true,
        skipped: false,
      };
      commitRound(round);
    }
  };

  const commitRound = (round: MapRoundResult) => {
    setCommittedRound(round);
    setPhase("result");
    setState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        rounds: [...prev.rounds, round],
      };
    });
  };

  const goToNextRound = () => {
    setState((prev) => {
      if (!prev) return prev;
      const next = prev.currentRound + 1;
      return { ...prev, currentRound: next };
    });
    if (state.currentRound + 1 >= spots.length) {
      setPhase("done");
    } else {
      setPhase("guessing");
    }
  };

  // ── Minimap interactions ───────────────────────────────────────────────

  // Compute image-natural pixel under the cursor, undoing the current
  // pan+zoom. Used by both pin-drag and click-to-teleport.
  const cursorToImagePx = (
    e: React.MouseEvent,
  ): [number, number] | null => {
    if (!activeCal) return null;
    const el = overheadRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const vx = e.clientX - rect.left;
    const vy = e.clientY - rect.top;
    const vpW = rect.width;
    const vpH = rect.height;
    // The image is rendered through a width-driven square inner
    // wrapper (vpW × vpW), centered vertically in the (possibly
    // taller-or-shorter-than-square) container. So both axes scale
    // image-natural → screen at the same rate (overheadDim / vpW).
    // vpH only affects where the image's vertical center is on
    // screen (vpH / 2), not its per-pixel scale.
    const px =
      activeCal.overheadW / 2 +
      ((vx - vpW / 2 - pan.x) / zoom) * (activeCal.overheadW / vpW);
    const py =
      activeCal.overheadH / 2 +
      ((vy - vpH / 2 - pan.y) / zoom) * (activeCal.overheadH / vpW);
    return [px, py];
  };

  const handlePinMouseDown = (e: React.MouseEvent) => {
    if (!activeCal) return;
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    pinDragRef.current = {
      startCx: e.clientX,
      startCy: e.clientY,
      moved: false,
    };
  };

  const handleOverheadMouseDown = (e: React.MouseEvent) => {
    if (!activeCal) return;
    if (e.button !== 0) return; // primary button only
    dragRef.current = {
      startCx: e.clientX,
      startCy: e.clientY,
      startPanX: pan.x,
      startPanY: pan.y,
      moved: false,
    };
  };

  const handleOverheadMouseMove = (e: React.MouseEvent) => {
    // Pin-drag wins over pan-drag. While the user is dragging the
    // guess pin, every mousemove repositions the pin to the cursor's
    // image-pixel target — feels like a real grab/drag interaction.
    // We only commit movements once the cursor has crossed a 4px
    // threshold from mousedown; a click-and-release within 4px is
    // treated as a tap (handled in mouseUp) so the user can click
    // pixels away from the existing pin to nudge it.
    if (pinDragRef.current) {
      const dx = e.clientX - pinDragRef.current.startCx;
      const dy = e.clientY - pinDragRef.current.startCy;
      if (!pinDragRef.current.moved && Math.hypot(dx, dy) > 4) {
        pinDragRef.current.moved = true;
      }
      if (pinDragRef.current.moved) {
        const pos = cursorToImagePx(e);
        if (pos) setPin(pos);
      }
      return;
    }
    const ds = dragRef.current;
    if (!ds || !activeCal) return;
    const dx = e.clientX - ds.startCx;
    const dy = e.clientY - ds.startCy;
    if (!ds.moved && Math.hypot(dx, dy) > 4) {
      ds.moved = true;
    }
    if (!ds.moved) return;
    const el = overheadRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // Image is a square sized to container width (rect.width).
    // X coverage allows (z-1)*vpW/2; Y coverage uses (z*vpW - vpH)/2
    // because the image's height equals vpW (not vpH) — so even at
    // z=1 there's vertical pan room when the container is shorter
    // than it is wide.
    const maxPanX = ((zoom - 1) * rect.width) / 2;
    const maxPanY = Math.max(0, (zoom * rect.width - rect.height) / 2);
    setPan({
      x: Math.max(-maxPanX, Math.min(maxPanX, ds.startPanX + dx)),
      y: Math.max(-maxPanY, Math.min(maxPanY, ds.startPanY + dy)),
    });
  };

  const handleOverheadMouseUp = (e: React.MouseEvent) => {
    if (pinDragRef.current) {
      const wasDrag = pinDragRef.current.moved;
      pinDragRef.current = null;
      // Tap on the pin (no drag) → treat as click-to-teleport at the
      // cursor's image pixel. Lets the player nudge the pin a couple
      // CSS pixels with a fresh tap, even though the pin's hit box
      // sits between cursor and overhead.
      if (!wasDrag) {
        if (phase === "result" || phase === "done") return;
        if (!activeCal) return;
        const pos = cursorToImagePx(e);
        if (pos) setPin(pos);
      }
      return;
    }
    const ds = dragRef.current;
    if (!ds) return;
    const wasDrag = ds.moved;
    dragRef.current = null;
    if (wasDrag) return; // user was panning, not pinning
    if (phase === "result" || phase === "done") return;
    if (!activeCal) return;
    const pos = cursorToImagePx(e);
    if (pos) setPin(pos);
  };

  const handleOverheadMouseLeave = () => {
    // Cancel any in-flight drag if the cursor leaves the viewport.
    dragRef.current = null;
    pinDragRef.current = null;
  };

  const resetZoomPan = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Submit eligibility per phase.
  const canSubmit =
    (phase === "guessing" && selectedMap != null && pin != null) ||
    (phase === "wrong-map" && pin != null);

  // ── Render ─────────────────────────────────────────────────────────────
  // Show the DoneScreen when phase says so OR when the round index has
  // moved past the last spot. The OR-on-currentSpot guard catches the
  // brief render window where React has committed the new currentRound
  // but the matching setPhase("done") hasn't landed yet — without it
  // the POV motion.img would dereference an undefined spot and throw.
  if (phase === "done" || !currentSpot) {
    return (
      <>
        <DoneScreen
          rounds={state.rounds}
          spots={spots}
          totalScore={totalScoreSoFar}
          day={day}
        />
        <DevDayReset day={day} />
      </>
    );
  }

  return (
    <main
      className="flex flex-col bg-bg p-2 text-ink sm:p-3"
      // Pin to the visible viewport below the global Header (~57px:
      // py-4 = 32px + ~24px content + 1px border). dvh handles mobile
      // browser chrome correctly. We DON'T touch app/layout.tsx because
      // changing body height would clip taller pages.
      //
      // Local override of the OWdle theme radii — the rest of the app
      // is intentionally angular CLI/labeler-style, but Map mode reads
      // friendlier as a "card" game with generous corners. CSS vars
      // cascade so every `rounded-(--radius-card)` inside this subtree
      // picks up the new value without us touching individual classes.
      style={{
        height: "calc(100dvh - 57px)",
        ["--radius-card" as string]: "18px",
        ["--radius-tile" as string]: "12px",
        ["--radius-pill" as string]: "9999px",
      }}
    >
      <div className="relative mx-auto flex h-full w-full max-w-[1920px] flex-col overflow-hidden rounded-(--radius-card) border border-line bg-bg shadow-[0_20px_60px_-20px_rgba(0,0,0,0.75)]">
        {/* POV image — inset from the frame's edges so it reads as a
            card with breathing room rather than a screen-filler. Wheel
            zooms (anchored at the cursor); drag at zoom>1 pans. The
            AnimatePresence crossfades the image element on round
            transition while the zoom wrapper persists. */}
        <div
          ref={povZoom.outerRef}
          onMouseDown={povZoom.onMouseDown}
          onMouseMove={povZoom.onMouseMove}
          className="absolute inset-8 overflow-hidden rounded-(--radius-card) select-none lg:inset-12"
          style={{
            cursor: povZoom.cursor,
            touchAction: "none",
          }}
        >
          <div
            className="absolute inset-0"
            style={{
              transform: povZoom.transform,
              transformOrigin: "center center",
              transition: povZoom.isPanning ? "none" : "transform 80ms ease-out",
            }}
          >
            <AnimatePresence initial={false}>
              {/* mode default (not "wait"): old image starts fading
                  out while the new one fades in, so there's no blank
                  beat between rounds. Bumped transition to 0.22s for
                  a snappier feel — the prior 0.35s read as sluggish. */}
              <motion.img
                key={currentSpot.id}
                src={media(currentSpot.screenshot)}
                alt="POV"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                className="absolute inset-0 h-full w-full object-contain"
                draggable={false}
              />
            </AnimatePresence>
          </div>
          {povZoom.zoom > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                povZoom.reset();
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className="absolute top-2 left-2 z-10 rounded-(--radius-card) border border-line px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-soft transition-colors hover:text-ink"
              style={{ backgroundColor: "var(--bg-surface)" }}
            >
              reset · {povZoom.zoom.toFixed(1)}×
            </button>
          )}
        </div>

        {/* HUD: round counter + total score, top-left. Friendlier
            chrome — softer border, lighter background blur, rounder
            corners — reads as a game card, not a labeler panel. */}
        <div
          className="absolute top-4 left-4 rounded-(--radius-card) border border-line/40 px-4 py-3 backdrop-blur-sm shadow-[0_8px_24px_-12px_rgba(0,0,0,0.6)]"
          style={{ backgroundColor: "rgb(from var(--bg-surface) r g b / 0.85)" }}
        >
          <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-info">
            Round {state.currentRound + 1}
            <span className="text-ink-faint"> of {spots.length}</span>
          </p>
          <p className="mt-1 font-display text-3xl text-ink leading-none">
            {totalScoreSoFar.toLocaleString()}
            <span className="ml-1 font-mono text-xs text-ink-faint tracking-[0.16em]">
              / {(MAX_ROUND_SCORE * spots.length).toLocaleString()}
            </span>
          </p>
        </div>

      {/* Wrong-map flash banner */}
      <AnimatePresence>
        {phase === "wrong-map" && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="absolute top-4 left-1/2 -translate-x-1/2 rounded-(--radius-card) border border-far px-4 py-3"
            style={{
              backgroundColor: "var(--tile-far)",
              color: "var(--tile-far-fg)",
            }}
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.2em]">
              Wrong map. It was{" "}
              <span className="font-bold">
                {MAPS.find((m) => m.key === currentSpot.mapKey)?.label ??
                  currentSpot.mapKey}
              </span>
              . Drop a pin for half points.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Result reveal — overlays the entire frame until "Next round" */}
      <AnimatePresence>
        {phase === "result" && committedRound && (
          <ResultOverlay
            key={committedRound.spotId}
            round={committedRound}
            spot={currentSpot}
            cal={currentCal}
            onNext={goToNextRound}
            isLast={state.currentRound + 1 >= spots.length}
          />
        )}
      </AnimatePresence>

      {/* Minimap — bottom-right, hover-expand. Lightweight chrome:
          dimmer border + tighter padding so the POV reads as the
          primary surface and the minimap as a tool docked over it. */}
      <DevDayReset day={day} />

      {phase !== "result" && (
        <div
          onMouseEnter={() => setMinimapHovered(true)}
          onMouseLeave={() => setMinimapHovered(false)}
          className="absolute right-4 bottom-4 flex flex-col gap-2 transition-[width] duration-[420ms] [transition-timing-function:cubic-bezier(0.65,0,0.35,1)]"
          style={{
            // Width grows in three steps:
            //   collapsed (no hover)        — compact corner card
            //   hover, zoom 1x              — original hover-expand
            //   hover, zoom > 1x            — extra-wide so the
            //     overhead has room to "open up" sideways without
            //     the map itself growing.
            //
            // Three separate chips (picker / overhead / submit) stack
            // vertically inside this wrapper — OpenGuessr-style — so
            // each reads as its own glass surface rather than one
            // monolithic card. The wrapper owns the shared width
            // and hover state; chips inherit through it.
            width: !minimapHovered
              ? "300px"
              : zoom > 1
                ? "min(900px, 64vw)"
                : "min(640px, 50vw)",
          }}
        >
          {/* Chip 1: Map picker. Collapsed shows the selected map,
              click to re-open. During wrong-map phase the player
              can't change away from the correct map, so the picker
              is locked. */}
          <div
            className="rounded-(--radius-card) border border-line/30 px-2.5 py-2 backdrop-blur-sm shadow-[0_8px_28px_-12px_rgba(0,0,0,0.6)]"
            style={{ backgroundColor: "rgb(from var(--bg-surface) r g b / 0.9)" }}
          >
            <MapPickerHeader
              selectedMapKey={
                phase === "wrong-map"
                  ? currentSpot.mapKey
                  : selectedMap
              }
              locked={phase === "wrong-map"}
              expanded={pickerOpen}
              onToggle={() => setPickerOpen((o) => !o)}
            />
            {pickerOpen && phase !== "wrong-map" && (
              <div className="mt-2">
                <MapPickerList
                  selectedMapKey={selectedMap}
                  onPick={(key) => {
                    // Switching maps invalidates everything tied to
                    // the previous overhead — drop the pin, reset
                    // zoom/pan so the new map opens in its natural
                    // fit-view instead of inheriting a stale 6× crop
                    // on a totally different image.
                    const switching = selectedMap !== key;
                    setSelectedMap(key);
                    if (switching) {
                      setPin(null);
                      setZoom(1);
                      setPan({ x: 0, y: 0 });
                    }
                    setPickerOpen(false);
                  }}
                />
              </div>
            )}
          </div>

          {/* Chip 2: Overhead area. Pure map surface — no picker, no
              submit, no inner padding. The container holds its natural
              aspect ratio at every zoom level (GeoGuessr-style); the
              player pans within it. All pin-positioning math (left:%,
              top:%) references the inner wrapper, so pins stay locked
              to image pixels. */}
          <div
            className="overflow-hidden rounded-(--radius-card) border border-line/30 backdrop-blur-sm shadow-[0_8px_28px_-12px_rgba(0,0,0,0.6)]"
            style={{ backgroundColor: "rgb(from var(--bg-surface) r g b / 0.9)" }}
          >
            {/* When the picker is open the player is in "selection
                mode" — show the empty placeholder rather than the
                previous map's overhead, which (with stale pin/zoom
                state) would read as a confused half-game-state.
                Initial state and re-pick state look identical now. */}
            {activeCal && !pickerOpen ? (
              <div
                ref={overheadRef}
                onMouseDown={handleOverheadMouseDown}
                onMouseMove={handleOverheadMouseMove}
                onMouseUp={handleOverheadMouseUp}
                onMouseLeave={handleOverheadMouseLeave}
                onContextMenu={(e) => e.preventDefault()}
                className="relative w-full overflow-hidden bg-bg/60 select-none"
                style={{
                  // Stable aspect ratio at all zoom levels. The
                  // earlier 3:2 swap at zoom>1 made vpH animate
                  // mid-wheel and broke the cursor anchor math on
                  // rapid scrolls. GeoGuessr-style maps keep the
                  // container fixed and let the user pan within it.
                  aspectRatio: `${activeCal.overheadW} / ${activeCal.overheadH}`,
                  cursor: zoom > 1 ? "grab" : "crosshair",
                  touchAction: "none",
                }}
              >
                {/* Width-driven, aspect-locked inner. At zoom = 1
                    the container is its natural square aspect so the
                    inner fills it perfectly. At zoom > 1 the
                    container becomes 3:2 (wider, shorter): the inner
                    still fills the container's width, but its
                    aspect-ratio constraint makes it TALLER than the
                    container — overflowing top and bottom, which
                    `overflow:hidden` on the container clips. Effect:
                    the image grows with the wider card (filling
                    horizontally) and the player sees the middle
                    landscape slice of the now-bigger image. Vertical
                    centering via `top:50% + translateY(-50%)` keeps
                    the un-panned default centered. */}
                <div
                  className="absolute left-0"
                  style={{
                    width: "100%",
                    aspectRatio: `${activeCal.overheadW} / ${activeCal.overheadH}`,
                    top: "50%",
                    transform: `translateY(-50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    transformOrigin: "center center",
                    // During a pan-drag the transition is off so the
                    // image follows the cursor 1:1. Outside of drag,
                    // a short transition smooths wheel-zoom without
                    // lagging behind rapid scrolls — 420ms was long
                    // enough that the third or fourth wheel tick was
                    // still catching up to the first, which read as
                    // "the zoom isn't following my cursor."
                    transition: dragRef.current
                      ? "none"
                      : "transform 140ms ease-out",
                    pointerEvents: "none",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={media(activeCal.overheadFile)}
                    alt={activeMapKey ?? "overhead"}
                    className="block h-full w-full select-none"
                    draggable={false}
                    onDragStart={(e) => e.preventDefault()}
                  />
                  {pin && (
                    <span
                      onMouseDown={handlePinMouseDown}
                      className="absolute"
                      title="Drag to reposition · click empty space to teleport"
                      style={{
                        left: `${(pin[0] / activeCal.overheadW) * 100}%`,
                        top: `${(pin[1] / activeCal.overheadH) * 100}%`,
                        // Counter-scale so the pin stays a constant
                        // visual size regardless of overhead zoom.
                        transform: `translate(-50%, -50%) scale(${1 / zoom})`,
                        // Override the parent transform-container's
                        // pointer-events:none so the pin captures its
                        // own mousedown. Empty space and the img stay
                        // transparent to the outer overhead handlers.
                        pointerEvents: "auto",
                        cursor: pinDragRef.current ? "grabbing" : "grab",
                      }}
                    >
                      <motion.span
                        key={`${Math.round(pin[0])}-${Math.round(pin[1])}`}
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{
                          type: "spring",
                          stiffness: 600,
                          damping: 22,
                        }}
                        className="block"
                      >
                        <MapPin variant="guess-large" />
                      </motion.span>
                    </span>
                  )}
                </div>
                {zoom > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      resetZoomPan();
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="absolute top-1.5 right-1.5 z-10 rounded-(--radius-card) border border-line px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-soft transition-colors hover:text-ink"
                    style={{ backgroundColor: "var(--bg-surface)" }}
                  >
                    reset · {zoom.toFixed(1)}×
                  </button>
                )}
                <p className="pointer-events-none absolute bottom-1 left-2 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-faint/80">
                  scroll = zoom · drag = pan
                </p>
              </div>
            ) : (
              <div className="grid h-32 place-items-center px-3 text-center">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
                  {selectedMap == null
                    ? "Pick a map above to drop a pin"
                    : "This map isn't calibrated yet — submitting this counts as a wrong-map guess"}
                </p>
              </div>
            )}
          </div>

          {/* Chip 3: Submit row. Pin coords on the left, Submit
              button on the right. Lives in its own glass surface so
              the action chip reads as the final step in the stack. */}
          <div
            className="flex items-center justify-between gap-3 rounded-(--radius-card) border border-line/30 px-2.5 py-2 backdrop-blur-sm shadow-[0_8px_28px_-12px_rgba(0,0,0,0.6)]"
            style={{ backgroundColor: "rgb(from var(--bg-surface) r g b / 0.9)" }}
          >
            <p className="font-mono text-[10px] tracking-[0.16em] text-ink-faint">
              {pin
                ? `pin (${Math.round(pin[0])}, ${Math.round(pin[1])})`
                : "no pin yet"}
            </p>
            <button
              type="button"
              onClick={submitGuess}
              disabled={!canSubmit}
              className="rounded-(--radius-card) bg-accent px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {phase === "wrong-map" ? "Submit (½ pts)" : "Submit"}
            </button>
          </div>
        </div>
      )}
      </div>
    </main>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Per-round result reveal. Shows the player's pin and the true location on
// the correct overhead, with a score breakdown.
// ───────────────────────────────────────────────────────────────────────────

// Reveal timeline (seconds from ResultOverlay mount). The whole
// thing is choreographed top-down so each beat lands as the previous
// one settles — the rhythm IS the payoff, not the score number alone.
const REVEAL = {
  playerPin: 0.30,       // pin appears AFTER the card lands
  cameraStart: 0.55,     // cinematic zoom begins
  cameraDuration: 0.80,  // ...and lasts this long
  answerPin: 1.20,       // pops in just before camera settles
  pulseRing: 1.20,       // emanates outward from the answer pin
  line: 1.40,            // distance line draws
  verdict: 1.65,         // right/wrong map verdict slides in
  tierBadge: 1.80,       // tier label slams in
  scorePopcount: 1.95,   // score number animates 0 → total
  scorePopcountDuration: 0.80,
  breakdown: 2.20,       // bonus/distance/total grid
  feedback: 2.35,        // difficulty + pin-accuracy strip
  nextButton: 2.40,
} as const;

function ResultOverlay(props: {
  round: MapRoundResult;
  spot: MapSpot;
  cal: Calibration | undefined;
  onNext: () => void;
  isLast: boolean;
}) {
  const { round, spot, cal, onNext, isLast } = props;

  // On wrong-map rounds, the first-guess pixels live in a DIFFERENT
  // map's coordinate space — plotting them on the correct overhead
  // would be nonsense, so we only honor the second-guess pin in that
  // case. Skipped rounds (no valid pin at all) hide the player pin
  // entirely and zoom in on the answer instead.
  const validPlayerPin = round.wrongMapFirst
    ? round.secondGuess?.guessedPx ?? null
    : round.firstGuess?.guessedPx ?? null;
  const hasPlayerPin = validPlayerPin != null;
  const playerPin: [number, number] = validPlayerPin ?? [0, 0];
  const correctPin: [number, number] = [spot.pixelX, spot.pixelY];
  const dx = playerPin[0] - correctPin[0];
  const dy = playerPin[1] - correctPin[1];
  const pixelDistance = Math.sqrt(dx * dx + dy * dy);
  const longEdge = Math.max(cal?.overheadW ?? 5000, cal?.overheadH ?? 5000);
  const fractionOff = pixelDistance / longEdge;

  // Wheel-zoom + drag-pan on the preview overhead so the player can
  // inspect how close they got. Resets when the round changes — we key
  // on the committed round's spotId.
  const resultZoom = useImageZoomPan({ resetKey: round.spotId });
  // A separate zoom instance for the POV view, so flipping back and
  // forth between Overhead and POV preserves each side's pan/zoom
  // independently — the cinematic camera survives a peek at the POV.
  const povZoom = useImageZoomPan({ resetKey: round.spotId + "-pov" });
  // Which image fills the central panel: the overhead (with pins +
  // distance line) or the original POV screenshot for side-by-side
  // mental comparison. Defaults to overhead so the cinematic reveal
  // is the first thing the player sees each round.
  const [panelView, setPanelView] = useState<"overhead" | "pov">("overhead");
  // New round → snap back to overhead so the cinematic plays cleanly.
  useEffect(() => {
    setPanelView("overhead");
  }, [round.spotId]);

  // Quick-tap feedback. Replaces the older "report a wrong pin"
  // free-form flow with two coarse signals — difficulty (5 buckets)
  // and pin-accuracy (binary). Both write to localStorage on every
  // tap; toggling the same value clears it.
  const [feedback, setFeedback] = useState<SpotFeedback | null>(() =>
    getSpotFeedback(spot.id),
  );

  const setDifficulty = (value: SpotDifficulty) => {
    const cleared = feedback?.difficulty === value;
    const next = updateSpotFeedback(spot.id, spot.mapKey, {
      difficulty: cleared ? undefined : value,
    });
    setFeedback(next);
  };

  const setAccuracy = (value: boolean) => {
    const cleared = feedback?.pinAccurate === value;
    const next = updateSpotFeedback(spot.id, spot.mapKey, {
      pinAccurate: cleared ? undefined : value,
    });
    setFeedback(next);
  };

  const previewCal = cal;

  // Track the outer container's CSS width — needed to convert pin
  // radii (in CSS pixels) to overhead-pixel offsets when trimming the
  // distance line so it ends at each pin's visible edge rather than
  // passing under the pin. ResizeObserver keeps this fresh if the
  // page reflows.
  const [resultOuterW, setResultOuterW] = useState(0);
  useEffect(() => {
    const el = resultZoom.outerEl;
    if (!el) {
      setResultOuterW(0);
      return;
    }
    setResultOuterW(el.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w) setResultOuterW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [resultZoom.outerEl]);

  // Cinematic camera zoom. After the player pin lands at zoom=1 we fly
  // the camera in to frame both pins (or just the answer when the
  // player has no valid pin). Driving the hook's setZoom/setPan
  // directly keeps user wheel/drag working immediately after the
  // animation settles — they just resume from the zoomed-in pose.
  //
  // Played-tracking ref: outerEl can flip null↔non-null when the
  // POV/Overhead toggle remounts the overhead div. Without this guard
  // the cinematic would re-fire on every remount; we want it to play
  // exactly once per round.
  const cinematicPlayedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!previewCal) return;
    if (cinematicPlayedRef.current === round.spotId) return;
    const outer = resultZoom.outerEl;
    if (!outer) return;
    cinematicPlayedRef.current = round.spotId;

    let raf = 0;
    let cancelled = false;

    // Wait one frame so the outer div has dimensions after the card's
    // slide-up animation. requestAnimationFrame is enough — the
    // outer's width is set by CSS, not by an async layout pass.
    const kickoff = requestAnimationFrame(() => {
      if (cancelled) return;
      const rect = outer.getBoundingClientRect();
      const outerW = rect.width;
      if (!outerW) return;
      const innerH = outerW * (previewCal.overheadH / previewCal.overheadW);

      // Bounding box in overhead coords. When the player has no
      // valid pin (skipped, or wrong-map with no 2nd guess) we
      // frame only the answer with a sensible default span.
      const focusOnAnswerOnly = !hasPlayerPin;
      const cx = focusOnAnswerOnly
        ? correctPin[0]
        : (playerPin[0] + correctPin[0]) / 2;
      const cy = focusOnAnswerOnly
        ? correctPin[1]
        : (playerPin[1] + correctPin[1]) / 2;
      const bboxW = focusOnAnswerOnly ? 0 : Math.abs(dx);
      const bboxH = focusOnAnswerOnly ? 0 : Math.abs(dy);

      // Padding gives the pins breathing room inside the frame.
      // Floors at 80px so the Bullseye case (pins overlapping) still
      // gives a wide-enough frame to see the surrounding landmark.
      const padding = Math.max(longEdge * 0.06, 80);
      const zoomX = previewCal.overheadW / (bboxW + 2 * padding);
      const zoomY = previewCal.overheadH / (bboxH + 2 * padding);
      const fitZoom = Math.min(zoomX, zoomY);
      // 0.92 safety so the pins sit visibly inside the frame edge,
      // not flush against it. Clamp to [1.2, 4.5] — never zoom out
      // below 1, and 4.5 keeps Bullseye reveals from going so deep
      // that the player loses the landmark context.
      const targetZoom = Math.max(1.2, Math.min(4.5, fitZoom * 0.92));

      // Pan in outer-CSS-pixels. Derived from the transform-origin =
      // center: a point (px, py) inside the inner div ends up at
      // (px - innerW/2)*zoom + panX + innerW/2 in outer coords.
      // We want (cx, cy) (overhead → inner via uniform scale) to
      // land at the outer center, so panX = (innerW/2 - px_inner) * zoom.
      const pxInner = (cx / previewCal.overheadW) * outerW;
      const pyInner = (cy / previewCal.overheadH) * innerH;
      const rawPanX = (outerW / 2 - pxInner) * targetZoom;
      const rawPanY = (innerH / 2 - pyInner) * targetZoom;
      // Clamp to the same bounds the wheel handler enforces — at zoom
      // Z, pan can't exceed ±(dim * (Z-1)/2) without the image edge
      // leaving the viewport. When the spot is near an overhead edge
      // the math wants to over-pan to truly center it; without this
      // clamp, the first post-cinematic wheel-zoom would slam the pan
      // back inside bounds, anchoring the zoom to the wrong place.
      const limX = (outerW * (targetZoom - 1)) / 2;
      const limY = (innerH * (targetZoom - 1)) / 2;
      const targetPanX = Math.max(-limX, Math.min(limX, rawPanX));
      const targetPanY = Math.max(-limY, Math.min(limY, rawPanY));

      // Don't kick off if it'd be a no-op (zoom == 1 and pan == 0).
      // Happens when the pins span almost the entire map.
      if (Math.abs(targetZoom - 1) < 0.05) return;

      resultZoom.setLocked(true);
      const startTime = performance.now() + REVEAL.cameraStart * 1000;
      const duration = REVEAL.cameraDuration * 1000;
      const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

      const tick = (now: number) => {
        if (cancelled) return;
        const elapsed = now - startTime;
        if (elapsed < 0) {
          raf = requestAnimationFrame(tick);
          return;
        }
        const t = Math.min(1, elapsed / duration);
        const eased = easeOutCubic(t);
        resultZoom.setZoom(1 + (targetZoom - 1) * eased);
        resultZoom.setPan({ x: targetPanX * eased, y: targetPanY * eased });
        if (t < 1) {
          raf = requestAnimationFrame(tick);
        } else {
          resultZoom.setLocked(false);
        }
      };
      raf = requestAnimationFrame(tick);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(kickoff);
      cancelAnimationFrame(raf);
      resultZoom.setLocked(false);
    };
    // round.spotId is the stable identity for this round; outerEl
    // is the live element ref (may be null on first render before
    // React commits the ref). The played-tracking ref above keeps
    // this from re-running when outerEl flips on toggle remount.
    // Hook setters are stable (useState setters).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round.spotId, previewCal, resultZoom.outerEl]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="absolute inset-0 z-10 grid place-items-center bg-bg"
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 4, scale: 0.99 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        // Map-dominant layout. The card takes ~75% of the viewport
        // height (clamped to 900px on big screens) so the player has
        // breathing room top and bottom while the map gets the
        // dominant share. min-h-0 + overflow-y-auto kept as safety
        // for very short viewports.
        className="flex w-full max-w-[1200px] flex-col gap-3 overflow-y-auto rounded-(--radius-card) border border-line p-4 text-center"
        style={{
          backgroundColor: "var(--bg-surface)",
          height: "min(900px, 75dvh)",
          maxHeight: "100%",
        }}
      >
        {/* Compact header — round-result label + score on one row,
            verdict + tier pills inline on the next. Saves ~80px of
            vertical space vs the original stacked layout, which is
            real estate the map gets back. */}
        <div className="flex shrink-0 flex-col items-center gap-1.5">
          <div className="flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-info">
              Round result
            </p>
            <h2 className="font-display text-2xl text-ink leading-none">
              <AnimatedScore
                target={round.pointsTotal}
                delay={REVEAL.scorePopcount}
                duration={REVEAL.scorePopcountDuration}
              />{" "}
              <span className="font-mono text-sm text-ink-faint tracking-[0.16em]">
                / {MAX_ROUND_SCORE.toLocaleString()}
              </span>
            </h2>
          </div>
          {/* Verdict + tier — inline pills so they read as one
              status row instead of two stacked statements. */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: REVEAL.verdict, duration: 0.3, ease: "easeOut" }}
            >
              <MapVerdictBadge
                wrongMap={round.wrongMapFirst}
                guessedMapKey={round.firstGuess?.guessedMap ?? null}
                actualMapKey={spot.mapKey}
              />
            </motion.div>
            <TierBadge
              tierName={tierLabelForRound(round)}
              pixelDistance={pixelDistance}
              fractionOff={fractionOff}
              hasPlayerPin={hasPlayerPin}
              delay={REVEAL.tierBadge}
            />
          </div>
        </div>

        {previewCal && (
          // Outer flex slot grabs every spare pixel between the header
          // and the footer (flex-1 + min-h-0). containerType: size lets
          // the inner sizing fall back to container-query units (cqw/
          // cqh), so the map renders as a true square fit to the
          // smaller of available width/height. No more flex-squished
          // wide rectangle.
          <div
            className="flex min-h-0 flex-1 items-center justify-center"
            style={{ containerType: "size" }}
          >
          <div
            // Map preview — a perfect square that fills the available
            // slot. width/height pinned to min(cqw, cqh) so it shrinks
            // proportionally on narrow viewports; aspectRatio kept as
            // belt-and-suspenders.
            style={{
              width: "min(100cqw, 100cqh)",
              height: "min(100cqw, 100cqh)",
              aspectRatio: `${previewCal.overheadW} / ${previewCal.overheadH}`,
            }}
            className="relative overflow-hidden rounded-(--radius-card) border border-line"
          >
            {/* Tab toggle — top-left of the panel. stopPropagation on
                pointer events so clicks don't kick off pan-drag on
                the zoom hook beneath. */}
            <div
              className="absolute top-2 left-2 z-30 flex gap-0.5 rounded-(--radius-card) border border-line p-0.5"
              style={{ backgroundColor: "var(--bg-surface)" }}
            >
              {(["overhead", "pov"] as const).map((view) => (
                <button
                  key={view}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPanelView(view);
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  className={`rounded-sm px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.18em] transition-colors ${
                    panelView === view
                      ? "bg-accent text-on-accent"
                      : "text-ink-soft hover:text-ink"
                  }`}
                >
                  {view === "overhead" ? "Overhead" : "POV"}
                </button>
              ))}
            </div>

            {panelView === "overhead" && (
              <div
                ref={resultZoom.outerRef}
                onMouseDown={resultZoom.onMouseDown}
                onMouseMove={resultZoom.onMouseMove}
                className="absolute inset-0"
                style={{
                  backgroundColor: "var(--bg-inset)",
                  cursor: resultZoom.cursor,
                  touchAction: "none",
                }}
              >
                {/* All zoomable content lives inside this inner div so
                    the img, pins, and distance line stay in lockstep
                    under the transform. The inner is width-driven +
                    aspect-locked so it fills the outer at zoom=1 and
                    preserves the overhead's natural aspect ratio when
                    the cinematic camera scales it up. */}
                <div
                  className="absolute left-0"
                  style={{
                    width: "100%",
                    aspectRatio: `${previewCal.overheadW} / ${previewCal.overheadH}`,
                    top: "50%",
                    transform: `translateY(-50%) ${resultZoom.transform}`,
                    transformOrigin: "center center",
                    // During cinematic flight we drive zoom/pan every
                    // frame via rAF, so no CSS transition is needed (or
                    // wanted — it'd add a 80ms lag that fights the
                    // animation). Once the lock is off, restore the
                    // brief easing for user wheel-zoom comfort.
                    transition:
                      resultZoom.isPanning || resultZoom.locked
                        ? "none"
                        : "transform 80ms ease-out",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={media(previewCal.overheadFile)}
                    alt=""
                    className="pointer-events-none block h-full w-full select-none"
                    draggable={false}
                  />

                  {/* Two-layer pin: the outer span owns position +
                      counter-scale (no animation, so style.transform is
                      authoritative). The inner motion.span owns the
                      entrance animation (scale 0→1 via motion props).
                      Splitting them avoids Framer Motion replacing the
                      outer's translate(-50%, -50%) when it composes its
                      own animated transform — which would offset the
                      pin by half its size. */}
                  {hasPlayerPin && (
                    <span
                      className="pointer-events-none absolute block"
                      style={{
                        left: `${(playerPin[0] / previewCal.overheadW) * 100}%`,
                        top: `${(playerPin[1] / previewCal.overheadH) * 100}%`,
                        transform: `translate(-50%, -50%) scale(${1 / resultZoom.zoom})`,
                      }}
                      title="Your guess"
                    >
                      <motion.span
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{
                          type: "spring",
                          stiffness: 600,
                          damping: 22,
                          delay: REVEAL.playerPin,
                        }}
                        className="block"
                      >
                        <MapPin variant="guess-large" />
                      </motion.span>
                    </span>
                  )}
                  {/* Pulse ring on the answer pin — a quick expanding
                      ring that emanates outward as the pin lands.
                      Communicates "here's the answer" with motion, not
                      just a static pin appearing. */}
                  <span
                    className="pointer-events-none absolute block"
                    style={{
                      left: `${(correctPin[0] / previewCal.overheadW) * 100}%`,
                      top: `${(correctPin[1] / previewCal.overheadH) * 100}%`,
                      transform: `translate(-50%, -50%) scale(${1 / resultZoom.zoom})`,
                    }}
                  >
                    <motion.span
                      initial={{ scale: 0.4, opacity: 0.85 }}
                      animate={{ scale: 2.4, opacity: 0 }}
                      transition={{
                        delay: REVEAL.pulseRing,
                        duration: 0.9,
                        ease: "easeOut",
                      }}
                      className="block h-14 w-14 rounded-full"
                      style={{
                        border: "2px solid var(--tile-correct)",
                        boxShadow: "0 0 14px 2px var(--tile-correct)",
                      }}
                    />
                  </span>
                  <span
                    className="pointer-events-none absolute block"
                    style={{
                      left: `${(correctPin[0] / previewCal.overheadW) * 100}%`,
                      top: `${(correctPin[1] / previewCal.overheadH) * 100}%`,
                      transform: `translate(-50%, -50%) scale(${1 / resultZoom.zoom})`,
                    }}
                    title={
                      spot.facingDeg != null
                        ? "Correct location · arrow shows camera-facing direction"
                        : "Correct location"
                    }
                  >
                    <motion.span
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{
                        type: "spring",
                        stiffness: 600,
                        damping: 22,
                        delay: REVEAL.answerPin,
                      }}
                      className="block"
                    >
                      <MapPin facingDeg={spot.facingDeg} variant="answer-large" />
                    </motion.span>
                  </span>
                  {hasPlayerPin && (() => {
                    // Trim the line back from each pin's center to its
                    // visible edge so the dashes don't get cut off
                    // mid-stroke under the pin. Pin radii are in CSS px
                    // (the SVG pins counter-scale to a fixed CSS size);
                    // convert via SVG-unit → CSS-px = (resultOuterW /
                    // overheadW) * zoom. We add a small visual gap on
                    // top of the pin's radius so the line breathes a
                    // bit before meeting the pin.
                    const PLAYER_PIN_R_CSS = 22;  // 44px guess-large / 2
                    const ANSWER_PIN_R_CSS = 26;  // 52px answer-large / 2
                    const VISUAL_GAP_CSS = 3;
                    const cssPerOverheadPx = resultOuterW > 0
                      ? (resultOuterW / previewCal.overheadW) * resultZoom.zoom
                      : 1;
                    const playerOffsetSvg =
                      (PLAYER_PIN_R_CSS + VISUAL_GAP_CSS) / cssPerOverheadPx;
                    const answerOffsetSvg =
                      (ANSWER_PIN_R_CSS + VISUAL_GAP_CSS) / cssPerOverheadPx;
                    const ldx = correctPin[0] - playerPin[0];
                    const ldy = correctPin[1] - playerPin[1];
                    const len = Math.sqrt(ldx * ldx + ldy * ldy);
                    // Bail out if pins overlap (Bullseye) — drawing a
                    // tiny stub line would be worse than no line.
                    if (len <= playerOffsetSvg + answerOffsetSvg) return null;
                    const ux = ldx / len;
                    const uy = ldy / len;
                    const x1 = playerPin[0] + ux * playerOffsetSvg;
                    const y1 = playerPin[1] + uy * playerOffsetSvg;
                    const x2 = correctPin[0] - ux * answerOffsetSvg;
                    const y2 = correctPin[1] - uy * answerOffsetSvg;
                    return (
                      <svg
                        className="pointer-events-none absolute inset-0 h-full w-full"
                        viewBox={`0 0 ${previewCal.overheadW} ${previewCal.overheadH}`}
                        preserveAspectRatio="none"
                      >
                        <motion.line
                          initial={{ pathLength: 0, opacity: 0 }}
                          animate={{ pathLength: 1, opacity: 0.7 }}
                          transition={{
                            duration: 0.5,
                            delay: REVEAL.line,
                            ease: "easeOut",
                          }}
                          x1={x1}
                          y1={y1}
                          x2={x2}
                          y2={y2}
                          stroke="var(--accent)"
                          strokeWidth={2}
                          strokeDasharray="10 7"
                          strokeLinecap="round"
                          vectorEffect="non-scaling-stroke"
                        />
                      </svg>
                    );
                  })()}
                </div>
              </div>
            )}

            {panelView === "pov" && (
              <div
                ref={povZoom.outerRef}
                onMouseDown={povZoom.onMouseDown}
                onMouseMove={povZoom.onMouseMove}
                className="absolute inset-0"
                style={{
                  backgroundColor: "var(--bg-inset)",
                  cursor: povZoom.cursor,
                  touchAction: "none",
                }}
              >
                <div
                  className="absolute inset-0"
                  style={{
                    transform: povZoom.transform,
                    transformOrigin: "center center",
                    transition: povZoom.isPanning
                      ? "none"
                      : "transform 80ms ease-out",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={media(spot.screenshot)}
                    alt="Original POV"
                    className="pointer-events-none absolute inset-0 block h-full w-full object-contain select-none"
                    draggable={false}
                  />
                </div>
              </div>
            )}

            {/* Reset button — tracks whichever zoom hook is currently
                visible. Only shown when zoomed in past 1× and not
                locked (cinematic flight). */}
            {panelView === "overhead" &&
              resultZoom.zoom > 1 &&
              !resultZoom.locked && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    resultZoom.reset();
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="absolute top-2 right-2 z-20 rounded-(--radius-card) border border-line px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-soft transition-colors hover:text-ink"
                  style={{ backgroundColor: "var(--bg-surface)" }}
                >
                  reset · {resultZoom.zoom.toFixed(1)}×
                </button>
              )}
            {panelView === "pov" && povZoom.zoom > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  povZoom.reset();
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className="absolute top-2 right-2 z-20 rounded-(--radius-card) border border-line px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-soft transition-colors hover:text-ink"
                style={{ backgroundColor: "var(--bg-surface)" }}
              >
                reset · {povZoom.zoom.toFixed(1)}×
              </button>
            )}
            <p className="pointer-events-none absolute bottom-1 left-2 z-20 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-faint/80">
              scroll = zoom · drag = pan
            </p>
          </div>
          </div>
        )}

        {/* Compact footer block — pinned at the bottom of the card via
            shrink-0. Breakdown becomes a single horizontal pill row,
            then the FeedbackStrip (already compact), then the Next
            button. Keeps non-map vertical footprint to ~180px so the
            map can dominate. */}
        <div className="flex shrink-0 flex-col gap-2">
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: REVEAL.breakdown, duration: 0.3, ease: "easeOut" }}
            className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 font-mono text-[10px] uppercase tracking-[0.18em]"
          >
            <span>
              <span className="text-ink-faint">Map bonus</span>{" "}
              <span className="text-ink">{round.pointsMap}</span>
            </span>
            <span>
              <span className="text-ink-faint">Distance</span>{" "}
              <span className="text-ink">{round.pointsDistance}</span>
            </span>
            <span>
              <span className="text-ink-faint">Total</span>{" "}
              <span className="text-accent">{round.pointsTotal}</span>
            </span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: REVEAL.feedback, duration: 0.3 }}
          >
            <FeedbackStrip
              difficulty={feedback?.difficulty}
              pinAccurate={feedback?.pinAccurate}
              onDifficulty={setDifficulty}
              onAccuracy={setAccuracy}
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: REVEAL.nextButton, duration: 0.3 }}
            className="flex flex-wrap items-center justify-center gap-3"
          >
            <button
              type="button"
              onClick={onNext}
              className="rounded-(--radius-card) bg-accent px-6 py-2.5 font-mono text-xs uppercase tracking-[0.24em] text-on-accent transition-opacity hover:opacity-90"
            >
              {isLast ? "See final score" : "Next round"}
            </button>
            <DevSpotEdit spotId={spot.id} mapKey={spot.mapKey} />
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// AnimatedScore — counts a number from 0 to target with an ease-out
// curve, anchored to a delay so it can be slotted into the reveal
// timeline. rAF-driven for sub-frame accuracy on the popcount.
// ───────────────────────────────────────────────────────────────────────────
function AnimatedScore(props: {
  target: number;
  delay: number;
  duration: number;
}) {
  const { target, delay, duration } = props;
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf = 0;
    const startTime = performance.now() + delay * 1000;
    const ms = duration * 1000;
    const easeOutQuint = (t: number) => 1 - Math.pow(1 - t, 5);
    const tick = (now: number) => {
      const elapsed = now - startTime;
      if (elapsed < 0) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const t = Math.min(1, elapsed / ms);
      setValue(Math.round(target * easeOutQuint(t)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, delay, duration]);
  return <>{value.toLocaleString()}</>;
}

// ───────────────────────────────────────────────────────────────────────────
// TierBadge — the tier name (Bullseye / Excellent / Good / ...) plus
// the raw distance, presented as a colored pill that slams in. The
// color tracks the tier so a glance tells you "how good was that"
// without reading the label.
// ───────────────────────────────────────────────────────────────────────────
const TIER_TONE: Record<string, { bg: string; fg: string }> = {
  Bullseye: { bg: "var(--tile-correct)", fg: "var(--tile-correct-fg)" },
  Excellent: { bg: "var(--tile-correct)", fg: "var(--tile-correct-fg)" },
  Good: { bg: "var(--accent-soft)", fg: "var(--accent-fg)" },
  OK: { bg: "var(--accent-soft)", fg: "var(--accent-fg)" },
  Far: { bg: "var(--accent)", fg: "var(--accent-fg)" },
  "Wrong area": { bg: "var(--tile-far)", fg: "var(--tile-far-fg)" },
  "Way off": { bg: "var(--tile-far)", fg: "var(--tile-far-fg)" },
  "Off map": { bg: "var(--tile-far)", fg: "var(--tile-far-fg)" },
  "Wrong map": { bg: "var(--tile-far)", fg: "var(--tile-far-fg)" },
  Skipped: { bg: "var(--bg-inset)", fg: "var(--ink-soft)" },
};

function TierBadge(props: {
  tierName: string;
  pixelDistance: number;
  fractionOff: number;
  hasPlayerPin: boolean;
  delay: number;
}) {
  const { tierName, pixelDistance, fractionOff, hasPlayerPin, delay } = props;
  const tone = TIER_TONE[tierName] ?? TIER_TONE["Off map"];
  const showDistance =
    hasPlayerPin && Number.isFinite(pixelDistance) && tierName !== "Wrong map";
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        delay,
        type: "spring",
        stiffness: 480,
        damping: 16,
      }}
      className="inline-flex items-baseline gap-2 rounded-(--radius-pill) px-3 py-1.5"
      style={{ backgroundColor: tone.bg, color: tone.fg }}
    >
      <span className="font-display text-sm tracking-[0.02em]">
        {tierName}
      </span>
      {showDistance && (
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] opacity-75">
          {Math.round(pixelDistance)}px · {(fractionOff * 100).toFixed(1)}%
          of map
        </span>
      )}
    </motion.div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Quick-tap feedback strip — difficulty bucket + pin-accuracy flag. Rendered
// inside ResultOverlay between the score breakdown and the Next-Round CTA.
// All writes go through updateSpotFeedback in lib/storage; no submit step.
// ───────────────────────────────────────────────────────────────────────────

const DIFFICULTY_OPTIONS: ReadonlyArray<{
  value: SpotDifficulty;
  label: string;
  // Color cue per bucket — green / blue / red so the strip reads as a
  // difficulty scale at a glance.
  selectedClass: string;
  hoverClass: string;
}> = [
  {
    value: "easy",
    label: "Easy",
    selectedClass: "bg-correct text-tile-correct-fg",
    hoverClass: "hover:border-correct/60 hover:text-correct",
  },
  {
    value: "normal",
    label: "Normal",
    selectedClass: "bg-info text-info-on",
    hoverClass: "hover:border-info/60 hover:text-info",
  },
  {
    value: "hard",
    label: "Hard",
    selectedClass: "bg-far text-tile-far-fg",
    hoverClass: "hover:border-far/60 hover:text-far",
  },
];

function ThumbsUpIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M7 22V11l5-9 1.5 1L11.5 9H20a2 2 0 0 1 1.98 2.32l-1.7 9A2 2 0 0 1 18.3 22H7Zm-5 0V11h3v11H2Z" />
    </svg>
  );
}

function ThumbsDownIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M17 2v11l-5 9-1.5-1L12.5 15H4a2 2 0 0 1-1.98-2.32l1.7-9A2 2 0 0 1 5.7 2H17Zm5 0v11h-3V2h3Z" />
    </svg>
  );
}

function FeedbackStrip(props: {
  difficulty: SpotDifficulty | undefined;
  pinAccurate: boolean | undefined;
  onDifficulty: (v: SpotDifficulty) => void;
  onAccuracy: (v: boolean) => void;
}) {
  const { difficulty, pinAccurate, onDifficulty, onAccuracy } = props;
  // Two visually-distinct groups so the player can tell at a glance
  // what each chip cluster is asking. Difficulty group sits inside a
  // blue-tinted container (info color), accuracy sits inside an
  // accent-tinted one. Chips in each group also pick up their group's
  // border color when idle so the relationship is unambiguous even
  // before reading the inline label.
  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-wrap items-center justify-center gap-2">
      {/* Difficulty group — info/blue tint */}
      <div
        className="flex flex-wrap items-center gap-1.5 rounded-(--radius-pill) border border-info/40 px-3 py-1.5"
        style={{ backgroundColor: "rgb(from var(--info) r g b / 0.08)" }}
      >
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-info">
          Difficulty
        </span>
        {DIFFICULTY_OPTIONS.map((opt) => {
          const selected = difficulty === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onDifficulty(opt.value)}
              aria-pressed={selected}
              className={
                "rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors " +
                (selected
                  ? `${opt.selectedClass} border-transparent`
                  : `border-info/30 text-ink-faint ${opt.hoverClass}`)
              }
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Accuracy group — accent/orange tint, thumbs icons */}
      <div
        className="flex flex-wrap items-center gap-1.5 rounded-(--radius-pill) border border-accent/40 px-3 py-1.5"
        style={{ backgroundColor: "rgb(from var(--accent) r g b / 0.08)" }}
      >
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-accent">
          Pin
        </span>
        <button
          type="button"
          onClick={() => onAccuracy(true)}
          aria-pressed={pinAccurate === true}
          aria-label="Pin looks accurate"
          className={
            "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors " +
            (pinAccurate === true
              ? "bg-correct text-tile-correct-fg border-transparent"
              : "border-accent/30 text-ink-faint hover:border-correct/60 hover:text-correct")
          }
        >
          <ThumbsUpIcon />
        </button>
        <button
          type="button"
          onClick={() => onAccuracy(false)}
          aria-pressed={pinAccurate === false}
          aria-label="Pin is off"
          className={
            "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors " +
            (pinAccurate === false
              ? "bg-far text-tile-far-fg border-transparent"
              : "border-accent/30 text-ink-faint hover:border-far/60 hover:text-far")
          }
        >
          <ThumbsDownIcon />
        </button>
      </div>
    </div>
  );
}


// ───────────────────────────────────────────────────────────────────────────
// Daily completion screen.
// ───────────────────────────────────────────────────────────────────────────

function DoneScreen(props: {
  rounds: MapRoundResult[];
  spots: MapSpot[];
  totalScore: number;
  day: string;
}) {
  const { rounds, spots, totalScore, day } = props;
  const maxPossible = MAX_ROUND_SCORE * spots.length;
  const pct = Math.round((totalScore / maxPossible) * 100);

  const shareText = useMemo(() => {
    const tiles = rounds
      .map((r) => {
        const frac = r.pointsTotal / MAX_ROUND_SCORE;
        if (r.skipped) return "⬜";
        if (frac >= 0.9) return "🟩";
        if (frac >= 0.6) return "🟨";
        if (frac >= 0.3) return "🟧";
        return "🟥";
      })
      .join("");
    return `OWdle Map · ${day}\n${tiles}\n${totalScore.toLocaleString()} / ${maxPossible.toLocaleString()} (${pct}%)`;
  }, [rounds, totalScore, maxPossible, pct, day]);

  return (
    <main
      className="grid min-h-screen place-items-center bg-bg text-ink"
      style={{
        ["--radius-card" as string]: "20px",
        ["--radius-tile" as string]: "14px",
        ["--radius-pill" as string]: "9999px",
      }}
    >
      <div className="mx-4 flex max-w-[640px] flex-col items-center gap-6 rounded-(--radius-card) border border-line bg-inset/40 p-8 text-center shadow-[0_20px_60px_-20px_rgba(0,0,0,0.7)]">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-info">
            Map mode complete · {day}
          </p>
          <h1 className="mt-2 font-display text-5xl text-ink">
            {totalScore.toLocaleString()}
          </h1>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
            of {maxPossible.toLocaleString()} ({pct}%)
          </p>
        </div>

        <div className="flex w-full flex-col gap-1.5">
          {rounds.map((r, i) => {
            const right = !r.wrongMapFirst && !r.skipped;
            const mapLabel =
              MAPS.find((m) => m.key === r.mapKey)?.label ?? r.mapKey;
            return (
              <div
                key={r.spotId}
                className="flex items-center gap-3 rounded-(--radius-tile) border border-line/60 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em]"
              >
                {/* ✓/✗ pip — green if right map, red if wrong. Color
                    comes from the same --tile-correct / --tile-far
                    tokens the result-screen badge uses, so the signal
                    is consistent across both screens. */}
                <span
                  aria-hidden
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-(--radius-pill) font-mono text-xs leading-none"
                  style={{
                    backgroundColor: right
                      ? "var(--tile-correct)"
                      : "var(--tile-far)",
                    color: right
                      ? "var(--tile-correct-fg)"
                      : "var(--tile-far-fg)",
                  }}
                >
                  {right ? "✓" : "✗"}
                </span>
                <span className="w-12 shrink-0 text-ink-faint">
                  Round {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-ink-soft normal-case tracking-[0.08em]">
                  {mapLabel}
                </span>
                <span className="shrink-0 text-ink">
                  {r.pointsTotal.toLocaleString()} pts
                </span>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(shareText).catch(() => {});
          }}
          className="rounded-(--radius-card) bg-accent px-5 py-2.5 font-mono text-[10px] uppercase tracking-[0.24em] text-on-accent transition-opacity hover:opacity-90"
        >
          Copy share text
        </button>

        <pre className="w-full whitespace-pre-wrap rounded-sm border border-line/60 bg-bg/60 p-3 font-mono text-[11px] tracking-[0.08em] text-ink-soft">
          {shareText}
        </pre>

        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
          Come back tomorrow for new spots.
        </p>
      </div>
    </main>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// MapPickerHeader — collapsed-state row at the top of the minimap.
// Shows the currently-selected map (thumbnail + name + gamemode chip)
// or a "Pick a map" placeholder when nothing's been chosen. Clicking
// toggles the expanded card list below. Disabled during wrong-map
// phase (the dropdown was disabled there too) so players can't bail
// out of the forced-correct-map second guess.
// ───────────────────────────────────────────────────────────────────────────
// ───────────────────────────────────────────────────────────────────────────
// GamemodeIcon — thin wrapper around the official Overwatch wiki icons
// (downloaded by scripts/build-gamemodes.mjs into public/gamemodes/).
// All icons are white-on-transparent PNGs so they read cleanly on the
// dark UI surfaces. Falls back to no render if the mode key isn't in
// the manifest (e.g. a new gamemode lands before we re-run the
// fetcher).
// ───────────────────────────────────────────────────────────────────────────
function GamemodeIcon({
  mode,
  className,
  size = 14,
}: {
  mode: Gamemode;
  className?: string;
  size?: number;
}) {
  const src = GAMEMODE_ICON_BY_KEY[mode];
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={media(src)}
      alt=""
      aria-hidden
      width={size}
      height={size}
      className={className}
      style={{ objectFit: "contain" }}
    />
  );
}

function MapPickerHeader(props: {
  selectedMapKey: string | null;
  locked: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { selectedMapKey, locked, expanded, onToggle } = props;
  const map = selectedMapKey
    ? MAPS.find((m) => m.key === selectedMapKey)
    : null;
  const preview = map ? mapPreview(map.key, map.overheadFile) : null;
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={locked}
      className="flex w-full items-center gap-3 rounded-(--radius-card) border border-line/40 bg-inset/40 px-2 py-1.5 text-left transition-colors hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-70"
    >
      {/* 16:9 cinematic strip — wide enough to make the promo art
          recognizable. Falls back to a "?" placeholder when no map
          is selected. */}
      <span
        aria-hidden
        className="flex h-10 w-[64px] shrink-0 items-center justify-center overflow-hidden rounded-(--radius-tile) bg-bg/60"
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="font-mono text-base text-ink-faint">?</span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm text-ink">
          {map?.label ?? "Pick a map"}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 truncate font-mono text-[9px] uppercase tracking-[0.18em] text-ink-faint">
          {map ? (
            <>
              <GamemodeIcon
                mode={map.gamemode}
                size={20}
                className="shrink-0"
              />
              <span className="truncate">
                {map.gamemode} · {map.location}
              </span>
            </>
          ) : (
            "tap to browse"
          )}
        </span>
      </span>
      <span
        aria-hidden
        className="shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint"
      >
        {locked ? "locked" : expanded ? "▴" : "▾"}
      </span>
    </button>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// MapPickerList — scrollable vertical list of map cards, replacing the
// native <select>. Each card carries an overhead thumbnail so a player
// who recognizes the map's shape can spot it visually without reading
// every name. Uncalibrated maps stay listed so the eventual roster is
// visible but are disabled with a "soon" badge — same UX as the old
// dropdown, just card-shaped.
// ───────────────────────────────────────────────────────────────────────────
function MapPickerList(props: {
  selectedMapKey: string | null;
  onPick: (key: string) => void;
}) {
  const { selectedMapKey, onPick } = props;
  // Calibrated maps first, then "soon" maps. Within each group, alpha
  // by label so the order is stable and easy to scan.
  const sorted = useMemo(() => {
    const live: typeof MAPS = [];
    const soon: typeof MAPS = [];
    for (const m of MAPS) {
      if (CALIBRATIONS[m.key]) live.push(m);
      else soon.push(m);
    }
    const byLabel = (a: { label: string }, b: { label: string }) =>
      a.label.localeCompare(b.label);
    return [...live.sort(byLabel), ...soon.sort(byLabel)];
  }, []);
  return (
    <ul
      className="grid max-h-[40vh] grid-cols-2 gap-2 overflow-y-auto pr-0.5 [scrollbar-color:var(--accent)_transparent] [scrollbar-width:thin]"
      role="listbox"
      aria-label="Map list"
    >
      {sorted.map((m) => {
        const calibrated = Boolean(CALIBRATIONS[m.key]);
        const isSelected = m.key === selectedMapKey;
        const preview = mapPreview(m.key, m.overheadFile);
        return (
          <li key={m.key} className="min-w-0">
            <button
              type="button"
              role="option"
              aria-selected={isSelected}
              disabled={!calibrated}
              onClick={() => onPick(m.key)}
              className={
                "group relative flex w-full flex-col overflow-hidden rounded-(--radius-tile) border text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 " +
                (isSelected
                  ? "border-accent bg-accent/10"
                  : "border-line/30 bg-bg/30 hover:border-accent/60 hover:bg-inset/40")
              }
            >
              {/* Column-layout card: cinematic banner on top, info
                  below. 16:9 keeps the promo art identifiable; the
                  fallback to overhead handles the three maps OverFast
                  doesn't catalog. */}
              <span
                aria-hidden
                className="block aspect-[16/9] w-full overflow-hidden bg-bg/60"
              >
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={preview}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </span>
              {/* "soon" badge floats over the thumbnail corner so it
                  doesn't crowd the text strip below. */}
              {!calibrated && (
                <span className="absolute top-1 right-1 rounded-(--radius-pill) bg-bg/80 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.2em] text-ink-faint backdrop-blur-sm">
                  soon
                </span>
              )}
              {calibrated && isSelected && (
                <span
                  aria-hidden
                  className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-(--radius-pill) bg-accent font-mono text-xs leading-none text-on-accent shadow"
                >
                  ✓
                </span>
              )}
              <span className="flex min-w-0 flex-col gap-1 px-2 py-2">
                <span className="truncate text-sm text-ink">{m.label}</span>
                <span className="flex min-w-0 items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
                  <GamemodeIcon
                    mode={m.gamemode}
                    size={28}
                    className="shrink-0"
                  />
                  <span className="truncate">
                    {m.gamemode} · {m.location}
                  </span>
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Friendly tier label derived from the points the round actually
// scored. We could store this on the round record, but the existing
// schema only has the three point fields — and the lookup is
// information-equivalent because the ladder rungs are unique values.
// ───────────────────────────────────────────────────────────────────────────
function tierLabelForRound(round: MapRoundResult): string {
  if (round.skipped) return "Skipped";
  if (round.wrongMapFirst) return "Wrong map";
  const dp = round.pointsDistance;
  if (dp >= 4000) return "Bullseye";
  if (dp >= 3000) return "Excellent";
  if (dp >= 2000) return "Good";
  if (dp >= 1200) return "OK";
  if (dp >= 600) return "Far";
  if (dp >= 250) return "Wrong area";
  if (dp >= 100) return "Way off";
  return "Off map";
}

// ───────────────────────────────────────────────────────────────────────────
// MapVerdictBadge — big right/wrong-map signal for the round result.
// Right: green pill with check + map name. Wrong: red pill with X,
// "you picked X" → "it was Y". The bigger surface area reads from
// across the room and matches the friendlier card style the rest of
// map mode now uses.
// ───────────────────────────────────────────────────────────────────────────
function MapVerdictBadge(props: {
  wrongMap: boolean;
  guessedMapKey: string | null;
  actualMapKey: string;
}) {
  const { wrongMap, guessedMapKey, actualMapKey } = props;
  const actualLabel =
    MAPS.find((m) => m.key === actualMapKey)?.label ?? actualMapKey;
  const guessedLabel = guessedMapKey
    ? (MAPS.find((m) => m.key === guessedMapKey)?.label ?? guessedMapKey)
    : null;
  if (wrongMap) {
    return (
      <div
        className="inline-flex items-center gap-2 rounded-(--radius-pill) px-3 py-1.5"
        style={{
          backgroundColor: "var(--tile-far)",
          color: "var(--tile-far-fg)",
        }}
      >
        <span aria-hidden className="font-mono text-base leading-none">
          ✗
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.16em]">
          {guessedLabel ? (
            <>
              you picked <strong>{guessedLabel}</strong> — it was{" "}
              <strong>{actualLabel}</strong>
            </>
          ) : (
            <>
              it was <strong>{actualLabel}</strong>
            </>
          )}
        </span>
      </div>
    );
  }
  return (
    <div
      className="inline-flex items-center gap-2 rounded-(--radius-pill) px-3 py-1.5"
      style={{
        backgroundColor: "var(--tile-correct)",
        color: "var(--tile-correct-fg)",
      }}
    >
      <span aria-hidden className="font-mono text-base leading-none">
        ✓
      </span>
      <span className="font-mono text-[11px] uppercase tracking-[0.16em]">
        right map · <strong>{actualLabel}</strong>
      </span>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// DevDayReset / DevRandomize — small floating buttons shown only in
// `next dev` (or on localhost). DevDayReset wipes today's persisted
// round state so we can replay the same daily; DevRandomize picks a
// fresh random set of N spots from the full pool and stores them as
// an override so testers can sample different visuals without waiting
// for a new day. Compiled out in production builds (Next.js inlines
// the NODE_ENV check; the dead branch tree-shakes).
// ───────────────────────────────────────────────────────────────────────────
function useShowDevControls(): boolean {
  // Render null on SSR + initial hydration to avoid React hydration
  // warnings, then flip to true on first effect. We check BOTH
  // NODE_ENV (replaced by Next.js at build time) and the hostname
  // (runtime), so the button always shows on localhost even if a
  // build flag misbehaves.
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const isDev = process.env.NODE_ENV === "development";
    const isLocal = ["localhost", "127.0.0.1"].includes(
      window.location.hostname,
    );
    setShow(isDev || isLocal);
  }, []);
  return show;
}

function DevDayReset({ day }: { day: string }) {
  const show = useShowDevControls();
  if (!show) return null;
  const onReset = () => {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(`owdle.map.${day}`);
    window.localStorage.removeItem(`owdle.map.${day}.override`);
    window.location.reload();
  };
  const onRandomize = () => {
    if (typeof window === "undefined") return;
    const pool = getAllMapSpots();
    if (pool.length === 0) return;
    // Fisher–Yates over a copy; pick the first ROUNDS_PER_DAY ids.
    const idx = pool.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    const pickedIds = idx
      .slice(0, ROUNDS_PER_DAY)
      .map((i) => pool[i].id);
    window.localStorage.setItem(
      `owdle.map.${day}.override`,
      JSON.stringify(pickedIds),
    );
    // Wipe the persisted run so the freshly-picked spots are played
    // from round 1 rather than colliding with the prior shape.
    window.localStorage.removeItem(`owdle.map.${day}`);
    window.location.reload();
  };
  return (
    <div className="fixed bottom-3 left-3 z-50 flex flex-col gap-1.5">
      <button
        type="button"
        onClick={onRandomize}
        title="Pick a fresh random set of spots for today (dev only). Reloads."
        className="rounded-(--radius-card) border border-accent px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-accent shadow-lg transition-opacity hover:opacity-100"
        style={{ backgroundColor: "var(--bg-surface)" }}
      >
        dev · randomize spots
      </button>
      <button
        type="button"
        onClick={onReset}
        title="Wipe today's map-mode localStorage and reload (dev only)"
        className="rounded-(--radius-card) border border-accent px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-accent shadow-lg transition-opacity hover:opacity-100"
        style={{ backgroundColor: "var(--bg-surface)" }}
      >
        dev · reset day
      </button>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// DevSpotEdit — dev-only inline button on ResultOverlay that jumps
// straight to /labeler/map/edit with the active spot pre-selected via
// URL hash. Avoids hunting the spot down in the labeler when the
// answer pin lands slightly off and you just want to drag-correct it.
// Same dev/localhost visibility check as DevDayReset.
// ───────────────────────────────────────────────────────────────────────────
function DevSpotEdit({ spotId, mapKey }: { spotId: string; mapKey: string }) {
  const show = useShowDevControls();
  if (!show) return null;
  // Hash params instead of search params so it works with the static
  // export build (`output: "export"`) — no server-side parsing needed
  // and the new tab survives a hard reload.
  const href = `/labeler/map/edit#map=${encodeURIComponent(mapKey)}&spot=${encodeURIComponent(spotId)}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title="Open this spot in the labeler (dev only)"
      className="rounded-(--radius-card) border border-accent px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.24em] text-accent transition-opacity hover:opacity-80"
      style={{ backgroundColor: "var(--bg-surface)" }}
    >
      dev · fix spot
    </a>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// useImageZoomPan — small wheel-zoom + drag-pan hook used by the POV and
// the result-screen overhead preview. Zoom is anchored at the cursor so
// the pixel under it stays put across the zoom step. Pan is clamped so
// the image never escapes the viewport entirely. Wheel listener is
// attached non-passively so the page doesn't scroll underneath. Pass a
// `resetKey` (e.g. a round id) to auto-reset zoom + pan when it changes.
// ───────────────────────────────────────────────────────────────────────────
function useImageZoomPan(opts?: {
  maxZoom?: number;
  resetKey?: unknown;
}) {
  // 16× cap matches mapping apps (Google Maps tops out around 20×).
  // 8× was too tight — combined with the cinematic camera already
  // landing at 3-5×, players only got ~3-4 wheel ticks before hitting
  // the cap and the view freezing.
  const MAX = opts?.maxZoom ?? 16;
  // Tracked as state, not just a ref, so the wheel-listener useEffect
  // below re-fires when the outer element changes (remount via the
  // POV/Overhead toggle). A pure ref doesn't trigger re-renders, so
  // the listener would stay bound to the original (now-detached) DOM
  // node and silently do nothing after a toggle round-trip.
  const [outerEl, setOuterEl] = useState<HTMLDivElement | null>(null);
  const setOuterRef = useCallback((el: HTMLDivElement | null) => {
    setOuterEl(el);
  }, []);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startPanX: number;
    startPanY: number;
  } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  // When true, wheel + drag are ignored. ResultOverlay sets this while
  // its cinematic zoom-in animation runs so the player can't accidentally
  // race the animation by scrolling mid-flight.
  const [locked, setLocked] = useState(false);

  // Reset whenever the resetKey changes (round transition, spot change).
  const resetKey = opts?.resetKey;
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setLocked(false);
  }, [resetKey]);

  const reset = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Shared cursor-anchored zoom helper. cx/cy are CSS-px coords inside
  // the outer element. `factor` is the multiplicative zoom step. Used
  // by wheel, Safari gesture, and pinch-touch paths so they all feel
  // identical (and so a bug fix lands once).
  const applyZoomAt = useCallback(
    (cx: number, cy: number, factor: number) => {
      const el = outerEl;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const W = rect.width;
      const H = rect.height;
      setZoom((curZoom) => {
        const newZoom = Math.max(1, Math.min(MAX, curZoom * factor));
        if (newZoom === curZoom) return curZoom;
        const ratio = newZoom / curZoom;
        setPan((curPan) => {
          if (newZoom === 1) return { x: 0, y: 0 };
          const newPanX = (cx - W / 2) * (1 - ratio) + ratio * curPan.x;
          const newPanY = (cy - H / 2) * (1 - ratio) + ratio * curPan.y;
          const limX = (W * (newZoom - 1)) / 2;
          const limY = (H * (newZoom - 1)) / 2;
          return {
            x: Math.max(-limX, Math.min(limX, newPanX)),
            y: Math.max(-limY, Math.min(limY, newPanY)),
          };
        });
        return newZoom;
      });
    },
    [outerEl, MAX],
  );

  // Non-passive wheel listener — synthetic `onWheel` is passive in
  // React, so preventDefault inside it is a no-op and the page would
  // scroll under us. Trackpad pinch on Chrome/Firefox/Edge fires wheel
  // events with `ctrlKey: true` and small deltaY; we use a gentler
  // factor in that case so a pinch doesn't fly to max zoom in one
  // motion. Re-attach when outerEl changes so the listener tracks DOM
  // remounts (POV/Overhead toggle).
  useEffect(() => {
    const el = outerEl;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (locked) return;
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      // Trackpad pinch (ctrlKey-wheel) lands many small-deltaY events
      // in quick succession; a continuous exp() factor feels much
      // closer to native map apps than a discrete step. Divisor
      // tuned so a single wheel tick / pinch motion nudges the zoom
      // rather than slamming it — result-page reviewers complained
      // the previous 1.15×/exp(-y/100) was too aggressive.
      const factor = e.ctrlKey
        ? Math.exp(-e.deltaY / 220)
        : e.deltaY < 0
          ? 1.08
          : 1 / 1.08;
      applyZoomAt(cx, cy, factor);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [outerEl, locked, applyZoomAt]);

  // Safari trackpad pinch fires `gesturestart` / `gesturechange` /
  // `gestureend` instead of ctrlKey-wheel. Listen for them and route
  // through the same zoom helper so the feel matches Chrome.
  useEffect(() => {
    const el = outerEl;
    if (!el) return;
    let lastScale = 1;
    let anchorX = 0;
    let anchorY = 0;
    type GestureEv = Event & { scale: number; clientX: number; clientY: number };
    const onStart = (raw: Event) => {
      const e = raw as GestureEv;
      e.preventDefault();
      if (locked) return;
      lastScale = 1;
      const rect = el.getBoundingClientRect();
      anchorX = e.clientX - rect.left;
      anchorY = e.clientY - rect.top;
    };
    const onChange = (raw: Event) => {
      const e = raw as GestureEv;
      e.preventDefault();
      if (locked) return;
      const factor = e.scale / lastScale;
      lastScale = e.scale;
      applyZoomAt(anchorX, anchorY, factor);
    };
    const onEnd = (raw: Event) => raw.preventDefault();
    el.addEventListener("gesturestart", onStart as EventListener);
    el.addEventListener("gesturechange", onChange as EventListener);
    el.addEventListener("gestureend", onEnd as EventListener);
    return () => {
      el.removeEventListener("gesturestart", onStart as EventListener);
      el.removeEventListener("gesturechange", onChange as EventListener);
      el.removeEventListener("gestureend", onEnd as EventListener);
    };
  }, [outerEl, locked, applyZoomAt]);

  // Touch gestures: single-finger drag = pan, two-finger pinch = zoom
  // anchored at the midpoint. Mirrors the mouse + wheel paths so the
  // app feels native on iPad / phone.
  const touchRef = useRef<
    | { mode: "pan"; startX: number; startY: number; startPanX: number; startPanY: number }
    | { mode: "pinch"; startDist: number; lastDist: number }
    | null
  >(null);
  useEffect(() => {
    const el = outerEl;
    if (!el) return;

    const onStart = (e: TouchEvent) => {
      if (locked) return;
      if (e.touches.length === 1) {
        if (zoom <= 1) return; // nothing to pan at native scale
        const t = e.touches[0];
        touchRef.current = {
          mode: "pan",
          startX: t.clientX,
          startY: t.clientY,
          startPanX: pan.x,
          startPanY: pan.y,
        };
        setIsPanning(true);
        e.preventDefault();
      } else if (e.touches.length === 2) {
        const [t1, t2] = [e.touches[0], e.touches[1]];
        const d = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        touchRef.current = { mode: "pinch", startDist: d, lastDist: d };
        e.preventDefault();
      }
    };

    const onMove = (e: TouchEvent) => {
      const st = touchRef.current;
      if (!st || locked) return;
      if (st.mode === "pan" && e.touches.length === 1) {
        const t = e.touches[0];
        const rect = el.getBoundingClientRect();
        const dx = t.clientX - st.startX;
        const dy = t.clientY - st.startY;
        const limX = (rect.width * (zoom - 1)) / 2;
        const limY = (rect.height * (zoom - 1)) / 2;
        setPan({
          x: Math.max(-limX, Math.min(limX, st.startPanX + dx)),
          y: Math.max(-limY, Math.min(limY, st.startPanY + dy)),
        });
        e.preventDefault();
      } else if (st.mode === "pinch" && e.touches.length === 2) {
        const [t1, t2] = [e.touches[0], e.touches[1]];
        const rect = el.getBoundingClientRect();
        const d = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const factor = d / st.lastDist;
        st.lastDist = d;
        const midX = (t1.clientX + t2.clientX) / 2 - rect.left;
        const midY = (t1.clientY + t2.clientY) / 2 - rect.top;
        applyZoomAt(midX, midY, factor);
        e.preventDefault();
      }
    };

    const onEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        touchRef.current = null;
        setIsPanning(false);
      } else if (e.touches.length === 1 && touchRef.current?.mode === "pinch") {
        // pinch downgraded to single-finger after one finger lifted —
        // close out the pinch session; user can lift fully then redo.
        touchRef.current = null;
      }
    };

    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [outerEl, locked, zoom, pan, applyZoomAt]);

  useEffect(() => {
    const onUp = () => {
      dragRef.current = null;
      setIsPanning(false);
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, []);

  const onMouseDown = (e: React.MouseEvent) => {
    if (locked) return;
    if (zoom <= 1) return;
    if (e.button !== 0) return;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPanX: pan.x,
      startPanY: pan.y,
    };
    setIsPanning(true);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragRef.current) return;
    const el = outerEl;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const newPanX = dragRef.current.startPanX + dx;
    const newPanY = dragRef.current.startPanY + dy;
    const limX = (rect.width * (zoom - 1)) / 2;
    const limY = (rect.height * (zoom - 1)) / 2;
    setPan({
      x: Math.max(-limX, Math.min(limX, newPanX)),
      y: Math.max(-limY, Math.min(limY, newPanY)),
    });
  };

  const transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
  const cursor =
    isPanning ? "grabbing" : zoom > 1 ? "grab" : undefined;

  return {
    // outerRef is now a callback ref — React passes the element on
    // attach (and null on detach), and we mirror it to state so the
    // wheel-listener useEffect re-fires across remounts.
    outerRef: setOuterRef,
    // outerEl exposes the current DOM node for imperative reads
    // (e.g. ResultOverlay's cinematic camera measures it).
    outerEl,
    zoom,
    pan,
    transform,
    cursor,
    reset,
    onMouseDown,
    onMouseMove,
    isPanning,
    // Imperative setters + lock used by ResultOverlay's cinematic
    // zoom-in animation. setLocked(true) suspends user wheel/drag so
    // the animation can't be raced; setLocked(false) hands control back.
    setZoom,
    setPan,
    setLocked,
    locked,
  };
}
