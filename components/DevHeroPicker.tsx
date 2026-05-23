"use client";

import { useMemo } from "react";
import { HEROES, type Hero } from "@/lib/heroes";

// Generic dev hero picker used by Classic, Splash, and any future mode
// whose daily seed reduces to "one hero of the day". Hero dropdown +
// Prev / Random / Next buttons + Today (reset to daily). Mirrors
// DevSoundPicker visually so the dev surface looks consistent across
// modes.
//
// Override semantics: `currentHeroKey` is the active hero (either the
// daily pick or whatever the picker last applied). `onApply(hero)`
// sets the override; `onApply(null)` clears it (back to daily).

type Props = {
  label: string;
  currentHeroKey: string;
  overrideActive: boolean;
  onApply: (hero: Hero | null) => void;
};

export function DevHeroPicker({
  label,
  currentHeroKey,
  overrideActive,
  onApply,
}: Props) {
  const heroes = useMemo(
    () => [...HEROES].sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );
  const idx = heroes.findIndex((h) => h.key === currentHeroKey);
  const safeIdx = idx >= 0 ? idx : 0;

  const handleHeroChange = (key: string) => {
    const hero = heroes.find((h) => h.key === key);
    if (hero) onApply(hero);
  };

  const handleStep = (delta: 1 | -1) => {
    if (heroes.length === 0) return;
    const next = (safeIdx + delta + heroes.length) % heroes.length;
    onApply(heroes[next]);
  };

  const handleRandom = () => {
    if (heroes.length === 0) return;
    let next = Math.floor(Math.random() * heroes.length);
    if (heroes.length > 1 && next === safeIdx) {
      next = (next + 1) % heroes.length;
    }
    onApply(heroes[next]);
  };

  const handleReset = () => onApply(null);

  return (
    <div className="mb-6 rounded-(--radius-card) border border-dashed border-accent/50 bg-accent/5 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
          Dev · {label} picker
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
          {safeIdx + 1} / {heroes.length}
          {overrideActive ? (
            <span className="ml-2 text-accent">override</span>
          ) : (
            <span className="ml-2 text-ink-faint">daily</span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={heroes[safeIdx]?.key ?? ""}
          onChange={(e) => handleHeroChange(e.target.value)}
          className="rounded-(--radius-card) border border-line bg-inset/60 px-2 py-1.5 font-mono text-xs text-ink"
        >
          {heroes.map((h) => (
            <option key={h.key} value={h.key}>
              {h.name}
            </option>
          ))}
        </select>

        <div className="ml-1 flex items-center gap-1">
          <button
            type="button"
            onClick={() => handleStep(-1)}
            className="rounded-(--radius-card) border border-line px-2 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft transition-colors hover:border-accent/50 hover:text-accent"
            aria-label="Previous hero"
          >
            ◀
          </button>
          <button
            type="button"
            onClick={handleRandom}
            className="rounded-(--radius-card) border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft transition-colors hover:border-accent/50 hover:text-accent"
          >
            Random
          </button>
          <button
            type="button"
            onClick={() => handleStep(1)}
            className="rounded-(--radius-card) border border-line px-2 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft transition-colors hover:border-accent/50 hover:text-accent"
            aria-label="Next hero"
          >
            ▶
          </button>
        </div>

        <button
          type="button"
          onClick={handleReset}
          disabled={!overrideActive}
          className="ml-auto rounded-(--radius-card) border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft transition-colors hover:border-accent/50 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:text-ink-soft"
        >
          Today
        </button>
      </div>
    </div>
  );
}
