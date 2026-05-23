"use client";

// Dev-only preview for the Phase 3.5 daily tier badge. Renders all 7
// tiers stacked with their official OW rank icons + percentile bands,
// plus a worked 4/5 example whose composite drives a live badge render.
//
// The badge component itself fetches /api/stats/today, which doesn't
// run under `next dev` (Pages Function). So this preview short-circuits
// the stats path entirely — we synthesize cutoffs and pass the chosen
// composite directly to tierForComposite, then render the icon + label
// inline using the same vocabulary as DailyTierBadge.

import { useMemo, useState } from "react";
import {
  TIERS,
  TIER_LABEL,
  modeScore,
  tierForComposite,
  type Tier,
  type TierCutoffs,
} from "@/lib/tier";

// Synthetic cutoffs for preview only. Spaced to land the canonical
// 4/5 example (composite ≈ 1.54) in Gold so the rendered badge
// changes if you tweak the example below.
const PREVIEW_CUTOFFS: TierCutoffs = {
  top500: 3.5,
  grandmaster: 2.8,
  diamond: 2.3,
  platinum: 1.8,
  gold: 1.3,
  silver: 0.8,
};

type Outcome = "won" | "lost";
type ModeRow = {
  slug: "classic" | "sound" | "quote" | "ability" | "splash";
  label: string;
  cap: number;
  outcome: Outcome;
  guesses: number;
};

const INITIAL_ROWS: ModeRow[] = [
  { slug: "classic", label: "Classic", cap: 8, outcome: "won", guesses: 4 },
  { slug: "sound", label: "Sound", cap: 8, outcome: "won", guesses: 6 },
  { slug: "quote", label: "Quote", cap: 8, outcome: "won", guesses: 5 },
  { slug: "ability", label: "Ability", cap: 12, outcome: "won", guesses: 7 },
  { slug: "splash", label: "Splash", cap: 5, outcome: "lost", guesses: 5 },
];

export default function TierPreviewPage() {
  const [rows, setRows] = useState<ModeRow[]>(INITIAL_ROWS);

  const composite = useMemo(
    () =>
      rows.reduce(
        (sum, r) => sum + modeScore(r.slug, r.outcome === "won", r.guesses),
        0,
      ),
    [rows],
  );
  const tier = tierForComposite(composite, PREVIEW_CUTOFFS);

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="font-display text-3xl font-bold tracking-tight">
        Daily Tier Preview
      </h1>
      <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">
        Dev-only · synthetic cutoffs · same render path as DailyTierBadge
      </p>

      <section className="mt-8">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.22em] text-info">
          All 7 tiers
        </h2>
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {TIERS.map((t) => (
            <li
              key={t}
              className="flex flex-col items-center gap-1.5 border border-line bg-surface/40 p-3"
            >
              <img
                src={`/ranks/${t}.png`}
                alt=""
                width={72}
                height={72}
                className="h-18 w-18 object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.45)]"
              />
              <span className="font-display text-base font-bold uppercase tracking-wide text-accent">
                {TIER_LABEL[t]}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
                {percentileLabel(t)}
              </span>
              <span className="font-mono text-[10px] tabular-nums text-ink-faint">
                ≥ {cutoffFor(t)?.toFixed(2) ?? "—"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.22em] text-info">
          Worked example · tweak inline
        </h2>

        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
                <th className="py-2 pr-4 text-left">Mode</th>
                <th className="py-2 pr-4 text-left">Cap</th>
                <th className="py-2 pr-4 text-left">Outcome</th>
                <th className="py-2 pr-4 text-left">Guesses</th>
                <th className="py-2 pr-4 text-right">Score</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const score = modeScore(r.slug, r.outcome === "won", r.guesses);
                return (
                  <tr key={r.slug} className="border-b border-line/60">
                    <td className="py-2 pr-4 font-medium">{r.label}</td>
                    <td className="py-2 pr-4 tabular-nums text-ink-faint">{r.cap}</td>
                    <td className="py-2 pr-4">
                      <select
                        value={r.outcome}
                        onChange={(e) => {
                          const next = [...rows];
                          next[i] = { ...r, outcome: e.target.value as Outcome };
                          setRows(next);
                        }}
                        className="border border-line bg-surface px-2 py-1 font-mono text-[11px] uppercase tracking-[0.18em]"
                      >
                        <option value="won">won</option>
                        <option value="lost">lost</option>
                      </select>
                    </td>
                    <td className="py-2 pr-4">
                      <input
                        type="number"
                        min={1}
                        max={r.cap}
                        value={r.guesses}
                        onChange={(e) => {
                          const next = [...rows];
                          next[i] = {
                            ...r,
                            guesses: Math.max(1, Math.min(r.cap, Number(e.target.value) || 1)),
                          };
                          setRows(next);
                        }}
                        className="w-20 border border-line bg-surface px-2 py-1 text-right tabular-nums"
                      />
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums text-accent-soft">
                      {score.toFixed(3)}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-line font-mono text-[10px] uppercase tracking-[0.18em] text-info">
                <td className="py-2 pr-4">Composite</td>
                <td colSpan={3}></td>
                <td className="py-2 pr-4 text-right">
                  <span className="font-display text-lg font-bold tabular-nums text-accent">
                    {composite.toFixed(3)}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-8 border-y border-accent/25 py-6">
          <p className="text-center font-mono text-[10px] uppercase tracking-[0.28em] text-info">
            Resulting badge
          </p>
          <div className="mt-3 flex flex-col items-center gap-2">
            <img
              src={`/ranks/${tier}.png`}
              alt=""
              width={120}
              height={120}
              className="h-30 w-30 object-contain drop-shadow-[0_6px_16px_rgba(0,0,0,0.5)]"
            />
            <span className="font-display text-3xl font-bold uppercase tracking-wide text-accent">
              {TIER_LABEL[tier]}
            </span>
          </div>
        </div>

        <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
          NB: Real prod cutoffs derive from today&apos;s all-5-modes finisher
          distribution via HogQL <code>quantile()</code>. These cutoffs are
          synthetic for preview only.
        </p>
      </section>
    </main>
  );
}

function percentileLabel(t: Tier): string {
  switch (t) {
    case "top500":
      return "top 1%";
    case "grandmaster":
      return "top 10%";
    case "diamond":
      return "top 30%";
    case "platinum":
      return "top 50%";
    case "gold":
      return "top 70%";
    case "silver":
      return "top 90%";
    case "bronze":
      return "bottom 10%";
  }
}

function cutoffFor(t: Tier): number | undefined {
  if (t === "bronze") return undefined;
  return PREVIEW_CUTOFFS[t];
}
