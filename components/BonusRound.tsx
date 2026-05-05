"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import clsx from "clsx";
import type { SoundBonusOption } from "@/lib/daily";

// Sound mode bonus: after the player gets the hero right, they pick which
// ability the clip belonged to. Options are sourced from the labeled clip
// set for that hero (sound-clips.json), so custom variants like
// "Scoped Fire" appear alongside press-kit abilities. Icons + descriptions
// are best-effort: if the slug matches a press-kit ability by name, we
// use that ability's art; otherwise we fall back to a label-only tile.
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
  const [hovering, setHovering] = useState<number | null>(null);
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
      className="rounded-(--radius-card) border border-line bg-inset/40 p-5 sm:p-6"
    >
      <div className="mb-4 flex items-baseline justify-between">
        <p
          className={clsx(
            "font-mono text-[10px] uppercase tracking-[0.24em]",
            eyebrowColor,
          )}
        >
          {eyebrowText}
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
          {answered ? "Answer revealed below" : "Pick the ability"}
        </p>
      </div>

      <p className="mb-5 max-w-md font-display text-base leading-snug text-ink sm:text-lg">
        {answered
          ? saved!.correct
            ? `Yep — that was ${heroName}'s ${correctLabel}.`
            : correctLabel
              ? `Not quite. The clip was ${heroName}'s ${correctLabel}.`
              : `Answer locked in.`
          : `Which of ${heroName}'s abilities was the sound from?`}
      </p>

      <div
        className="grid gap-3 sm:gap-4"
        style={{
          gridTemplateColumns: `repeat(${Math.min(options.length, 5)}, minmax(0, 1fr))`,
        }}
      >
        {options.map((opt, i) => {
          const isPicked = selectedIndex === i;
          const showAsRight = answered && opt.isCorrect;
          const showAsWrong =
            answered && isPicked && !saved!.correct;
          const isExpanded = answered ? isPicked : hovering === i;

          return (
            <BonusOptionCard
              key={opt.slug}
              option={opt}
              isPicked={isPicked}
              showAsRight={showAsRight}
              showAsWrong={showAsWrong}
              dimmed={answered && !isPicked && !opt.isCorrect}
              isExpanded={isExpanded}
              disabled={answered}
              onMouseEnter={() => setHovering(i)}
              onMouseLeave={() => setHovering(null)}
              onClick={() => handlePick(i)}
            />
          );
        })}
      </div>

      <AnimatePresence>
        {answered && options[selectedIndex!]?.description && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <p className="mt-4 max-w-md text-sm text-ink-soft">
              {options[selectedIndex!].description}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

function BonusOptionCard({
  option,
  isPicked,
  showAsRight,
  showAsWrong,
  dimmed,
  isExpanded,
  disabled,
  onMouseEnter,
  onMouseLeave,
  onClick,
}: {
  option: SoundBonusOption;
  isPicked: boolean;
  showAsRight: boolean;
  showAsWrong: boolean;
  dimmed: boolean;
  isExpanded: boolean;
  disabled: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
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
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      disabled={disabled}
      aria-pressed={isPicked}
      className={clsx(
        "tile-shape group relative flex flex-col items-center gap-2 p-3 text-center transition-all",
        showAsRight
          ? "border-2 border-correct bg-correct/20 shadow-[inset_0_0_0_1px_var(--tile-correct)]"
          : showAsWrong
            ? "border-2 border-far bg-far/15"
            : isPicked
              ? "border border-accent bg-accent/10"
              : "border border-line bg-muted/40 hover:border-accent/60 hover:bg-accent/5",
        dimmed && "opacity-40",
        disabled && "cursor-default",
      )}
    >
      <div
        className={clsx(
          "tile-shape relative flex items-center justify-center bg-canvas/60",
          "h-14 w-14 sm:h-16 sm:w-16",
        )}
      >
        {option.icon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={option.icon}
            alt=""
            className="h-full w-full object-contain p-1"
            loading="lazy"
          />
        ) : (
          <span
            className="font-display text-2xl text-accent-soft"
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
      {isExpanded && !disabled && option.description && (
        <div className="absolute left-full top-0 z-10 ml-2 hidden w-56 rounded-(--radius-card) border border-line bg-surface p-3 text-left text-xs text-ink-soft shadow-2xl shadow-black/30 sm:block">
          {option.description}
        </div>
      )}
    </button>
  );
}
