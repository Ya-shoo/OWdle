"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MODES, type ModeDef } from "@/lib/modes";
import { dayString } from "@/lib/daily";
import { archiveFillStatus, archiveWindow } from "@/lib/archive";

// The archive front door. One card per canonical daily mode: Classic is live
// (links to its week grid, with a solved-count teaser); the other four are
// greyed "Soon" teasers — the same treatment the home page gives an unbuilt
// mode. Bonus/featured modes (Melee, Map) are deliberately absent: the
// archive mirrors the canonical daily only.

// Only the canonical five have (or will have) an archive.
const CANONICAL: ModeDef[] = MODES.filter(
  (m) => m.tier === "canonical" && m.built,
);

const ARCHIVE_BLURBS: Record<string, string> = {
  classic: "Replay the past week of attribute puzzles.",
  sound: "Past ability-sound clips, on demand.",
  quote: "Re-guess past hero conversations.",
  splash: "Past skin-art spotlights to replay.",
  ability: "Past ability-icon reveals to retry.",
};

// Solved-this-week tally for Classic, computed client-side (localStorage).
// Mounted-gated so the static-export prerender doesn't fight hydration. The
// denominator is the ACTUAL window length (clamped near the bag cutover),
// matching the grid rather than assuming a fixed 7.
function useClassicWeek(): { won: number; total: number } | null {
  const [week, setWeek] = useState<{ won: number; total: number } | null>(
    null,
  );
  useEffect(() => {
    const win = archiveWindow(dayString());
    const won = win.filter(
      (d) => archiveFillStatus("classic", d).outcome === "won",
    ).length;
    setWeek({ won, total: win.length });
  }, []);
  return week;
}

export function ArchiveHub() {
  const classicWeek = useClassicWeek();

  return (
    <div>
      <header className="mb-10">
        <h1 className="font-display display-headline text-5xl text-ink sm:text-6xl">
          Archive
        </h1>
        <p className="mt-4 max-w-lg text-ink-soft">
          Replay past daily puzzles. Catch up on a day you missed, or turn a
          loss into a win. Archive play is just for you; it never touches your
          streak.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {CANONICAL.map((mode) =>
          mode.slug === "classic" ? (
            <ActiveCard
              key={mode.slug}
              label={mode.label}
              blurb={ARCHIVE_BLURBS[mode.slug] ?? mode.blurb}
              href="/archive/classic/"
              week={classicWeek}
            />
          ) : (
            <SoonCard
              key={mode.slug}
              label={mode.label}
              blurb={ARCHIVE_BLURBS[mode.slug] ?? mode.blurb}
            />
          ),
        )}
      </div>
    </div>
  );
}

function ActiveCard({
  label,
  blurb,
  href,
  week,
}: {
  label: string;
  blurb: string;
  href: string;
  week: { won: number; total: number } | null;
}) {
  return (
    <Link
      href={href}
      className="group relative flex h-full flex-col rounded-(--radius-card) border border-line bg-card p-6 shadow-card transition-[transform,box-shadow,border-color] duration-200 ease-[var(--ease-spring)] hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-card-hover focus-visible:-translate-y-0.5 focus-visible:border-accent/40 focus-visible:shadow-card-hover"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-soft text-2xl font-bold text-ink">{label}</h2>
        {week && week.won > 0 ? (
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-correct">
            {week.won}/{week.total} this week
          </span>
        ) : (
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
            Open →
          </span>
        )}
      </div>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">{blurb}</p>
      <span className="mt-6 inline-flex items-center font-mono text-[11px] uppercase tracking-[0.2em] text-accent-soft transition-colors group-hover:text-accent">
        Replay past week →
      </span>
    </Link>
  );
}

function SoonCard({ label, blurb }: { label: string; blurb: string }) {
  return (
    <div className="relative flex h-full flex-col rounded-(--radius-card) border border-line bg-muted p-6 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-soft text-2xl font-bold text-ink-soft">{label}</h2>
        <span className="font-mono text-xs uppercase tracking-[0.18em] text-info">
          Soon
        </span>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-ink-faint">{blurb}</p>
    </div>
  );
}
