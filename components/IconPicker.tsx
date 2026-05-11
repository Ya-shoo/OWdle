"use client";

import { useEffect, useMemo, useState } from "react";
import { HEROES_BY_KEY, type Ability, type Hero } from "@/lib/heroes";
import soundClipsData from "@/data/sound-clips.json";
import committedOverrides from "@/data/sound-clip-icons.json";

type SoundClip = {
  slug: string;
  label: string;
  audioUrl: string;
  videoUrl: string | null;
  duration: number;
};

type Overrides = Record<string, Record<string, string>>;

const SOUND_CLIPS = soundClipsData as Record<string, SoundClip[]>;
const COMMITTED = committedOverrides as Overrides;

// Mirror lib/daily.ts:abilityNameToSlug. Must stay in sync so what we
// write here resolves correctly at runtime.
function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function abilityBySlug(hero: Hero, slug: string): Ability | undefined {
  return hero.abilities.find((a) => slugify(a.name) === slug);
}

const STORAGE_KEY = "owdle:icon-picker:overrides:v1";

// Heroes that have at least one labeled clip. Sorted by display name.
const HEROES_WITH_CLIPS = Object.keys(SOUND_CLIPS)
  .map((key) => HEROES_BY_KEY[key])
  .filter((h): h is Hero => Boolean(h))
  .sort((a, b) => a.name.localeCompare(b.name));

type ClipStatus = "auto" | "override" | "orphan";

function clipStatus(
  hero: Hero,
  clipSlug: string,
  overrides: Overrides,
): ClipStatus {
  if (overrides[hero.key]?.[clipSlug]) return "override";
  if (abilityBySlug(hero, clipSlug)) return "auto";
  return "orphan";
}

function loadStashed(): Overrides {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Overrides) : {};
  } catch {
    return {};
  }
}

function saveStashed(overrides: Overrides): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // ignore quota errors
  }
}

// Merge committed (on disk) overrides with the in-progress stash from
// localStorage. Stash wins so unsaved edits survive a refresh.
function initialOverrides(): Overrides {
  const stashed = loadStashed();
  const out: Overrides = {};
  const heroes = new Set([
    ...Object.keys(COMMITTED),
    ...Object.keys(stashed),
  ]);
  for (const heroKey of heroes) {
    out[heroKey] = { ...(COMMITTED[heroKey] ?? {}), ...(stashed[heroKey] ?? {}) };
  }
  return out;
}

// Strip empty hero entries before serializing — keeps the on-disk file
// minimal and stable in diffs.
function cleanForExport(overrides: Overrides): Overrides {
  const out: Overrides = {};
  for (const [heroKey, clipMap] of Object.entries(overrides)) {
    const filtered = Object.fromEntries(
      Object.entries(clipMap).filter(([, v]) => Boolean(v)),
    );
    if (Object.keys(filtered).length > 0) out[heroKey] = filtered;
  }
  return out;
}

type Filter = "all" | "needs-icon" | "customized";

export function IconPicker() {
  const [overrides, setOverrides] = useState<Overrides>({});
  const [hydrated, setHydrated] = useState(false);
  const [heroKey, setHeroKey] = useState<string>(
    HEROES_WITH_CLIPS[0]?.key ?? "",
  );
  const [filter, setFilter] = useState<Filter>("needs-icon");
  const [copied, setCopied] = useState(false);

  // Load committed + stashed overrides on mount. Render a skeleton until
  // hydration so we don't trip server/client mismatch warnings — the
  // server can't see localStorage, so initial state has to come from the
  // client. setState-in-effect is the canonical hydration-sync pattern.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOverrides(initialOverrides());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveStashed(overrides);
  }, [overrides, hydrated]);

  const hero = HEROES_BY_KEY[heroKey];
  const clips = useMemo(() => SOUND_CLIPS[heroKey] ?? [], [heroKey]);

  const filteredClips = useMemo(() => {
    if (!hero) return [];
    return clips.filter((clip) => {
      const status = clipStatus(hero, clip.slug, overrides);
      if (filter === "needs-icon") return status === "orphan";
      if (filter === "customized") return status === "override";
      return true;
    });
  }, [clips, filter, hero, overrides]);

  const orphanCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const h of HEROES_WITH_CLIPS) {
      const list = SOUND_CLIPS[h.key] ?? [];
      let n = 0;
      for (const c of list) {
        if (clipStatus(h, c.slug, overrides) === "orphan") n++;
      }
      out[h.key] = n;
    }
    return out;
  }, [overrides]);

  const totalOrphans = useMemo(
    () => Object.values(orphanCounts).reduce((a, b) => a + b, 0),
    [orphanCounts],
  );

  const assign = (clipSlug: string, abilitySlug: string | null) => {
    setOverrides((prev) => {
      const next: Overrides = { ...prev };
      const heroMap = { ...(next[heroKey] ?? {}) };
      if (abilitySlug == null) {
        delete heroMap[clipSlug];
      } else {
        heroMap[clipSlug] = abilitySlug;
      }
      if (Object.keys(heroMap).length === 0) {
        delete next[heroKey];
      } else {
        next[heroKey] = heroMap;
      }
      return next;
    });
  };

  const exportJson = () => JSON.stringify(cleanForExport(overrides), null, 2) + "\n";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(exportJson());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // fall through — the download button is the safer fallback
    }
  };

  const handleDownload = () => {
    const blob = new Blob([exportJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sound-clip-icons.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleResetStash = () => {
    if (
      !window.confirm(
        "Discard all unsaved edits and reload from data/sound-clip-icons.json?",
      )
    )
      return;
    window.localStorage.removeItem(STORAGE_KEY);
    setOverrides(JSON.parse(JSON.stringify(COMMITTED)));
  };

  if (!hydrated || !hero) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-16">
        <div className="font-mono text-xs uppercase tracking-[0.2em] text-ink-faint">
          Loading…
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-16">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-accent">
            Dev · icon picker
          </p>
          <h1 className="mt-3 font-display display-headline text-4xl text-ink sm:text-5xl">
            Sound clip icons
          </h1>
          <p className="mt-3 max-w-xl text-ink-soft">
            Assign an ability icon to each labeled clip. Custom labels
            (&ldquo;Scoped Fire&rdquo;, &ldquo;Primary Fire&rdquo;) don&rsquo;t
            auto-match a press-kit ability — pick one from the hero&rsquo;s
            abilities below. Save with{" "}
            <span className="font-mono text-ink">Download</span> and replace{" "}
            <span className="font-mono text-ink">data/sound-clip-icons.json</span>.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-(--radius-card) border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-ink-soft transition-colors hover:border-accent/60 hover:text-accent"
            >
              {copied ? "Copied!" : "Copy JSON"}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="rounded-(--radius-card) border border-accent/60 bg-accent/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-accent transition-colors hover:bg-accent/20"
            >
              Download
            </button>
          </div>
          <button
            type="button"
            onClick={handleResetStash}
            className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint underline-offset-4 hover:text-far hover:underline"
          >
            Reset to committed file
          </button>
        </div>
      </header>

      <section className="mb-6 flex flex-wrap items-center gap-3 rounded-(--radius-card) border border-line bg-inset/40 p-4">
        <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
          Hero
          <select
            value={heroKey}
            onChange={(e) => setHeroKey(e.target.value)}
            className="rounded-(--radius-card) border border-line bg-canvas px-2 py-1.5 font-mono text-xs text-ink"
          >
            {HEROES_WITH_CLIPS.map((h) => {
              const orphans = orphanCounts[h.key] ?? 0;
              return (
                <option key={h.key} value={h.key}>
                  {h.name}
                  {orphans > 0 ? ` · ${orphans} unassigned` : ""}
                </option>
              );
            })}
          </select>
        </label>

        <div className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
          <span className="mr-1">Show</span>
          {(["needs-icon", "all", "customized"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={
                "rounded-(--radius-card) border px-2 py-1 transition-colors " +
                (filter === f
                  ? "border-accent text-accent"
                  : "border-line text-ink-soft hover:border-accent/40 hover:text-ink")
              }
            >
              {f === "needs-icon" ? "Orphans" : f === "all" ? "All" : "Customized"}
            </button>
          ))}
        </div>

        <div className="ml-auto font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
          {totalOrphans} unassigned across {HEROES_WITH_CLIPS.length} heroes
        </div>
      </section>

      <div className="space-y-4">
        {filteredClips.length === 0 && (
          <div className="rounded-(--radius-card) border border-dashed border-line bg-inset/40 p-8 text-center font-mono text-xs uppercase tracking-[0.18em] text-ink-faint">
            No clips for this filter.
          </div>
        )}
        {filteredClips.map((clip) => (
          <ClipRow
            key={clip.slug}
            hero={hero}
            clip={clip}
            status={clipStatus(hero, clip.slug, overrides)}
            assignedAbilitySlug={overrides[hero.key]?.[clip.slug] ?? null}
            onAssign={(abilitySlug) => assign(clip.slug, abilitySlug)}
          />
        ))}
      </div>
    </main>
  );
}

function ClipRow({
  hero,
  clip,
  status,
  assignedAbilitySlug,
  onAssign,
}: {
  hero: Hero;
  clip: SoundClip;
  status: ClipStatus;
  assignedAbilitySlug: string | null;
  onAssign: (abilitySlug: string | null) => void;
}) {
  const autoAbility = abilityBySlug(hero, clip.slug);
  const overrideAbility = assignedAbilitySlug
    ? abilityBySlug(hero, assignedAbilitySlug)
    : null;
  const currentAbility = overrideAbility ?? autoAbility;

  const fallbackLetter = clip.label
    .replace(/[^a-zA-Z0-9]/g, "")
    .charAt(0)
    .toUpperCase();

  const statusBadge =
    status === "orphan"
      ? { text: "Orphan", className: "border-far/50 bg-far/10 text-far" }
      : status === "override"
        ? {
            text: "Custom",
            className: "border-accent/50 bg-accent/10 text-accent",
          }
        : {
            text: "Auto",
            className:
              "border-correct/40 bg-correct/10 text-correct",
          };

  return (
    <div className="rounded-(--radius-card) border border-line bg-inset/40 p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="tile-shape relative flex h-12 w-12 items-center justify-center bg-canvas/60">
          {currentAbility?.icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={currentAbility.icon}
              alt=""
              className="h-full w-full object-contain p-1"
            />
          ) : (
            <span
              className="font-display text-xl text-accent-soft"
              aria-hidden
            >
              {fallbackLetter}
            </span>
          )}
        </div>
        <div className="flex-1">
          <div className="font-display text-lg text-ink">{clip.label}</div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
            slug: {clip.slug} · {clip.duration.toFixed(1)}s
          </div>
        </div>
        <span
          className={
            "rounded-(--radius-card) border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] " +
            statusBadge.className
          }
        >
          {statusBadge.text}
        </span>
        {assignedAbilitySlug && (
          <button
            type="button"
            onClick={() => onAssign(null)}
            className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint underline-offset-4 hover:text-far hover:underline"
          >
            Clear override
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
        {hero.abilities.map((ab) => {
          const abSlug = slugify(ab.name);
          const isPicked =
            overrideAbility != null && slugify(overrideAbility.name) === abSlug;
          const isAuto =
            !overrideAbility && autoAbility && slugify(autoAbility.name) === abSlug;
          return (
            <button
              key={abSlug}
              type="button"
              onClick={() => onAssign(abSlug)}
              title={ab.name}
              className={
                "tile-shape group flex flex-col items-center gap-1 p-2 text-center transition-colors " +
                (isPicked
                  ? "border-2 border-accent bg-accent/10"
                  : isAuto
                    ? "border border-correct/40 bg-correct/5 hover:border-accent/60"
                    : "border border-line bg-canvas/60 hover:border-accent/60 hover:bg-accent/5")
              }
            >
              <div className="flex h-12 w-12 items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={ab.icon}
                  alt=""
                  className="h-full w-full object-contain"
                />
              </div>
              <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-soft leading-tight">
                {ab.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
