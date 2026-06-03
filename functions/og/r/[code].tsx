// GET /og/r/[code].png
//
// Renders the personalized daily-complete share image for the encoded
// results in the path. Uses workers-og (Satori on Cloudflare) so the
// route is dynamic per-link without a Node runtime. The output is the
// PNG that link unfurlers (Discord, iMessage, Twitter, Slack, etc.)
// fetch via the og:image meta tag set in functions/r/[code].ts.
//
// Render budget: ~150-300ms cold, sub-100ms warm (per workers-og
// benchmarks). Edge-cached 24h since the image is fully determined by
// the path — same encoded code always produces the same bytes.

import { ImageResponse, loadGoogleFont } from "workers-og";
import { decodeResults } from "../../../lib/shareUrl";

// Minimal handler shape — the runtime passes `params` keyed by the
// route's `[code]` segment. We don't depend on @cloudflare/workers-
// types here, matching the convention in functions/_lib/types.ts.
type Handler = (ctx: {
  request: Request;
  params: { code: string };
}) => Promise<Response>;

const CARD = 960;

// Mode display labels — kept inline so this function has no dependency
// on lib/modes.ts (which pulls in React-only code).
const MODE_LABEL: Record<string, string> = {
  classic: "Classic",
  quote: "Quote",
  splash: "Spotlight",
  sound: "Sound",
  ability: "Ability",
  map: "Map",
};

// Format YYYY-MM-DD → "MAY 29, 2026" — matches the share card's
// in-product date format.
function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${months[m - 1]} ${d}, ${y}`.toUpperCase();
}

export const onRequestGet: Handler = async ({ params }) => {
  const code = params.code;
  const decoded = decodeResults(code);
  if (!decoded) {
    return new Response("Invalid share code", { status: 400 });
  }

  const wonCount = decoded.results.filter((r) => r.outcome === "won").length;
  const lostCount = decoded.results.filter((r) => r.outcome === "lost").length;
  const totalGuesses = decoded.results.reduce((s, r) => s + r.guesses, 0);
  const sweep = wonCount === decoded.results.length;
  const dateLabel = formatDate(decoded.date);

  // Subset Google Fonts to just the characters we'll render. Includes
  // both casings + the special glyphs we draw inline (checkmark, ✕).
  // The lowercase/uppercase split matters because the OG uses literal
  // "DAILY COMPLETE", "MAY 29, 2026" strings — `textTransform:
  // uppercase` doesn't change which glyphs Satori asks for at load
  // time, so missing the caps yields tofu boxes.
  const fontText =
    "OWdleabcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ" +
    "0123456789 ,.:·-/&✓✕" +
    dateLabel +
    Object.values(MODE_LABEL).join("");

  const [bricolageBold, bricolageMedium, plexMono, sairaMedium] =
    await Promise.all([
      loadGoogleFont({ family: "Bricolage Grotesque", weight: 800, text: fontText }),
      loadGoogleFont({ family: "Bricolage Grotesque", weight: 500, text: fontText }),
      loadGoogleFont({ family: "IBM Plex Mono", weight: 500, text: fontText }),
      loadGoogleFont({ family: "Saira Condensed", weight: 500, text: fontText }),
    ]);

  // Tally chips that flank the total-guesses number. Hints + missed
  // condense to a single left-side label; skips lives on the right.
  // Mirrors ModifierTallyRow from components/ShareCard.tsx.
  const leftLabel = (() => {
    const parts: string[] = [];
    if (lostCount > 0) parts.push(`${lostCount} missed`);
    if (decoded.hints > 0)
      parts.push(`${decoded.hints} hint${decoded.hints === 1 ? "" : "s"}`);
    return parts.length ? parts.join(" · ") : null;
  })();
  const rightLabel =
    decoded.skips > 0
      ? `${decoded.skips} skip${decoded.skips === 1 ? "" : "s"}`
      : null;
  // Single-tally case: promote the left label to the right side per the
  // "preferred to the right" rule.
  const promoteLeftToRight = leftLabel != null && rightLabel == null;
  const finalLeft = promoteLeftToRight ? null : leftLabel;
  const finalRight = promoteLeftToRight ? leftLabel : rightLabel;

  // Hex badge tone: green on a sweep, warm amber otherwise.
  const tone = sweep
    ? {
        stroke: "#4ade80",
        innerStroke: "rgba(74,222,128,0.45)",
        fillFrom: "rgba(74,222,128,0.22)",
        fillTo: "rgba(74,222,128,0.05)",
        text: "#4ade80",
      }
    : {
        stroke: "#ffa466",
        innerStroke: "rgba(255,164,102,0.45)",
        fillFrom: "rgba(255,164,102,0.18)",
        fillTo: "rgba(255,164,102,0.05)",
        text: "#ffa466",
      };

  // Split results into top row of 3 + centered bottom row of 2. Same
  // visual rhythm as DailyShareCard's 6-col grid trick, but built with
  // flex since Satori doesn't support CSS grid.
  const topRow = decoded.results.slice(0, 3);
  const bottomRow = decoded.results.slice(3);

  return new ImageResponse(
    (
      <div
        style={{
          width: CARD,
          height: CARD,
          display: "flex",
          flexDirection: "column",
          background: "#0a0e14",
          color: "#f5efe6",
          fontFamily: "Saira Condensed",
          padding: 56,
          position: "relative",
        }}
      >
        {/* Atmospheric backdrop — paired radial washes mirroring the
            site's --bg-pattern token. */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            background:
              "radial-gradient(ellipse 70% 40% at 0% 0%, rgba(242,101,34,0.14), transparent 70%), radial-gradient(ellipse 60% 35% at 100% 100%, rgba(45,156,219,0.12), transparent 70%)",
          }}
        />

        {/* Top brand row — wordmark left, date pinned to top-right. */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              fontFamily: "Bricolage Grotesque",
              fontWeight: 800,
              fontSize: 140,
              lineHeight: 0.9,
              letterSpacing: "-0.02em",
            }}
          >
            <span style={{ color: "#f5efe6" }}>OW</span>
            <span style={{ color: "#f26522" }}>dle</span>
          </div>
          <div
            style={{
              display: "flex",
              fontFamily: "IBM Plex Mono",
              fontSize: 28,
              letterSpacing: "0.18em",
              color: "rgba(245,239,230,0.75)",
            }}
          >
            {dateLabel}
          </div>
        </div>

        {/* Hex badge — same polygon as the in-product HexBadge. SVG is
            inline; Satori rasterizes it cleanly without filter support. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginTop: 24,
            position: "relative",
          }}
        >
          <div style={{ display: "flex", width: 260, height: 298, position: "relative" }}>
            <svg
              viewBox="0 0 220 252"
              width={260}
              height={298}
              style={{ position: "absolute", top: 0, left: 0 }}
            >
              <defs>
                <linearGradient id="hex-fill" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor={tone.fillFrom} />
                  <stop offset="100%" stopColor={tone.fillTo} />
                </linearGradient>
              </defs>
              <polygon
                points="110,4 215,63 215,189 110,248 5,189 5,63"
                fill="url(#hex-fill)"
                stroke={tone.stroke}
                strokeWidth="2"
              />
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
                top: 0,
                left: 0,
                width: 260,
                height: 298,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width={56} height={56} viewBox="0 0 56 56">
                <path
                  d="M10 28 L24 42 L46 16"
                  fill="none"
                  stroke={tone.text}
                  strokeWidth="5"
                  strokeLinecap="square"
                  strokeLinejoin="miter"
                />
              </svg>
              <div
                style={{
                  display: "flex",
                  marginTop: 10,
                  fontFamily: "IBM Plex Mono",
                  fontSize: 16,
                  letterSpacing: "0.28em",
                  color: "#f5efe6",
                }}
              >
                DAILY COMPLETE
              </div>
              <div
                style={{
                  display: "flex",
                  width: 40,
                  height: 1,
                  background: tone.innerStroke,
                  marginTop: 10,
                }}
              />
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  marginTop: 10,
                  fontFamily: "Bricolage Grotesque",
                  fontWeight: 800,
                  color: tone.text,
                  letterSpacing: "-0.01em",
                }}
              >
                <span style={{ fontSize: 80 }}>{wonCount}</span>
                <span
                  style={{
                    fontSize: 56,
                    color: "rgba(245,239,230,0.55)",
                    marginLeft: 4,
                    marginRight: 4,
                  }}
                >
                  /
                </span>
                <span style={{ fontSize: 80 }}>{decoded.results.length}</span>
              </div>
            </div>
          </div>

          {/* Total guesses row — number flanked by modifier tally chips. */}
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "center",
              marginTop: 12,
            }}
          >
            {finalLeft && (
              <div
                style={{
                  display: "flex",
                  fontFamily: "IBM Plex Mono",
                  fontSize: 24,
                  letterSpacing: "0.10em",
                  color: "rgba(245,239,230,0.65)",
                  marginRight: 22,
                }}
              >
                {finalLeft}
              </div>
            )}
            <div style={{ display: "flex", alignItems: "baseline" }}>
              <span
                style={{
                  fontFamily: "Bricolage Grotesque",
                  fontWeight: 800,
                  fontSize: 120,
                  lineHeight: 0.85,
                  color: "#ffa466",
                  letterSpacing: "-0.03em",
                }}
              >
                {totalGuesses}
              </span>
              <span
                style={{
                  fontFamily: "Bricolage Grotesque",
                  fontWeight: 500,
                  fontSize: 36,
                  color: "rgba(245,239,230,0.7)",
                  marginLeft: 12,
                }}
              >
                guess{totalGuesses === 1 ? "" : "es"}
              </span>
            </div>
            {finalRight && (
              <div
                style={{
                  display: "flex",
                  fontFamily: "IBM Plex Mono",
                  fontSize: 24,
                  letterSpacing: "0.10em",
                  color: "rgba(245,239,230,0.65)",
                  marginLeft: 22,
                }}
              >
                {finalRight}
              </div>
            )}
          </div>
        </div>

        {/* Mode breakdown — top row of 3, bottom row of 2 centered.
            Flex is sufficient since each chip uses a fixed width keyed
            to the card's content area. The outer column needs an
            explicit full width so the inner rows can center within it. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 32,
            width: "100%",
          }}
        >
          <ModeRowFlex chips={topRow} />
          {bottomRow.length > 0 && (
            <div
              style={{
                display: "flex",
                marginTop: 14,
                width: "100%",
              }}
            >
              <ModeRowFlex chips={bottomRow} centered />
            </div>
          )}
        </div>

        {/* URL stamp bottom-right. */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginTop: "auto",
            paddingTop: 36,
          }}
        >
          <div
            style={{
              display: "flex",
              fontFamily: "Bricolage Grotesque",
              fontWeight: 800,
              fontSize: 36,
              color: "#ffa466",
              letterSpacing: "-0.01em",
            }}
          >
            playowdle.com
          </div>
        </div>
      </div>
    ),
    {
      width: CARD,
      height: CARD,
      fonts: [
        { name: "Bricolage Grotesque", data: bricolageBold, weight: 800 },
        { name: "Bricolage Grotesque", data: bricolageMedium, weight: 500 },
        { name: "IBM Plex Mono", data: plexMono, weight: 500 },
        { name: "Saira Condensed", data: sairaMedium, weight: 500 },
      ],
      headers: {
        // Aggressive edge cache — encoded code → image is deterministic.
        "cache-control": "public, max-age=86400, s-maxage=86400, immutable",
      },
    },
  );
};

// Renders a row of up to three mode chips. Each chip is fixed-width
// (the card's content area divided by three), so the bottom-row
// "centered" variant naturally sits under the gaps of the top row when
// the parent flex container centers its 2 chips.
function ModeRowFlex({
  chips,
  centered = false,
}: {
  chips: { slug: string; outcome: "won" | "lost"; guesses: number }[];
  centered?: boolean;
}) {
  // Content width: 960 - 2 * 56 (padding) = 848. Three chips + two
  // 14px gaps: chip width = (848 - 28) / 3 = ~273.
  const CHIP_WIDTH = 273;
  const GAP = 14;
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        justifyContent: centered ? "center" : "flex-start",
      }}
    >
      {chips.map((r, i) => (
        <div
          key={r.slug}
          style={{
            display: "flex",
            width: CHIP_WIDTH,
            marginLeft: i === 0 ? 0 : GAP,
          }}
        >
          <ModeChip result={r} />
        </div>
      ))}
    </div>
  );
}

function ModeChip({
  result,
}: {
  result: { slug: string; outcome: "won" | "lost"; guesses: number };
}) {
  const won = result.outcome === "won";
  const tone = won
    ? { bg: "rgba(74,222,128,0.12)", border: "rgba(74,222,128,0.4)", fg: "#4ade80" }
    : { bg: "rgba(239,68,68,0.10)", border: "rgba(239,68,68,0.35)", fg: "#ef4444" };
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "13px 18px",
        borderRadius: 12,
        background: tone.bg,
        border: `1px solid ${tone.border}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center" }}>
        {/* Icon as inline SVG, not text. Bricolage Grotesque doesn't
            ship ✓ / ✕ glyphs so the text path falls back to system
            fonts which Satori renders as bare letters (a V, an X). */}
        <div
          style={{
            display: "flex",
            width: 28,
            height: 28,
            alignItems: "center",
            justifyContent: "center",
            marginRight: 10,
          }}
        >
          <svg width={26} height={26} viewBox="0 0 26 26">
            {won ? (
              <path
                d="M5 14 L11 20 L22 7"
                fill="none"
                stroke={tone.fg}
                strokeWidth="3.4"
                strokeLinecap="square"
              />
            ) : (
              <path
                d="M6 6 L20 20 M20 6 L6 20"
                fill="none"
                stroke={tone.fg}
                strokeWidth="3"
                strokeLinecap="square"
              />
            )}
          </svg>
        </div>
        <span
          style={{
            display: "flex",
            fontFamily: "Bricolage Grotesque",
            fontWeight: 500,
            fontSize: 32,
            color: "#f5efe6",
          }}
        >
          {MODE_LABEL[result.slug] ?? result.slug}
        </span>
      </div>
      <span
        style={{
          display: "flex",
          fontFamily: "IBM Plex Mono",
          fontWeight: 500,
          fontSize: 24,
          color: tone.fg,
          letterSpacing: "0.06em",
        }}
      >
        {won ? result.guesses : "—"}
      </span>
    </div>
  );
}
