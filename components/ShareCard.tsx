"use client";

import type { Hero } from "@/lib/heroes";
import type { ModeSlug } from "@/lib/modes";
import { prettyDay } from "@/lib/daily";

// Three card layouts rendered offscreen for image capture:
//
//   • RoundShareCard — single-hero round result (Classic/Sound/Splash/
//     Ability). Splotlight passes an optional `skin` so skin variants
//     get a "{rarity} · {skin name}" line.
//   • QuoteShareCard — two-speaker variant for Quote mode. Pair of
//     portrait tiles with rarity-colored ring + names + outcome.
//   • DailyShareCard — end-of-day summary with one row per mode.
//
// (A "spoiler-free" variant lived here briefly with a modal toggle —
// removed once we decided per-round redaction wasn't valuable. The
// daily-card spoiler variant is a future addition.)
//
// Hierarchy intent: the OWdle wordmark + the mode label are the loudest
// elements on every card — that's the brand the share is meant to push.
// The hero name (or "Solved/Missed") plays second fiddle. Footer is a
// minimal URL stamp; we deliberately dropped the "DAILY OVERWATCH QUIZ"
// tagline that used to sit at the bottom — the wordmark + mode + URL
// already say what the card is.
//
// Sizing target: 1080×1080. Square plays well across iMessage, WhatsApp,
// Discord, and Twitter feeds. modern-screenshot upscales 2× for retina.

const CARD_SIZE = 1080;
const SITE = "playowdle.com";

// Per-mode display label. Tighter than MODES[].label since this is
// the hero of the top row, not a button.
const MODE_LABEL: Record<ModeSlug, string> = {
  classic: "Classic",
  quote: "Quote",
  splash: "Spotlight",
  sound: "Sound",
  ability: "Ability",
  map: "Map",
};

const FONT_DISPLAY =
  "var(--theme-font-display, 'Bricolage Grotesque'), system-ui, sans-serif";
const FONT_MONO =
  "var(--theme-font-mono, 'IBM Plex Mono'), ui-monospace, monospace";
const FONT_STRUCT =
  "var(--theme-font-structural, 'Saira Condensed'), system-ui, sans-serif";

export type RoundShareCardProps = {
  mode: ModeSlug;
  answer: Hero;
  guesses: number;
  outcome: "won" | "lost";
  // Spotlight-only: the specific skin if the answer was a skin variant
  // rather than the base hero. Adds a "{rarity} · {skin name}" line
  // under the hero name and shrinks the hero name to make room.
  skin?: { name: string; rarity: string } | null;
};

export function RoundShareCard({
  mode,
  answer,
  guesses,
  outcome,
  skin,
}: RoundShareCardProps) {
  const won = outcome === "won";
  const splash = answer.splash_url ?? answer.portrait;
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
      }}
    >
      {/* Splash backdrop — full-bleed character art, dimmed so brand +
          headline column stay legible regardless of hero color. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={splash}
        alt=""
        crossOrigin="anonymous"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center 22%",
          opacity: 0.45,
        }}
      />
      {/* Veil — stronger top + bottom darkening so the wordmark and URL
          stamp don't fight bright frames in the hero art. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(10,14,20,0.78) 0%, rgba(10,14,20,0.15) 28%, rgba(10,14,20,0.20) 60%, rgba(10,14,20,0.92) 100%)",
        }}
      />

      {/* Top brand row — OWdle wordmark anchors the left, mode label
          anchors the right. Both deliberately large so they read as the
          primary identity of the card, with the hero playing supporting
          role. */}
      <div
        style={{
          position: "absolute",
          top: 60,
          left: 56,
          right: 56,
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 24,
        }}
      >
        <BrandMark size={140} />
        <ModeBadge mode={mode} size={64} />
      </div>

      {/* Outcome accent stripe — green on win, red on loss. Echoes the
          live result card's color language. */}
      <div
        style={{
          position: "absolute",
          top: 470,
          left: 56,
          width: 88,
          height: 8,
          borderRadius: 4,
          background: won ? "#4ade80" : "#ef4444",
          boxShadow: won
            ? "0 0 24px rgba(74,222,128,0.55)"
            : "0 0 24px rgba(239,68,68,0.55)",
        }}
      />

      {/* Headline column — hero name and outcome verb. Hero name is the
          punch; outcome line sits under it. When a skin is present the
          hero name shrinks from 140 → 110 to make room for the skin
          line below it; the outcome line drops to 64 in tandem so the
          vertical stack still fits inside the bottom-padding zone. */}
      <div
        style={{
          position: "absolute",
          top: skin ? 470 : 506,
          left: 48,
          right: 48,
          display: "flex",
          flexDirection: "column",
          gap: skin ? 8 : 12,
        }}
      >
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: skin ? 110 : 140,
            fontWeight: 800,
            lineHeight: 0.94,
            color: "#f5efe6",
            letterSpacing: "-0.02em",
            textShadow: "0 6px 24px rgba(0,0,0,0.55)",
          }}
        >
          {answer.name}
        </div>
        {skin && (
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 18,
              fontFamily: FONT_DISPLAY,
              fontSize: 56,
              fontWeight: 600,
              color: "#f5efe6",
              textShadow: "0 4px 16px rgba(0,0,0,0.5)",
            }}
          >
            <span
              style={{
                fontFamily: FONT_MONO,
                fontSize: 26,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color:
                  skin.rarity === "legendary"
                    ? "#ffa466"
                    : skin.rarity === "mythic"
                      ? "#c084fc"
                      : "#2d9cdb",
              }}
            >
              {skin.rarity}
            </span>
            <span>{skin.name}</span>
          </div>
        )}
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: skin ? 64 : 80,
            fontWeight: 600,
            lineHeight: 1,
            color: won ? "#4ade80" : "#ef4444",
            letterSpacing: "-0.01em",
            marginTop: skin ? 6 : 0,
          }}
        >
          {won
            ? `in ${guesses} ${guesses === 1 ? "guess" : "guesses"}`
            : "Missed"}
        </div>
      </div>

      <UrlStamp slug={mode} />
    </div>
  );
}

export type QuoteShareCardProps = {
  speakerA: Hero;
  speakerB: Hero;
  guesses: number;
  outcome: "won" | "lost";
};

export function QuoteShareCard({
  speakerA,
  speakerB,
  guesses,
  outcome,
}: QuoteShareCardProps) {
  const won = outcome === "won";
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
      {/* Atmospheric backdrop — no full-bleed hero art for the quote
          layout. The portraits are the visual hook; the dark canvas
          lets them breathe like character portraits in an Overwatch
          select screen. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 70% 45% at 25% 20%, rgba(242,101,34,0.14), transparent 70%), radial-gradient(ellipse 60% 40% at 75% 80%, rgba(45,156,219,0.12), transparent 70%)",
        }}
      />

      {/* Top brand row */}
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 24,
        }}
      >
        <BrandMark size={140} />
        <ModeBadge mode="quote" size={64} />
      </div>

      {/* Portrait pair — face-on character icons, sized so they read at
          thumbnail size on social. Rounded squares match the live game's
          .result-card chrome. Spaced apart with a positive gap rather
          than overlapping, since the front tile's drop shadow used to
          cast a dark stripe across the back tile's edge. */}
      <div
        style={{
          position: "relative",
          marginTop: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 32,
        }}
      >
        <PortraitTile src={speakerA.portrait} ring="#f26522" />
        <PortraitTile src={speakerB.portrait} ring="#2d9cdb" />
      </div>

      {/* Outcome accent stripe */}
      <div
        style={{
          position: "relative",
          marginTop: 56,
          alignSelf: "flex-start",
          width: 96,
          height: 8,
          borderRadius: 4,
          background: won ? "#4ade80" : "#ef4444",
          boxShadow: won
            ? "0 0 24px rgba(74,222,128,0.55)"
            : "0 0 24px rgba(239,68,68,0.55)",
        }}
      />

      {/* Headline column — speaker pair name + outcome line. Names sit
          on one line ("A & B") since portraits already carry the visual
          identification; this is the verbal confirmation. */}
      <div
        style={{
          position: "relative",
          marginTop: 24,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 110,
            fontWeight: 800,
            lineHeight: 0.96,
            color: "#f5efe6",
            letterSpacing: "-0.02em",
            textShadow: "0 6px 24px rgba(0,0,0,0.55)",
          }}
        >
          {speakerA.name}{" "}
          <span style={{ color: "rgba(245,239,230,0.5)", fontWeight: 600 }}>
            &amp;
          </span>{" "}
          {speakerB.name}
        </div>
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 76,
            fontWeight: 600,
            lineHeight: 1,
            color: won ? "#4ade80" : "#ef4444",
            letterSpacing: "-0.01em",
          }}
        >
          {won
            ? `in ${guesses} ${guesses === 1 ? "guess" : "guesses"}`
            : "Missed"}
        </div>
      </div>

      <UrlStamp slug="quote" />
    </div>
  );
}

// Square hero portrait tile with a subtle colored ring so the two
// speakers read as a distinguishable pair even at small thumbnail size.
// Sized to match the brand row above — large enough to be the focal
// point, small enough to leave room for the speaker names below.
function PortraitTile({ src, ring }: { src: string; ring: string }) {
  return (
    <div
      style={{
        position: "relative",
        width: 340,
        height: 340,
        borderRadius: 24,
        padding: 4,
        background: `linear-gradient(135deg, ${ring} 0%, rgba(10,14,20,0.6) 100%)`,
        boxShadow: "0 12px 40px rgba(0,0,0,0.55)",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        crossOrigin="anonymous"
        style={{
          width: "100%",
          height: "100%",
          borderRadius: 20,
          objectFit: "cover",
          background: "#11161f",
        }}
      />
    </div>
  );
}

export type DailyModeResult = {
  slug: ModeSlug;
  outcome: "won" | "lost" | "pending";
  guesses: number;
};

export type DailyShareCardProps = {
  day: string;
  results: DailyModeResult[];
  // Hints + skips count across all built modes. Surfaced in the small
  // tally line under the headline number so viewers see at a glance
  // whether the day was a "clean" run or assisted. Optional (defaults
  // to 0) so callers that don't track these can omit.
  totalHints?: number;
  totalSkips?: number;
};

// DailyShareCard runs slightly smaller than the round / quote cards
// — the daily layout doesn't carry a full-bleed splash backdrop so a
// 1080×1080 canvas left visible whitespace below the modes grid. 960
// keeps the 1:1 ratio that social platforms prefer while tightening
// the overall composition.
const DAILY_CARD_SIZE = 960;

export function DailyShareCard({
  day,
  results,
  totalHints = 0,
  totalSkips = 0,
}: DailyShareCardProps) {
  const wonCount = results.filter((r) => r.outcome === "won").length;
  const lostCount = results.filter((r) => r.outcome === "lost").length;
  const totalGuesses = results.reduce((sum, r) => sum + r.guesses, 0);
  const sweep = wonCount === results.length;
  return (
    <div
      style={{
        width: DAILY_CARD_SIZE,
        height: DAILY_CARD_SIZE,
        position: "relative",
        background: "#0a0e14",
        color: "#f5efe6",
        fontFamily: FONT_STRUCT,
        overflow: "hidden",
        padding: 56,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 70% 40% at 0% 0%, rgba(242,101,34,0.14), transparent 70%), radial-gradient(ellipse 60% 35% at 100% 100%, rgba(45,156,219,0.12), transparent 70%)",
        }}
      />

      {/* Top brand row — OWdle wordmark anchors the left at full size,
          date sits in the top-right corner (alignItems: flex-start) so
          it tracks the padded edge instead of baseline-aligning with
          the wordmark and floating mid-row. */}
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 24,
        }}
      >
        <BrandMark size={140} />
        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 28,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "rgba(245,239,230,0.75)",
            whiteSpace: "nowrap",
          }}
        >
          {/* Drops the weekday (e.g. "Friday, ") so the date fits beside
              the OWdle wordmark without forcing a smaller font. Other
              surfaces (home page, in-game daily-complete card) still
              use the full prettyDay(). */}
          {formatShareDate(day)}
        </div>
      </div>

      {/* Hex badge + total-guesses row. Hex carries the {won}/{total}
          mode score (replacing the previous "Daily Swept" eyebrow). The
          total-guesses number sits directly under it, flanked by the
          modifier tallies: hints on the left, skips on the right when
          both apply; otherwise the single tally sits on the right beside
          the number. Missed count, when present, slots in alongside
          the hints. */}
      <div
        style={{
          position: "relative",
          marginTop: 24,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
        }}
      >
        <HexBadge wonCount={wonCount} total={results.length} sweep={sweep} />
        <ModifierTallyRow
          totalGuesses={totalGuesses}
          lostCount={lostCount}
          totalHints={totalHints}
          totalSkips={totalSkips}
        />
      </div>

      {/* Mode breakdown — 6-col grid so the bottom row of 2 chips can
          center under the top row of 3. Each chip spans 2 cols; the
          bottom row starts the leading chip at col 2 (and the trailing
          chip at col 4) which shifts both chips inward by 1 col width,
          landing them centered relative to the row above. */}
      <div
        style={{
          position: "relative",
          marginTop: 32,
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          gap: 14,
        }}
      >
        {results.map((r, i) => {
          const isPenultimate = i === results.length - 2;
          const isLast = i === results.length - 1;
          const isBottomRowStart =
            results.length % 3 === 2 && isPenultimate;
          const isBottomRowEnd = results.length % 3 === 2 && isLast;
          const cellStyle: React.CSSProperties = isBottomRowStart
            ? { gridColumn: "2 / span 2" }
            : isBottomRowEnd
              ? { gridColumn: "4 / span 2" }
              : { gridColumn: "span 2" };
          return (
            <div key={r.slug} style={cellStyle}>
              <ModeRow result={r} />
            </div>
          );
        })}
      </div>

      {/* URL stamp anchored to the bottom-right with a guaranteed gap
          below the last mode row so it never overlaps. `marginTop: auto`
          pushes it down without affecting the mode-row position. */}
      <div
        style={{
          position: "relative",
          marginTop: "auto",
          paddingTop: 36,
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
          }}
        >
          {SITE}
        </div>
      </div>
    </div>
  );
}

// Horizontal stat row anchored by the total-guesses number. Modifier
// tallies (hints / skips / missed) flank the number per the user's
// rule: single tally lives on the right (preferred slot); two tallies
// split with hints on the left + skips on the right. Missed slots in
// next to hints since both read as "the run wasn't clean".
function ModifierTallyRow({
  totalGuesses,
  lostCount,
  totalHints,
  totalSkips,
}: {
  totalGuesses: number;
  lostCount: number;
  totalHints: number;
  totalSkips: number;
}) {
  // Combine misses + hints into the "left-leaning" tally so we have at
  // most one chip on each side of the number.
  const leftLabel = (() => {
    const parts: string[] = [];
    if (lostCount > 0) parts.push(`${lostCount} missed`);
    if (totalHints > 0) {
      parts.push(`${totalHints} hint${totalHints === 1 ? "" : "s"}`);
    }
    return parts.length ? parts.join(" · ") : null;
  })();
  const rightLabel =
    totalSkips > 0
      ? `${totalSkips} skip${totalSkips === 1 ? "" : "s"}`
      : null;

  // When only one side has content, push it to the right (per user
  // preference). If neither side has content, the row is just the
  // number + "guesses" label.
  const hasLeft = leftLabel != null;
  const hasRight = rightLabel != null;
  const promoteLeftToRight = hasLeft && !hasRight;
  const finalLeft = promoteLeftToRight ? null : leftLabel;
  const finalRight = promoteLeftToRight ? leftLabel : rightLabel;

  const tallyStyle: React.CSSProperties = {
    fontFamily: FONT_MONO,
    fontSize: 24,
    letterSpacing: "0.10em",
    color: "rgba(245,239,230,0.65)",
    whiteSpace: "nowrap",
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "center",
        gap: 22,
      }}
    >
      {finalLeft && <span style={tallyStyle}>{finalLeft}</span>}
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <span
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 120,
            fontWeight: 800,
            lineHeight: 0.85,
            color: "#ffa466",
            letterSpacing: "-0.03em",
          }}
        >
          {totalGuesses}
        </span>
        <span
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 36,
            fontWeight: 500,
            color: "rgba(245,239,230,0.7)",
          }}
        >
          guess{totalGuesses === 1 ? "" : "es"}
        </span>
      </div>
      {finalRight && <span style={tallyStyle}>{finalRight}</span>}
    </div>
  );
}

function ModeRow({ result }: { result: DailyModeResult }) {
  const won = result.outcome === "won";
  const lost = result.outcome === "lost";
  const tone = won
    ? { bg: "rgba(74,222,128,0.12)", border: "rgba(74,222,128,0.4)", fg: "#4ade80" }
    : lost
      ? { bg: "rgba(239,68,68,0.10)", border: "rgba(239,68,68,0.35)", fg: "#ef4444" }
      : {
          bg: "rgba(177,169,157,0.06)",
          border: "rgba(177,169,157,0.18)",
          fg: "rgba(177,169,157,0.7)",
        };
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "13px 18px",
        borderRadius: 12,
        background: tone.bg,
        border: `1px solid ${tone.border}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <span
          aria-hidden
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 28,
            fontWeight: 700,
            color: tone.fg,
            lineHeight: 1,
          }}
        >
          {won ? "✓" : lost ? "✕" : "—"}
        </span>
        <span
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 32,
            fontWeight: 600,
            color: "#f5efe6",
            whiteSpace: "nowrap",
          }}
        >
          {MODE_LABEL[result.slug]}
        </span>
      </div>
      <span
        style={{
          fontFamily: FONT_MONO,
          fontSize: 24,
          letterSpacing: "0.06em",
          color: tone.fg,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {result.outcome === "pending" ? "—" : result.guesses}
      </span>
    </div>
  );
}

// Hexagonal completion badge — same polygon points + green palette as
// the home-page CompleteBadge, but flattened into a single SVG layer
// (no filter blur) so modern-screenshot rasterizes it cleanly. The
// `sweep` color shifts the stroke and content to green when the player
// cleared every mode; mixed days fall back to a warm amber so the
// badge still reads as "completed" without overclaiming a sweep.
function HexBadge({
  wonCount,
  total,
  sweep,
}: {
  wonCount: number;
  total: number;
  sweep: boolean;
}) {
  const tone = sweep
    ? {
        stroke: "#4ade80",
        innerStroke: "rgba(74,222,128,0.45)",
        fillFrom: "rgba(74,222,128,0.22)",
        fillTo: "rgba(74,222,128,0.05)",
        glow: "rgba(74,222,128,0.35)",
        text: "#4ade80",
      }
    : {
        stroke: "#ffa466",
        innerStroke: "rgba(255,164,102,0.45)",
        fillFrom: "rgba(255,164,102,0.18)",
        fillTo: "rgba(255,164,102,0.05)",
        glow: "rgba(255,164,102,0.30)",
        text: "#ffa466",
      };
  const WIDTH = 260;
  const HEIGHT = 298;
  return (
    <div
      style={{
        position: "relative",
        width: WIDTH,
        height: HEIGHT,
      }}
    >
      {/* Ambient glow halo behind the hex. Bloom-y radial wash that
          hugs the hex outline so the badge reads as energetic without
          a filter-blur dependency. */}
      <div
        style={{
          position: "absolute",
          inset: -36,
          background: `radial-gradient(ellipse at center, ${tone.glow}, transparent 65%)`,
        }}
      />
      <svg
        viewBox="0 0 220 252"
        width={WIDTH}
        height={HEIGHT}
        style={{ position: "absolute", inset: 0 }}
      >
        <defs>
          <linearGradient
            id="hex-badge-fill"
            x1="0%"
            y1="0%"
            x2="0%"
            y2="100%"
          >
            <stop offset="0%" stopColor={tone.fillFrom} />
            <stop offset="100%" stopColor={tone.fillTo} />
          </linearGradient>
        </defs>
        {/* main hex outline */}
        <polygon
          points="110,4 215,63 215,189 110,248 5,189 5,63"
          fill="url(#hex-badge-fill)"
          stroke={tone.stroke}
          strokeWidth="2"
        />
        {/* inner double-rim hairline */}
        <polygon
          points="110,16 203,68 203,184 110,236 17,184 17,68"
          fill="none"
          stroke={tone.innerStroke}
          strokeWidth="1.2"
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
        }}
      >
        {/* Checkmark glyph */}
        <svg
          width={56}
          height={56}
          viewBox="0 0 56 56"
          style={{ color: tone.text }}
        >
          <path
            d="M10 28 L24 42 L46 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="5"
            strokeLinecap="square"
            strokeLinejoin="miter"
          />
        </svg>
        <div
          style={{
            marginTop: 10,
            fontFamily: FONT_MONO,
            fontSize: 16,
            letterSpacing: "0.28em",
            textTransform: "uppercase",
            color: "#f5efe6",
          }}
        >
          Daily complete
        </div>
        <div
          style={{
            width: 40,
            height: 1,
            background: tone.innerStroke,
            marginTop: 10,
          }}
        />
        <div
          style={{
            marginTop: 10,
            display: "flex",
            alignItems: "baseline",
            fontFamily: FONT_DISPLAY,
            fontWeight: 800,
            lineHeight: 1,
            color: tone.text,
            letterSpacing: "-0.01em",
          }}
        >
          <span style={{ fontSize: 80 }}>{wonCount}</span>
          <span
            style={{
              fontSize: 56,
              color: "rgba(245,239,230,0.55)",
              margin: "0 4px",
            }}
          >
            /
          </span>
          <span style={{ fontSize: 80 }}>{total}</span>
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

function ModeBadge({ mode, size }: { mode: ModeSlug; size: number }) {
  return (
    <div
      style={{
        fontFamily: FONT_DISPLAY,
        fontSize: size,
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        color: "rgba(245,239,230,0.92)",
        textShadow: "0 4px 16px rgba(0,0,0,0.5)",
      }}
    >
      {MODE_LABEL[mode]}
    </div>
  );
}

// Single-line URL stamp on the bottom edge. Replaces the previous
// "DAILY OVERWATCH QUIZ" tagline + URL pair — the wordmark up top and
// the mode label already say what the card is.
function UrlStamp({ slug }: { slug: ModeSlug | null }) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 48,
        left: 56,
        right: 56,
        display: "flex",
        justifyContent: "flex-end",
        fontFamily: FONT_DISPLAY,
        fontSize: 36,
        fontWeight: 700,
        color: "#ffa466",
        textShadow: "0 4px 12px rgba(0,0,0,0.5)",
      }}
    >
      {slug ? `${SITE}/${slug}` : SITE}
    </div>
  );
}

// Share-image date format. Same locale-aware month/day/year as
// prettyDay() but without the weekday — keeps the date string short
// enough to sit beside the OWdle wordmark on the share card without
// wrapping or shrinking the wordmark.
function formatShareDate(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
