import type { ModeSlug } from "@/lib/modes";

// Hand-drawn 24×24 stroke glyphs, one per mode — the site's mode
// iconography, used by the post-completion next-mode card and progress
// track. Stroke-only with currentColor so every surface tints them
// through text color, matching the structural line-art language of the
// rest of the chrome (hairlines, mono uppercase tags). Geometry borrows
// from Lucide (ISC) where a shape fit, then gets tuned by hand.
//
//   classic   3×3 attribute grid, answer tile filled
//   quote     two facing speech bubbles — two speakers, one dialogue
//   splash    crop viewfinder over a sliver of art (Spotlight)
//   sound     waveform bars, mirroring the mode's WaveformPlayer UI
//   ability   star
//   map       compass (unbuilt mode; future-proofs the set)
export function ModeGlyph({
  slug,
  className,
}: {
  slug: ModeSlug;
  className?: string;
}) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };
  switch (slug) {
    case "classic":
      // 3×3 Wordle-style attribute table; the filled center tile is the
      // matched answer cell. Filled cell is drawn larger so its visual
      // weight matches the stroked cells' outer edge.
      return (
        <svg {...common} strokeWidth={1.5}>
          <rect x="3" y="3" width="4.5" height="4.5" rx="0.75" />
          <rect x="9.75" y="3" width="4.5" height="4.5" rx="0.75" />
          <rect x="16.5" y="3" width="4.5" height="4.5" rx="0.75" />
          <rect x="3" y="9.75" width="4.5" height="4.5" rx="0.75" />
          <rect
            x="9"
            y="9"
            width="6"
            height="6"
            rx="1"
            fill="currentColor"
            stroke="none"
          />
          <rect x="16.5" y="9.75" width="4.5" height="4.5" rx="0.75" />
          <rect x="3" y="16.5" width="4.5" height="4.5" rx="0.75" />
          <rect x="9.75" y="16.5" width="4.5" height="4.5" rx="0.75" />
          <rect x="16.5" y="16.5" width="4.5" height="4.5" rx="0.75" />
        </svg>
      );
    case "quote":
      // Two bubbles facing each other — the pre-match dialogue between
      // two heroes the player has to attribute.
      return (
        <svg {...common}>
          <path d="M14 9a2 2 0 0 1-2 2H6l-4 4V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z" />
          <path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1" />
        </svg>
      );
    case "splash":
      // Viewfinder corner brackets cropping a sliver of art — the mode
      // shows a cropped detail that zooms out with each guess.
      return (
        <svg {...common}>
          <path d="M3 7V5a2 2 0 0 1 2-2h2" />
          <path d="M17 3h2a2 2 0 0 1 2 2v2" />
          <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
          <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
          <path d="M7 16l3.5-4.5 2.5 3 1.5-1.5L17 16" />
        </svg>
      );
    case "sound":
      // Waveform — the same visual the mode's own audio player draws.
      return (
        <svg {...common}>
          <path d="M2 10v4" />
          <path d="M6 7v10" />
          <path d="M10 3v18" />
          <path d="M14 8v8" />
          <path d="M18 5v14" />
          <path d="M22 10v4" />
        </svg>
      );
    case "ability":
      return (
        <svg {...common}>
          <path d="M12 2.5l2.94 5.95 6.56.95-4.75 4.63 1.12 6.54L12 17.5l-5.87 3.07 1.12-6.54-4.75-4.63 6.56-.95z" />
        </svg>
      );
    case "map":
      // Compass — GeoGuessr-for-Overwatch.
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M15.7 8.3l-1.9 5.5-5.5 1.9 1.9-5.5z" />
        </svg>
      );
  }
}
