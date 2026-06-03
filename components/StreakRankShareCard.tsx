"use client";

import {
  STREAK_TIER_ACCENT,
  STREAK_TIER_LABEL,
  STREAK_TIER_PERCENTILE_MAX,
  type StreakTier,
} from "@/lib/streakRank";

// Offscreen 1080×1080 card for sharing a streak rank. Mirrors ShareCard's
// visual language (dark canvas, OWdle wordmark, amber URL stamp) but the
// hero element is the Overwatch rank badge + streak count. Rendered
// offscreen by ShareButton / ShareModal and rasterized by modern-screenshot
// (which upscales 2× for retina). Same-origin /ranks/*.png so no
// crossOrigin needed — the splash cards set it only for R2-hosted art.

const CARD_SIZE = 1080;
const SITE = "playowdle.com";

const FONT_DISPLAY =
  "var(--theme-font-display, 'Bricolage Grotesque'), system-ui, sans-serif";
const FONT_MONO =
  "var(--theme-font-mono, 'IBM Plex Mono'), ui-monospace, monospace";
const FONT_STRUCT =
  "var(--theme-font-structural, 'Saira Condensed'), system-ui, sans-serif";

export type StreakRankShareCardProps = {
  tier: StreakTier;
  streak: number;
};

export function StreakRankShareCard({ tier, streak }: StreakRankShareCardProps) {
  const accent = STREAK_TIER_ACCENT[tier];
  return (
    <div
      style={{
        width: CARD_SIZE,
        height: CARD_SIZE,
        position: "relative",
        background: "#0a0e14",
        color: "#f5efe6",
        fontFamily: FONT_STRUCT,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        padding: 56,
      }}
    >
      {/* Tier-tinted radial wash behind the badge. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(circle at 50% 38%, ${hexA(accent, 0.07)} 0%, ${hexA(accent, 0.03)} 32%, transparent 58%)`,
        }}
      />

      {/* Top brand row — wordmark left, "Streak Rank" eyebrow right. */}
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 24,
        }}
      >
        <BrandMark size={120} />
        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 26,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "rgba(245,239,230,0.7)",
            whiteSpace: "nowrap",
            paddingTop: 16,
          }}
        >
          Streak Rank
        </div>
      </div>

      {/* Hero column — badge, tier label, "Streaker", streak count. */}
      <div
        style={{
          position: "relative",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
          marginTop: -16,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/ranks/${tier}.png`}
          alt=""
          width={360}
          height={360}
          style={{
            width: 360,
            height: 360,
            objectFit: "contain",
            filter: `drop-shadow(0 12px 38px ${hexA(accent, 0.26)})`,
          }}
        />
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 96,
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: "-0.02em",
            color: "#f5efe6",
            textShadow: "0 6px 24px rgba(0,0,0,0.55)",
            marginTop: 12,
          }}
        >
          {STREAK_TIER_LABEL[tier]}
        </div>
        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 30,
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            color: accent,
            marginTop: 8,
          }}
        >
          Streak Holder
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 20,
            marginTop: 32,
          }}
        >
          <FlameMark size={64} />
          <span
            style={{
              fontFamily: FONT_DISPLAY,
              fontSize: 150,
              fontWeight: 800,
              lineHeight: 0.85,
              color: "#ffa466",
              letterSpacing: "-0.03em",
            }}
          >
            {streak}
          </span>
          <span
            style={{
              fontFamily: FONT_DISPLAY,
              fontSize: 52,
              fontWeight: 500,
              color: "rgba(245,239,230,0.7)",
            }}
          >
            day{streak === 1 ? "" : "s"}
          </span>
        </div>

        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 27,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "rgba(245,239,230,0.62)",
            marginTop: 30,
          }}
        >
          Top {STREAK_TIER_PERCENTILE_MAX[tier]}% of streak holders
        </div>
      </div>

      {/* URL stamp, bottom-right. */}
      <div
        style={{
          position: "relative",
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 36,
            fontWeight: 700,
            color: "#ffa466",
            letterSpacing: "-0.01em",
            textShadow: "0 4px 12px rgba(0,0,0,0.5)",
          }}
        >
          {SITE}
        </div>
      </div>
    </div>
  );
}

function BrandMark({ size }: { size: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        fontFamily: FONT_DISPLAY,
        fontSize: size,
        fontWeight: 800,
        letterSpacing: "-0.02em",
        color: "#f5efe6",
        lineHeight: 0.9,
        textShadow: "0 4px 16px rgba(0,0,0,0.5)",
      }}
    >
      <span>OW</span>
      <span style={{ color: "#f26522" }}>dle</span>
    </div>
  );
}

// Fire glyph — same path + fill-red identity as StreakBadge's flame so the
// streak count reads consistently with the in-app badge.
function FlameMark({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="#ef4444">
      <path d="M13.5 1.5c0 3 1.5 4 3 6s2 4 2 6c0 4-3 7-6.5 7s-6.5-3-6.5-7c0-2 1-3.5 2-4.5 0 2 1 2.5 2 1.5 0-1.5 0-3 1-4.5 1-1.5 2-2.5 3-5z" />
    </svg>
  );
}

// "#rrggbb" + alpha → "rgba(...)" so gradient/shadow alphas can vary off
// the per-tier accent hex.
function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${a})`;
}
