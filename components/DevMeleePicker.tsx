"use client";

import { useMemo } from "react";
import { getAllMeleeClips } from "@/lib/daily";

// Dev picker for Melee mode. A single hero dropdown (only heroes that have
// a melee clip) + Prev / Random / Next + Today. Mirrors DevAbilityPicker's
// look so the dev surface feels consistent across modes. Override plays the
// chosen hero's clip and skips localStorage so test plays don't pollute the
// real daily.

type Props = {
  currentHeroKey: string;
  overrideActive: boolean;
  onApply: (heroKey: string | null) => void;
};

export function DevMeleePicker({
  currentHeroKey,
  overrideActive,
  onApply,
}: Props) {
  const clips = useMemo(() => getAllMeleeClips(), []);

  const idx = clips.findIndex((c) => c.heroKey === currentHeroKey);
  const safeIdx = idx >= 0 ? idx : 0;
  const selected = clips[safeIdx];

  const step = (delta: 1 | -1) => {
    if (clips.length === 0) return;
    const next = (safeIdx + delta + clips.length) % clips.length;
    onApply(clips[next].heroKey);
  };

  const random = () => {
    if (clips.length === 0) return;
    let n = Math.floor(Math.random() * clips.length);
    if (clips.length > 1 && n === safeIdx) n = (n + 1) % clips.length;
    onApply(clips[n].heroKey);
  };

  return (
    <div className="mb-6 rounded-(--radius-card) border border-dashed border-accent/50 bg-accent/5 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
          Dev · Melee picker
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
          {selected?.heroName ?? "—"}
          {overrideActive ? (
            <span className="ml-2 text-accent">override</span>
          ) : (
            <span className="ml-2 text-ink-faint">daily</span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={selected?.heroKey ?? ""}
          onChange={(e) => onApply(e.target.value || null)}
          className="rounded-(--radius-card) border border-line bg-inset/60 px-2 py-1.5 font-mono text-xs text-ink"
        >
          {clips.map((c) => (
            <option key={c.heroKey} value={c.heroKey}>
              {c.heroName} ({c.duration.toFixed(1)}s)
            </option>
          ))}
        </select>

        <div className="ml-1 flex items-center gap-1">
          <button
            type="button"
            onClick={() => step(-1)}
            className="rounded-(--radius-card) border border-line px-2 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft transition-colors hover:border-accent/50 hover:text-accent"
            aria-label="Previous hero"
          >
            ◀
          </button>
          <button
            type="button"
            onClick={random}
            className="rounded-(--radius-card) border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft transition-colors hover:border-accent/50 hover:text-accent"
          >
            Random
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            className="rounded-(--radius-card) border border-line px-2 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft transition-colors hover:border-accent/50 hover:text-accent"
            aria-label="Next hero"
          >
            ▶
          </button>
        </div>

        <button
          type="button"
          onClick={() => onApply(null)}
          disabled={!overrideActive}
          className="ml-auto rounded-(--radius-card) border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft transition-colors hover:border-accent/50 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:text-ink-soft"
        >
          Today
        </button>
      </div>
    </div>
  );
}
