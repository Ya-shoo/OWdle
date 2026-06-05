// GET /og/r/[code].png
//
// Renders the personalized share image for the encoded results in the
// path — the daily-complete summary grid for daily codes, or a single
// mode's spoiler-free result card for round codes (see lib/shareUrl.ts
// for the two formats). Uses workers-og (Satori on Cloudflare) so the
// route is dynamic per-link without a Node runtime. The output is the
// PNG that link unfurlers (Discord, iMessage, Twitter, Slack, etc.)
// fetch via the og:image meta tag set in functions/r/[code].ts.
//
// All cards are SPOILER-FREE: no hero name, no skin or ability art, no
// speaker portraits. A link unfurl renders to everyone scrolling past,
// not just the person who chose to look — answer art would leak the
// day's puzzle into every chat it's posted in. The visual centerpiece
// is a per-mode Overwatch wiki spray instead.
//
// Render budget: ~150-300ms cold, sub-100ms warm (per workers-og
// benchmarks). Edge-cached 24h since the image is fully determined by
// the path — same encoded code always produces the same bytes.

import { ImageResponse, loadGoogleFont } from "workers-og";
import {
  decodeResults,
  decodeRoundResult,
  type DecodedRound,
} from "../../../lib/shareUrl";

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

// Cache policy. Prod: deterministic code → deterministic bytes, so
// cache hard and immutable. Local dev (wrangler on localhost):
// no-store — an immutable 24h entry in the browser cache makes
// card-design iteration invisible (the browser won't even revalidate;
// ShareModal additionally cache-busts its preview URL in dev to evict
// entries cached before this header existed).
function ogCacheControl(request: Request): string {
  const host = new URL(request.url).hostname;
  return host === "localhost" || host === "127.0.0.1"
    ? "no-store"
    : "public, max-age=86400, s-maxage=86400, immutable";
}

export const onRequestGet: Handler = async ({ params, request }) => {
  const code = params.code;
  const decoded = decodeResults(code);
  if (!decoded) {
    // Not a daily code — try the dash-free round format before bailing.
    const round = decodeRoundResult(code);
    if (round) return renderRoundOg(round, request);
    return new Response("Invalid share code", { status: 400 });
  }

  const wonCount = decoded.results.filter((r) => r.outcome === "won").length;
  const lostCount = decoded.results.filter((r) => r.outcome === "lost").length;
  const totalGuesses = decoded.results.reduce((s, r) => s + r.guesses, 0);
  const sweep = wonCount === decoded.results.length;
  // Numeric date — the spelled-out month moved aside so the top-right
  // corner could take the URL stamp (freeing the bottom for the spray).
  const [dy, dm, dd] = decoded.date.split("-").map(Number);
  const dateLabel = `${dm}/${dd}/${dy}`;

  // Subset Google Fonts to just the characters we'll render. Includes
  // both casings + the special glyphs we draw inline (checkmark, ✕).
  // The lowercase/uppercase split matters because the OG uses literal
  // "DAILY COMPLETE", "MAY 29, 2026" strings — `textTransform:
  // uppercase` doesn't change which glyphs Satori asks for at load
  // time, so missing the caps yields tofu boxes.
  const fontText =
    "OWdleabcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ" +
    // "—" is the lost-mode count glyph in ModeChip; it must sit BEFORE
    // the "&" (everything after an ampersand is silently dropped from
    // the text= subset request — see the round renderer's note).
    "0123456789 ,.:·-—/&✓✕" +
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

  // Centerpiece spray (chibi Venture at the museum glass — wiki spray,
  // shipped as a git-tracked static asset). Replaces the old hex badge;
  // when unreachable the card degrades to the verdict line alone.
  const spray = await loadImage(
    `${new URL(request.url).origin}/og-spray-daily.png`,
  );

  const res = new ImageResponse(
    (
      <div
        style={{
          width: CARD,
          height: CARD,
          display: "flex",
          flexDirection: "column",
          background: "#0a0e14",
          // Chip treatment — rounded corners with TRUE transparency
          // outside the radius (no parent fill; the PNG keeps alpha),
          // so the card floats on whatever the chat renders behind it.
          borderRadius: 100,
          overflow: "hidden",
          color: "#f5efe6",
          fontFamily: "Saira Condensed",
          padding: 56,
          position: "relative",
        }}
      >
        {/* Flat backdrop — the old radial washes read as a green cast
            in the bottom-right against the dark base; the spray carries
            the card's color now. */}

        {/* Top brand row — wordmark left; URL stamp + numeric date
            stacked top-right (the URL used to live bottom-right, ceded
            to the spray). */}
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
              flexDirection: "column",
              alignItems: "flex-end",
              gap: 8,
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
            <div
              style={{
                display: "flex",
                fontFamily: "IBM Plex Mono",
                fontSize: 26,
                letterSpacing: "0.18em",
                color: "rgba(245,239,230,0.75)",
              }}
            >
              {dateLabel}
            </div>
          </div>
        </div>

        {/* Spray centerpiece — replaces the old hex badge with actual
            game charm. Painted OUT OF FLOW behind the stats column so
            it can run big; the verdict line + guesses deliberately
            overlap its bottom edge (crate area) by design. */}
        {spray && (
          <div
            style={{
              position: "absolute",
              top: 170,
              left: 0,
              right: 0,
              display: "flex",
              justifyContent: "center",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt=""
              src={spray}
              width={560}
              height={560}
              style={{ width: 560, height: 560 }}
            />
          </div>
        )}

        {/* Stats column — overlaps the spray's base, sits above it in
            paint order. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginTop: 395,
            position: "relative",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
            }}
          >
            <svg
              width={40}
              height={40}
              viewBox="0 0 56 56"
              style={{ marginRight: 14 }}
            >
              <path
                d="M10 28 L24 42 L46 16"
                fill="none"
                stroke={tone.text}
                strokeWidth="6"
                strokeLinecap="square"
                strokeLinejoin="miter"
              />
            </svg>
            <div
              style={{
                display: "flex",
                fontFamily: "IBM Plex Mono",
                fontSize: 26,
                letterSpacing: "0.28em",
                color: "#f5efe6",
                marginRight: 18,
              }}
            >
              DAILY COMPLETE
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                fontFamily: "Bricolage Grotesque",
                fontWeight: 800,
                color: tone.text,
                letterSpacing: "-0.01em",
              }}
            >
              <span style={{ fontSize: 44 }}>{wonCount}</span>
              <span
                style={{
                  fontSize: 32,
                  color: "rgba(245,239,230,0.55)",
                  marginLeft: 3,
                  marginRight: 3,
                }}
              >
                /
              </span>
              <span style={{ fontSize: 44 }}>{decoded.results.length}</span>
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
                  fontSize: 30,
                  letterSpacing: "0.10em",
                  color: "rgba(245,239,230,0.78)",
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
                  fontSize: 30,
                  letterSpacing: "0.10em",
                  color: "rgba(245,239,230,0.78)",
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
            marginTop: 24,
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
              <ModeRowFlex chips={bottomRow} />
            </div>
          )}
        </div>

        {/* (URL stamp moved to the top-right column — the spray owns
            the bottom air now.) */}
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
    },
  );
  // workers-og APPENDS caller headers to its own cache defaults (the
  // names differ only by case), yielding a contradictory combo — so
  // set on the response instead of passing through options.
  res.headers.set("cache-control", ogCacheControl(request));
  // Public image; the share modal's spoiler-free Download fetches it
  // as a blob (cross-origin against the og-dev server).
  res.headers.set("access-control-allow-origin", "*");
  return res;
};

// Renders a centered row of up to three mode chips.
function ModeRowFlex({
  chips,
}: {
  chips: { slug: string; outcome: "won" | "lost"; guesses: number }[];
}) {
  // Content-hugging pills, every row centered — fixed-width chips left
  // a void between short mode names and their counts (the
  // space-between stretched it wider still).
  const GAP = 14;
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        justifyContent: "center",
      }}
    >
      {chips.map((r, i) => (
        <div
          key={r.slug}
          style={{
            display: "flex",
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
        alignItems: "center",
        padding: "13px 20px",
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
            <path
              d={won ? "M5 14 L11 20 L22 7" : "M6 6 L20 20 M20 6 L6 20"}
              fill="none"
              stroke={tone.fg}
              strokeWidth={won ? 3.4 : 3}
              strokeLinecap="square"
            />
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
          // A readable beat between name and count — the chip hugs its
          // content now instead of stretching them apart.
          marginLeft: 18,
        }}
      >
        {won ? result.guesses : "—"}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Round card — single-mode result, spray-centric and spoiler-free.
// Mirrors the daily card's design language: flat dark canvas, wordmark
// + URL/date header, a big wiki spray as the centerpiece, stats
// overlapping its base. One card per mode — the spoiler variant
// (answer art derived server-side) and the map-backdrop look were
// consolidated away in favor of this; an uppercased mode letter in a
// round code decodes to this same card.

// Per-mode sprays, shipped as git-tracked static assets so the worker
// fetches them same-origin in both prod and og-dev. 512² with alpha;
// the daily card's Venture spray lives beside them in public/.
const SPRAY_FILE: Record<string, string> = {
  classic: "/og-spray-classic.png", // D.Va Cardboard Crafter
  quote: "/og-spray-quote.png", // Sigma Diagnosis
  splash: "/og-spray-splash.png", // Zenyatta Bathmaster
  sound: "/og-spray-sound.png", // Lúcio-Oh's cereal
  ability: "/og-spray-ability.png", // Jetpack Cat among the flowers
};

// Asset → data-URI cache. Bounded defensively; the spray set is small
// and stable, so in practice it warms once per isolate.
const imageCache = new Map<string, string>();
const IMAGE_CACHE_MAX = 24;

async function loadImage(url: string): Promise<string | null> {
  const cached = imageCache.get(url);
  if (cached) return cached;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    let bin = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    const mime = /\.png(\?|$)/i.test(url) ? "image/png" : "image/jpeg";
    const dataUri = `data:${mime};base64,${btoa(bin)}`;
    if (imageCache.size >= IMAGE_CACHE_MAX) imageCache.clear();
    imageCache.set(url, dataUri);
    return dataUri;
  } catch {
    return null;
  }
}

async function renderRoundOg(
  round: DecodedRound,
  request: Request,
): Promise<Response> {
  const won = round.outcome === "won";
  const modeLabel = (MODE_LABEL[round.slug] ?? round.slug).toUpperCase();
  // Numeric date, matching the daily card's header.
  const [dy, dm, dd] = round.date.split("-").map(Number);
  const dateLabel = `${dm}/${dd}/${dy}`;
  // At most one of these is nonzero (hints = Classic, skips = Sound).
  const tally =
    round.hints > 0
      ? `${round.hints} hint${round.hints === 1 ? "" : "s"}`
      : round.skips > 0
        ? `${round.skips} skip${round.skips === 1 ? "" : "s"}`
        : null;
  const cta = won ? "Can you beat it?" : "Can you solve it?";

  const origin = new URL(request.url).origin;
  const spray = await loadImage(
    `${origin}${SPRAY_FILE[round.slug] ?? "/og-spray-daily.png"}`,
  );

  // NO "&" in this subset string: loadGoogleFont ships it as a raw
  // text= URL param, so an ampersand terminates the param and silently
  // drops every character after it (see the daily renderer's note).
  const fontText =
    "OWdleabcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ" +
    "0123456789 ,.:·-—/?" +
    dateLabel +
    modeLabel;

  const [bricolageBold, bricolageMedium, plexMono] = await Promise.all([
    loadGoogleFont({ family: "Bricolage Grotesque", weight: 800, text: fontText }),
    loadGoogleFont({ family: "Bricolage Grotesque", weight: 500, text: fontText }),
    loadGoogleFont({ family: "IBM Plex Mono", weight: 500, text: fontText }),
  ]);

  const res = new ImageResponse(
    (
      <div
        style={{
          width: CARD,
          height: CARD,
          display: "flex",
          flexDirection: "column",
          background: "#0a0e14",
          // Chip treatment — rounded corners with TRUE transparency
          // outside the radius (no parent fill; the PNG keeps alpha),
          // so the card floats on whatever the chat renders behind it.
          borderRadius: 100,
          overflow: "hidden",
          color: "#f5efe6",
          fontFamily: "IBM Plex Mono",
          padding: 56,
          position: "relative",
        }}
      >
        {/* Top brand row — identical header to the daily card:
            wordmark left, URL + numeric date stacked right. */}
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
              flexDirection: "column",
              alignItems: "flex-end",
              gap: 8,
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
            <div
              style={{
                display: "flex",
                fontFamily: "IBM Plex Mono",
                fontSize: 26,
                letterSpacing: "0.18em",
                color: "rgba(245,239,230,0.75)",
              }}
            >
              {dateLabel}
            </div>
          </div>
        </div>

        {/* Spray centerpiece — out of flow, big, with the stats band
            clipping its base for depth (same trick as the daily card). */}
        {spray && (
          <div
            style={{
              position: "absolute",
              top: 165,
              left: 0,
              right: 0,
              display: "flex",
              justifyContent: "center",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt=""
              src={spray}
              width={600}
              height={600}
              style={{ width: 600, height: 600 }}
            />
          </div>
        )}

        {/* Stats band — lower third over the spray's base. MODE big on
            the left (the at-a-glance read), guess count on the right.
            No backing fill: the old translucent panel read as a shadowy
            box wherever the spray crossed behind it. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 504,
            position: "relative",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: "100%",
            }}
          >
            {/* Verdict eyebrow. */}
            <div style={{ display: "flex", alignItems: "center" }}>
              <svg
                width={30}
                height={30}
                viewBox="0 0 56 56"
                style={{ marginRight: 12 }}
              >
                <path
                  d={
                    won ? "M10 28 L24 42 L46 16" : "M14 14 L42 42 M42 14 L14 42"
                  }
                  fill="none"
                  stroke={won ? "#4ade80" : "#ef4444"}
                  strokeWidth="7"
                  strokeLinecap="square"
                  strokeLinejoin="miter"
                />
              </svg>
              <div
                style={{
                  display: "flex",
                  fontFamily: "IBM Plex Mono",
                  fontSize: 26,
                  letterSpacing: "0.28em",
                  color: won ? "#4ade80" : "#ef4444",
                }}
              >
                {won ? "SOLVED" : "MISSED"}
              </div>
            </div>

            {/* Headline row — mode name and count share the line,
                bottom-aligned. Label stays vertically centered on the
                numeral. */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "space-between",
                width: "100%",
                marginTop: 10,
              }}
            >
              <div
                style={{
                  display: "flex",
                  fontFamily: "Bricolage Grotesque",
                  fontWeight: 800,
                  fontSize: 84,
                  lineHeight: 0.9,
                  letterSpacing: "-0.02em",
                  color: "#f5efe6",
                }}
              >
                {modeLabel}
              </div>
              {won && (
                <div style={{ display: "flex", alignItems: "center" }}>
                  <span
                    style={{
                      fontFamily: "Bricolage Grotesque",
                      fontWeight: 800,
                      fontSize: 110,
                      lineHeight: 0.85,
                      color: "#ffa466",
                      letterSpacing: "-0.03em",
                    }}
                  >
                    {round.guesses}
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
                    guess{round.guesses === 1 ? "" : "es"}
                  </span>
                </div>
              )}
            </div>

            {/* Tally — tucked right under the count, right-aligned,
                info blue so it reads as the count's footnote. */}
            {tally && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  width: "100%",
                  marginTop: 6,
                  fontFamily: "IBM Plex Mono",
                  fontSize: 26,
                  letterSpacing: "0.2em",
                  color: "#2d9cdb",
                }}
              >
                {tally.toUpperCase()}
              </div>
            )}
          </div>

          {/* CTA — the round card's growth hook. paddingLeft offsets
              the trailing letter-spacing unit so the glyph run centers
              optically (tracked text otherwise sits ~6px left). */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              // The tally row already pads the band's bottom when
              // present; without one the CTA needs its own clearance
              // from the mode name.
              marginTop: tally ? 12 : 34,
              paddingLeft: 6,
              fontFamily: "IBM Plex Mono",
              fontSize: 26,
              letterSpacing: "0.24em",
              color: "#ffa466",
            }}
          >
            {cta.toUpperCase()}
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
      ],
    },
  );
  res.headers.set("cache-control", ogCacheControl(request));
  res.headers.set("access-control-allow-origin", "*");
  return res;
}
