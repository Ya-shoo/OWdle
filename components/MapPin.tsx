// Shared map-pin SVG. Renders a filled pin with concentric halos for
// visual weight, optionally with an arrow on top pointing in `facingDeg`
// (0° = up, 90° = right, matching the CSS rotation convention).
//
// Used by:
//   - MapReview validate mode (the actively-edited spot's pin)
//   - MapGame placement pin (player tentative guess)
//   - MapGame ResultOverlay (player + correct-answer pins after submit)
//
// Direction arrow shows only when `facingDeg` is passed — player-guess
// pins deliberately omit it (player only places a position).

import type { CSSProperties } from "react";

export type PinVariant = "answer" | "answer-large" | "guess" | "guess-large";

const SIZE: Record<PinVariant, number> = {
  answer: 28,
  "answer-large": 52,
  guess: 28,
  "guess-large": 44,
};

// Fill + stroke per variant. Stroke is the rim around the inner circle;
// fill is the pin body + halos + direction arrow. Raw CSS-var refs so
// the pin tracks the theme tokens without a Tailwind round-trip.
const COLOR: Record<PinVariant, { fill: string; stroke: string }> = {
  answer: { fill: "var(--tile-correct)", stroke: "var(--bg-base)" },
  "answer-large": { fill: "var(--tile-correct)", stroke: "var(--bg-base)" },
  guess: { fill: "var(--accent)", stroke: "var(--bg-base)" },
  "guess-large": { fill: "var(--accent)", stroke: "var(--bg-base)" },
};

export function MapPin(props: {
  facingDeg?: number | null;
  variant: PinVariant;
  className?: string;
  style?: CSSProperties;
  onMouseDown?: (e: React.MouseEvent<SVGSVGElement>) => void;
  onContextMenu?: (e: React.MouseEvent<SVGSVGElement>) => void;
  title?: string;
}) {
  const { facingDeg, variant, className, style, onMouseDown, onContextMenu, title } = props;
  const size = SIZE[variant];
  const { fill, stroke } = COLOR[variant];
  const hasDir = facingDeg != null && Number.isFinite(facingDeg);
  return (
    <svg
      width={size}
      height={size}
      viewBox="-16 -16 32 32"
      onMouseDown={onMouseDown}
      onContextMenu={onContextMenu}
      className={className}
      style={{ overflow: "visible", display: "block", ...style }}
    >
      {title && <title>{title}</title>}

      {/* Outer soft glow — gives the pin presence on busy overhead
          imagery without dominating it. Drawn first so the body
          layers above it. overflow:visible on the <svg> lets these
          larger circles bleed past the viewBox. */}
      <circle cx={0} cy={0} r={14} fill={fill} opacity={0.14} />
      <circle cx={0} cy={0} r={9.5} fill={fill} opacity={0.28} />

      {/* Direction arrow / vision cone. Anchored just outside the
          inner circle so it reads as "the camera was pointing this
          way" rather than overlapping the pin body. Drawn below
          the body so the body's stroke crisply cuts across the
          arrow's inner edge. */}
      {hasDir && (
        <path
          d="M 0 -15 L 6.5 -6.5 L -6.5 -6.5 Z"
          fill={fill}
          stroke={stroke}
          strokeWidth={1.5}
          strokeLinejoin="round"
          transform={`rotate(${facingDeg} 0 0)`}
        />
      )}

      {/* Inner pin body. Thick stroke for high contrast against
          map imagery of unknown brightness. */}
      <circle
        cx={0}
        cy={0}
        r={6.5}
        fill={fill}
        stroke={stroke}
        strokeWidth={2.5}
      />

      {/* Center dot — a small dark pip in the middle of the pin
          gives it depth and a precise visual anchor point, so the
          eye locks to "the center of this pin" instead of "the
          middle-ish of a blob". */}
      <circle cx={0} cy={0} r={1.8} fill={stroke} />
    </svg>
  );
}
