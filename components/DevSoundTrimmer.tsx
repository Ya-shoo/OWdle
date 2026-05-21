"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  heroKey: string;
  slug: string;
  // Raw source-file duration from the decoded audio. Null while the
  // WaveformPlayer is still fetching/decoding; the editor renders a
  // disabled skeleton in that window.
  fileDuration: number | null;
  // What the silence-skip heuristic would have used if no manual override
  // were active. Shown as a hint so the editor knows the baseline.
  autoStartOffset: number | null;
  // Pre-bucketed peaks for the *full* source file (untrimmed), normalized
  // to [0, 1]. Drives the editor's mini-waveform that the drag handles
  // sit on top of. Null while the audio is still loading.
  fullPeaks: number[] | null;
  // Currently persisted values (from data/sound-clip-trims.json) — null
  // when no manual trim has been saved for this clip.
  persistedStart: number | null;
  persistedEnd: number | null;
  // Live draft values applied to the WaveformPlayer. Null on either side
  // means "use auto / file end".
  draftStart: number | null;
  draftEnd: number | null;
  onChange: (next: { start: number | null; end: number | null }) => void;
  onSave: (next: {
    start: number | null;
    end: number | null;
  }) => Promise<void>;
};

// Trim nudges, in seconds. Chosen so a single key press buys obvious
// movement at the perceptual scale (10ms ≈ one rAF frame; 100ms ≈ a
// quick breath). Larger jumps would overshoot most cleanup work.
const NUDGES = [-0.1, -0.05, -0.01, 0.01, 0.05, 0.1];

// Mini-waveform geometry. Width is fluid via viewBox + preserveAspectRatio
// none, so the SVG scales to the container. Heights are set in pixels so
// the SVG keeps a stable visual size regardless of the parent flex.
const VIEW_W = 1200;
const VIEW_H = 80;
const BAR_GAP = 2;
// Pointer-area width around each handle's center line. Bigger than the
// visible 2px stroke so the grab target isn't pixel-thin.
const HANDLE_HIT_W = 16;
// Minimum spacing in seconds between start and end. Mirrors the 0.05s
// floor in clampStart/clampEnd so a drag can't collapse the window.
const MIN_WINDOW = 0.05;

function fmtSeconds(s: number | null, fallback = "—"): string {
  if (s == null || !isFinite(s)) return fallback;
  return `${s.toFixed(3)}s`;
}

function approxEqual(a: number | null, b: number | null): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(a - b) < 0.0005;
}

export function DevSoundTrimmer({
  heroKey,
  slug,
  fileDuration,
  autoStartOffset,
  fullPeaks,
  persistedStart,
  persistedEnd,
  draftStart,
  draftEnd,
  onChange,
  onSave,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Brief "Saved" confirmation after a successful write so the user has a
  // signal beyond the indicator dot flipping back to "synced".
  const [savedFlash, setSavedFlash] = useState(false);

  const dirty =
    !approxEqual(draftStart, persistedStart) ||
    !approxEqual(draftEnd, persistedEnd);
  const ready = fileDuration != null;

  const effectiveStart = draftStart ?? autoStartOffset ?? 0;
  const effectiveEnd = draftEnd ?? fileDuration ?? 0;
  const audibleDuration = Math.max(0, effectiveEnd - effectiveStart);

  const clampStart = (v: number): number => {
    if (fileDuration == null) return Math.max(0, v);
    const upper = (draftEnd ?? fileDuration) - MIN_WINDOW;
    return Math.max(0, Math.min(upper, v));
  };
  const clampEnd = (v: number): number => {
    if (fileDuration == null) return v;
    const lower = (draftStart ?? autoStartOffset ?? 0) + MIN_WINDOW;
    return Math.max(lower, Math.min(fileDuration, v));
  };

  const nudgeStart = (delta: number) => {
    const base = draftStart ?? autoStartOffset ?? 0;
    onChange({ start: clampStart(base + delta), end: draftEnd });
  };
  const nudgeEnd = (delta: number) => {
    const base = draftEnd ?? fileDuration ?? 0;
    if (fileDuration == null) return;
    onChange({ start: draftStart, end: clampEnd(base + delta) });
  };

  // Manual numeric input. Blanking the field reverts that side to null
  // (auto / file end). Non-numeric input is dropped so the field can't
  // get wedged in an unparseable state.
  const setStartFromInput = (raw: string) => {
    if (raw.trim() === "") {
      onChange({ start: null, end: draftEnd });
      return;
    }
    const n = Number(raw);
    if (!isFinite(n)) return;
    onChange({ start: clampStart(n), end: draftEnd });
  };
  const setEndFromInput = (raw: string) => {
    if (raw.trim() === "") {
      onChange({ start: draftStart, end: null });
      return;
    }
    const n = Number(raw);
    if (!isFinite(n)) return;
    onChange({ start: draftStart, end: clampEnd(n) });
  };

  const handleClear = () => {
    onChange({ start: null, end: null });
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    setSavedFlash(false);
    try {
      await onSave({ start: draftStart, end: draftEnd });
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1500);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  // Status label for the indicator dot at top-right. Resolves in order:
  // save error > saving > unsaved > recently-saved > synced.
  let status: { label: string; tone: "ok" | "warn" | "err" | "info" };
  if (saveError) status = { label: saveError, tone: "err" };
  else if (saving) status = { label: "Saving…", tone: "info" };
  else if (dirty) status = { label: "Unsaved changes", tone: "warn" };
  else if (savedFlash) status = { label: "Saved", tone: "ok" };
  else if (persistedStart != null || persistedEnd != null)
    status = { label: "Saved trim active", tone: "ok" };
  else status = { label: "Auto (no trim)", tone: "info" };

  const toneClass: Record<typeof status.tone, string> = {
    ok: "text-correct",
    warn: "text-accent",
    err: "text-far",
    info: "text-ink-faint",
  };

  return (
    <div className="w-full max-w-2xl rounded-(--radius-card) border border-dashed border-accent/50 bg-accent/5 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
          Dev · trim · {heroKey} / {slug}
        </div>
        <div
          className={`font-mono text-[10px] uppercase tracking-[0.18em] ${toneClass[status.tone]}`}
        >
          {status.label}
        </div>
      </div>

      <TrimScrubber
        fullPeaks={fullPeaks}
        fileDuration={fileDuration}
        startSec={effectiveStart}
        endSec={effectiveEnd}
        startOverridden={draftStart != null}
        endOverridden={draftEnd != null}
        autoStartOffset={autoStartOffset}
        disabled={!ready}
        onChangeStart={(sec) =>
          onChange({ start: clampStart(sec), end: draftEnd })
        }
        onChangeEnd={(sec) =>
          onChange({ start: draftStart, end: clampEnd(sec) })
        }
      />

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <TrimAxis
          label="Start"
          value={draftStart}
          placeholderValue={autoStartOffset ?? 0}
          placeholderLabel={
            autoStartOffset != null
              ? `auto · ${autoStartOffset.toFixed(3)}s`
              : "auto"
          }
          disabled={!ready}
          onInput={setStartFromInput}
          onNudge={nudgeStart}
        />
        <TrimAxis
          label="End"
          value={draftEnd}
          placeholderValue={fileDuration ?? 0}
          placeholderLabel={
            fileDuration != null
              ? `file end · ${fileDuration.toFixed(3)}s`
              : "file end"
          }
          disabled={!ready}
          onInput={setEndFromInput}
          onNudge={nudgeEnd}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
        <span>
          Window: {fmtSeconds(effectiveStart)} → {fmtSeconds(effectiveEnd)}
        </span>
        <span className="text-ink-soft">·</span>
        <span>Audible {audibleDuration.toFixed(3)}s</span>
        {(persistedStart != null || persistedEnd != null) && (
          <>
            <span className="text-ink-soft">·</span>
            <span>
              Saved {fmtSeconds(persistedStart)} → {fmtSeconds(persistedEnd)}
            </span>
          </>
        )}
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={handleClear}
            disabled={draftStart == null && draftEnd == null}
            className="rounded-(--radius-card) border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft transition-colors hover:border-accent/50 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:text-ink-soft"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving}
            className="rounded-(--radius-card) border border-accent/60 bg-accent/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-accent transition-colors hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-accent/10"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

type ScrubberProps = {
  fullPeaks: number[] | null;
  fileDuration: number | null;
  startSec: number;
  endSec: number;
  // Whether the user has manually overridden each side (vs falling back
  // to auto / file end). Drives the visual distinction between a tracked
  // override and a default position so dragging the auto-position handle
  // makes it immediately obvious you've taken control.
  startOverridden: boolean;
  endOverridden: boolean;
  autoStartOffset: number | null;
  disabled: boolean;
  onChangeStart: (sec: number) => void;
  onChangeEnd: (sec: number) => void;
};

// Mini-waveform with two draggable handles. Bars inside the [start, end]
// window are painted accent; bars outside are dimmed so the user can see
// what they're cutting. Pointer events use setPointerCapture so a drag
// continues even when the cursor leaves the SVG bounds.
function TrimScrubber({
  fullPeaks,
  fileDuration,
  startSec,
  endSec,
  startOverridden,
  endOverridden,
  autoStartOffset,
  disabled,
  onChangeStart,
  onChangeEnd,
}: ScrubberProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragging, setDragging] = useState<"start" | "end" | null>(null);

  // Convert a clientX (from a pointer event) to a seconds offset into the
  // file. Uses the SVG's current bounding rect rather than the viewBox so
  // CSS scaling is handled automatically.
  const clientXToSeconds = (clientX: number): number | null => {
    const svg = svgRef.current;
    if (!svg || fileDuration == null) return null;
    const rect = svg.getBoundingClientRect();
    const ratio = Math.max(
      0,
      Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)),
    );
    return ratio * fileDuration;
  };

  const handlePointerDown = (
    side: "start" | "end",
    e: React.PointerEvent<SVGElement>,
  ) => {
    if (disabled) return;
    e.preventDefault();
    (e.currentTarget as SVGElement).setPointerCapture?.(e.pointerId);
    setDragging(side);
    // First move applied on the down event itself so a tap-without-drag
    // still snaps the handle to the tap point. Without this, the user
    // has to actually drag a pixel to register anything.
    const sec = clientXToSeconds(e.clientX);
    if (sec == null) return;
    if (side === "start") onChangeStart(sec);
    else onChangeEnd(sec);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGElement>) => {
    if (!dragging || disabled) return;
    const sec = clientXToSeconds(e.clientX);
    if (sec == null) return;
    if (dragging === "start") onChangeStart(sec);
    else onChangeEnd(sec);
  };

  const handlePointerUp = (e: React.PointerEvent<SVGElement>) => {
    if (!dragging) return;
    (e.currentTarget as SVGElement).releasePointerCapture?.(e.pointerId);
    setDragging(null);
  };

  // ESC abort: revert drag mid-flight without saving the final position.
  // Implemented as: any time a drag is active, listening for keydown.
  // We don't actually rewind the value (the parent owns it) — pressing
  // ESC just ends the drag at whatever the current position is, which is
  // the cheap, predictable behavior. A true "abort to pre-drag value"
  // would require snapshotting state on pointerdown.
  useEffect(() => {
    if (!dragging) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDragging(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dragging]);

  if (!ready(fullPeaks, fileDuration)) {
    return (
      <div className="flex h-[80px] w-full items-center justify-center rounded-(--radius-card) border border-line/60 bg-inset/40">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">
          {disabled ? "Audio loading…" : "Decoding audio…"}
        </span>
      </div>
    );
  }

  const peaks = fullPeaks!;
  const dur = fileDuration!;
  const startRatio = Math.max(0, Math.min(1, startSec / dur));
  const endRatio = Math.max(0, Math.min(1, endSec / dur));
  const startX = startRatio * VIEW_W;
  const endX = endRatio * VIEW_W;
  const autoX =
    autoStartOffset != null
      ? Math.max(0, Math.min(1, autoStartOffset / dur)) * VIEW_W
      : null;
  const barWidth = Math.max(1, VIEW_W / peaks.length - BAR_GAP);

  return (
    <div className="relative w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        className={`block h-20 w-full touch-none select-none rounded-(--radius-card) border border-line/60 bg-inset/40 ${disabled ? "opacity-40" : ""}`}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        aria-label="Sound clip trim scrubber"
      >
        {/* dim "out of window" overlay rectangles, behind bars. Painted
            as two side strips so the bars themselves don't need a per-
            bar in/out check at render time. */}
        {startX > 0 && (
          <rect
            x={0}
            y={0}
            width={startX}
            height={VIEW_H}
            fill="var(--color-canvas)"
            opacity={0.55}
          />
        )}
        {endX < VIEW_W && (
          <rect
            x={endX}
            y={0}
            width={VIEW_W - endX}
            height={VIEW_H}
            fill="var(--color-canvas)"
            opacity={0.55}
          />
        )}

        {/* bars */}
        {peaks.map((p, i) => {
          const x = (i / peaks.length) * VIEW_W;
          const barCenterX = x + barWidth / 2;
          const inWindow = barCenterX >= startX && barCenterX <= endX;
          const ampl = Math.max(2, p * (VIEW_H / 2 - 4));
          return (
            <rect
              key={i}
              x={x}
              y={VIEW_H / 2 - ampl}
              width={barWidth}
              height={ampl * 2}
              rx={1}
              className={
                inWindow ? "fill-accent/85" : "fill-line/70"
              }
            />
          );
        })}

        {/* auto-start hint — a thin dashed line where the silence-skip
            heuristic would land, so the user sees the baseline they're
            overriding when they drag the start handle elsewhere. Only
            drawn when the user hasn't already taken control. */}
        {autoX != null && !disabled && (
          <line
            x1={autoX}
            x2={autoX}
            y1={4}
            y2={VIEW_H - 4}
            stroke="var(--color-info)"
            strokeWidth={1}
            strokeDasharray="2 4"
            strokeOpacity={0.5}
          />
        )}

        {/* start handle */}
        <ScrubberHandle
          x={startX}
          side="start"
          overridden={startOverridden}
          active={dragging === "start"}
          disabled={disabled}
          onPointerDown={handlePointerDown}
        />

        {/* end handle */}
        <ScrubberHandle
          x={endX}
          side="end"
          overridden={endOverridden}
          active={dragging === "end"}
          disabled={disabled}
          onPointerDown={handlePointerDown}
        />
      </svg>

      <div className="mt-1 flex justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-ink-faint">
        <span className="text-correct/80">◆ Start {startSec.toFixed(3)}s</span>
        <span>file 0s — {dur.toFixed(3)}s</span>
        <span className="text-far/80">End {endSec.toFixed(3)}s ◆</span>
      </div>
    </div>
  );
}

function ready(
  fullPeaks: number[] | null,
  fileDuration: number | null,
): fullPeaks is number[] {
  return (
    fullPeaks != null &&
    fullPeaks.length > 0 &&
    fileDuration != null &&
    fileDuration > 0
  );
}

type HandleProps = {
  x: number;
  side: "start" | "end";
  overridden: boolean;
  active: boolean;
  disabled: boolean;
  onPointerDown: (
    side: "start" | "end",
    e: React.PointerEvent<SVGElement>,
  ) => void;
};

// Draggable handle rendered as a vertical line + a wider invisible hit
// rect + a visible grip tab at the top so the affordance reads as "a
// button you can drag." Color-coded: green for start, red for end.
function ScrubberHandle({
  x,
  side,
  overridden,
  active,
  disabled,
  onPointerDown,
}: HandleProps) {
  const color = side === "start" ? "var(--tile-correct)" : "var(--tile-far)";
  const isPrimary = overridden || active;
  return (
    <g
      style={{ cursor: disabled ? "not-allowed" : "ew-resize" }}
      onPointerDown={(e) => onPointerDown(side, e)}
    >
      {/* invisible hit rect — wide grab target around the line */}
      <rect
        x={x - HANDLE_HIT_W / 2}
        y={0}
        width={HANDLE_HIT_W}
        height={VIEW_H}
        fill="transparent"
      />
      {/* vertical line */}
      <line
        x1={x}
        x2={x}
        y1={0}
        y2={VIEW_H}
        stroke={color}
        strokeWidth={active ? 3 : 2}
        strokeOpacity={isPrimary ? 1 : 0.75}
      />
      {/* top grip tab — a small rounded rect that anchors the handle
          visually, anchored on the side the handle "owns" (start tab
          extends right; end tab extends left) so they don't collide
          when start and end are dragged close together. */}
      <rect
        x={side === "start" ? x : x - 14}
        y={2}
        width={14}
        height={12}
        rx={2}
        fill={color}
        fillOpacity={active ? 1 : 0.85}
      />
      {/* bottom grip tab — mirror on the bottom edge so the handle is
          equally grabbable from either end. */}
      <rect
        x={side === "start" ? x : x - 14}
        y={VIEW_H - 14}
        width={14}
        height={12}
        rx={2}
        fill={color}
        fillOpacity={active ? 1 : 0.85}
      />
      {/* grip dots inside the top tab for visual texture */}
      <circle
        cx={side === "start" ? x + 7 : x - 7}
        cy={8}
        r={1.2}
        fill="var(--color-canvas)"
        fillOpacity={0.7}
      />
      <circle
        cx={side === "start" ? x + 7 : x - 7}
        cy={VIEW_H - 8}
        r={1.2}
        fill="var(--color-canvas)"
        fillOpacity={0.7}
      />
    </g>
  );
}

type AxisProps = {
  label: string;
  value: number | null;
  placeholderValue: number;
  placeholderLabel: string;
  disabled: boolean;
  onInput: (raw: string) => void;
  onNudge: (delta: number) => void;
};

function TrimAxis({
  label,
  value,
  placeholderValue,
  placeholderLabel,
  disabled,
  onInput,
  onNudge,
}: AxisProps) {
  return (
    <div className="flex flex-col gap-2 rounded-(--radius-card) border border-line/60 bg-inset/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
          {label}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
          {value == null ? placeholderLabel : "override"}
        </span>
      </div>
      <input
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0"
        disabled={disabled}
        value={value == null ? "" : Number(value.toFixed(3))}
        placeholder={placeholderValue.toFixed(3)}
        onChange={(e) => onInput(e.target.value)}
        className="rounded-(--radius-card) border border-line bg-bg/40 px-2 py-1.5 font-mono text-xs text-ink disabled:cursor-not-allowed disabled:opacity-40"
      />
      <div className="flex flex-wrap gap-1">
        {NUDGES.map((delta) => (
          <button
            key={delta}
            type="button"
            disabled={disabled}
            onClick={() => onNudge(delta)}
            className="rounded-(--radius-card) border border-line px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft transition-colors hover:border-accent/50 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:text-ink-soft"
          >
            {delta > 0 ? "+" : ""}
            {Math.round(delta * 1000)}ms
          </button>
        ))}
      </div>
    </div>
  );
}
