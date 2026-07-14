"use client";

import { motion } from "motion/react";
import clsx from "clsx";
import type { SoundBonusOption } from "@/lib/daily";

// Sound mode bonus: after the player gets the hero right, they pick which
// ability the clip belonged to. Options are sourced from the labeled clip
// set for that hero (sound-clips.json), so custom variants like
// "Scoped Fire" appear alongside press-kit abilities. Icons are best-effort:
// auto-matched by slugified name, with a hand-curated override map in
// data/sound-clip-icons.json for labels that don't slug-match.
export function BonusRound({
  heroName,
  options,
  saved,
  onSelect,
}: {
  heroName: string;
  options: SoundBonusOption[];
  saved: { selected: number; correct: boolean | null } | undefined;
  onSelect: (selectedIndex: number, correct: boolean | null) => void;
}) {
  const answered = saved != null;
  const selectedIndex = saved?.selected ?? null;
  const correctIndex = options.findIndex((o) => o.isCorrect);

  const handlePick = (i: number) => {
    if (answered) return;
    const opt = options[i];
    if (!opt) return;
    onSelect(i, opt.isCorrect);
  };

  const eyebrowText = answered
    ? saved!.correct
      ? "Bonus · Correct"
      : "Bonus · Missed"
    : "Bonus round";

  const eyebrowColor = answered
    ? saved!.correct
      ? "text-correct"
      : "text-far"
    : "text-accent-soft";

  const correctLabel =
    correctIndex >= 0 ? options[correctIndex].label : null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.15 }}
      className="rounded-(--radius-card) border border-line bg-card p-5 sm:p-6"
    >
      <div className="mb-4 flex items-baseline justify-between">
        <p
          className={clsx(
            "utility-label text-[10px]",
            eyebrowColor,
          )}
        >
          {eyebrowText}
        </p>
        <p className="utility-label text-[10px] text-ink-faint">
          {answered ? "Answer revealed below" : "Pick the ability"}
        </p>
      </div>

      <p className="mb-5 max-w-md font-display text-base leading-snug text-ink sm:text-lg">
        {answered
          ? saved!.correct
            ? `Yep, that was ${heroName}'s ${correctLabel}.`
            : correctLabel
              ? `Not quite. The clip was ${heroName}'s ${correctLabel}.`
              : `Answer locked in.`
          : `Which of ${heroName}'s abilities was the sound from?`}
      </p>

      {/* auto-fit wraps to multiple rows on narrow phones so we don't force
          5 cramped <44px cells on a 320px screen. Caps target column count
          at the option count so we never leave a half-empty trailing row on
          wide viewports. */}
      <div
        className="grid gap-3 sm:gap-4"
        style={{
          gridTemplateColumns: `repeat(auto-fit, minmax(72px, 1fr))`,
        }}
      >
        {options.map((opt, i) => {
          const isPicked = selectedIndex === i;
          const showAsRight = answered && opt.isCorrect;
          const showAsWrong =
            answered && isPicked && !saved!.correct;

          return (
            <BonusOptionCard
              key={opt.slug}
              option={opt}
              isPicked={isPicked}
              showAsRight={showAsRight}
              showAsWrong={showAsWrong}
              dimmed={answered && !isPicked && !opt.isCorrect}
              disabled={answered}
              onClick={() => handlePick(i)}
            />
          );
        })}
      </div>
    </motion.section>
  );
}

function BonusOptionCard({
  option,
  isPicked,
  showAsRight,
  showAsWrong,
  dimmed,
  disabled,
  onClick,
}: {
  option: SoundBonusOption;
  isPicked: boolean;
  showAsRight: boolean;
  showAsWrong: boolean;
  dimmed: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  // First letter fallback when we don't have a press-kit icon (e.g., a
  // custom-variant slug like "scoped-fire"). Using the label's first
  // letter keeps the tile visually consistent with the iconed options.
  const fallbackLetter = option.label
    .replace(/[^a-zA-Z0-9]/g, "")
    .charAt(0)
    .toUpperCase();

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={isPicked}
      className={clsx(
        "tile-shape group relative flex flex-col items-center gap-2 p-3 text-center transition-all",
        showAsRight
          ? "border-2 border-correct bg-muted"
          : showAsWrong
            ? "border-2 border-far bg-muted"
            : isPicked
              ? "border border-accent bg-muted"
              : "border border-line bg-muted hover:border-edge",
        dimmed && "opacity-40",
        disabled && "cursor-default",
      )}
    >
      <div
        className={clsx(
          "tile-shape relative flex items-center justify-center bg-canvas",
          "h-14 w-14 sm:h-16 sm:w-16",
        )}
      >
        {option.icon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={option.icon}
            alt=""
            className="h-full w-full object-contain p-1"
          />
        ) : (
          <span
            className="font-display text-2xl font-bold text-accent-soft"
            aria-hidden
          >
            {fallbackLetter}
          </span>
        )}
        {showAsRight && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{
              duration: 0.4,
              ease: [0.34, 1.56, 0.64, 1],
            }}
            className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-correct text-[10px] font-bold text-on-correct"
            aria-hidden
          >
            ✓
          </motion.span>
        )}
        {showAsWrong && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{
              duration: 0.4,
              ease: [0.34, 1.56, 0.64, 1],
            }}
            className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-far text-[10px] font-bold text-on-far"
            aria-hidden
          >
            ✗
          </motion.span>
        )}
      </div>
      <div
        className={clsx(
          "font-display text-xs leading-tight transition-colors sm:text-sm",
          showAsRight
            ? "text-correct"
            : showAsWrong
              ? "text-far"
              : "text-ink",
        )}
      >
        {option.label}
      </div>
    </button>
  );
}
