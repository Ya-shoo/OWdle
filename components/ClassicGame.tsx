"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { type Hero } from "@/lib/heroes";
import { dayString, getHeroForDay, prettyDay } from "@/lib/daily";
import { isDailyComplete } from "@/lib/storage";
import {
  trackGuessSubmitted,
  trackHintUsed,
  trackModeCompleted,
  trackModeStarted,
} from "@/lib/tracking";
import { Brand } from "./Brand";
import { NextModeCTA } from "./NextModeCTA";
import { LossReveal } from "./LossReveal";
import { ModeStatsLine } from "./ModeStatsLine";
import { DevViewToggle, useDevViewState } from "./DevViewToggle";
import { DevHeroPicker } from "./DevHeroPicker";
import { ShareButton } from "./ShareButton";
import { TextShareBlock } from "./TextShareBlock";
import { buildClassicShareText } from "@/lib/share";
import { roundShareLinks } from "@/lib/shareLinks";
import { useShareLinkVisit } from "@/lib/useShareLinkVisit";
import { DailyCompleteResultCard } from "./DailyCompleteResultCard";
import { TryDeadlockleCard } from "./TryDeadlockleCard";
import { BUILT_MODE_SLUGS } from "@/lib/modes";
import { ClassicBoard, MAX_GUESSES, useClassicRound } from "./ClassicBoard";
import { ArchiveCta } from "./ArchiveCta";

const IS_DEV = process.env.NODE_ENV !== "production";

export function ClassicGame() {
  // Inbound share-link attribution (?c= from /r/[code] redirects).
  useShareLinkVisit("classic");
  const [day, setDay] = useState<string | null>(null);
  // Dev-only view toggle + override hero. When override is set we serve
  // that hero instead of the daily seed; the round runs in throwaway
  // (non-persisting) mode so test playthroughs don't touch real progress.
  const [devView, setDevView] = useDevViewState("classic");
  const [overrideHero, setOverrideHero] = useState<Hero | null>(null);
  const isOverride = overrideHero !== null;

  useEffect(() => {
    setDay(dayString());
  }, []);

  const answer = overrideHero ?? (day ? getHeroForDay(day) : null);

  const round = useClassicRound({
    day,
    answer,
    storageMode: "classic",
    // Dev override plays a throwaway round — no writes to the real daily key.
    persist: !isOverride,
    onGuessSubmitted: isOverride
      ? undefined
      : ({ guessNumber, isCorrect, hero }) => {
          if (!day || !answer) return;
          trackGuessSubmitted({
            mode: "classic",
            dailyId: day,
            guessNumber,
            isCorrect,
            guessId: hero.key,
            answerId: answer.key,
          });
        },
    onHintUsed: isOverride
      ? undefined
      : ({ hintIndex, atGuessNumber, attr }) => {
          if (!day) return;
          trackHintUsed({
            mode: "classic",
            dailyId: day,
            hintIndex,
            atGuessNumber,
            attributeRevealed: attr,
          });
        },
  });

  const won = round?.state.won === true;
  const lost = round?.state.lost === true;

  // mode_started — once per day, skip dev overrides so test runs don't
  // pollute prod analytics. The tracker itself dedupes via localStorage.
  useEffect(() => {
    if (!day || isOverride) return;
    const ans = getHeroForDay(day);
    if (!ans) return;
    trackModeStarted({ mode: "classic", dailyId: day, answerId: ans.key });
  }, [day, isOverride]);

  // mode_completed — fires once when the round transitions to won or lost.
  // Tracker dedupes; effect watches the two terminal flags only.
  useEffect(() => {
    if (!day || isOverride) return;
    if (!won && !lost) return;
    const ans = getHeroForDay(day);
    if (!ans) return;
    const guessesLen = round?.state.guesses.length ?? 0;
    const hintsLen = round?.state.hintsUsed?.length ?? 0;
    trackModeCompleted({
      mode: "classic",
      dailyId: day,
      outcome: won ? "won" : "lost",
      totalGuesses: guessesLen,
      cap: MAX_GUESSES,
      hintsUsed: hintsLen,
      bonusCorrect: round?.state.bonus?.correct ?? null,
      answerId: ans.key,
    });
  }, [
    day,
    isOverride,
    won,
    lost,
    round?.state.guesses.length,
    round?.state.hintsUsed?.length,
  ]);

  if (!round) {
    return (
      <main className="mx-auto w-full max-w-4xl px-6 py-16">
        <div className="font-mono text-xs uppercase tracking-[0.2em] text-ink-faint">
          Loading…
        </div>
      </main>
    );
  }

  const { answer: hero, state, effectiveUsed, hintsUsed } = round;

  // Daily-only reveal chrome, injected into the shared board between the
  // input row and the guess history. On the final mode of the day the
  // per-mode result card is replaced by ClassicDailyComplete (score recap +
  // streak + back-to-home). Everything here — NextModeCTA, share, stats,
  // TryDeadlockle — is deliberately absent from the archive variant.
  const dailyComplete = isDailyComplete({
    day: round.day,
    currentMode: "classic",
    currentDone: true,
    builtSlugs: BUILT_MODE_SLUGS,
  });

  const reveal = (
    <>
      <AnimatePresence>
        {state.won &&
          (dailyComplete ? (
            <ClassicDailyComplete
              key="win-daily"
              answer={hero}
              guesses={effectiveUsed}
              hintsUsed={hintsUsed.length}
              outcome="won"
              day={round.day}
            />
          ) : (
            <motion.div
              key="win"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="result-card mx-auto mb-8 w-full max-w-md rounded-(--radius-card) border border-correct/40 bg-correct/10 p-4 sm:p-5"
            >
              <div className="flex flex-col gap-5">
                <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-center sm:text-left">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={hero.portrait}
                    alt=""
                    className="h-16 w-16 rounded-(--radius-card) bg-muted object-cover sm:h-20 sm:w-20"
                  />
                  <div className="flex-1">
                    <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-info">
                      Solved
                    </div>
                    <div className="mt-1 font-display text-3xl text-ink">
                      {hero.name}{" "}
                      <span className="text-ink-soft">in {effectiveUsed}</span>
                    </div>
                    {hintsUsed.length > 0 && (
                      <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
                        💡 used {hintsUsed.length}{" "}
                        {hintsUsed.length === 1 ? "hint" : "hints"}
                      </div>
                    )}
                    <ModeStatsLine mode="classic" />
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <NextModeCTA current="classic" />
                </div>
                {/* Emoji-grid text share — the guess path as 🟩🟨🟥 rows
                    (latest first, capped), LoLdle-style. The link-first
                    ShareButton rides in the block's action row — ONE share
                    affordance per card, at the bottom. */}
                <TextShareBlock
                  text={buildClassicShareText({
                    guesses: state.guesses,
                    answer: hero,
                    won: true,
                    hints: hintsUsed.length,
                    url: roundShareLinks({
                      day: round.day,
                      slug: "classic",
                      outcome: "won",
                      guesses: state.guesses.length,
                      hints: hintsUsed.length,
                    }).url,
                  })}
                  surface="round_result"
                  mode="classic"
                  dailyId={round.day}
                  share={
                    <ShareButton
                      {...roundShareLinks({
                        day: round.day,
                        slug: "classic",
                        outcome: "won",
                        guesses: state.guesses.length,
                        hints: hintsUsed.length,
                      })}
                      filename={`owdle-classic-${round.day}.png`}
                      surface="round_result"
                      mode="classic"
                      dailyId={round.day}
                    />
                  }
                />
              </div>
            </motion.div>
          ))}
      </AnimatePresence>

      <AnimatePresence>
        {state.lost &&
          !state.won &&
          (dailyComplete ? (
            <ClassicDailyComplete
              key="loss-daily"
              answer={hero}
              guesses={state.guesses.length}
              hintsUsed={hintsUsed.length}
              outcome="lost"
              day={round.day}
            />
          ) : (
            <LossReveal
              current="classic"
              share={
                <ShareButton
                  {...roundShareLinks({
                    day: round.day,
                    slug: "classic",
                    outcome: "lost",
                    guesses: state.guesses.length,
                    hints: hintsUsed.length,
                  })}
                  filename={`owdle-classic-${round.day}.png`}
                  surface="round_result"
                  mode="classic"
                  dailyId={round.day}
                />
              }
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={hero.portrait}
                  alt=""
                  className="h-16 w-16 rounded-(--radius-card) bg-muted object-cover sm:h-20 sm:w-20"
                />
                <div className="flex-1">
                  <div className="font-display text-3xl text-ink">
                    {hero.name}
                  </div>
                  <div className="mt-1 font-mono text-xs uppercase tracking-[0.18em] text-ink-faint">
                    {state.guesses.length} guesses
                    {hintsUsed.length > 0 &&
                      ` · ${hintsUsed.length} hint${hintsUsed.length === 1 ? "" : "s"}`}
                  </div>
                  <ModeStatsLine mode="classic" />
                </div>
              </div>
            </LossReveal>
          ))}
      </AnimatePresence>
    </>
  );

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 lg:py-16">
      <header className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-info">
            <span suppressHydrationWarning>{prettyDay(round.day)}</span>
          </p>
          <h1 className="mt-3 font-display display-headline text-5xl text-ink sm:text-6xl">
            Classic
          </h1>
          <p className="mt-3 max-w-md text-ink-soft">
            Type a hero. Match the eight attributes. New puzzle daily.
          </p>
        </div>
        <div className="flex flex-col items-start gap-3 sm:items-end">
          <div className="hidden flex-col items-end font-mono text-xs uppercase tracking-[0.2em] text-ink-faint sm:flex">
            <Brand size="sm" />
            <span className="mt-1 text-info">classic mode</span>
          </div>
          {/* Entry to the past-week replay. Quiet mono utility while a round
              is in progress; once it's won or lost it upgrades to a prominent
              button — finishing today's puzzle is the natural moment to send a
              player to replay or redeem past days. */}
          {won || lost ? (
            <ArchiveCta />
          ) : (
            <Link
              href="/archive/"
              className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-ink-faint transition-colors hover:text-accent"
            >
              <span aria-hidden>↺</span> Archive
            </Link>
          )}
        </div>
      </header>

      {IS_DEV && (
        <div className="mb-4 flex justify-center">
          <DevViewToggle mode="classic" active={devView} onChange={setDevView} />
        </div>
      )}
      {IS_DEV && devView && (
        <DevHeroPicker
          label="Classic"
          currentHeroKey={hero.key}
          overrideActive={isOverride}
          onApply={setOverrideHero}
        />
      )}

      <ClassicBoard round={round} reveal={reveal} />
    </main>
  );
}

// Classic-specific wrapper around DailyCompleteResultCard. Owns the
// mode-specific summary row (portrait + "Symmetra in 5" + hints used) and
// the TryDeadlockleCard sibling that the user wanted OUTSIDE the result
// card chrome.
function ClassicDailyComplete({
  answer,
  guesses,
  hintsUsed,
  outcome,
  day,
}: {
  answer: Hero;
  guesses: number;
  hintsUsed: number;
  outcome: "won" | "lost";
  day: string;
}) {
  const summary = (
    <div className="flex items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={answer.portrait}
        alt=""
        className="h-14 w-14 rounded-(--radius-card) bg-muted object-cover sm:h-16 sm:w-16"
      />
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-info">
          Classic {outcome === "won" ? "Solved" : "Missed"}
        </div>
        <div className="mt-0.5 truncate font-display text-xl text-ink sm:text-2xl">
          {answer.name}
          {outcome === "won" && (
            <span className="text-ink-soft"> in {guesses}</span>
          )}
        </div>
        {hintsUsed > 0 && (
          <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
            💡 used {hintsUsed} {hintsUsed === 1 ? "hint" : "hints"}
          </div>
        )}
      </div>
    </div>
  );
  return (
    <>
      <DailyCompleteResultCard
        mode="classic"
        guesses={guesses}
        outcome={outcome}
        day={day}
        summary={summary}
      />
      <div className="mx-auto mt-8 mb-10 flex w-full max-w-lg justify-center">
        <TryDeadlockleCard />
      </div>
    </>
  );
}
