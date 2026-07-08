"use client";

import Link from "next/link";
import { ReactNode } from "react";
import { motion } from "motion/react";
import { type ModeSlug, BUILT_MODE_SLUGS } from "@/lib/modes";
import { loadModeState } from "@/lib/storage";
import { prettyDay } from "@/lib/daily";
import { DailyStatsBand } from "./DailyStatsBand";
import { DailyTierBadge } from "./DailyTierBadge";
import { StreakBadge } from "./StreakBadge";
import { NextResetCountdown } from "./NextResetCountdown";
import { DailyTextShare } from "./DailyTextShare";
import { ShareButton } from "./ShareButton";
import { type DailyModeResult } from "./ShareCard";
import { dailyShareLinks } from "@/lib/shareLinks";
import { TryBonusRoundNudge } from "./TryBonusRoundNudge";

// Shown in place of the per-mode result card when the player finishes
// their LAST mode of the day. Aggregates outcomes across every built
// mode, surfaces the streak / tier / countdown the way the home-page
// hero does, and routes the Share affordance through the /r/[code]
// link-unfurl share button. TryDeadlockleCard renders
// as a sibling outside this card — that's a deliberate decision so the
// cross-promo doesn't read as nested inside the player's result.

const MODE_LABEL: Record<ModeSlug, string> = {
  classic: "Classic",
  quote: "Quote",
  splash: "Spotlight",
  sound: "Sound",
  ability: "Ability",
  melee: "Melee",
  map: "Map",
};

type Props = {
  // Mode the player just finished — drives the breakdown highlight row
  // and overrides loadModeState's read for that slug (so the card
  // reflects this render even if the persist hasn't been observed).
  mode: ModeSlug;
  // The mode's just-set guess count + outcome.
  guesses: number;
  outcome: "won" | "lost";
  // Pacific day key for share filename + countdown context.
  day: string;
  // Caller-supplied confirmation block for the mode they just finished
  // (portrait + name etc.). Each game owns its own shape — Quote shows
  // two portraits, Ability adds the ability name, Splash adds the skin
  // tag. Keeps this card agnostic of per-mode reveal vocabulary.
  summary: ReactNode;
};

export function DailyCompleteResultCard({
  mode,
  guesses,
  outcome,
  day,
  summary,
}: Props) {
  // Aggregate every built mode's outcome for the breakdown grid + the
  // shareable DailyShareCard. The current mode is overlaid from props
  // so the row reflects what the player sees right now, even before
  // localStorage has been re-read by other consumers.
  // Pull each mode's persisted state once so we can compute results AND
  // totalHints/totalSkips from the same source. Skips are Sound-only
  // (the __skip__ marker pushed into guesses[]); hints are Classic-only
  // (hintsUsed[] in storage). Other modes contribute 0 to both.
  const allStates = BUILT_MODE_SLUGS.map((slug) => ({
    slug,
    st: loadModeState(slug, day),
  }));
  const results: DailyModeResult[] = allStates.map(({ slug, st }) => {
    if (slug === mode) {
      return { slug, outcome, guesses };
    }
    const won = st.won === true;
    const lost = st.lost === true || st.gaveUp === true;
    return {
      slug,
      outcome: won ? "won" : lost ? "lost" : "pending",
      guesses: st.guesses.length,
    };
  });

  const wonCount = results.filter((r) => r.outcome === "won").length;
  const lostCount = results.filter((r) => r.outcome === "lost").length;
  const totalGuesses = results.reduce((s, r) => s + r.guesses, 0);
  const totalHints = allStates.reduce(
    (sum, { st }) => sum + (st.hintsUsed?.length ?? 0),
    0,
  );
  const totalSkips = allStates.reduce(
    (sum, { st }) => sum + st.guesses.filter((g) => g === "__skip__").length,
    0,
  );
  // Tone: green if the player won at least one mode (completed = win
  // worth celebrating), red only on the rare all-miss day so the card
  // chrome still reflects the day's character.
  const tone: "won" | "lost" = wonCount > 0 ? "won" : "lost";

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
    <>
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={
        "result-card mx-auto w-full max-w-lg rounded-(--radius-card) border p-5 sm:p-6 " +
        (tone === "won"
          ? "border-correct/40 bg-correct/10"
          : "border-wrong/35 bg-wrong/10")
      }
    >
      <div className="flex flex-col gap-5">
        {/* Eyebrow row — daily-complete badge + date. */}
        <div
          className={
            "flex items-baseline justify-between gap-3 border-b pb-3 " +
            (tone === "won" ? "border-correct/25" : "border-wrong/25")
          }
        >
          <span
            className={
              "font-mono text-[10px] uppercase tracking-[0.22em] " +
              (tone === "won" ? "text-correct" : "text-wrong")
            }
          >
            <span aria-hidden>✓</span> Daily Complete
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">
            {prettyDay(day)}
          </span>
        </div>

        {/* Mode-specific summary — caller-supplied so each game can
            render its own confirmation shape (portrait, names, etc.). */}
        {summary}

        {/* Headline stat band — total guesses + streak share one
            horizontal row inside a single divider band. Saves the ~80px
            the streak's own band variant used to claim below. */}
        <div className="grid grid-cols-2 items-center gap-3 border-y border-line/60 py-3">
          <div className="flex flex-col items-center gap-1 text-center">
            <span className="font-display text-3xl font-extrabold tabular-nums leading-none text-accent-soft sm:text-4xl">
              {totalGuesses}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink-faint">
              Total guesses
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.18em]">
              <span className="text-correct">{wonCount}w</span>
              {lostCount > 0 && (
                <>
                  <span className="text-ink-faint"> · </span>
                  <span className="text-wrong">{lostCount}l</span>
                </>
              )}
              <span className="text-ink-faint"> · </span>
              <span className="text-ink-soft">{results.length} modes</span>
            </span>
          </div>
          <StreakBadge variant="inline" />
        </div>

        {/* Per-mode breakdown — 2-up on phones, 3-up on tablet+ so the
            five modes pack into 2-3 rows instead of consuming five. The
            mode the player just finished gets a subtle info ring so it
            stays visually anchored even at chip density. */}
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {results.map((r) => (
            <ModeChip key={r.slug} result={r} highlight={r.slug === mode} />
          ))}
        </div>

        {/* Ambient daily band — global percentile + tier badge. Each
            hides itself when sample size is too small or value is zero,
            so the layout stays tight on the first week. */}
        <DailyStatsBand />
        <DailyTierBadge />

        {/* Countdown — centered and the largest typographic moment in
            the card after the headline stat, since "when's the next
            one?" is the player's most natural next thought once they're
            done with today. */}
        <div className="flex flex-col items-center gap-1 border-t border-line/60 pt-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-info">
            Next puzzle in
          </span>
          <NextResetCountdown
            label=""
            className="font-display text-3xl font-bold tabular-nums leading-none text-accent-soft sm:text-4xl"
          />
        </div>
      </div>
    </motion.div>

    {/* Bonus-round push — the daily set is done, so the most prominent
        next action is a bonus island. Sits directly under the completion
        card, ahead of the text-share + share button, so it reads as "what
        to do next" rather than a footnote. Self-hides when no bonus mode
        is live. */}
    <div className="mx-auto mt-4 flex w-full max-w-lg justify-center">
      <TryBonusRoundNudge variant="banner" />
    </div>

    {/* Copyable results text — LoLdle-style strings replace the image
        share on this surface (zero-friction paste into Discord /
        iMessage); the embedded /r/[code] link still unfurls the
        per-player card image where chats render previews. The
        link-first ShareButton rides in the block's action row — ONE
        share affordance per surface (mirrors Deadlockle's layout). */}
    <div className="mx-auto mt-4 w-full max-w-lg">
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

    {/* Action row sits OUTSIDE the result card — navigation belongs
        below the card chrome. Same max-w as the card so it lines up. */}
    <div className="mx-auto mt-4 flex w-full max-w-lg flex-wrap items-center justify-between gap-3 px-1">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-info underline-offset-4 hover:underline"
      >
        ← Home
      </Link>
    </div>
  </>
  );
}

function ModeChip({
  result,
  highlight,
}: {
  result: DailyModeResult;
  highlight: boolean;
}) {
  const won = result.outcome === "won";
  const lost = result.outcome === "lost";
  return (
    <div
      className={
        "flex items-center justify-between gap-1.5 rounded-(--radius-card) border px-2.5 py-1.5 " +
        (won
          ? "border-correct/30 bg-correct/5"
          : lost
            ? "border-wrong/30 bg-wrong/5"
            : "border-line bg-inset/40") +
        (highlight ? " ring-1 ring-info/45" : "")
      }
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span
          aria-hidden
          className={
            "font-display text-sm leading-none " +
            (won ? "text-correct" : lost ? "text-wrong" : "text-ink-faint")
          }
        >
          {won ? "✓" : lost ? "✕" : "—"}
        </span>
        <span className="truncate font-display text-sm text-ink">
          {MODE_LABEL[result.slug]}
        </span>
      </div>
      <span
        className={
          "shrink-0 font-mono text-[10px] tabular-nums uppercase tracking-[0.14em] " +
          (won ? "text-correct" : lost ? "text-wrong" : "text-ink-faint")
        }
      >
        {result.outcome === "pending" ? "—" : result.guesses}
      </span>
    </div>
  );
}
