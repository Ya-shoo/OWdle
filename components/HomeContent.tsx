"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { dayString, prettyDay } from "@/lib/daily";
import { loadModeState } from "@/lib/storage";
import {
  BUILT_MODE_SLUGS,
  MODES,
  type ModeDef,
  type ModeSlug,
} from "@/lib/modes";
import { Brand } from "./Brand";
import { HomeBanner } from "./HomeBanner";
import { NextResetCountdown } from "./NextResetCountdown";
import { RequestNextGame } from "./RequestNextGame";
import { StreakBadge } from "./StreakBadge";
import { SupportLinks } from "./SupportLinks";
import { TryDeadlockleCard } from "./TryDeadlockleCard";
import { ShareButton } from "./ShareButton";
import { DailyShareCard, type DailyModeResult } from "./ShareCard";
import { modeAttempts } from "@/lib/tier";
import { SITE_URL } from "@/lib/site";

type Status = {
  won: boolean;
  lost: boolean;
  gaveUp: boolean;
  guesses: number;
  // Classic-only: hints consumed this round. Other modes always 0.
  // Surfaces in the daily share image's tally line.
  hints: number;
  // Sound-only: skip-turn count (filtered from guesses[] via the
  // __skip__ sentinel). Other modes always 0.
  skips: number;
};
type StatusMap = Partial<Record<ModeSlug, Status>>;

export function HomeContent() {
  const [day, setDay] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<StatusMap>({});

  useEffect(() => {
    const d = dayString();
    setDay(d);
    const map: StatusMap = {};
    for (const slug of BUILT_MODE_SLUGS) {
      const st = loadModeState(slug, d);
      map[slug] = {
        won: st.won,
        lost: st.lost === true,
        gaveUp: st.gaveUp === true,
        // Slots spent, not just hero picks: counts Sound skips (already in
        // guesses[]) and Classic hints (separate hintsUsed[]) so the daily
        // rollup + share card match each round's "in N" and the tier total.
        guesses: modeAttempts(st),
        hints: st.hintsUsed?.length ?? 0,
        skips: st.guesses.filter((g) => g === "__skip__").length,
      };
    }
    setStatuses(map);
  }, []);

  // "Daily complete" now means every mode has been finished — won or
  // lost. The hero copy below shows a score band (Yw / Zl) so losses
  // are reflected honestly. Streak progression follows the same "all
  // finished" rule.
  const isFinished = (s: ModeSlug) => {
    const st = statuses[s];
    return st != null && (st.won || st.lost || st.gaveUp);
  };
  const allDone = day != null && BUILT_MODE_SLUGS.every(isFinished);
  const wonCount = BUILT_MODE_SLUGS.filter((s) => statuses[s]?.won).length;
  const lostCount = BUILT_MODE_SLUGS.filter(
    (s) => statuses[s]?.lost || statuses[s]?.gaveUp,
  ).length;
  const completedCount = wonCount + lostCount;
  const totalGuesses = BUILT_MODE_SLUGS.reduce(
    (sum, s) => sum + (statuses[s]?.guesses ?? 0),
    0,
  );

  return (
    <main className="flex-1">
      <section className="relative isolate flex min-h-[min(72vh,720px)] items-end overflow-hidden">
        <HomeBanner />
        <div className="relative mx-auto w-full max-w-6xl px-6 pb-14 pt-24 sm:pb-20 sm:pt-32">
          {allDone ? (
            <DailyCompleteHero
              day={day}
              count={BUILT_MODE_SLUGS.length}
              wonCount={wonCount}
              lostCount={lostCount}
              totalGuesses={totalGuesses}
              statuses={statuses}
            />
          ) : (
            <DefaultHero day={day} />
          )}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-12 pt-12 sm:pt-16">
        <div className="mb-6 flex items-baseline justify-between border-b border-line pb-3">
          <h2 className="utility-label text-sm text-info">Modes</h2>
          <span className="utility-label text-sm text-ink-faint">
            {day
              ? `${completedCount} / ${BUILT_MODE_SLUGS.length} done`
              : `${BUILT_MODE_SLUGS.length} live`}
          </span>
        </div>

        <ul className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-3">
          {MODES.map((mode) => (
            <li key={mode.slug} className="bg-canvas">
              <ModeCard
                mode={mode}
                status={mode.built ? statuses[mode.slug] : undefined}
              />
            </li>
          ))}
        </ul>
      </section>

      {/* Engagement strip: vote on next game + tip jar in one row.
          54/46 split — vote keeps a slight horizontal lead since it's the
          more interactive ask, but the column is trimmed so the leaderboard
          tiles read at a comfortable size. Single vertical hairline divider
          between the two columns. */}
      <section className="mx-auto max-w-6xl border-t border-line px-6 pt-7 pb-12 sm:pt-8">
        <div className="grid gap-y-14 md:grid-cols-[54fr_46fr] md:gap-y-0 md:divide-x md:divide-line">
          <div className="md:pr-10 lg:pr-14">
            <RequestNextGame />
          </div>
          <div className="md:pl-10 lg:pl-14">
            <SupportLinks />
          </div>
        </div>
      </section>

      {/* Sister-site card — sits beneath the engagement strip as a softer
          outbound suggestion once the primary asks have been made. */}
      <section className="mx-auto max-w-6xl px-6 pb-20 pt-4">
        <TryDeadlockleCard />
      </section>

      <footer className="border-t border-line bg-inset/40">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-8 font-mono text-xs text-ink-faint sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-3xl text-[10px] leading-relaxed">
            Sources:{" "}
            <a
              className="underline-offset-2 hover:underline"
              href="https://overfast-api.tekrop.fr/"
            >
              OverFast API
            </a>
            ,{" "}
            <a
              className="underline-offset-2 hover:underline"
              href="https://overwatch.fandom.com/"
            >
              Overwatch Fandom wiki
            </a>{" "}
            (CC-BY-SA), Blizzard press kit. Overwatch and all related
            assets are © and ™ Blizzard Entertainment, Inc. OWdle is an
            unofficial fan project, not endorsed by or affiliated with
            Blizzard, and claims no ownership of assets used.
          </div>
          <Link
            href="/how-to-play/"
            className="uppercase tracking-[0.22em] text-accent-soft transition-colors hover:text-accent"
          >
            How to play →
          </Link>
        </div>
      </footer>
    </main>
  );
}

function DefaultHero({ day }: { day: string | null }) {
  return (
    <div>
      {/* Date + countdown line sits directly on the panning Ken Burns
          banner, so the shadow handles bright frames (key art with
          orange/yellow highlights) without dimming on dark frames. */}
      <div
        style={{
          textShadow: "1px 1px 2px rgba(0,0,0,0.25)",
        }}
      >
        <p className="font-mono text-sm uppercase tracking-[0.22em] text-info">
          <span suppressHydrationWarning>
            {day ? prettyDay(day) : "Today"}
          </span>
        </p>
        <p className="mt-2 font-mono text-sm uppercase tracking-[0.22em] text-ink-faint">
          Daily · <NextResetCountdown />
        </p>
      </div>
      <Brand as="h1" size="2xl" className="mt-6 leading-[0.95]" />
      <p className="mt-6 max-w-xl text-lg text-ink-soft">
        A daily Overwatch hero quiz.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
        <BeginButton />
        <Link
          href="/how-to-play/"
          className="font-mono text-xs font-medium uppercase tracking-[0.22em] text-accent-soft transition-colors hover:text-accent"
          style={{ textShadow: "1px 1px 2px rgba(0,0,0,0.4)" }}
        >
          How to play →
        </Link>
      </div>
    </div>
  );
}

// Primary call-to-action that anchors first-time visitors to the start of
// the sequential progression. Always points at Classic — the modes grid
// below carries the per-mode entry points for returning users. Body is
// solid OW orange with dark ink so the eye snaps to it immediately even
// against the warm tones the banner pans through.
function BeginButton() {
  return (
    <Link
      href="/classic/"
      className="begin-cta group relative inline-flex"
      aria-label="Begin"
    >
      {/* button body — solid accent pill. Dark cast shadow underneath
          for tactility; the orange rim is kept tight so it hugs the
          edge rather than blooming outward. Hover scales the button up
          (no Y-lift) so the affordance is "growth toward you" rather
          than "lift off the page". Active dips below rest for a click
          press-down feel. */}
      <span
        className="relative inline-flex items-center gap-4 rounded-full bg-accent px-7 py-5 font-display text-lg font-bold uppercase tracking-[0.18em] text-on-accent shadow-[0_2px_6px_-1px_rgba(0,0,0,0.4),0_0_4px_-1px_var(--accent)] transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.04] group-hover:bg-accent-soft group-hover:shadow-[0_4px_12px_-2px_rgba(0,0,0,0.45),0_0_6px_-2px_var(--accent)] group-active:scale-[0.98] group-active:shadow-[0_1px_3px_-1px_rgba(0,0,0,0.35),0_0_2px_-1px_var(--accent)]"
      >
        {/* leading triangle — dark, matches label */}
        <svg
          aria-hidden
          width="10"
          height="12"
          viewBox="0 0 10 12"
          className="shrink-0 text-on-accent"
        >
          <polygon points="0,0 10,6 0,12" fill="currentColor" />
        </svg>

        <span>Begin</span>
      </span>
    </Link>
  );
}

function DailyCompleteHero({
  day,
  count,
  wonCount,
  lostCount,
  totalGuesses,
  statuses,
}: {
  day: string;
  count: number;
  wonCount: number;
  lostCount: number;
  totalGuesses: number;
  statuses: StatusMap;
}) {
  const sweep = wonCount === count;
  // Per-mode rollup for the shareable card. Same order as BUILT_MODE_SLUGS
  // so the row order on the image matches the modes grid below the hero.
  const results: DailyModeResult[] = BUILT_MODE_SLUGS.map((slug) => {
    const st = statuses[slug];
    const won = st?.won === true;
    const lost = st?.lost === true || st?.gaveUp === true;
    return {
      slug,
      outcome: won ? "won" : lost ? "lost" : "pending",
      guesses: st?.guesses ?? 0,
    };
  });
  const totalHints = BUILT_MODE_SLUGS.reduce(
    (sum, s) => sum + (statuses[s]?.hints ?? 0),
    0,
  );
  const totalSkips = BUILT_MODE_SLUGS.reduce(
    (sum, s) => sum + (statuses[s]?.skips ?? 0),
    0,
  );
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center gap-10 sm:flex-row sm:items-center sm:gap-14"
    >
      <CompleteBadge count={count} totalGuesses={totalGuesses} />
      <div className="flex-1 text-center sm:text-left">
        <p
          className="utility-label text-sm text-correct"
          style={{
            textShadow: "1px 1px 2px rgba(0,0,0,0.25)",
          }}
        >
          <span aria-hidden>✓</span> Daily complete · {prettyDay(day)}
          <span className="text-ink-faint"> · </span>
          <NextResetCountdown />
        </p>
        <Brand as="h1" size="2xl" className="mt-4 leading-[0.95]" />
        <p className="mt-6 max-w-md text-lg text-ink-soft">
          {sweep ? (
            <>
              You swept all <span className="text-ink">{count}</span> modes
              today in{" "}
              <span className="text-ink">{totalGuesses}</span> total guesses.
              New puzzles arrive at{" "}
              <span className="text-ink">2:15am Pacific</span>.
            </>
          ) : (
            <>
              You finished today's set —{" "}
              <span className="text-correct">{wonCount} won</span>,{" "}
              <span className="text-wrong">{lostCount} missed</span>,{" "}
              <span className="text-ink">{totalGuesses}</span> guesses total.
              New puzzles arrive at{" "}
              <span className="text-ink">2:15am Pacific</span>.
            </>
          )}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
          <StreakBadge variant="hero" />
          <ShareButton
            renderCard={() => (
              <DailyShareCard
                day={day}
                results={results}
                totalHints={totalHints}
                totalSkips={totalSkips}
              />
            )}
            url={SITE_URL}
            text={
              sweep
                ? `OWdle · Swept all ${count} modes in ${totalGuesses} guesses`
                : `OWdle · ${wonCount}/${count} in ${totalGuesses} guesses`
            }
            filename={`owdle-daily-${day}.png`}
            surface="daily_complete"
            dailyId={day}
            variant="soft"
            label="Share results"
          />
        </div>
      </div>
    </motion.div>
  );
}

function CompleteBadge({
  count,
  totalGuesses,
}: {
  count: number;
  totalGuesses: number;
}) {
  return (
    <motion.div
      initial={{ scale: 0.78, opacity: 0, rotate: -8 }}
      animate={{ scale: 1, opacity: 1, rotate: 0 }}
      transition={{
        duration: 0.7,
        delay: 0.1,
        ease: [0.34, 1.56, 0.64, 1],
      }}
      className="relative shrink-0"
      style={{ width: 220, height: 252 }}
    >
      {/* Outer ambient glow — sits behind the badge */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          inset: -32,
          background:
            "radial-gradient(ellipse at center, rgba(74,222,128,0.32), transparent 65%)",
          filter: "blur(14px)",
        }}
      />

      {/* Hexagonal frame with glow + sharp stroke */}
      <svg
        viewBox="0 0 220 252"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        <defs>
          <linearGradient id="badge-fill" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(74,222,128,0.22)" />
            <stop offset="100%" stopColor="rgba(74,222,128,0.04)" />
          </linearGradient>
          <filter id="badge-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3.5" />
          </filter>
        </defs>
        {/* glow halo around the edge */}
        <polygon
          points="110,4 215,63 215,189 110,248 5,189 5,63"
          fill="none"
          stroke="rgba(74,222,128,0.65)"
          strokeWidth="3"
          filter="url(#badge-glow)"
        />
        {/* fill + sharp stroke */}
        <polygon
          points="110,4 215,63 215,189 110,248 5,189 5,63"
          fill="url(#badge-fill)"
          stroke="var(--tile-correct)"
          strokeWidth="1.75"
        />
        {/* inner hairline to suggest a double-rim */}
        <polygon
          points="110,16 203,68 203,184 110,236 17,184 17,68"
          fill="none"
          stroke="rgba(74,222,128,0.35)"
          strokeWidth="0.9"
        />
      </svg>

      {/* Content layer */}
      <div className="relative flex h-full flex-col items-center justify-center px-6 text-center">
        <motion.div
          initial={{ scale: 0, rotate: -120 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{
            duration: 0.55,
            delay: 0.5,
            ease: [0.34, 1.56, 0.64, 1],
          }}
          aria-hidden
        >
          <svg width="56" height="56" viewBox="0 0 56 56" className="text-correct">
            <path
              d="M10 28 L24 42 L46 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="5"
              strokeLinecap="square"
              strokeLinejoin="miter"
            />
          </svg>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.7 }}
          className="mt-4 font-display display-headline text-[11px] text-ink"
        >
          Daily complete
        </motion.div>
        <div className="mt-3 h-px w-10 bg-correct/45" />
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.78 }}
          className="mt-3 font-soft text-5xl font-extrabold leading-none text-correct"
        >
          {count}
          <span className="text-ink-soft">/</span>
          {count}
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.86 }}
          className="mt-2 utility-label text-xs text-info"
        >
          {totalGuesses} guesses
        </motion.div>
      </div>
    </motion.div>
  );
}

function ModeCard({
  mode,
  status,
}: {
  mode: ModeDef;
  status: Status | undefined;
}) {
  if (!mode.built) {
    return (
      <div className="block h-full p-6 opacity-50">
        <ModeCardInner label={mode.label} blurb={mode.blurb}>
          <span className="utility-label text-xs text-info">Soon</span>
        </ModeCardInner>
      </div>
    );
  }

  let tag: React.ReactNode;
  if (status?.won) {
    tag = (
      <span className="utility-label text-xs text-correct">
        <span aria-hidden>✓</span> in {status.guesses}
      </span>
    );
  } else if (status?.lost) {
    // Cap-hit loss — answer was revealed, no recovery.
    tag = (
      <span className="utility-label text-xs text-wrong">
        <span aria-hidden>✕</span> Missed
      </span>
    );
  } else if (status?.gaveUp) {
    // Legacy Sound mode "Show answer" path. Same finished vibe as lost
    // for routing; kept distinct in copy so old saves still render
    // sensibly.
    tag = (
      <span className="utility-label text-xs text-ink-faint">
        Revealed
      </span>
    );
  } else if (status && status.guesses > 0) {
    tag = (
      <span className="utility-label text-xs text-info">
        {status.guesses} {status.guesses === 1 ? "guess" : "guesses"} · Resume →
      </span>
    );
  } else {
    tag = (
      <span className="utility-label text-xs text-accent">Play →</span>
    );
  }

  return (
    <Link
      href={`/${mode.slug}/`}
      className="group block h-full p-6 transition-colors hover:bg-muted focus-visible:bg-muted"
    >
      <ModeCardInner label={mode.label} blurb={mode.blurb}>
        {tag}
      </ModeCardInner>
    </Link>
  );
}

function ModeCardInner({
  label,
  blurb,
  children,
}: {
  label: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-soft text-2xl font-bold text-ink">{label}</h3>
        {children}
      </div>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">{blurb}</p>
    </div>
  );
}
