"use client";

// Dev-only preview for the round / quote share cards. The real cards
// only render offscreen behind a finished round, which makes design
// iteration painfully slow (play a round per look). This renders them
// inline at a readable scale with hero / mode / outcome / skin knobs.
//
// Prod 404 is handled by app/labeler/layout.tsx, same as the other tools.

import { useEffect, useMemo, useRef, useState } from "react";
import { HEROES, type Hero } from "@/lib/heroes";
import { BUILT_MODE_SLUGS, type ModeSlug } from "@/lib/modes";
import { dayString } from "@/lib/daily";
import { HERO_PALETTE } from "@/lib/heroColors";
import {
  RoundShareCard,
  QuoteShareCard,
  DailyShareCard,
  ROUND_CARD_BOX,
  type DailyModeResult,
} from "@/components/ShareCard";
import { DailyTextShare } from "@/components/DailyTextShare";
import { ShareButton } from "@/components/ShareButton";
import { dailyShareLinks } from "@/lib/shareLinks";

const PREVIEW_SCALE = 0.42;
const ROUND_MODES: ModeSlug[] = ["classic", "sound", "splash", "ability"];

// Synthetic-but-plausible waveform for the sound card. Deterministic
// (no Math.random) so the preview is stable across renders; the real
// game decodes the day's clip via computeWaveformPeaks.
const PREVIEW_PEAKS = Array.from({ length: 96 }, (_, i) => {
  const v =
    Math.abs(Math.sin(i * 0.55) * Math.sin(i * 0.13)) +
    0.25 * Math.abs(Math.sin(i * 1.7));
  return Math.min(1, 0.12 + v);
});

// Local palette server (scripts/palette-server.mjs) — writes
// data/hero-palettes.json so edits ship with the next deploy.
const PALETTE_API = "http://127.0.0.1:8791/api/hero-palettes";
const MAX_PALETTE = 5;

type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> };

// Canvas-based eyedropper fallback for browsers without the EyeDropper
// API (Safari). Draws the hero's art into a canvas and samples pixels
// on click — covers the actual use case (lifting costume colors off the
// splash) without Chromium's any-pixel API. Base art is same-origin
// (git-tracked public/), so getImageData stays untainted.
function ImageSampler({
  hero,
  onPick,
  onClose,
}: {
  hero: Hero;
  onPick: (hex: string) => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  // Esc cancels, as the hint promises.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = hero.splash_url ?? hero.portrait;
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const scale = Math.min(
        720 / img.naturalWidth,
        560 / img.naturalHeight,
        1,
      );
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.onerror = () => setFailed(true);
  }, [hero]);

  const sample = (e: React.MouseEvent): string | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) * (canvas.width / rect.width));
    const y = Math.floor(
      (e.clientY - rect.top) * (canvas.height / rect.height),
    );
    try {
      const d = canvas
        .getContext("2d")
        ?.getImageData(x, y, 1, 1).data;
      if (!d) return null;
      return `#${[d[0], d[1], d[2]]
        .map((v) => v.toString(16).padStart(2, "0"))
        .join("")}`;
    } catch {
      // Tainted canvas (cross-origin art without CORS) — can't sample.
      setFailed(true);
      return null;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
      onClick={onClose}
    >
      <div
        className="flex flex-col gap-3 border border-line bg-canvas p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between gap-6">
          <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-info">
            Sample from {hero.name}&apos;s art
          </span>
          <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
            {hover && (
              <span
                className="inline-block h-4 w-4 border border-line"
                style={{ background: hover }}
              />
            )}
            {failed ? "couldn't read pixels" : (hover ?? "click to pick · esc to cancel")}
          </span>
        </div>
        <canvas
          ref={canvasRef}
          className="cursor-crosshair"
          onMouseMove={(e) => setHover(sample(e))}
          onMouseLeave={() => setHover(null)}
          onClick={(e) => {
            const c = sample(e);
            if (c) onPick(c);
          }}
        />
        <button
          type="button"
          onClick={onClose}
          className="self-end border border-line bg-surface px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft transition-colors hover:border-accent hover:text-accent"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// Visual editor for the selected hero's costume palette. Auto-saves
// (debounced) through the palette server; Next's HMR then reloads the
// JSON import, so the cards below re-render with the new colors a beat
// later — that's the live preview loop.
function PaletteEditor({ hero }: { hero: Hero }) {
  const [serverMap, setServerMap] = useState<Record<string, string[]> | null>(
    null,
  );
  const [offline, setOffline] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  // Which swatch the canvas sampler is currently picking for (null =
  // closed). Chromium routes around it via the native EyeDropper API.
  const [samplerIdx, setSamplerIdx] = useState<number | null>(null);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(PALETTE_API)
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)),
      )
      .then((json) => {
        if (!cancelled) {
          setServerMap(json as Record<string, string[]>);
          setOffline(false);
        }
      })
      .catch(() => {
        if (!cancelled) setOffline(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-seed the draft when switching heroes (or when the live file
  // lands). Server contents win over the build-time import, which goes
  // stale between saves and HMR passes. Render-time state adjustment
  // (the React-documented pattern) instead of an effect, so the reset
  // paints in the same pass as the hero switch.
  const seedSig = `${hero.key}:${serverMap ? "server" : "import"}`;
  const [lastSeed, setLastSeed] = useState("");
  if (lastSeed !== seedSig) {
    setLastSeed(seedSig);
    setDraft(serverMap?.[hero.key] ?? HERO_PALETTE[hero.key] ?? ["#888888"]);
    setStatus("idle");
  }

  // Debounced write-through. Key is captured as an argument so a hero
  // switch mid-debounce can't save the old colors under the new hero.
  const scheduleSave = (key: string, colors: string[]) => {
    if (saveTimer.current != null) window.clearTimeout(saveTimer.current);
    setStatus("saving");
    saveTimer.current = window.setTimeout(() => {
      fetch(PALETTE_API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, colors }),
      })
        .then((r) => setStatus(r.ok ? "saved" : "error"))
        .catch(() => setStatus("error"));
    }, 600);
  };

  const update = (colors: string[]) => {
    setDraft(colors);
    scheduleSave(hero.key, colors);
  };

  // Chrome: native EyeDropper (samples ANY pixel on screen). Safari &
  // friends: canvas sampler over the hero's art — covers the real use
  // case (lifting costume colors) without the Chromium-only API.
  const pickColor = async (idx: number) => {
    if ("EyeDropper" in window) {
      const ED = (window as unknown as { EyeDropper: EyeDropperCtor })
        .EyeDropper;
      try {
        const result = await new ED().open();
        update(draft.map((c, i) => (i === idx ? result.sRGBHex : c)));
      } catch {
        // User pressed Esc — not an error.
      }
    } else {
      setSamplerIdx(idx);
    }
  };

  return (
    <section className="mt-10 border border-line bg-surface/30 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.22em] text-info">
          Palette editor · {hero.name}
        </h2>
        <span
          className={`font-mono text-[10px] uppercase tracking-[0.18em] ${
            offline
              ? "text-far"
              : status === "error"
                ? "text-far"
                : status === "saving"
                  ? "text-accent"
                  : status === "saved"
                    ? "text-info"
                    : "text-ink-faint"
          }`}
        >
          {offline
            ? "palette server offline · restart npm run dev"
            : status === "saving"
              ? "saving…"
              : status === "saved"
                ? "saved → data/hero-palettes.json"
                : status === "error"
                  ? "save failed"
                  : "auto-saves on change"}
        </span>
      </div>
      <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
        Dominant color first · 2 frame colors get day-shuffled from these ·
        ◉ eyedrops from the hero art (any screen pixel in Chrome)
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        {draft.map((c, i) => (
          <div
            key={i}
            className="flex items-center gap-1.5 border border-line bg-surface px-2 py-1.5"
          >
            <input
              type="color"
              value={c}
              onChange={(e) =>
                update(draft.map((x, j) => (j === i ? e.target.value : x)))
              }
              className="h-9 w-9 cursor-pointer border-0 bg-transparent p-0"
              title={i === 0 ? "Dominant color" : `Color ${i + 1}`}
            />
            <span className="font-mono text-[10px] text-ink-faint">{c}</span>
            <button
              type="button"
              onClick={() => pickColor(i)}
              title="Eyedropper — sample from the hero art (or any screen pixel in Chrome)"
              className="px-1 text-sm text-ink-soft transition-colors hover:text-accent"
            >
              ◉
            </button>
            <button
              type="button"
              onClick={() => update(draft.filter((_, j) => j !== i))}
              disabled={draft.length <= 1}
              title="Remove color"
              className="px-1 text-sm text-ink-soft transition-colors hover:text-far disabled:opacity-30"
            >
              ✕
            </button>
          </div>
        ))}
        {draft.length < MAX_PALETTE && (
          <button
            type="button"
            onClick={() => update([...draft, "#888888"])}
            className="border border-line bg-surface px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft transition-colors hover:border-accent hover:text-accent"
          >
            + add color
          </button>
        )}
      </div>
      {samplerIdx != null && (
        <ImageSampler
          hero={hero}
          onPick={(hex) => {
            update(draft.map((c, i) => (i === samplerIdx ? hex : c)));
            setSamplerIdx(null);
          }}
          onClose={() => setSamplerIdx(null)}
        />
      )}
    </section>
  );
}

function CardFrame({
  children,
  box = ROUND_CARD_BOX,
}: {
  children: React.ReactNode;
  // Card bounding-box size in design px — the daily card runs its own
  // 960² square rather than the round-chip box.
  box?: number;
}) {
  return (
    <div
      className="overflow-hidden border border-line"
      style={{
        width: box * PREVIEW_SCALE,
        height: box * PREVIEW_SCALE,
      }}
    >
      <div
        style={{
          transform: `scale(${PREVIEW_SCALE})`,
          transformOrigin: "top left",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function HeroSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Hero;
  onChange: (h: Hero) => void;
}) {
  const sorted = useMemo(
    () => [...HEROES].sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );
  return (
    <label className="flex flex-col gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
      {label}
      <select
        value={value.key}
        onChange={(e) => {
          const hero = HEROES.find((h) => h.key === e.target.value);
          if (hero) onChange(hero);
        }}
        className="border border-line bg-surface px-2 py-1 font-mono text-[12px] text-ink"
      >
        {sorted.map((h) => (
          <option key={h.key} value={h.key}>
            {h.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function SharePreviewPage() {
  const [hero, setHero] = useState<Hero>(
    () => HEROES.find((h) => h.splash_url) ?? HEROES[0],
  );
  const [speakerA, setSpeakerA] = useState<Hero>(() => HEROES[0]);
  const [speakerB, setSpeakerB] = useState<Hero>(
    () => HEROES[1] ?? HEROES[0],
  );
  const [outcome, setOutcome] = useState<"won" | "lost">("won");
  const [guesses, setGuesses] = useState(4);
  const [hints, setHints] = useState(0);
  const [skips, setSkips] = useState(0);
  // Spotlight-only skin line. Pulls real skins off the selected hero so
  // long legendary names get exercised, not lorem placeholders.
  const [skinIndex, setSkinIndex] = useState(-1);
  const skin = skinIndex >= 0 ? hero.skins[skinIndex] ?? null : null;
  // Ability-only eyebrow. Falls back to the hero's first ability when
  // the index goes stale after a hero switch.
  const [abilityIndex, setAbilityIndex] = useState(0);
  const ability =
    hero.abilities[abilityIndex] ?? hero.abilities[0] ?? null;
  // Today's daily id, same source the games stamp their cards with.
  const day = useMemo(() => dayString(), []);
  // Daily-complete card state: not hero-specific — an end-of-day
  // summary across all built modes. First N modes render as missed.
  const [missedModes, setMissedModes] = useState(0);
  const dailyResults = useMemo<DailyModeResult[]>(
    () =>
      BUILT_MODE_SLUGS.map((slug, i) => ({
        slug,
        outcome: i < missedModes ? "lost" : "won",
        guesses,
      })),
    [missedModes, guesses],
  );

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="font-display text-3xl font-bold tracking-tight">
        Share Card Preview
      </h1>
      <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">
        Dev-only · round + quote 1080² cards without playing a round
      </p>

      <section className="mt-8 flex flex-wrap items-end gap-4">
        <HeroSelect label="Hero" value={hero} onChange={setHero} />
        <label className="flex flex-col gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
          Outcome
          <select
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as "won" | "lost")}
            className="border border-line bg-surface px-2 py-1 font-mono text-[12px] uppercase tracking-[0.14em] text-ink"
          >
            <option value="won">won</option>
            <option value="lost">lost</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
          Guesses
          <input
            type="number"
            min={1}
            value={guesses}
            onChange={(e) =>
              setGuesses(Math.max(1, Number(e.target.value) || 1))
            }
            className="w-20 border border-line bg-surface px-2 py-1 text-right tabular-nums text-ink"
          />
        </label>
        <label className="flex flex-col gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
          Hints (Classic)
          <input
            type="number"
            min={0}
            value={hints}
            onChange={(e) => setHints(Math.max(0, Number(e.target.value) || 0))}
            className="w-20 border border-line bg-surface px-2 py-1 text-right tabular-nums text-ink"
          />
        </label>
        <label className="flex flex-col gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
          Skips (Sound)
          <input
            type="number"
            min={0}
            value={skips}
            onChange={(e) => setSkips(Math.max(0, Number(e.target.value) || 0))}
            className="w-20 border border-line bg-surface px-2 py-1 text-right tabular-nums text-ink"
          />
        </label>
        <label className="flex flex-col gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
          Skin (Spotlight only)
          <select
            value={skinIndex}
            onChange={(e) => setSkinIndex(Number(e.target.value))}
            className="border border-line bg-surface px-2 py-1 font-mono text-[12px] text-ink"
          >
            <option value={-1}>base hero</option>
            {hero.skins.map((s, i) => (
              <option key={`${s.name}-${i}`} value={i}>
                {s.rarity} · {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
          Ability (Ability only)
          <select
            value={abilityIndex}
            onChange={(e) => setAbilityIndex(Number(e.target.value))}
            className="border border-line bg-surface px-2 py-1 font-mono text-[12px] text-ink"
          >
            {hero.abilities.map((a, i) => (
              <option key={`${a.name}-${i}`} value={i}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      <PaletteEditor hero={hero} />

      <section className="mt-8">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.22em] text-info">
          Round cards · all modes
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-6 md:grid-cols-2">
          {ROUND_MODES.map((m) => (
            <div key={m}>
              <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
                {m}
              </div>
              <CardFrame>
                <RoundShareCard
                  mode={m}
                  answer={hero}
                  guesses={guesses}
                  outcome={outcome}
                  day={day}
                  skin={m === "splash" ? skin : null}
                  ability={m === "ability" ? ability : null}
                  waveform={m === "sound" ? PREVIEW_PEAKS : null}
                  hints={m === "classic" ? hints : 0}
                  skips={m === "sound" ? skips : 0}
                />
              </CardFrame>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.22em] text-info">
          Quote card
        </h2>
        <div className="mt-3 flex flex-wrap items-end gap-4">
          <HeroSelect label="Speaker A" value={speakerA} onChange={setSpeakerA} />
          <HeroSelect label="Speaker B" value={speakerB} onChange={setSpeakerB} />
        </div>
        <div className="mt-3">
          <CardFrame>
            <QuoteShareCard
              speakerA={speakerA}
              speakerB={speakerB}
              guesses={guesses}
              outcome={outcome}
              day={day}
            />
          </CardFrame>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.22em] text-info">
          Daily complete card
        </h2>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
          Not hero-specific — end-of-day summary across all built modes ·
          per-mode guesses + hints/skips reuse the knobs above
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
            Missed modes
            <input
              type="number"
              min={0}
              max={BUILT_MODE_SLUGS.length}
              value={missedModes}
              onChange={(e) =>
                setMissedModes(
                  Math.max(
                    0,
                    Math.min(
                      BUILT_MODE_SLUGS.length,
                      Number(e.target.value) || 0,
                    ),
                  ),
                )
              }
              className="w-20 border border-line bg-surface px-2 py-1 text-right tabular-nums text-ink"
            />
          </label>
        </div>
        <div className="mt-3">
          <CardFrame>
            <DailyShareCard
              day={day}
              results={dailyResults}
              totalHints={hints}
              totalSkips={skips}
            />
          </CardFrame>
        </div>
        <div className="mt-4 max-w-lg">
          <h3 className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
            Text share (the live daily surface)
          </h3>
          <DailyTextShare
            day={day}
            results={dailyResults}
            totalHints={hints}
            totalSkips={skips}
            share={
              <ShareButton
                {...dailyShareLinks({
                  day,
                  // Preview results are always terminal (won/lost) — the
                  // knob only flips outcomes, never leaves one pending.
                  results: dailyResults as {
                    slug: ModeSlug;
                    outcome: "won" | "lost";
                    guesses: number;
                  }[],
                  hints,
                  skips,
                })}
                filename={`owdle-daily-${day}.png`}
                surface="daily_complete"
                dailyId={day}
              />
            }
          />
        </div>
      </section>
    </main>
  );
}
