"use client";

import { useState } from "react";

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
    const upper = (draftEnd ?? fileDuration) - 0.05;
    return Math.max(0, Math.min(upper, v));
  };
  const clampEnd = (v: number): number => {
    if (fileDuration == null) return v;
    const lower = (draftStart ?? autoStartOffset ?? 0) + 0.05;
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

      <div className="grid gap-3 sm:grid-cols-2">
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
