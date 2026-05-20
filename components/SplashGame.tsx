"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { HEROES, HEROES_BY_KEY, type Hero } from "@/lib/heroes";
import { dayString, getSplashForDay, prettyDay } from "@/lib/daily";
import { loadModeState, saveModeState, type ModeState } from "@/lib/storage";
import { HeroCombobox } from "./HeroCombobox";
import { GuessRow } from "./GuessRow";
import { Brand } from "./Brand";
import { media } from "@/lib/media";
import { NextModeCTA } from "./NextModeCTA";

const MODE = "splash";

// Crop window zoom level by guess count. Higher = more zoomed in (less visible).
// Image is a square crop centered on the character (smartcrop), so transformOrigin
// is always 50%/50% and high initial zoom lands tightly on the face/torso.
// Index 0 = before any guess. Each wrong guess advances the index until full.
const ZOOM_BY_GUESS = [20, 14, 10, 7, 5, 3.5, 2.5, 1.7, 1.2, 1];

export function SplashGame() {
  const [day, setDay] = useState<string | null>(null);
  const [state, setState] = useState<ModeState | null>(null);

  useEffect(() => {
    const d = dayString();
    setDay(d);
    setState(loadModeState(MODE, d));
  }, []);

  if (!day || !state) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-16">
        <div className="font-mono text-xs uppercase tracking-[0.2em] text-ink-faint">
          Loading…
        </div>
      </main>
    );
  }

  const { hero: answer, imageUrl, skin } = getSplashForDay(day);
  const guessedHeroes = state.guesses
    .map((k) => HEROES_BY_KEY[k])
    .filter(Boolean);
  const excludeKeys = new Set(state.guesses);

  // Wrong guesses zoom out the crop. A win locks the full image.
  const wrongCount = state.won
    ? ZOOM_BY_GUESS.length - 1
    : state.guesses.length;
  const zoomIdx = Math.min(wrongCount, ZOOM_BY_GUESS.length - 1);
  const zoom = state.won ? 1 : ZOOM_BY_GUESS[zoomIdx];

  const handleGuess = (hero: Hero) => {
    if (state.won) return;
    const next: ModeState = {
      ...state,
      guesses: [...state.guesses, hero.key],
      won: hero.key === answer.key,
    };
    setState(next);
    saveModeState(MODE, next);
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-16">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-info">
            <span suppressHydrationWarning>{prettyDay(day)}</span>
          </p>
          <h1 className="mt-3 font-display display-headline text-5xl text-ink sm:text-6xl">
            Spotlight
          </h1>
          <p className="mt-3 max-w-md text-ink-soft">
            Identify the hero from a cropped sliver. Each wrong guess zooms
            out.
          </p>
        </div>
        <div className="hidden flex-col items-end font-mono text-xs uppercase tracking-[0.2em] text-ink-faint sm:flex">
          <Brand size="sm" />
          <span className="mt-1 text-info">spotlight mode</span>
        </div>
      </header>

      <div className="mb-8 flex flex-col items-center">
        <SplashFrame
          imageUrl={imageUrl}
          zoom={zoom}
          revealed={state.won}
          heroName={answer.name}
        />
      </div>

      {!state.won && (
        <div className="mb-6">
          <HeroCombobox
            heroes={HEROES}
            excludeKeys={excludeKeys}
            onSelect={handleGuess}
          />
          <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-info">
            {state.guesses.length}{" "}
            {state.guesses.length === 1 ? "guess" : "guesses"}
            <span className="ml-2 text-ink-faint">
              · zoom {zoom.toFixed(zoom < 2 ? 2 : 1)}×
            </span>
          </p>
        </div>
      )}

      <AnimatePresence>
        {state.won && (
          <motion.div
            key="win"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="mb-8 rounded-(--radius-card) border border-correct/40 bg-correct/10 p-5 sm:p-6"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={answer.portrait}
                alt=""
                className="h-16 w-16 rounded-(--radius-card) bg-muted object-cover sm:h-20 sm:w-20"
              />
              <div className="flex-1">
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-info">
                  Solved
                </div>
                <div className="mt-1 font-display text-2xl text-ink sm:text-3xl">
                  {answer.name}{" "}
                  <span className="text-ink-soft">
                    in {state.guesses.length}
                  </span>
                </div>
                {skin && (
                  <div className="mt-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em]">
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
                <div className="mt-3">
                  <NextModeCTA current="splash" />
                </div>
              </div>
            </div>
          </motion.div>
        )}
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

      {state.guesses.length === 0 && (
        <div className="mt-10 rounded-(--radius-card) border border-dashed border-line bg-inset/40 p-8 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-ink-faint">
            Look closely. Then start guessing above.
          </p>
        </div>
      )}
    </main>
  );
}

function SplashFrame({
  imageUrl,
  zoom,
  revealed,
  heroName,
}: {
  imageUrl: string;
  zoom: number;
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
          className="block h-full w-full object-cover transition-transform duration-700 ease-out"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: "50% 50%",
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
