"use client";

// Dev-only preview for the Phase 3.5 daily tier badge. Tier is a pure
// percentile of the daily total (sum of guesses + hints) against today's
// all-5-modes finisher distribution. Lower total = better rank.
//
// /api/stats/today doesn't run under `next dev` (Pages Function), so
// this preview synthesizes a 30-finisher distribution + maps the live
// total against it.

import { useMemo, useState } from "react";
import {
  TIERS,
  TIER_LABEL,
  TIER_PERCENTILE_MAX,
  LOSS_PENALTY,
  BONUS_QUESTION_CREDIT,
  dailyTotal,
  tierForTopPercent,
  topPercent,
  type ModeProgress,
  type Tier,
} from "@/lib/tier";
import type { ModeSlug } from "@/lib/modes";

// Synthetic distribution of today's all-5-modes finisher totals
// (sum of guesses + hints across 5 modes). 30 entries, sorted ascending
// (lower = better). Roughly: best players ~10-15, middle ~20-30, worst
// ~35-41 (max = sum of caps).
const SYNTHETIC_TOTALS = [
  6, 7, 9,                          // T500 territory (top 1%-10%)
  11, 12, 13,                       // GM
  15, 16, 17, 18, 19, 20,           // diamond
  22, 23, 24, 25, 26, 27,           // platinum
  28, 29, 30, 31, 32, 33,           // gold
  34, 35, 36, 37,                   // silver
  39, 41,                           // bronze
];

type Outcome = "won" | "lost";
type BonusState = "correct" | "wrong" | "unanswered";
type ModeRow = {
  slug: ModeSlug;
  label: string;
  cap: number;
  outcome: Outcome;
  guesses: number;
  hints: number;
  hintsAllowed: boolean;       // Classic only
  bonus: BonusState;           // Classic only — ignored elsewhere
  bonusAllowed: boolean;       // Classic only
};

const INITIAL_ROWS: ModeRow[] = [
  { slug: "classic", label: "Classic", cap: 8, outcome: "won", guesses: 4, hints: 1, hintsAllowed: true, bonus: "correct", bonusAllowed: true },
  { slug: "sound", label: "Sound", cap: 8, outcome: "won", guesses: 6, hints: 0, hintsAllowed: false, bonus: "unanswered", bonusAllowed: false },
  { slug: "quote", label: "Quote", cap: 8, outcome: "won", guesses: 5, hints: 0, hintsAllowed: false, bonus: "unanswered", bonusAllowed: false },
  { slug: "ability", label: "Ability", cap: 12, outcome: "won", guesses: 7, hints: 0, hintsAllowed: false, bonus: "unanswered", bonusAllowed: false },
  { slug: "splash", label: "Splash", cap: 5, outcome: "lost", guesses: 5, hints: 0, hintsAllowed: false, bonus: "unanswered", bonusAllowed: false },
];

function rowsToModes(rows: ModeRow[]): Partial<Record<ModeSlug, ModeProgress>> {
  const out: Partial<Record<ModeSlug, ModeProgress>> = {};
  for (const r of rows) {
    out[r.slug] = {
      won: r.outcome === "won",
      guesses: new Array(r.guesses).fill(""),
      hintsUsed: new Array(r.hints).fill(""),
      bonus: r.bonusAllowed
        ? {
            correct:
              r.bonus === "correct"
                ? true
                : r.bonus === "wrong"
                  ? false
                  : null,
          }
        : null,
    };
  }
  return out;
}

export default function TierPreviewPage() {
  const [rows, setRows] = useState<ModeRow[]>(INITIAL_ROWS);

  const modes = useMemo(() => rowsToModes(rows), [rows]);
  const total = useMemo(() => dailyTotal(modes), [modes]);
  const pct = topPercent(total, SYNTHETIC_TOTALS);
  const tier = tierForTopPercent(pct);

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="font-display text-3xl font-bold tracking-tight">
        Daily Tier Preview
      </h1>
      <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">
        Dev-only · simple total · synthetic 30-finisher distribution
      </p>

      <section className="mt-8">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.22em] text-info">
          Tier ladder · percentile of finisher distribution
        </h2>
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {TIERS.map((t) => (
            <li
              key={t}
              className="flex flex-col items-center gap-1.5 border border-line bg-surface/40 p-3 text-center"
            >
              <img
                src={`/ranks/${t}.png`}
                alt=""
                width={64}
                height={64}
                className="h-16 w-16 object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.45)]"
              />
              <span className="font-display text-base font-bold uppercase tracking-wide text-accent">
                {TIER_LABEL[t]}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
                {percentileLabel(t)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.22em] text-info">
          Scoring
        </h2>
        <pre className="mt-3 overflow-x-auto border border-line bg-surface/40 p-3 font-mono text-[11px] leading-relaxed text-ink-soft">
{`daily total = sum across all 5 modes of:
  guesses + Classic hints                       (base slot count)
  + ${LOSS_PENALTY.toFixed(1)} if the mode was lost                   (tie-break)
  − ${BONUS_QUESTION_CREDIT.toFixed(1)} if Classic bonus question correct      (win-quality credit)

lower = better. Tier is the percentile rank of this total against
today's all-5-modes finisher distribution.`}
        </pre>
      </section>

      <section className="mt-10">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.22em] text-info">
          Worked example · tweak inline
        </h2>

        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
                <th className="py-2 pr-3 text-left">Mode</th>
                <th className="py-2 pr-3 text-left">Cap</th>
                <th className="py-2 pr-3 text-left">Outcome</th>
                <th className="py-2 pr-3 text-left">Guesses</th>
                <th className="py-2 pr-3 text-left">Hints</th>
                <th className="py-2 pr-3 text-left">Bonus</th>
                <th className="py-2 pr-3 text-right">Slots</th>
                <th className="py-2 pr-3 text-right">+Loss</th>
                <th className="py-2 pr-3 text-right">−Bonus</th>
                <th className="py-2 pr-3 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const slots = r.guesses + r.hints;
                const lossBump = r.outcome === "lost" ? LOSS_PENALTY : 0;
                const bonusCredit =
                  r.bonusAllowed && r.bonus === "correct"
                    ? BONUS_QUESTION_CREDIT
                    : 0;
                const subtotal = slots + lossBump - bonusCredit;
                return (
                  <tr key={r.slug} className="border-b border-line/60">
                    <td className="py-2 pr-3 font-medium">{r.label}</td>
                    <td className="py-2 pr-3 tabular-nums text-ink-faint">
                      {r.cap}
                    </td>
                    <td className="py-2 pr-3">
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
                    <td className="py-2 pr-3">
                      <input
                        type="number"
                        min={1}
                        max={r.cap}
                        value={r.guesses}
                        onChange={(e) => {
                          const next = [...rows];
                          next[i] = {
                            ...r,
                            guesses: Math.max(
                              1,
                              Math.min(r.cap, Number(e.target.value) || 1),
                            ),
                          };
                          setRows(next);
                        }}
                        className="w-16 border border-line bg-surface px-2 py-1 text-right tabular-nums"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      {r.hintsAllowed ? (
                        <input
                          type="number"
                          min={0}
                          max={2}
                          value={r.hints}
                          onChange={(e) => {
                            const next = [...rows];
                            next[i] = {
                              ...r,
                              hints: Math.max(
                                0,
                                Math.min(2, Number(e.target.value) || 0),
                              ),
                            };
                            setRows(next);
                          }}
                          className="w-14 border border-line bg-surface px-2 py-1 text-right tabular-nums"
                        />
                      ) : (
                        <span className="font-mono text-[11px] text-ink-faint">
                          —
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      {r.bonusAllowed ? (
                        <select
                          value={r.bonus}
                          onChange={(e) => {
                            const next = [...rows];
                            next[i] = {
                              ...r,
                              bonus: e.target.value as BonusState,
                            };
                            setRows(next);
                          }}
                          className="border border-line bg-surface px-2 py-1 font-mono text-[11px] uppercase tracking-[0.18em]"
                        >
                          <option value="correct">correct</option>
                          <option value="wrong">wrong</option>
                          <option value="unanswered">skip</option>
                        </select>
                      ) : (
                        <span className="font-mono text-[11px] text-ink-faint">
                          —
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">
                      {slots}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-wrong">
                      {lossBump > 0 ? `+${lossBump.toFixed(1)}` : "—"}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-correct">
                      {bonusCredit > 0 ? `−${bonusCredit.toFixed(1)}` : "—"}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-accent-soft">
                      {subtotal.toFixed(1)}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-line font-mono text-[10px] uppercase tracking-[0.18em] text-info">
                <td className="py-2 pr-3">Daily total</td>
                <td colSpan={8}></td>
                <td className="py-2 pr-3 text-right">
                  <span className="font-display text-lg font-bold tabular-nums text-accent">
                    {total.toFixed(1)}
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
            <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink-faint">
              Top{" "}
              <span className="tabular-nums text-accent-soft">{pct}%</span>{" "}
              of today&apos;s finishers
            </span>
          </div>
        </div>

        <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
          NB: Real prod distribution is fetched from /api/stats/today and only
          surfaces when ≥ 10 players have finished all five modes today.
          The 30-finisher distribution above is fabricated for preview.
          Hints only fire from Classic in-game — other modes always score
          with hints = 0.
        </p>
      </section>
    </main>
  );
}

function percentileLabel(t: Tier): string {
  switch (t) {
    case "top500":
      return `top ${TIER_PERCENTILE_MAX.top500}%`;
    case "grandmaster":
      return `top ${TIER_PERCENTILE_MAX.grandmaster}%`;
    case "diamond":
      return `top ${TIER_PERCENTILE_MAX.diamond}%`;
    case "platinum":
      return `top ${TIER_PERCENTILE_MAX.platinum}%`;
    case "gold":
      return `top ${TIER_PERCENTILE_MAX.gold}%`;
    case "silver":
      return `top ${TIER_PERCENTILE_MAX.silver}%`;
    case "bronze":
      return "bottom 10%";
  }
}
