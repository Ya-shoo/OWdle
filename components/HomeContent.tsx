"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { dayString, prettyDay } from "@/lib/daily";
import { loadModeState } from "@/lib/storage";
import {
  BUILT_MODE_SLUGS,
  MODES,
  PLAYABLE_MODE_SLUGS,
  type ModeDef,
  type ModeSlug,
} from "@/lib/modes";
import { Brand } from "./Brand";
import { HomeBanner } from "./HomeBanner";
import { NextResetCountdown } from "./NextResetCountdown";
import { StreakBadge } from "./StreakBadge";
import { SupportLinks } from "./SupportLinks";
import { TryDeadlockleCard } from "./TryDeadlockleCard";
import { TryWuWadleCard } from "./TryWuWadleCard";
import { DailyTextShare } from "./DailyTextShare";
import { ShareButton } from "./ShareButton";
import { type DailyModeResult } from "./ShareCard";
import { dailyShareLinks } from "@/lib/shareLinks";
import { useShareLinkVisit } from "@/lib/useShareLinkVisit";
import { modeAttempts } from "@/lib/tier";
import { SiteGreeter } from "./SiteGreeter";
import { TryBonusRoundNudge } from "./TryBonusRoundNudge";
import { ArchiveCta } from "./ArchiveCta";

// Home grid split (design decision: canonical daily stays exactly 5).
//   • Daily grid — everything that isn't a bonus island: the 5 canonical
//     modes + featured Map (greyed "Soon" while built:false).
//   • Bonus section — tier:"bonus" only (Melee), its own labeled block so
//     it reads as outside the daily rather than a 6th daily mode.
const DAILY_MODES = MODES.filter((m) => m.tier !== "bonus");
const BONUS_MODES = MODES.filter((m) => m.tier === "bonus");

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
  // Inbound share-link attribution — daily /r/[code] links redirect
  // here with ?c= appended.
  useShareLinkVisit("home");
  const [day, setDay] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<StatusMap>({});

  useEffect(() => {
    const d = dayString();
    setDay(d);
    const map: StatusMap = {};
    // Load status for every playable mode (canonical + bonus Melee) so the
    // bonus card can show its own ✓/Missed/Resume state. The daily rollup
    // below (allDone, counts, share) still keys off BUILT_MODE_SLUGS only,
    // so bonus play never affects "X / 5 done" or the streak.
    for (const slug of PLAYABLE_MODE_SLUGS) {
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
      <SiteGreeter />
      <section className="relative isolate flex min-h-[min(72vh,720px)] items-start overflow-hidden">
        {/* Completed state swaps in the content-dense summary hero, which
            spans the banner's bright middle band — dim the art so it stays
            a backdrop instead of fighting the text. */}
        <HomeBanner dim={allDone} />
        {/* Hero copy anchors top-left of the max-w-6xl working area (which
            sits inside the ad-rail gutters), so the banner reads as a full
            backdrop with the content tucked into the corner. */}
        <div className="relative mx-auto w-full max-w-6xl px-6 pb-16 pt-24 sm:pb-24 sm:pt-48">
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
        <div className="mb-6 flex items-baseline justify-between">
          <h2 className="utility-label text-sm text-info">Modes</h2>
          <span className="utility-label text-sm text-ink-faint">
            {day
              ? `${completedCount} / ${BUILT_MODE_SLUGS.length} done`
              : `${BUILT_MODE_SLUGS.length} live`}
          </span>
        </div>

        {/* Daily grid — the 5 canonical modes + featured Map (greyed
            "Soon"). Standalone mode cards: rounded, separated by air, each
            lifting off the canvas with a lighter-navy fill + hairline
            border + a tight contained shadow — no seam grid delineating
            them. */}
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {DAILY_MODES.map((mode) => (
            <li key={mode.slug}>
              <ModeCard
                mode={mode}
                status={mode.built ? statuses[mode.slug] : undefined}
              />
            </li>
          ))}
        </ul>

        {/* Archive entry — replay past days of the daily modes. A proper
            button (not a mono afterthought) so the retention hook — replay a
            missed day, redeem a red day to green — reads as a real
            destination. Centered under the grid for visibility. */}
        <div className="mt-8 flex justify-center">
          <ArchiveCta />
        </div>

        {/* Bonus modes — playable, shareable islands OUTSIDE the daily
            set. Always visible for discovery; no streak/rank coupling and
            not counted in the "X / 5 done" tally above. Self-hides until a
            bonus mode is live. */}
        {BONUS_MODES.length > 0 && (
          <div className="mt-10">
            <div className="mb-6 flex items-baseline justify-between">
              <h2 className="utility-label text-sm text-info">Bonus modes</h2>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {BONUS_MODES.map((mode) => (
                <li key={mode.slug}>
                  <ModeCard
                    mode={mode}
                    status={mode.built ? statuses[mode.slug] : undefined}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Maker note pulled from the homepage for now (kept in
          components/MakerNote.tsx for easy re-add). The FAQ + its FAQPage
          JSON-LD moved to /whats-next alongside the roadmap vote, so the
          homepage runs straight from the modes into the support / network
          strip below. */}

      {/* Support panel — the tip jar, now centered on its own where the
          vote widget + tip jar two-column strip used to sit (the "which game
          next" vote moved to /whats-next). Inverted "paper" card: solid soft
          blue-white with no outline, the same light-card treatment as the
          sister-site cards below, so the one personal/human panel pops off
          the dark board. max-w-lg keeps it about the width its column had
          before, so centering reads as deliberate rather than a stretched
          half-panel. */}
      <section className="mx-auto max-w-6xl px-6 pb-12 pt-4">
        <div className="mx-auto max-w-lg rounded-(--radius-card) bg-[#e1e6f3] p-6 shadow-card sm:p-8">
          <SupportLinks />
        </div>
      </section>

      {/* Sister-site cards — two small branded cross-promo cards, centered
          side by side (stacking on mobile), a softer outbound suggestion
          once the primary asks have been made. Each card is themed to its
          destination's accent-on-dark, consistent across the network. Below
          them, a quiet centered "What's next?" link is the only remaining
          entry to the roadmap vote (now at /whats-next) — kept deliberately
          low-key so it doesn't re-introduce the "portfolio operator" read on
          the homepage. */}
      <section className="mx-auto max-w-3xl px-6 pb-12 pt-4">
        <div className="flex flex-wrap items-stretch justify-center gap-4">
          <TryDeadlockleCard />
          <TryWuWadleCard />
        </div>
        <div className="mt-6 flex justify-center">
          <Link
            href="/whats-next/"
            className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-ink-faint transition-colors hover:text-info"
          >
            What&rsquo;s next?
            <svg
              aria-hidden
              width="14"
              height="10"
              viewBox="0 0 14 10"
            >
              <path
                d="M0 5 L12 5 M8 1 L13 5 L8 9"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="square"
              />
            </svg>
          </Link>
        </div>
      </section>

      {/* Attribution footer is rendered site-wide by SiteFooter in the
          root layout. */}
    </main>
  );
}

function DefaultHero({ day }: { day: string | null }) {
  return (
    <div>
      {/* Date + countdown as two solid chips — never translucent text laid
          straight on the banner. A saturated blue "Daily · <date>" tag pairs
          with a dark card carrying the live "Next <countdown>" timer; both
          are fully opaque and shadow-lifted so they read as real tags on any
          banner frame, bright or dark. */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex -skew-x-12 items-center border border-info bg-info px-5 py-2 shadow-[0_2px_6px_-1px_rgba(0,0,0,0.45)]">
          <span
            suppressHydrationWarning
            className="skew-x-12 font-mono text-xs font-bold uppercase tracking-[0.16em] text-on-info"
          >
            Daily · {day ? prettyDay(day) : "Today"}
          </span>
        </span>
        <span className="inline-flex -skew-x-12 items-center border border-line bg-card px-5 py-2 shadow-[0_2px_6px_-1px_rgba(0,0,0,0.45)]">
          <NextResetCountdown
            label="Next "
            className="skew-x-12 font-mono text-xs font-bold uppercase tracking-[0.16em]"
          />
        </span>
      </div>
      <Brand as="h1" size="2xl" className="mt-6 leading-[0.95]" />
      <p
        className="mt-6 max-w-xl text-lg font-bold text-ink"
        style={{
          textShadow:
            "0 0 1px rgba(0,0,0,0.85), 0 0 2px rgba(0,0,0,0.55), 0 1px 2px rgba(0,0,0,0.5)",
        }}
      >
        The daily Overwatch guessing game
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
  // Personalized share links — bare /r/[code] for the button + the
  // matching OG image for the modal preview. Pending entries shouldn't
  // exist post-completion but the type allows them; filter defensively
  // (same as DailyTextShare does for its embedded link).
  const completedResults = results.filter((r) => r.outcome !== "pending") as {
    slug: ModeSlug;
    outcome: "won" | "lost";
    guesses: number;
  }[];
  const shareLinks =
    completedResults.length > 0
      ? dailyShareLinks({
          day,
          results: completedResults,
          hints: totalHints,
          skips: totalSkips,
        })
      : null;
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
              You finished today's set:{" "}
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
          <TryBonusRoundNudge />
        </div>
        {/* Copyable results text — LoLdle-style strings replace the
            image share here; the embedded /r/[code] link still unfurls
            the per-player card in chats that render previews. The
            link-first ShareButton rides in the block's action row —
            one share affordance, at the bottom. */}
        <div className="mt-4">
          <DailyTextShare
            day={day}
            results={results}
            totalHints={totalHints}
            totalSkips={totalSkips}
            share={
              shareLinks ? (
                <ShareButton
                  url={shareLinks.url}
                  ogImageUrl={shareLinks.ogImageUrl}
                  filename={`owdle-daily-${day}.png`}
                  surface="daily_complete"
                  dailyId={day}
                />
              ) : undefined
            }
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
      {/* Hexagonal frame — flat fill + sharp stroke */}
      <svg
        viewBox="0 0 220 252"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        {/* fill + sharp stroke */}
        <polygon
          points="110,4 215,63 215,189 110,248 5,189 5,63"
          fill="rgba(74,222,128,0.12)"
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
        <div className="mt-3 h-px w-10 bg-correct" />
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
      <div className="relative flex h-full flex-col rounded-(--radius-card) border border-line bg-muted p-6 shadow-card">
        <ModeCardInner label={mode.label} blurb={mode.blurb} dim>
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
      className="group relative flex h-full flex-col rounded-(--radius-card) border border-line bg-card p-6 shadow-card transition-[transform,box-shadow] duration-200 ease-[var(--ease-spring)] hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-card-hover focus-visible:-translate-y-0.5 focus-visible:scale-[1.02] focus-visible:shadow-card-hover"
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
  dim = false,
}: {
  label: string;
  blurb: string;
  children: React.ReactNode;
  // Recessed "Soon" cards quiet their text a step instead of fading the
  // whole card with opacity — keeps the fill a solid color.
  dim?: boolean;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3">
        <h3
          className={`font-soft text-2xl font-bold ${dim ? "text-ink-soft" : "text-ink"}`}
        >
          {label}
        </h3>
        {children}
      </div>
      <p
        className={`mt-3 text-sm leading-relaxed ${dim ? "text-ink-faint" : "text-ink-soft"}`}
      >
        {blurb}
      </p>
    </div>
  );
}
