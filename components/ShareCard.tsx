"use client";

import type { Hero } from "@/lib/heroes";
import type { ModeSlug } from "@/lib/modes";
import { media } from "@/lib/media";
import { heroFrameColors, heroPalette } from "@/lib/heroColors";

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
// Visual language (round + quote): "broadcast plates" — flat solid
// parallelograms sharing one -12° skew, hard-offset shadows with zero
// blur, full-strength art, condensed uppercase chips. Deliberately NO
// gradients, glows, or soft scrims anywhere on these two cards: the
// soft-wash-over-dimmed-art look is what made earlier versions read
// as machine-generated.
//
// Sizing: cards are COMPOSED in a fixed 1080² design space (so every
// measurement below stays a round number), then scaled by CARD_SCALE
// into the final captured box — 864² — via a transform wrapper. Square
// plays well across iMessage, WhatsApp, Discord, and Twitter feeds.
// modern-screenshot upscales 2× for retina on top of that.

const CARD_SIZE = 1080;
// 0.8 felt oversized in feeds too; trimmed a further 10% → 778² box.
const CARD_SCALE = 0.72;
export const ROUND_CARD_BOX = Math.round(CARD_SIZE * CARD_SCALE);
// Breathing room between the chip's rounded border and the captured box
// edge. Flush contact (chip exactly box-sized) had the border shaved to
// a sliver along the edge midpoints by box clipping/AA at fractional
// scale — corners curve away from the clip, so only the edges thinned.
const CHIP_INSET = 14;
const CHIP_SCALE = (ROUND_CARD_BOX - CHIP_INSET * 2) / CARD_SIZE;
const SITE = "playowdle.com";

// Per-mode display label. Tighter than MODES[].label since this is
// the hero of the top row, not a button.
const MODE_LABEL: Record<ModeSlug, string> = {
  classic: "Classic",
  quote: "Quote",
  splash: "Spotlight",
  sound: "Sound",
  ability: "Ability",
  melee: "Melee",
  map: "Map",
};

// Per-mode chip outline colors. The cards read as console-menu game
// chips (Wii/GameCube tile language: rounded corners + a thick solid
// frame). Round cards frame in the ANSWER HERO's signature color (see
// lib/heroColors.ts); this per-mode palette is the fallback for heroes
// missing from that map, and the Quote card's frame (two speakers — no
// single hero color to pick).
const CHIP_COLOR: Record<ModeSlug, string> = {
  classic: "#e23d3d", // crimson (Switch-red)
  quote: "#56b8e8", // sky blue (Wii)
  splash: "#a18df5", // lavender (Mario Kart frame)
  sound: "#c3d934", // chartreuse (GB pixel-yellow-green)
  ability: "#6e58d8", // indigo (GameCube)
  melee: "#f2843d", // orange (reserved for melee mode)
  map: "#3ecfbf", // teal (reserved for map mode)
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
  // REAL hero guesses only. Skips (Sound) and hints (Classic) are NOT
  // guesses — folding them in here overstated the player's misses
  // ("solved in 2" off a 1-skip 1-guess round). They arrive separately
  // below and render as their own tally chip beside the outcome chip.
  guesses: number;
  skips?: number;
  hints?: number;
  outcome: "won" | "lost";
  // Daily id ("YYYY-MM-DD") — stamped above the URL in the colophon so
  // a shared card is self-dating in the feed.
  day: string;
  // Spotlight-only: the specific skin if the answer was a skin variant
  // rather than the base hero. Adds a "{rarity} · {skin name}" eyebrow
  // over the hero name, and when `file` is present the card art swaps
  // to the skin render itself — the round was about THAT skin, so the
  // share should show it, not the base hero. Skin files live in R2
  // (unlike the git-tracked base splashes), hence the media() hop.
  skin?: { name: string; rarity: string; file?: string } | null;
  // Ability-only: the daily ability. Adds an icon-tile + ability-name
  // eyebrow over the hero name (icons are git-tracked white glyphs in
  // public/abilities — no media() needed).
  ability?: { name: string; icon: string } | null;
  // Sound-only: normalized clip peaks (0..1, WAVEFORM_BAR_COUNT bars).
  // When present, the card's art is the clip's waveform instead of the
  // hero splash — the waveform is what the player actually played with.
  waveform?: number[] | null;
};

export function RoundShareCard({
  mode,
  answer,
  guesses,
  skips = 0,
  hints = 0,
  outcome,
  day,
  skin,
  ability,
  waveform,
}: RoundShareCardProps) {
  const won = outcome === "won";
  const modifierParts: string[] = [];
  if (hints > 0) modifierParts.push(`${hints} hint${hints === 1 ? "" : "s"}`);
  if (skips > 0) modifierParts.push(`${skips} skip${skips === 1 ? "" : "s"}`);
  const modifier = modifierParts.length > 0 ? modifierParts.join(" · ") : null;
  // Skin art is the one cross-origin asset on these cards (R2 media
  // domain — base splashes/portraits/icons are git-served same-origin).
  // The game page displays the same skin file via a plain <img> (no
  // crossOrigin), which caches a non-CORS response; this card's
  // crossOrigin load then FAILS on that cache hit and the capture drops
  // the art. The stable ?share param keys the card's request separately
  // so it always gets a fresh CORS-approved response (R2 ignores the
  // query for object lookup).
  const splash = skin?.file
    ? `${media(skin.file)}?share`
    : (answer.splash_url ?? answer.portrait);
  // Skin and ability are mutually exclusive in practice (one per mode);
  // either one adds an eyebrow row, so either one earns the taller plate.
  const hasEyebrow = Boolean(skin || ability);
  const plateH = hasEyebrow ? PLATE_H_EYEBROW : PLATE_H;
  // Two of the hero's costume colors, day-seeded shuffle deciding which
  // lands outer vs inner (lib/heroColors.ts).
  const [frameOuter, frameInner] = heroFrameColors(
    answer.key,
    day,
    CHIP_COLOR[mode],
  );
  // Flat-art cards (waveform / ability glyph) have a solid dark canvas,
  // so a same-color bottom plate vanished into it — give the plate a
  // slightly lighter, warmer panel tone there. Splash cards keep the
  // deep dark: their plate already contrasts against the art above.
  const flatArt = Boolean(ability || (waveform && waveform.length > 0));
  const plateBg = flatArt ? "#1b1410" : "#0a0e14";
  return (
    <div
      style={{
        width: ROUND_CARD_BOX,
        height: ROUND_CARD_BOX,
        position: "relative",
      }}
    >
      <div
        style={{
          width: CARD_SIZE,
          height: CARD_SIZE,
          transform: `translate(${CHIP_INSET}px, ${CHIP_INSET}px) scale(${CHIP_SCALE})`,
          transformOrigin: "top left",
          position: "relative",
          background: "#0a0e14",
          color: "#f5efe6",
          fontFamily: FONT_STRUCT,
          overflow: "hidden",
          // Chip treatment: big rounded corners + a concentric frame in
          // the answer hero's costume palette (outer border = dominant
          // color; FrameRings draws the inner bands). Corners outside
          // the radius capture as transparent PNG (see captureNodePng),
          // so the card lands in feeds as a true chip.
          borderRadius: 112,
          border: `12px solid ${frameOuter}`,
        }}
      >
      {ability ? (
        /* Ability mode: the glyph IS the hero asset — the white icon
           sits directly on the dark canvas at poster scale. (An orange
           staging plate behind it proved unnecessary; the asset
           carries itself.) */
        <div
          style={{
            position: "absolute",
            top: 200,
            left: 0,
            right: 0,
            height: 470,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ability.icon}
            alt=""
            crossOrigin="anonymous"
            style={{ width: 560, height: 400, objectFit: "contain" }}
          />
        </div>
      ) : waveform && waveform.length > 0 ? (
        /* Sound mode: the clip's waveform IS the asset — the same bars
           the player guessed against, fully revealed in accent orange
           on the dark canvas. */
        <div
          style={{
            position: "absolute",
            top: 200,
            left: 0,
            right: 0,
            height: 470,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg viewBox="0 0 861 300" width={861} height={300} aria-hidden>
            {waveform.map((p, i) => {
              const ampl = Math.max(4, p * 146);
              return (
                <rect
                  key={i}
                  x={i * 9}
                  y={150 - ampl}
                  width={6}
                  height={ampl * 2}
                  rx={3}
                  fill="#f26522"
                />
              );
            })}
          </svg>
        </div>
      ) : (
        /* Splash backdrop at FULL strength — no dim, no scrim. The old
           45%-opacity art + overlay veil was the biggest "AI poster"
           tell; now the art carries the card and every line of text
           sits on a solid plate instead of floating over it. */
        // eslint-disable-next-line @next/next/no-img-element
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
            // Skin sources are raw 800² full-body wiki renders — the
            // base splashes went through smartcrop saliency, but these
            // didn't, so uncropped they read as a small distant figure.
            // Zoom toward the head/torso zone (the renders are framed
            // consistently enough for one fixed crop): shows roughly
            // head-to-waist in the art window above the plate.
            ...(skin?.file
              ? { transform: "scale(1.4)", transformOrigin: "50% 16%" }
              : null),
          }}
        />
      )}

      {/* Brand tag bleeds off the left edge, like a broadcast
          lower-third. The card's overflow:hidden trims the bleed flush
          with the edge. (The mode tag lives on the seam below.) */}
      <div
        style={{
          position: "absolute",
          top: 56,
          left: 0,
          display: "flex",
        }}
      >
        <BrandPlate />
      </div>

      {/* Bottom plate — solid panel with a rising diagonal top edge.
          The cut climbs left→right; an orange seam bar rides the edge. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: plateH,
          background: plateBg,
          clipPath: `polygon(0 ${PLATE_RISE}px, 100% 0, 100% 100%, 0 100%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: plateH - PLATE_RISE - 14,
          height: PLATE_RISE + 14,
          background: "#f26522",
          clipPath: `polygon(0 ${PLATE_RISE}px, 100% 0, 100% 14px, 0 ${
            PLATE_RISE + 14
          }px)`,
        }}
      />

      {/* Mode tag rides the RIGHT END of the diagonal seam — a tab on
          the divider rather than a floating corner element. Vertically
          centered on the seam line at the right edge (seam center sits
          plateH − 7 from the bottom; the tag is ~108 tall), straddling
          art above and plate below, and ROTATED to the seam's own slope
          so it travels along the line. Pivot at the right edge keeps
          the contact point pinned where tag meets seam. */}
      <div
        style={{
          position: "absolute",
          right: 0,
          bottom: plateH - 61,
          display: "flex",
          transform: `rotate(-${SEAM_ANGLE_DEG}deg)`,
          transformOrigin: "right center",
        }}
      >
        <ModePlate label={MODE_LABEL[mode]} />
      </div>

      {/* Result column on the plate: outcome chip → (optional skin
          eyebrow) → bottom row of hero name + date/URL stamp. The name
          and the stamp SHARE the bottom row (name left, stamp right,
          both bottom-aligned) — stacking the stamp under the name gave
          it a whole band to itself and hoisted the left column,
          stranding a dead lower-left corner. Name sizes step down by
          length so the longest roster names still clear the stamp. */}
      <div
        style={{
          position: "absolute",
          left: 56,
          right: 56,
          // Splits the plate's free air ~evenly above the chip and
          // below the bottom row (the row was hugging the card edge).
          bottom: 56,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <OutcomeChip won={won} guesses={guesses} />
          {modifier && <ModifierChip label={modifier} />}
        </div>
        {skin && (
          <div
            style={{
              marginTop: 18,
              display: "flex",
              alignItems: "baseline",
              gap: 18,
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
            <span
              style={{
                fontFamily: FONT_DISPLAY,
                fontSize: 44,
                fontWeight: 600,
                color: "#f5efe6",
              }}
            >
              {skin.name}
            </span>
          </div>
        )}
        {ability && (
          /* Name-only eyebrow — the glyph already stars as the card's
             main asset above, so repeating it in a small tile here
             would be redundant. */
          <div
            style={{
              marginTop: 18,
              fontFamily: FONT_DISPLAY,
              fontSize: 44,
              fontWeight: 600,
              color: "#f5efe6",
            }}
          >
            {ability.name}
          </div>
        )}
        <div
          style={{
            marginTop: hasEyebrow ? 14 : 18,
            width: "100%",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 28,
          }}
        >
          <div
            style={{
              fontFamily: FONT_DISPLAY,
              fontSize: roundNameSize(answer.name, hasEyebrow),
              fontWeight: 800,
              lineHeight: 0.9,
              letterSpacing: "-0.02em",
              whiteSpace: "nowrap",
              color: "#f5efe6",
            }}
          >
            {answer.name}
          </div>
          <StampBlock day={day} slug={mode} />
        </div>
      </div>

      {frameInner !== frameOuter && <FrameRings color={frameInner} />}
      </div>
    </div>
  );
}

// Inner frame ring — the second palette color at the SAME 12px weight
// as the outer border, hugging its inside. Implemented as a real border
// on a full-bleed overlay (NOT an inset box-shadow: modern-screenshot's
// SVG rasterization mangled inset shadows into giant half-fills in
// captured PNGs, while borders capture faithfully). The overlay paints
// inward over the content area — the card box doesn't grow — and sits
// as the LAST child so edge-bleeding plates tuck under the full bezel,
// matching how the outer border already clips them.
function FrameRings({ color }: { color: string }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        // Outer radius 112 minus the outer 12px border.
        borderRadius: 100,
        border: `12px solid ${color}`,
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Broadcast-plate primitives shared by the round + quote cards. One skew
// angle and one shadow treatment everywhere — the repetition is what makes
// the geometry read as a system instead of decoration. Shadows are hard
// offsets (zero blur): print-style, where a soft glow would read as AI.

const PLATE_SKEW = "skewX(-12deg)";
const PLATE_UNSKEW = "skewX(12deg)";
const HARD_SHADOW = "12px 14px 0 rgba(0, 0, 0, 0.45)";
const CHIP_SHADOW = "8px 10px 0 rgba(0, 0, 0, 0.45)";
// The two top tags (brand + mode) sit directly on the art — the full
// hard offset read too harsh there, so they get a tucked-in offset with
// a touch of blur. Chips and tiles on solid ground stay razor.
const TAG_SHADOW = "8px 10px 6px rgba(0, 0, 0, 0.4)";
// Bottom plate geometry for RoundShareCard: total height and how far the
// diagonal top edge rises from right (0) to left (PLATE_RISE). The plate
// grows when an eyebrow row (Spotlight skin / Ability icon+name) joins
// the stack so the outcome chip keeps clear air under the orange seam
// instead of crowding it. The date/URL stamp rides the name's own row,
// so it costs no plate height.
const PLATE_H = 384;
const PLATE_H_EYEBROW = 432;
const PLATE_RISE = 64;
// Seam slope in degrees — the diagonal's rise over the full card width.
// The mode tag rotates by this so it rides the line instead of crossing
// it horizontally.
const SEAM_ANGLE_DEG = (Math.atan2(PLATE_RISE, CARD_SIZE) * 180) / Math.PI;

// Solid dark tag carrying the wordmark. Bleeds off the card's left edge;
// the wordmark itself is counter-skewed upright (the brand never leans).
function BrandPlate() {
  return (
    <div
      style={{
        background: "#0a0e14",
        transform: PLATE_SKEW,
        boxShadow: TAG_SHADOW,
        borderBottom: "6px solid #f26522",
        padding: "20px 44px 16px 76px",
        marginLeft: -40,
      }}
    >
      <div
        style={{
          transform: PLATE_UNSKEW,
          display: "flex",
          alignItems: "baseline",
          fontFamily: FONT_DISPLAY,
          fontSize: 84,
          fontWeight: 800,
          letterSpacing: "-0.02em",
          lineHeight: 1,
          color: "#f5efe6",
        }}
      >
        <span>OW</span>
        <span style={{ color: "#f26522" }}>dle</span>
      </div>
    </div>
  );
}

// Solid orange tag carrying the card's label (mode name, or "Daily" on
// the summary card). Bleeds off the right edge. The label leans WITH
// the plate — oblique condensed caps are the Overwatch HUD voice; only
// the wordmark stays upright.
function ModePlate({ label }: { label: string }) {
  return (
    <div
      style={{
        background: "#f26522",
        transform: PLATE_SKEW,
        boxShadow: TAG_SHADOW,
        padding: "26px 76px 22px 44px",
        marginRight: -40,
      }}
    >
      <div
        style={{
          fontFamily: FONT_STRUCT,
          fontSize: 60,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          lineHeight: 1,
          color: "#0a0e14",
        }}
      >
        {label}
      </div>
    </div>
  );
}

// Flat win/loss chip — replaces the old glowing accent stripe + colored
// outcome text. Dark-on-green / light-on-red. A rounded Wii/Apple-style
// pill (the one element that doesn't lean): the plates carry the
// broadcast skew, the pill carries the verdict.
function OutcomeChip({ won, guesses }: { won: boolean; guesses: number }) {
  return (
    <div
      style={{
        background: won ? "#4ade80" : "#ef4444",
        borderRadius: 999,
        boxShadow: CHIP_SHADOW,
        // Explicit height + flex centering instead of padding: Saira's
        // baseline sits low in its line box and uppercase-only text has
        // nothing below the baseline, so padding-based centering rode
        // visibly low in the pill.
        height: 86,
        display: "flex",
        alignItems: "center",
        padding: "0 38px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 12,
          fontFamily: FONT_STRUCT,
          fontSize: 38,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          lineHeight: 1,
          color: won ? "#062712" : "#f5efe6",
          // Optical correction for the metric bias above — dial here if
          // the block still reads high/low.
          transform: "translateY(-7px)",
        }}
      >
        {won ? (
          <>
            <span>✓ Solved in</span>
            {/* The count is the brag — give the numeral its own size
                step so it leads the chip. Baseline alignment keeps it
                seated with the surrounding caps. */}
            <span style={{ fontSize: 64 }}>{guesses}</span>
            <span>{guesses === 1 ? "guess" : "guesses"}</span>
          </>
        ) : (
          <span>✕ Missed</span>
        )}
      </div>
    </div>
  );
}

// Honesty chip for non-guess turns spent: "1 skip" (Sound) / "2 hints"
// (Classic). Outlined amber rather than filled so it reads as a footnote
// to the outcome chip, not a second verdict. Pill-shaped to match.
function ModifierChip({ label }: { label: string }) {
  return (
    <div
      style={{
        background: "#0a0e14",
        border: "3px solid #ffa466",
        borderRadius: 999,
        boxShadow: CHIP_SHADOW,
        // Same explicit-height centering + optical nudge as OutcomeChip
        // (see the metric note there).
        height: 64,
        display: "flex",
        alignItems: "center",
        padding: "0 30px",
      }}
    >
      <div
        style={{
          fontFamily: FONT_STRUCT,
          fontSize: 38,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          lineHeight: 1,
          color: "#ffa466",
          transform: "translateY(-4px)",
        }}
      >
        {label}
      </div>
    </div>
  );
}

// Step the hero name down by length so the longest roster names hold a
// single line NEXT TO the date/URL stamp (they share the bottom row; the
// stamp's widest case is ~365px of "September 28, 2026"). No canvas text
// measurement in the offscreen capture path, so this is a coarse but
// sufficient ladder.
function roundNameSize(name: string, hasEyebrow: boolean): number {
  if (name.length <= 9) return hasEyebrow ? 100 : 120;
  if (name.length <= 12) return hasEyebrow ? 84 : 92;
  return hasEyebrow ? 76 : 84;
}

export type QuoteShareCardProps = {
  speakerA: Hero;
  speakerB: Hero;
  guesses: number;
  outcome: "won" | "lost";
  // Daily id ("YYYY-MM-DD") — stamped above the URL in the colophon.
  day: string;
};

export function QuoteShareCard({
  speakerA,
  speakerB,
  guesses,
  outcome,
  day,
}: QuoteShareCardProps) {
  const won = outcome === "won";
  // Two answer heroes → outer ring carries speaker A's dominant color,
  // inner ring speaker B's. Same costume logic as the round cards, and
  // it doubles as a read on the pair (orange-ring portrait = outer).
  const aColor = heroPalette(speakerA.key, CHIP_COLOR.quote)[0];
  const bColor = heroPalette(speakerB.key, CHIP_COLOR.quote)[0];
  return (
    <div
      style={{
        width: ROUND_CARD_BOX,
        height: ROUND_CARD_BOX,
        position: "relative",
      }}
    >
      <div
        style={{
          width: CARD_SIZE,
          height: CARD_SIZE,
          transform: `translate(${CHIP_INSET}px, ${CHIP_INSET}px) scale(${CHIP_SCALE})`,
          transformOrigin: "top left",
          position: "relative",
          background: "#0a0e14",
          color: "#f5efe6",
          fontFamily: FONT_STRUCT,
          overflow: "hidden",
          // Chip treatment — same frame language as the round cards.
          borderRadius: 112,
          border: `12px solid ${aColor}`,
        }}
      >
      {/* Giant flat quotation marks — typographic set dressing for
          Quote mode. Solid brand colors, no transparency games; they
          sit BEHIND the portrait tiles so the overlap reads as layered
          paper rather than a soft backdrop. */}
      <div
        style={{
          position: "absolute",
          top: 148,
          left: 40,
          fontFamily: FONT_DISPLAY,
          fontSize: 380,
          fontWeight: 800,
          lineHeight: 1,
          color: "#f26522",
        }}
      >
        &ldquo;
      </div>
      <div
        style={{
          position: "absolute",
          top: 430,
          right: 40,
          fontFamily: FONT_DISPLAY,
          fontSize: 380,
          fontWeight: 800,
          lineHeight: 1,
          color: "#2d9cdb",
        }}
      >
        &rdquo;
      </div>

      {/* Top plate row — same broadcast tags as the round card. */}
      <div
        style={{
          position: "absolute",
          top: 56,
          left: 0,
          right: 0,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
        }}
      >
        <BrandPlate />
        <ModePlate label={MODE_LABEL.quote} />
      </div>

      {/* Portrait pair — staggered heights give the card a diagonal
          flow; orange ring = speaker A, blue ring = speaker B, matching
          the tick colors on the name rows below. */}
      <div
        style={{
          position: "absolute",
          top: 286,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          gap: 48,
        }}
      >
        <PortraitTile src={speakerA.portrait} ring="#f26522" lift={-20} />
        <PortraitTile src={speakerB.portrait} ring="#2d9cdb" lift={36} />
      </div>

      {/* Speaker names — stacked rows, each keyed to its ring color by
          a skewed tick, then the shared outcome chip. */}
      <div
        style={{
          position: "absolute",
          left: 56,
          right: 56,
          bottom: 48,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 22,
        }}
      >
        <SpeakerRow name={speakerA.name} tint="#f26522" />
        <SpeakerRow name={speakerB.name} tint="#2d9cdb" />
        <div style={{ height: 6 }} />
        <OutcomeChip won={won} guesses={guesses} />
      </div>

      {/* Date + URL colophon pinned to the lower-right corner, clear of
          the left-anchored names/chip column. */}
      <div style={{ position: "absolute", right: 56, bottom: 48 }}>
        <StampBlock day={day} slug="quote" />
      </div>

      {bColor !== aColor && <FrameRings color={bColor} />}
      </div>
    </div>
  );
}

// Speaker name row: skewed solid tick (the speaker's ring color) + name.
// Stacking two rows beats the old single "A & B" line — no overflow risk
// on long pairs, and the color ticks tie names back to the portraits.
function SpeakerRow({ name, tint }: { name: string; tint: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
      <div
        style={{
          width: 20,
          height: 56,
          background: tint,
          transform: PLATE_SKEW,
        }}
      />
      <div
        style={{
          fontFamily: FONT_DISPLAY,
          fontSize: 84,
          fontWeight: 800,
          lineHeight: 1,
          letterSpacing: "-0.02em",
          whiteSpace: "nowrap",
          color: "#f5efe6",
        }}
      >
        {name}
      </div>
    </div>
  );
}

// Square hero portrait tile: near-sharp corners, a solid colored ring
// (no gradient fade), and a hard offset shadow — printed-sticker feel.
// `lift` staggers the pair vertically for diagonal flow.
function PortraitTile({
  src,
  ring,
  lift,
}: {
  src: string;
  ring: string;
  lift: number;
}) {
  return (
    <div
      style={{
        position: "relative",
        zIndex: 1,
        width: 360,
        height: 360,
        borderRadius: 4,
        border: `6px solid ${ring}`,
        background: "#11161f",
        boxShadow: HARD_SHADOW,
        transform: `translateY(${lift}px)`,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        crossOrigin="anonymous"
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          objectFit: "cover",
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

// DailyShareCard composes slightly smaller than the round / quote cards
// — the daily layout doesn't carry a full-bleed splash backdrop so a
// 1080×1080 canvas left visible whitespace below the modes grid. 960
// keeps the 1:1 ratio that social platforms prefer while tightening
// the overall composition. It ships in the SAME captured chip box as
// the round cards (scale wrapper below), so the family lands uniform
// in feeds.
const DAILY_CARD_SIZE = 960;
const DAILY_CHIP_SCALE = (ROUND_CARD_BOX - CHIP_INSET * 2) / DAILY_CARD_SIZE;

export function DailyShareCard({
  day,
  results,
  totalHints = 0,
  totalSkips = 0,
}: DailyShareCardProps) {
  const wonCount = results.filter((r) => r.outcome === "won").length;
  const totalGuesses = results.reduce((sum, r) => sum + r.guesses, 0);
  const sweep = wonCount === results.length;
  // Same honesty-tally language as the round cards' ModifierChip.
  // (Misses aren't tallied here — they're already visible twice over:
  // ✕ marks on the tiles and the won/total in the verdict pill.)
  const modifierParts: string[] = [];
  if (totalHints > 0) {
    modifierParts.push(`${totalHints} hint${totalHints === 1 ? "" : "s"}`);
  }
  if (totalSkips > 0) {
    modifierParts.push(`${totalSkips} skip${totalSkips === 1 ? "" : "s"}`);
  }
  const modifier = modifierParts.length > 0 ? modifierParts.join(" · ") : null;
  return (
    <div
      style={{
        width: ROUND_CARD_BOX,
        height: ROUND_CARD_BOX,
        position: "relative",
      }}
    >
      <div
        style={{
          width: DAILY_CARD_SIZE,
          height: DAILY_CARD_SIZE,
          transform: `translate(${CHIP_INSET}px, ${CHIP_INSET}px) scale(${DAILY_CHIP_SCALE})`,
          transformOrigin: "top left",
          position: "relative",
          background: "#0a0e14",
          color: "#f5efe6",
          fontFamily: FONT_STRUCT,
          overflow: "hidden",
          // Chip treatment to match the round cards — single brand-
          // orange frame (no hero to borrow a palette from here) and
          // the same visual corner radius (100 in 960-space ≈ the
          // rounds' 112 in 1080-space).
          borderRadius: 100,
          border: "12px solid #f26522",
        }}
      >
      {/* Top tag row — same broadcast tags as the round cards; the
          summary card announces itself as DAILY where a round card
          names its mode. */}
      <div
        style={{
          position: "absolute",
          top: 48,
          left: 0,
          right: 0,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
        }}
      >
        <BrandPlate />
        <ModePlate label="Daily" />
      </div>

      {/* Mode shelf — the day rendered as a collection of mode
          mini-chips, each framed in its mode's CHIP_COLOR: the daily
          card is literally the shelf the round chips sit on. 6-col grid
          so the bottom row of 2 tiles centers under the top row of 3
          (each tile spans 2 cols; a 2-tile bottom row starts at col 2 /
          col 4, shifting both inward by one column width). */}
      <div
        style={{
          position: "absolute",
          top: 212,
          left: 56,
          right: 56,
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          gap: 16,
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
              <ModeTile result={r} />
            </div>
          );
        })}
      </div>

      {/* Bottom zone — mirrors the round cards' plate hierarchy (chip
          row → big element → colophon right) without the diagonal:
          verdict pill + tallies, then the giant guess total sharing its
          row with the date/URL stamp. */}
      <div
        style={{
          position: "absolute",
          left: 56,
          right: 56,
          bottom: 52,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <DailyVerdictPill
            sweep={sweep}
            won={wonCount}
            total={results.length}
          />
          {modifier && <ModifierChip label={modifier} />}
        </div>
        <div
          style={{
            marginTop: 18,
            width: "100%",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 28,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
            <span
              style={{
                fontFamily: FONT_DISPLAY,
                fontSize: 124,
                fontWeight: 800,
                lineHeight: 0.9,
                letterSpacing: "-0.03em",
                color: "#ffa466",
              }}
            >
              {totalGuesses}
            </span>
            <span
              style={{
                fontFamily: FONT_DISPLAY,
                fontSize: 40,
                fontWeight: 500,
                color: "rgba(245,239,230,0.7)",
              }}
            >
              guess{totalGuesses === 1 ? "" : "es"}
            </span>
          </div>
          <StampBlock day={day} slug={null} />
        </div>
      </div>
      </div>
    </div>
  );
}

// Mode mini-chip for the daily shelf: rounded tile framed in the mode's
// CHIP_COLOR with the warm panel fill, carrying outcome mark, guess
// count, and mode name. A small hard shadow keeps the "chips on a
// shelf" read without competing with the card's own frame.
function ModeTile({ result }: { result: DailyModeResult }) {
  const won = result.outcome === "won";
  const lost = result.outcome === "lost";
  return (
    <div
      style={{
        background: "#1b1410",
        border: `5px solid ${CHIP_COLOR[result.slug]}`,
        borderRadius: 26,
        boxShadow: "6px 8px 0 rgba(0, 0, 0, 0.45)",
        padding: "20px 0 16px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
      }}
    >
      <div
        style={{
          fontFamily: FONT_STRUCT,
          fontSize: 30,
          fontWeight: 700,
          lineHeight: 1,
          color: won
            ? "#4ade80"
            : lost
              ? "#ef4444"
              : "rgba(245,239,230,0.5)",
        }}
      >
        {won ? "✓" : lost ? "✕" : "—"}
      </div>
      <div
        style={{
          fontFamily: FONT_DISPLAY,
          fontSize: 68,
          fontWeight: 800,
          lineHeight: 1,
          color: "#f5efe6",
        }}
      >
        {result.outcome === "pending" ? "—" : result.guesses}
      </div>
      <div
        style={{
          fontFamily: FONT_STRUCT,
          fontSize: 26,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          lineHeight: 1,
          color: "rgba(245,239,230,0.7)",
        }}
      >
        {MODE_LABEL[result.slug]}
      </div>
    </div>
  );
}

// Day verdict pill — the daily card's OutcomeChip analog. Sweep days go
// win-green with the ✓; mixed days go warm amber without it (completed,
// but not overclaiming a sweep — same signal the old hex badge used).
function DailyVerdictPill({
  sweep,
  won,
  total,
}: {
  sweep: boolean;
  won: number;
  total: number;
}) {
  return (
    <div
      style={{
        background: sweep ? "#4ade80" : "#ffa466",
        borderRadius: 999,
        boxShadow: CHIP_SHADOW,
        height: 86,
        display: "flex",
        alignItems: "center",
        padding: "0 38px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 12,
          fontFamily: FONT_STRUCT,
          fontSize: 38,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          lineHeight: 1,
          color: sweep ? "#062712" : "#2b1606",
          // Same optical correction as OutcomeChip (Saira metric bias).
          transform: "translateY(-7px)",
        }}
      >
        {sweep && <span>✓</span>}
        <span style={{ fontSize: 64 }}>
          {won}/{total}
        </span>
        <span>modes</span>
      </div>
    </div>
  );
}

// Date + URL colophon for the round/quote cards: muted mono datestamp
// over the amber URL, right-aligned as one block. Replaces the previous
// URL-only stamp — a shared card should date itself in the feed.
function StampBlock({
  day,
  slug,
}: {
  day: string;
  // null → bare site URL (the daily summary isn't mode-specific).
  slug: ModeSlug | null;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 6,
      }}
    >
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 26,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "rgba(245,239,230,0.85)",
        }}
      >
        {formatShareDate(day)}
      </div>
      <div
        style={{
          fontFamily: FONT_DISPLAY,
          fontSize: 30,
          fontWeight: 700,
          color: "#ffa466",
        }}
      >
        {slug ? `${SITE}/${slug}` : SITE}
      </div>
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
