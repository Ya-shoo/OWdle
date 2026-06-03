"use client";

// Dev-only preview for the streak-rank badge/modal/share-card. The real
// badge is driven by current streak + /api/stats/streaks cutoffs, neither
// of which is meaningful under `next dev` (the Pages Function doesn't run
// locally, and a dev browser rarely has a high streak). This page forces a
// tier + streak so the visuals can be verified without that plumbing.
//
// Prod 404 is handled by app/labeler/layout.tsx, same as the other tools.

import { useEffect, useState } from "react";
import {
  STREAK_TIERS,
  STREAK_TIER_FLOOR,
  STREAK_TIER_LABEL,
  STREAK_TIER_PERCENTILE_MAX,
  type StreakTier,
} from "@/lib/streakRank";
import { StreakRankPill } from "@/components/StreakRankBadge";
import { StreakRankModal } from "@/components/StreakRankModal";
import { StreakRankShareCard } from "@/components/StreakRankShareCard";

const PREVIEW_SCALE = 0.42;

export default function StreakRankPreviewPage() {
  const [tier, setTier] = useState<StreakTier>("top500");
  const [streak, setStreak] = useState(12);
  const [modalOpen, setModalOpen] = useState(false);

  // URL params let a one-shot screenshot land directly on a given tier /
  // streak, optionally with the modal already open
  // (?tier=champion&streak=30&open=1). Applied post-mount so SSR + client
  // first render agree (no hydration mismatch).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const t = p.get("tier");
    if (t && (STREAK_TIERS as readonly string[]).includes(t)) {
      setTier(t as StreakTier);
    }
    const s = Number(p.get("streak"));
    if (Number.isFinite(s) && s > 0) setStreak(s);
    if (p.get("open") === "1") setModalOpen(true);
  }, []);

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="font-display text-3xl font-bold tracking-tight">
        Streak Rank Preview
      </h1>
      <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">
        Dev-only · forced tier + streak · no /api/stats/streaks dependency
      </p>

      <section className="mt-8">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.22em] text-info">
          Streak tier ladder
        </h2>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
          Click any badge to pop its promotion modal at the streak below.
        </p>
        <ul className="mt-3 grid grid-cols-3 gap-3">
          {STREAK_TIERS.map((t) => (
            <li key={t}>
              <button
                type="button"
                onClick={() => {
                  setTier(t);
                  setModalOpen(true);
                }}
                title={`Preview the ${STREAK_TIER_LABEL[t]} promotion modal`}
                className="flex w-full flex-col items-center gap-1.5 border border-line bg-surface/40 p-3 text-center transition-colors hover:border-accent hover:bg-surface/70"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/ranks/${t}.png`}
                  alt=""
                  width={64}
                  height={64}
                  className="h-16 w-16 object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.45)]"
                />
                <span className="font-display text-base font-bold uppercase tracking-wide text-accent">
                  {STREAK_TIER_LABEL[t]}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
                  top {STREAK_TIER_PERCENTILE_MAX[t]}% · floor{" "}
                  {STREAK_TIER_FLOOR[t]}d
                </span>
                <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.18em] text-info/80">
                  Click to preview
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10 flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
          Tier
          <select
            value={tier}
            onChange={(e) => setTier(e.target.value as StreakTier)}
            className="border border-line bg-surface px-2 py-1 font-mono text-[12px] uppercase tracking-[0.14em] text-ink"
          >
            {STREAK_TIERS.map((t) => (
              <option key={t} value={t}>
                {STREAK_TIER_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
          Streak (days)
          <input
            type="number"
            min={1}
            value={streak}
            onChange={(e) =>
              setStreak(Math.max(1, Number(e.target.value) || 1))
            }
            className="w-24 border border-line bg-surface px-2 py-1 text-right tabular-nums text-ink"
          />
        </label>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="rounded-full bg-info/15 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-info ring-1 ring-info/40 transition-colors hover:bg-info/25"
        >
          Open promotion modal
        </button>
      </section>

      <section className="mt-10">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.22em] text-info">
          Header pill (desktop)
        </h2>
        <div className="mt-3 inline-flex border border-line bg-canvas/80 p-3">
          {/* Force-visible: the real pill is hidden below the sm breakpoint. */}
          <div className="[&>button]:!inline-flex">
            <StreakRankPill
              tier={tier}
              streak={streak}
              onClick={() => setModalOpen(true)}
            />
          </div>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.22em] text-info">
          Share card · 1080×1080
        </h2>
        <div
          className="mt-3 overflow-hidden border border-line"
          style={{ width: 1080 * PREVIEW_SCALE, height: 1080 * PREVIEW_SCALE }}
        >
          <div
            style={{
              transform: `scale(${PREVIEW_SCALE})`,
              transformOrigin: "top left",
            }}
          >
            <StreakRankShareCard tier={tier} streak={streak} />
          </div>
        </div>
      </section>

      {modalOpen && (
        <StreakRankModal
          tier={tier}
          streak={streak}
          onClose={() => setModalOpen(false)}
        />
      )}
    </main>
  );
}
