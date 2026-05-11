"use client";

import { useMemo } from "react";
import {
  getAllLabeledSoundClips,
  resolveLabeledSoundClip,
  type LabeledSoundClipRef,
  type ResolvedSoundClip,
} from "@/lib/daily";

type Props = {
  currentClip: ResolvedSoundClip;
  overrideActive: boolean;
  onApply: (clip: ResolvedSoundClip | null) => void;
};

// Dev-only picker rendered above the Sound game. Lets the developer cycle
// through every labeled clip in sound-clips.json (~127 entries across 35
// heroes) plus a Random shuffle, so we can sanity-check the snippet
// ladder, bonus round, and reveal video without waiting for a daily seed
// rotation. Gated by NODE_ENV at the call site — never reaches prod.
export function DevSoundPicker({
  currentClip,
  overrideActive,
  onApply,
}: Props) {
  const allClips = useMemo<LabeledSoundClipRef[]>(
    () => getAllLabeledSoundClips(),
    [],
  );

  const heroes = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of allClips) seen.set(c.heroKey, c.heroName);
    return [...seen.entries()]
      .map(([key, name]) => ({ key, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allClips]);

  // Dropdowns are pure projections of `currentClip` — no local state, so
  // an external change (Random, Today reset) is reflected without an
  // effect. When `currentClip` is from the SFX fallback path (slug=null,
  // no labeled equivalent) we gracefully default to the first labeled
  // hero/clip so the dropdowns aren't blank.
  const selectedHero = heroes.some((h) => h.key === currentClip.hero.key)
    ? currentClip.hero.key
    : (heroes[0]?.key ?? "");

  const heroClips = useMemo(
    () => allClips.filter((c) => c.heroKey === selectedHero),
    [allClips, selectedHero],
  );

  const selectedSlug =
    currentClip.slug && heroClips.some((c) => c.slug === currentClip.slug)
      ? currentClip.slug
      : (heroClips[0]?.slug ?? "");

  const flatIndex =
    currentClip.slug != null
      ? allClips.findIndex(
          (c) =>
            c.heroKey === currentClip.hero.key && c.slug === currentClip.slug,
        )
      : -1;

  const applyByRef = (heroKey: string, slug: string) => {
    const resolved = resolveLabeledSoundClip(heroKey, slug);
    if (resolved) onApply(resolved);
  };

  const handleHeroChange = (key: string) => {
    const first = allClips.find((c) => c.heroKey === key);
    if (first) applyByRef(first.heroKey, first.slug);
  };

  const handleSlugChange = (slug: string) => {
    applyByRef(selectedHero, slug);
  };

  const handleStep = (delta: 1 | -1) => {
    if (allClips.length === 0) return;
    const start = flatIndex >= 0 ? flatIndex : 0;
    const next = (start + delta + allClips.length) % allClips.length;
    const c = allClips[next];
    applyByRef(c.heroKey, c.slug);
  };

  const handleRandom = () => {
    if (allClips.length === 0) return;
    let idx = Math.floor(Math.random() * allClips.length);
    if (allClips.length > 1 && idx === flatIndex) {
      idx = (idx + 1) % allClips.length;
    }
    const c = allClips[idx];
    applyByRef(c.heroKey, c.slug);
  };

  const handleReset = () => onApply(null);

  return (
    <div className="mb-6 rounded-(--radius-card) border border-dashed border-accent/50 bg-accent/5 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
          Dev · sound picker
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
          {flatIndex >= 0 ? flatIndex + 1 : "—"} / {allClips.length}
          {overrideActive ? (
            <span className="ml-2 text-accent">override</span>
          ) : (
            <span className="ml-2 text-ink-faint">daily</span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={selectedHero}
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
          value={selectedSlug}
          onChange={(e) => handleSlugChange(e.target.value)}
          className="rounded-(--radius-card) border border-line bg-inset/60 px-2 py-1.5 font-mono text-xs text-ink"
        >
          {heroClips.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.label} · {c.duration.toFixed(1)}s
            </option>
          ))}
        </select>

        <div className="ml-1 flex items-center gap-1">
          <button
            type="button"
            onClick={() => handleStep(-1)}
            className="rounded-(--radius-card) border border-line px-2 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft transition-colors hover:border-accent/50 hover:text-accent"
            aria-label="Previous clip"
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
            aria-label="Next clip"
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
