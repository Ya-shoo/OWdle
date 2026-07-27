"use client";

// Per-mode "how everyone did today" panel. Sits at the bottom of a mode
// page, above ModeFooterNav and the site footer, vertically centered.
//
// This is the one thing on the page no other site can reproduce: OWdle's
// own play data for today's puzzle. Note it is CLIENT-fetched (from
// /api/stats/today), so it contributes nothing to the static HTML — its
// job is value to a human reading the page, not crawlable word count.
// The FAQ block above it does the crawler work.
//
// Hides completely when the sample is under lib/stats MIN_SAMPLE, so a
// freshly rolled day never shows a percentage built from three players.

import { modeDayStats, useDailyStats, type StatsMode } from "@/lib/stats";

const MODE_LABEL: Record<StatsMode, string> = {
  classic: "Classic",
  quote: "Quote",
  ability: "Ability",
  splash: "Spotlight",
  sound: "Sound",
  melee: "Melee",
};

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 px-5 text-center">
      <span className="font-display display-headline text-3xl leading-none text-ink sm:text-4xl">
        {value}
      </span>
      <span className="utility-label text-[10px] text-ink-faint">{label}</span>
    </div>
  );
}

export function ModeStatsPanel({ mode }: { mode: StatsMode }) {
  const stats = useDailyStats();
  const s = modeDayStats(stats, mode);
  if (!s) return null;

  return (
    <section className="mx-auto w-full max-w-3xl px-6 pb-4 pt-10">
      {/* bg-canvas + hairline matches ModeFooterNav's cards and the FAQ
          rows, so this reads as the same card language rather than a
          heavier slab. The numbers carry the emphasis on their own. */}
      <div className="flex flex-col items-center justify-center rounded-(--radius-card) border border-line bg-canvas px-5 py-5">
        <h2 className="utility-label text-[11px] text-info">
          Today&rsquo;s numbers for {MODE_LABEL[mode]}
        </h2>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-y-4 divide-y divide-line sm:divide-y-0 sm:divide-x">
          <Stat value={`${s.percent}%`} label="Solved it" />
          {s.avgGuessesWon !== null && (
            <Stat
              value={String(s.avgGuessesWon)}
              label="Average guesses to solve"
            />
          )}
        </div>
      </div>
    </section>
  );
}
