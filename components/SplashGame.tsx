"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { HEROES, HEROES_BY_KEY, type Hero } from "@/lib/heroes";
import {
  dayString,
  getSplashForDay,
  getSplashOriginForDay,
  getSpotlightPreview,
  prettyDay,
} from "@/lib/daily";
import { loadModeState, saveModeState, type ModeState } from "@/lib/storage";
import {
  trackBonusAnswered,
  trackGuessSubmitted,
  trackModeCompleted,
  trackModeStarted,
} from "@/lib/tracking";
import { SkinBonusRound } from "./SkinBonusRound";
import { HeroCombobox } from "./HeroCombobox";
import { GuessRow } from "./GuessRow";
import { Brand } from "./Brand";
import { media } from "@/lib/media";
import { NextModeCTA } from "./NextModeCTA";
import { LossReveal } from "./LossReveal";
import { ScrollIntoViewOnMount } from "./ScrollIntoViewOnMount";
import { GuessRemaining } from "./GuessRemaining";
import { ModeStatsLine } from "./ModeStatsLine";
import { DevViewToggle, useDevViewState } from "./DevViewToggle";
import { DevHeroPicker } from "./DevHeroPicker";
import { ShareButton } from "./ShareButton";
import { roundShareLinks } from "@/lib/shareLinks";
import { useShareLinkVisit } from "@/lib/useShareLinkVisit";
import { DailyCompleteResultCard } from "./DailyCompleteResultCard";
import { TryDeadlockleCard } from "./TryDeadlockleCard";
import { isDailyComplete } from "@/lib/storage";
import { BUILT_MODE_SLUGS } from "@/lib/modes";
import type { Skin } from "@/lib/heroes";

const IS_DEV = process.env.NODE_ENV !== "production";

const MODE = "splash";

// Hard cap on guesses. Player only ever sees indices 0..MAX_GUESSES of
// the zoom curve — the curve's tail (positions 5..8) is intentionally
// out of reach. The cap is meant to bite: at the lose-line the crop is
// still tight enough to be challenging, especially on legendary skins.
const MAX_GUESSES = 5;

// Crop window zoom level by guess count. Higher = more zoomed in (less
// visible). Image is a square crop centered on the character (smartcrop).
// The zoom anchors on a per-day transform-origin (see
// getSplashOriginForDay): horizontally centered, vertically randomized
// within the middle third, so the tight initial crop lands on a fresh
// focal point each day and zooms out from there.
//
// The curve is calibrated for a "full reveal" at position 8 even though
// the player never reaches that during normal play (cap at 5). This
// keeps the per-step deltas the same shape they'd have in an 8-guess
// mode while compressing the player's visible journey into the harder
// first half: 20× → 12× → 7× → 4× → 2.5× → LOSS. Past the cap, the
// LossReveal forces zoom to 1× regardless.
const ZOOM_BY_GUESS = [20, 12, 7, 4, 2.5, 1.8, 1.4, 1.15, 1];

export function SplashGame() {
  // Inbound share-link attribution (?c= from /r/[code] redirects).
  useShareLinkVisit("splash");
  const [day, setDay] = useState<string | null>(null);
  const [state, setState] = useState<ModeState | null>(null);
  // Dev-only view + override hero. When set, we serve that hero's
  // default splash image (no skin variant) and freeze localStorage so
  // test playthroughs don't overwrite the daily progress.
  const [devView, setDevView] = useDevViewState("splash");
  const [overrideHero, setOverrideHero] = useState<Hero | null>(null);
  const isOverride = overrideHero !== null;
  // Scroll anchor for the splash art. On a completed round we bring this to
  // the top of the viewport so the now fully zoomed-out art (and the result
  // card directly below) are framed together.
  const artRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const d = dayString();
    setDay(d);
    setState(loadModeState(MODE, d));
  }, []);

  // mode_started — once per day, skip dev overrides.
  useEffect(() => {
    if (!day || isOverride) return;
    const pick = getSplashForDay(day);
    trackModeStarted({
      mode: "splash",
      dailyId: day,
      answerId: pick.hero.key,
    });
  }, [day, isOverride]);

  // mode_completed — fires on terminal transition.
  const stateWon = state?.won === true;
  const stateLost = state?.lost === true;
  useEffect(() => {
    if (!day || isOverride) return;
    if (!stateWon && !stateLost) return;
    const pick = getSplashForDay(day);
    trackModeCompleted({
      mode: "splash",
      dailyId: day,
      outcome: stateWon ? "won" : "lost",
      totalGuesses: state?.guesses.length ?? 0,
      cap: MAX_GUESSES,
      answerId: pick.hero.key,
      skinKey: pick.skin?.key ?? null,
    });
  }, [day, isOverride, stateWon, stateLost, state?.guesses.length]);

  const applyOverride = (hero: Hero | null) => {
    setOverrideHero(hero);
    // Restart the in-memory round when the picker changes target.
    setState({ day: day ?? "", guesses: [], won: false });
  };

  if (!day || !state) {
    return (
      <main className="mx-auto w-full max-w-4xl px-6 py-16">
        <div className="utility-label text-xs text-ink-faint">
          Loading…
        </div>
      </main>
    );
  }

  // Override path previews the hero's legendary skin (matching the
  // legendary-only daily), falling back to base art if it has none.
  // Daily path uses the full seeded picker.
  const splash = overrideHero
    ? getSpotlightPreview(overrideHero)
    : getSplashForDay(day);
  const { hero: answer, imageUrl, skin } = splash;
  // Per-day zoom focal point: centered horizontally, randomized within the
  // middle third vertically. Seeded on day + image so it's stable across
  // guesses/reloads (the crop only zooms out from this fixed anchor) yet
  // varies per hero when previewing via the dev picker.
  const origin = getSplashOriginForDay(day, imageUrl);
  const guessedHeroes = state.guesses
    .map((k) => HEROES_BY_KEY[k])
    .filter(Boolean);
  const excludeKeys = new Set(state.guesses);

  const lost = state.lost === true;
  const ended = state.won || lost;

  // Wrong guesses zoom out the crop. On win or loss the image snaps to
  // full reveal regardless of where the curve was.
  const zoomIdx = Math.min(state.guesses.length, ZOOM_BY_GUESS.length - 1);
  const zoom = ended ? 1 : ZOOM_BY_GUESS[zoomIdx];

  // Skin-name bonus: after winning, the player gets one shot at naming
  // the (now fully revealed) skin via a search over the hero's full skin
  // list. Eligible only when the day is a skin day AND the hero has more
  // than one skin to search through — single-skin heroes and legacy
  // default-art days have no question to ask. The result card shows
  // alongside the pending bonus, but its skin rarity + name line (and
  // the share card's) stays hidden until the bonus is answered so the
  // card can't leak the answer.
  const bonusEligible = skin != null && answer.skins.length >= 2;
  const bonusPending = state.won && bonusEligible && !state.bonus;
  const skinRevealed = bonusPending ? null : skin;

  const handleGuess = (hero: Hero) => {
    if (ended) return;
    const newGuesses = [...state.guesses, hero.key];
    const won = hero.key === answer.key;
    const nextLost = !won && newGuesses.length >= MAX_GUESSES;
    if (!isOverride) {
      trackGuessSubmitted({
        mode: "splash",
        dailyId: day,
        guessNumber: newGuesses.length,
        isCorrect: won,
        guessId: hero.key,
        answerId: answer.key,
      });
    }
    const next: ModeState = {
      ...state,
      guesses: newGuesses,
      won,
      lost: nextLost,
    };
    setState(next);
    if (!isOverride) saveModeState(MODE, next);
  };

  const handleBonus = (selected: number, correct: boolean | null) => {
    if (!state.won || state.bonus) return;
    const next: ModeState = { ...state, bonus: { selected, correct } };
    setState(next);
    if (!isOverride) {
      saveModeState(MODE, next);
      if (correct != null && skin) {
        trackBonusAnswered({
          mode: "splash",
          dailyId: day,
          correct,
          answerId: skin.key,
          // -1 = guessed text matched none of the hero's skins.
          selectedId:
            selected >= 0
              ? (answer.skins[selected]?.key ?? "")
              : "__no_match__",
        });
      }
    }
  };

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 lg:py-16">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="utility-label text-xs text-info">
            <span suppressHydrationWarning>{prettyDay(day)}</span>
          </p>
          <h1 className="mt-3 font-display display-headline uppercase text-5xl text-ink sm:text-6xl">
            Spotlight
          </h1>
          <p className="mt-3 max-w-md text-ink-soft">
            Guess the hero from a cropped sliver. Each wrong guess zooms
            out.
          </p>
        </div>
        <div className="hidden flex-col items-end utility-label text-xs text-ink-faint sm:flex">
          <Brand size="sm" />
        </div>
      </header>

      {IS_DEV && (
        <div className="mb-4 flex justify-center">
          <DevViewToggle
            mode="splash"
            active={devView}
            onChange={setDevView}
          />
        </div>
      )}
      {IS_DEV && devView && (
        <DevHeroPicker
          label="Spotlight"
          currentHeroKey={answer.key}
          overrideActive={isOverride}
          onApply={applyOverride}
        />
      )}

      <div
        ref={artRef}
        className="mb-8 flex scroll-mt-6 flex-col items-center sm:scroll-mt-8"
      >
        <SplashFrame
          imageUrl={imageUrl}
          zoom={zoom}
          origin={origin}
          revealed={ended}
          heroName={answer.name}
        />
      </div>
      {ended && <ScrollIntoViewOnMount targetRef={artRef} />}

      {state.won && bonusEligible && skin && (
        <div className="mx-auto mb-8 w-full max-w-md">
          <SkinBonusRound
            skins={answer.skins}
            correctSkinKey={skin.key}
            saved={state.bonus}
            onSelect={handleBonus}
          />
        </div>
      )}

      {!ended && (
        <div className="mb-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <GuessRemaining used={state.guesses.length} cap={MAX_GUESSES} />
            <span className="utility-label text-[10px] text-ink-faint">
              zoom {zoom.toFixed(zoom < 2 ? 2 : 1)}×
            </span>
          </div>
          <HeroCombobox
            heroes={HEROES}
            excludeKeys={excludeKeys}
            onSelect={handleGuess}
          />
        </div>
      )}

      <AnimatePresence>
        {state.won &&
          (isDailyComplete({
            day,
            currentMode: "splash",
            currentDone: true,
            builtSlugs: BUILT_MODE_SLUGS,
          }) ? (
            <SplashDailyComplete
              key="win-daily"
              answer={answer}
              skin={skinRevealed}
              guesses={state.guesses.length}
              outcome="won"
              day={day}
            />
          ) : (
            <motion.div
              key="win"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="result-card mx-auto mb-8 w-full max-w-md rounded-(--radius-card) border border-correct bg-win p-4 sm:p-5"
            >
              <div className="flex flex-col gap-5">
                <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-center sm:text-left">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={answer.portrait}
                    alt=""
                    className="h-16 w-16 rounded-(--radius-card) bg-muted object-cover sm:h-20 sm:w-20"
                  />
                  <div className="flex-1">
                    <div className="utility-label text-[10px] text-info">
                      Solved
                    </div>
                    <div className="mt-1 font-display text-2xl font-bold text-ink sm:text-3xl">
                      {answer.name}{" "}
                      <span className="text-ink-soft">
                        in {state.guesses.length}
                      </span>
                    </div>
                    {skinRevealed && (
                      <div className="mt-2 flex items-center justify-center gap-2 utility-label text-[11px] sm:justify-start">
                        <span
                          className={
                            skinRevealed.rarity === "legendary"
                              ? "text-accent-soft"
                              : "text-info"
                          }
                        >
                          {skinRevealed.rarity}
                        </span>
                        <span className="text-ink-soft">·</span>
                        <span className="text-ink">{skinRevealed.name}</span>
                      </div>
                    )}
                    <ModeStatsLine mode="splash" />
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <NextModeCTA current="splash" scrollIntoViewOnMount={false} />
                  <ShareButton
                    {...roundShareLinks({
                      day,
                      slug: "splash",
                      outcome: "won",
                      guesses: state.guesses.length,
                    })}
                    filename={`owdle-splash-${day}.png`}
                    surface="round_result"
                    mode="splash"
                    dailyId={day}
                  />
                </div>
              </div>
            </motion.div>
          ))}
      </AnimatePresence>

      <AnimatePresence>
        {lost &&
          !state.won &&
          (isDailyComplete({
            day,
            currentMode: "splash",
            currentDone: true,
            builtSlugs: BUILT_MODE_SLUGS,
          }) ? (
            <SplashDailyComplete
              key="loss-daily"
              answer={answer}
              skin={skin}
              guesses={state.guesses.length}
              outcome="lost"
              day={day}
            />
          ) : (
            <LossReveal
              current="splash"
              scrollIntoViewOnMount={false}
              share={
                <ShareButton
                  {...roundShareLinks({
                    day,
                    slug: "splash",
                    outcome: "lost",
                    guesses: state.guesses.length,
                  })}
                  filename={`owdle-splash-${day}.png`}
                  surface="round_result"
                  mode="splash"
                  dailyId={day}
                />
              }
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={answer.portrait}
                  alt=""
                  className="h-16 w-16 rounded-(--radius-card) bg-muted object-cover sm:h-20 sm:w-20"
                />
                <div className="flex-1">
                  <div className="font-display text-2xl font-bold text-ink sm:text-3xl">
                    {answer.name}
                  </div>
                  {skin && (
                    <div className="mt-2 flex items-center gap-2 utility-label text-[11px]">
                      <span
                        className={
                          skin.rarity === "legendary"
                            ? "text-accent-soft"
                            : "text-info"
                        }
                      >
                        {skin.rarity}
                      </span>
                      <span className="text-ink-soft">·</span>
                      <span className="text-ink">{skin.name}</span>
                    </div>
                  )}
                  <div className="mt-1 utility-label text-xs text-ink-faint">
                    after {state.guesses.length} wrong{" "}
                    {state.guesses.length === 1 ? "guess" : "guesses"}
                  </div>
                  <ModeStatsLine mode="splash" />
                </div>
              </div>
            </LossReveal>
          ))}
      </AnimatePresence>

      <div className="space-y-4">
        <AnimatePresence initial={false}>
          {[...guessedHeroes].reverse().map((hero, revIdx) => {
            const originalIdx = guessedHeroes.length - 1 - revIdx;
            const isLatest = originalIdx === guessedHeroes.length - 1;
            return (
              <GuessRow
                key={hero.key}
                guess={hero}
                answer={answer}
                isLatest={isLatest}
              />
            );
          })}
        </AnimatePresence>
      </div>
    </main>
  );
}

function SplashFrame({
  imageUrl,
  zoom,
  origin,
  revealed,
  heroName,
}: {
  imageUrl: string;
  zoom: number;
  origin: { x: number; y: number };
  revealed: boolean;
  heroName: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="tile-shape relative w-full overflow-hidden border border-line bg-muted shadow-2xl shadow-black/10"
        style={{ aspectRatio: "1 / 1", maxWidth: "min(80vw, 540px)" }}
        role="img"
        aria-label={
          revealed ? `Splash art for ${heroName}` : "Cropped splash art"
        }
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={media(imageUrl)}
          alt=""
          className="puzzle-art block h-full w-full object-cover transition-transform duration-700 ease-out"
          draggable={false}
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: `${origin.x}% ${origin.y}%`,
          }}
          loading="eager"
          decoding="async"
        />
        {/* subtle vignette to ground the crop */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.35) 100%)",
          }}
        />
      </div>
    </div>
  );
}

// Splash-specific wrapper around DailyCompleteResultCard. Owns the
// mode-specific confirmation row (with optional skin rarity + name)
// and the TryDeadlockleCard sibling.
function SplashDailyComplete({
  answer,
  skin,
  guesses,
  outcome,
  day,
}: {
  answer: Hero;
  skin: Skin | null;
  guesses: number;
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
        <div className="utility-label text-[10px] text-info">
          Spotlight {outcome === "won" ? "Solved" : "Missed"}
        </div>
        <div className="mt-0.5 truncate font-display text-xl font-bold text-ink sm:text-2xl">
          {answer.name}
          {outcome === "won" && (
            <span className="text-ink-soft"> in {guesses}</span>
          )}
        </div>
        {skin && (
          <div className="mt-0.5 flex items-center gap-2 utility-label text-[10px]">
            <span
              className={
                skin.rarity === "legendary"
                  ? "text-accent-soft"
                  : "text-info"
              }
            >
              {skin.rarity}
            </span>
            <span className="text-ink-soft">·</span>
            <span className="text-ink">{skin.name}</span>
          </div>
        )}
      </div>
    </div>
  );
  return (
    <>
      <DailyCompleteResultCard
        mode="splash"
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
