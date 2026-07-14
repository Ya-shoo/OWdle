import clsx from "clsx";

// Solid, forward-leaning label plate — the Workshop language's replacement
// for the old tracked-out mono eyebrows. Reads like the game client's own
// chip labels (TANK / DAMAGE / SUPPORT): a saturated or steel parallelogram
// with condensed bold caps riding on it.
//
// Geometry: the body skews −10°; the content counter-skews +4°, so the text
// keeps a subtle −6° forward lean instead of standing bolt upright inside a
// leaning box. One angle site-wide — nothing else gets to be diagonal.
//
// Tones follow the color law: orange ACTS (interactive contexts), gold
// REWARDS (earned states only), blue INFORMS, red for losses, steel for
// neutral chrome. All fills are fully saturated solids per the
// nothing-may-look-translucent rule; no outlines (the shadow carries the
// edge on busy backdrops — pass lift={false} on flat page sections).

const TONE_CLASSES = {
  accent: "bg-accent text-on-accent",
  steel: "bg-card text-ink",
  info: "bg-info text-on-info",
  gold: "bg-gold text-on-gold",
  correct: "bg-correct text-on-correct",
  far: "bg-far text-on-far",
} as const;

const SIZE_CLASSES = {
  sm: "px-2.5 py-1 text-[11px]",
  md: "px-3.5 py-1.5 text-xs",
  lg: "px-5 py-2 text-xs",
} as const;

export type PlateTone = keyof typeof TONE_CLASSES;

export function Plate({
  tone = "steel",
  size = "md",
  lift = true,
  as: Tag = "span",
  className,
  children,
}: {
  tone?: PlateTone;
  size?: keyof typeof SIZE_CLASSES;
  // Drop shadow for plates sitting on photography/banners; flat page
  // sections don't need the lift.
  lift?: boolean;
  as?: "span" | "h2" | "h3" | "div";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Tag
      className={clsx(
        "inline-flex -skew-x-[10deg] items-center",
        TONE_CLASSES[tone],
        SIZE_CLASSES[size],
        lift && "shadow-[0_2px_6px_-1px_rgba(0,0,0,0.45)]",
        className,
      )}
    >
      <span className="utility-label inline-block skew-x-[4deg]">
        {children}
      </span>
    </Tag>
  );
}
