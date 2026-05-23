import clsx from "clsx";

// Minimal-but-prominent counter shown above the guess input. A row of
// pips equal to the cap (one filled per available guess, hollow per used)
// plus a numeric readout. Severity ramps as remaining drops — each
// tone is a bright, saturated token so the urgency cue stays legible
// on the dark canvas:
//   - remaining > 50% of cap → info     (bright blue)
//   - 25% < remaining ≤ 50%  → partial  (bright yellow)
//   - 1 < remaining ≤ 25%    → accent   (bright orange)
//   - remaining ≤ 1          → far      (bright red)
//
// The `wrong` token (#1a2030) is the "miss" *tile* background — too dark
// to read as text — so we use `far` (#ef4444) for the red endpoint.
//
// Used uniformly across every mode so the urgency cue feels consistent.
// `used` and `cap` are taken explicitly (rather than computing remaining
// internally) so the caller can pass the *effective* used count — for
// Classic that's guesses + hints, for Sound it's guesses (skips already
// counted in there). Single source of truth on the cap is in each game.
export function GuessRemaining({
  used,
  cap,
  className,
}: {
  used: number;
  cap: number;
  className?: string;
}) {
  const remaining = Math.max(0, cap - used);
  const ratio = remaining / cap;
  const tone =
    remaining <= 1
      ? "far"
      : ratio <= 0.25
        ? "accent"
        : ratio <= 0.5
          ? "partial"
          : "info";

  const toneText = {
    info: "text-info",
    partial: "text-partial",
    accent: "text-accent",
    far: "text-far",
  }[tone];

  const toneFill = {
    info: "bg-info",
    partial: "bg-partial",
    accent: "bg-accent",
    far: "bg-far",
  }[tone];

  const toneRing = {
    info: "border-info/60",
    partial: "border-partial/70",
    accent: "border-accent/70",
    far: "border-far/70",
  }[tone];

  return (
    <div
      className={clsx("inline-flex items-center gap-3", toneText, className)}
      aria-label={`${remaining} of ${cap} guesses left`}
    >
      <span className="flex items-center gap-1.5">
        {Array.from({ length: cap }).map((_, i) => {
          const filled = i < remaining;
          return (
            <span
              key={i}
              aria-hidden
              className={clsx(
                "inline-block h-2.5 w-2.5 rounded-full border transition-colors",
                filled ? `${toneFill} ${toneRing}` : "border-line bg-transparent",
              )}
            />
          );
        })}
      </span>
      <span className="inline-flex items-baseline gap-1.5">
        <span className="font-display text-2xl font-bold leading-none tabular-nums sm:text-3xl">
          {remaining}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] opacity-70">
          left
        </span>
      </span>
    </div>
  );
}
