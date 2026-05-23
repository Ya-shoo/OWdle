"use client";

import { useMemo } from "react";
import { HEROES, type Hero } from "@/lib/heroes";

// Dev picker for Ability mode. Two dropdowns (hero, ability index) +
// Prev / Random / Next + Today. Random shuffles across BOTH dimensions:
// it picks a random hero AND a random ability of that hero, so a tap
// cycles you through unique (hero, ability) pairs instead of staying
// stuck on the same hero.

type Props = {
  currentHeroKey: string;
  currentAbilityIndex: number;
  overrideActive: boolean;
  onApply: (hero: Hero | null, abilityIndex?: number) => void;
};

export function DevAbilityPicker({
  currentHeroKey,
  currentAbilityIndex,
  overrideActive,
  onApply,
}: Props) {
  const heroes = useMemo(
    () =>
      [...HEROES]
        .filter((h) => h.abilities.length > 0)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  const selectedHero =
    heroes.find((h) => h.key === currentHeroKey) ?? heroes[0];
  const abilities = selectedHero?.abilities ?? [];
  const safeAbilityIdx = Math.max(
    0,
    Math.min(currentAbilityIndex, abilities.length - 1),
  );

  const heroIdx = heroes.findIndex((h) => h.key === selectedHero?.key);
  const safeHeroIdx = heroIdx >= 0 ? heroIdx : 0;

  const handleHeroChange = (key: string) => {
    const hero = heroes.find((h) => h.key === key);
    if (hero) onApply(hero, 0);
  };

  const handleAbilityChange = (idxStr: string) => {
    if (!selectedHero) return;
    const idx = parseInt(idxStr, 10);
    if (!Number.isNaN(idx)) onApply(selectedHero, idx);
  };

  const handleStepHero = (delta: 1 | -1) => {
    if (heroes.length === 0) return;
    const next = (safeHeroIdx + delta + heroes.length) % heroes.length;
    onApply(heroes[next], 0);
  };

  const handleRandom = () => {
    if (heroes.length === 0) return;
    let heroNext = Math.floor(Math.random() * heroes.length);
    if (heroes.length > 1 && heroNext === safeHeroIdx) {
      heroNext = (heroNext + 1) % heroes.length;
    }
    const hero = heroes[heroNext];
    const abilityIdx =
      hero.abilities.length > 1
        ? Math.floor(Math.random() * hero.abilities.length)
        : 0;
    onApply(hero, abilityIdx);
  };

  const handleReset = () => onApply(null);

  return (
    <div className="mb-6 rounded-(--radius-card) border border-dashed border-accent/50 bg-accent/5 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
          Dev · Ability picker
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
          {selectedHero?.name ?? "—"} ·{" "}
          {abilities[safeAbilityIdx]?.name ?? "—"}
          {overrideActive ? (
            <span className="ml-2 text-accent">override</span>
          ) : (
            <span className="ml-2 text-ink-faint">daily</span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={selectedHero?.key ?? ""}
          onChange={(e) => handleHeroChange(e.target.value)}
          className="rounded-(--radius-card) border border-line bg-inset/60 px-2 py-1.5 font-mono text-xs text-ink"
        >
          {heroes.map((h) => (
            <option key={h.key} value={h.key}>
              {h.name}
            </option>
          ))}
        </select>

        <select
          value={safeAbilityIdx}
          onChange={(e) => handleAbilityChange(e.target.value)}
          className="rounded-(--radius-card) border border-line bg-inset/60 px-2 py-1.5 font-mono text-xs text-ink"
        >
          {abilities.map((a, i) => (
            <option key={a.name + i} value={i}>
              {a.name}
            </option>
          ))}
        </select>

        <div className="ml-1 flex items-center gap-1">
          <button
            type="button"
            onClick={() => handleStepHero(-1)}
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
            onClick={() => handleStepHero(1)}
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
