import type { ReactNode } from "react";

// Shared mode header intro (the <h1> + lede) and the pre-hydration shell.
//
// WHY THIS EXISTS: each *Game.tsx is a client component that gates on
// `if (!round) return <Loading…/>`, and `round` is only populated inside a
// useEffect (the daily answer depends on the client clock and localStorage).
// Under `output: "export"` the build pre-renders a client component's FIRST
// render, so that gate branch IS the shipped HTML. Every mode page therefore
// went out with no <h1> at all and the literal word "Loading…" as its only
// body text.
//
// Rendering ModeIntro in BOTH branches fixes that without touching any game
// logic: the heading and lede land in the static HTML, and because the two
// branches emit identical markup the header doesn't flash or shift when the
// board hydrates in over the top of it.
//
// The lede strings are Yash's, moved verbatim out of the five *Game.tsx
// headers. Do not reword them here.

export type ModeIntroCopy = {
  title: string;
  lede: ReactNode;
  // Body width of the mode's own <main>, so the pre-hydration shell matches
  // and nothing reflows on hydration. Defaults to the daily modes' width.
  maxWidth?: string;
};

export const MODE_INTRO = {
  classic: {
    title: "Classic",
    lede: "Type a hero. Match the eight attributes.",
  },
  quote: {
    title: "Quote",
    lede: "Try to guess which two heroes are having a conversation :D More dialogue is revealed as you go.",
  },
  splash: {
    title: "Spotlight",
    lede: "Guess the hero from a cropped sliver. Each wrong guess zooms out.",
  },
  sound: {
    title: "Sound",
    lede: "Listen to the ability sound. Each wrong guess extends the clip.",
  },
  ability: {
    title: "Ability",
    lede: "An ability icon, revealed a little more with every miss. Guess the hero it belongs to.",
  },
  // Bonus mode. Narrower body than the five daily modes (max-w-3xl), so it
  // passes its own width through to ModeLoading.
  melee: {
    title: "Melee",
    lede: "Guess the Overwatch hero from their melee sound. Listen to the hit. Five guesses.",
    maxWidth: "max-w-3xl",
  },
} as const satisfies Record<string, ModeIntroCopy>;

// Breathing room between a sparse board and whatever follows it (the stats
// panel, then the FAQ). An untouched board is short, so without this the
// next section crowds right up under the input.
//
// It lives INSIDE the game's <main> and keys off guess count alone, so the
// spacing is identical whether or not ModeStatsPanel rendered — that panel
// hides itself below the sample floor and on any environment without the
// /api/stats/today Pages Function, and nothing downstream should shift
// depending on it.
export function ModeBodySpacer({ guesses }: { guesses: number }) {
  if (guesses >= 3) return null;
  return (
    <div aria-hidden className={guesses === 0 ? "h-20 sm:h-28" : "h-10 sm:h-16"} />
  );
}

export function ModeIntro({ title, lede }: ModeIntroCopy) {
  return (
    <>
      <h1 className="mt-3 font-display display-headline uppercase text-5xl text-ink sm:text-6xl">
        {title}
      </h1>
      <p className="mt-3 max-w-md text-ink-soft">{lede}</p>
    </>
  );
}

// Pre-hydration shell. Replaces the old bare "Loading…" div. Keeps the exact
// <main>/<header> wrapper the live board uses so nothing jumps on hydration;
// the date slot holds its line with a nbsp because prettyDay() needs the
// client clock and can't be known at build time.
export function ModeLoading({
  title,
  lede,
  maxWidth = "max-w-4xl",
}: ModeIntroCopy) {
  return (
    <main
      className={`mx-auto w-full ${maxWidth} px-4 py-10 sm:px-6 lg:py-16`}
    >
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="utility-label text-xs text-info">&nbsp;</p>
          <ModeIntro title={title} lede={lede} />
        </div>
      </header>
      {/* bg-canvas, not bg-card: this is on screen for a frame or two, and a
          large saturated slab that then vanishes reads worse than the bare
          "Loading…" it replaced. A hairline outline holds the space quietly. */}
      <div
        aria-hidden
        className="h-40 rounded-(--radius-card) border border-line bg-canvas"
      />
      <span className="sr-only">Loading today&rsquo;s puzzle.</span>
      {/* Pre-hydration the board is by definition empty, so it carries the
          same spacing an untouched board gets. Keeps the FAQ from jumping
          upward for the split second before the real board mounts. */}
      <ModeBodySpacer guesses={0} />
    </main>
  );
}
