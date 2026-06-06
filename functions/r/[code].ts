// GET /r/[code]
//
// Lightweight HTML response that carries the OG meta tags pointing at
// the personalized share image (functions/og/r/[code].tsx). Link
// unfurlers (Discord, iMessage, Slack, Twitter/X, Facebook) fetch this
// HTML, read og:image, and render the personalized result card as
// their preview.
//
// Two code formats share the namespace (see lib/shareUrl.ts): daily
// codes unfurl the all-modes summary and send humans to the home page;
// round codes unfurl the single-mode spoiler-free card and send humans
// straight to that mode so they can play it. Both redirects carry the
// code as ?c= so the app can attribute the inbound visit (and later
// build a "beat their score" hook) without changing any URL already in
// the wild.
//
// Humans who actually click the link land here too — we send them on
// after the meta-refresh interval. That's a couple hundred ms longer
// than a 30x redirect, but a meta refresh keeps the OG meta tags in the
// same response so the unfurler doesn't follow the redirect to scrape
// OG from the destination. (Some unfurlers do follow 30x, some don't;
// meta refresh sidesteps the variance entirely.)
//
// The HTML is intentionally minimal — no scripts, no stylesheets,
// just the meta tags + a single anchor as a fallback for any client
// that disables meta refresh.

import { decodeResults, decodeRoundResult } from "../../lib/shareUrl";
import { captureServerEvent } from "../_lib/posthog";

type Handler = (ctx: {
  request: Request;
  params: { code: string };
  waitUntil(p: Promise<unknown>): void;
}) => Promise<Response>;

const SITE_ORIGIN = "https://playowdle.com";

// Mode display labels — inline so this function has no dependency on
// lib/modes.ts (which pulls in React-only code elsewhere in its graph).
const MODE_LABEL: Record<string, string> = {
  classic: "Classic",
  quote: "Quote",
  splash: "Spotlight",
  sound: "Sound",
  ability: "Ability",
  map: "Map",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&"
      ? "&amp;"
      : c === "<"
        ? "&lt;"
        : c === ">"
          ? "&gt;"
          : c === '"'
            ? "&quot;"
            : "&#39;",
  );
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${months[m - 1]} ${d}, ${y}`;
}

// Shared unfurl shell — same head for both code formats, parameterized
// on the text + destination.
function shareShellHtml(opts: {
  title: string;
  description: string;
  canonical: string;
  ogImageUrl: string;
  redirectUrl: string;
}): string {
  const { title, description, canonical, ogImageUrl, redirectUrl } = opts;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(title)}</title>
<link rel="canonical" href="${escapeHtml(canonical)}" />
<meta name="description" content="${escapeHtml(description)}" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:image" content="${escapeHtml(ogImageUrl)}" />
<meta property="og:image:width" content="960" />
<meta property="og:image:height" content="960" />
<meta property="og:url" content="${escapeHtml(canonical)}" />
<meta property="og:site_name" content="OWdle" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta name="twitter:image" content="${escapeHtml(ogImageUrl)}" />
<meta http-equiv="refresh" content="0;url=${escapeHtml(redirectUrl)}" />
<style>
body{background:#0a0e14;color:#f5efe6;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
a{color:#ffa466}
</style>
</head>
<body>
<a href="${escapeHtml(redirectUrl)}">Continue to OWdle →</a>
</body>
</html>`;
}

const SHELL_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  // Short cache: the page only has to be fresh long enough for the
  // unfurler to fetch it once. Unfurlers re-scrape often when links
  // are pasted in different contexts, so don't pin too long.
  "cache-control": "public, max-age=300, s-maxage=300",
} as const;

// Map a fetcher's User-Agent to the platform it unfurls for, or null
// for anything that looks like a human browser. Humans who click a
// share link land on the destination page and fire share_link_visited
// from JS — capturing them here too would double-count the visit half
// of the funnel, so only bot fetches report.
function unfurlPlatform(ua: string): string | null {
  const s = ua.toLowerCase();
  if (!s) return null;
  // Apple's link-preview fetcher (iMessage, Notes, Mail) presents BOTH
  // tokens appended to a Safari-ish UA — must match before the
  // individual twitter/facebook checks.
  if (s.includes("facebot twitterbot")) return "imessage";
  if (s.includes("discordbot")) return "discord";
  if (s.includes("slackbot") || s.includes("slack-imgproxy")) return "slack";
  if (s.includes("twitterbot")) return "twitter";
  if (s.includes("facebookexternalhit") || s.includes("facebot"))
    return "facebook";
  if (s.includes("telegrambot")) return "telegram";
  if (s.includes("whatsapp")) return "whatsapp";
  if (s.includes("linkedinbot")) return "linkedin";
  if (s.includes("redditbot")) return "reddit";
  // Teams and Skype share one preview fetcher.
  if (s.includes("skypeuripreview")) return "teams";
  if (s.includes("snapchat")) return "snapchat";
  // Search/AI crawlers hit /r/ URLs they find in the wild — real bot
  // traffic but NOT a person pasting a share link, so they get their
  // own bucket for dashboards to exclude. (Applebot is Siri/Spotlight
  // crawling, distinct from the iMessage preview UA above.)
  if (
    /googlebot|bingbot|duckduckbot|yandexbot|baiduspider|applebot|petalbot|gptbot|claudebot|perplexitybot|amazonbot|ccbot/.test(
      s,
    )
  )
    return "search_crawler";
  // Generic automation fallback: still a bot, origin unknown. Raw UA
  // ships as a prop so new platforms can be promoted to named buckets.
  if (/bot|crawler|spider|scrape|preview|embed|curl|wget|python|go-http|node-fetch|axios|httpclient/.test(s))
    return "other_bot";
  return null;
}

// Report a bot fetch of a valid share link to PostHog — the
// "link got pasted somewhere that unfurls" beat between share_clicked
// (client, sharer side) and share_link_visited (client, visitor side).
// shared_* prop names mirror share_link_visited so the three events
// read as one funnel. Localhost (wrangler pages dev / og-dev-server)
// logs instead of sending, same split as ogCacheControl's. Counts are
// directional: the 5-minute s-maxage above means an edge-cached repeat
// fetch of the same code never reaches this function, and platforms
// with their own embed caches (Discord) scrape once per URL anyway.
function captureUnfurl(opts: {
  request: Request;
  waitUntil: (p: Promise<unknown>) => void;
  code: string;
  codeType: "daily" | "round";
  sharedDate: string;
  sharedMode?: string;
  sharedOutcome?: "won" | "lost";
}): void {
  const ua = opts.request.headers.get("user-agent") ?? "";
  const platform = unfurlPlatform(ua);
  if (!platform) return;

  const host = new URL(opts.request.url).hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    console.log(
      `[unfurl] would capture share_link_unfurled: ${platform} ${opts.codeType} ${opts.code} (localhost — not sent)`,
    );
    return;
  }

  captureServerEvent({
    event: "share_link_unfurled",
    properties: {
      code: opts.code,
      code_type: opts.codeType,
      shared_date: opts.sharedDate,
      shared_mode: opts.sharedMode ?? null,
      shared_outcome: opts.sharedOutcome ?? null,
      platform,
      user_agent: ua,
    },
    waitUntil: opts.waitUntil,
  });
}

export const onRequestGet: Handler = async ({ params, request, waitUntil }) => {
  const code = params.code;
  const url = new URL(request.url);
  const origin = url.origin || SITE_ORIGIN;
  const ogImageUrl = `${origin}/og/r/${encodeURIComponent(code)}`;
  const canonical = `${origin}/r/${encodeURIComponent(code)}`;

  const daily = decodeResults(code);
  if (daily) {
    captureUnfurl({
      request,
      waitUntil,
      code,
      codeType: "daily",
      sharedDate: daily.date,
    });
    const wonCount = daily.results.filter((r) => r.outcome === "won").length;
    const total = daily.results.length;
    const totalGuesses = daily.results.reduce((s, r) => s + r.guesses, 0);
    const dateLabel = formatDate(daily.date);

    const title =
      wonCount === total
        ? `OWdle — swept all ${total} modes in ${totalGuesses} guesses`
        : `OWdle — ${wonCount}/${total} modes in ${totalGuesses} guesses`;
    const description = `OWdle daily for ${dateLabel}. Click to play today's puzzles.`;

    const html = shareShellHtml({
      title,
      description,
      canonical,
      ogImageUrl,
      redirectUrl: `${origin}/?c=${encodeURIComponent(code)}`,
    });
    return new Response(html, { headers: SHELL_HEADERS });
  }

  const round = decodeRoundResult(code);
  if (round) {
    captureUnfurl({
      request,
      waitUntil,
      code,
      codeType: "round",
      sharedDate: round.date,
      sharedMode: round.slug,
      sharedOutcome: round.outcome,
    });
    const label = MODE_LABEL[round.slug] ?? round.slug;
    const dateLabel = formatDate(round.date);
    const title =
      round.outcome === "won"
        ? `OWdle ${label} — solved in ${round.guesses} ${
            round.guesses === 1 ? "guess" : "guesses"
          }`
        : `OWdle ${label} — missed it`;
    const description = `OWdle ${label} for ${dateLabel}. ${
      round.outcome === "won" ? "Can you beat it?" : "Can you solve it?"
    } Click to play.`;

    const html = shareShellHtml({
      title,
      description,
      canonical,
      ogImageUrl,
      // Round links land the visitor ON that mode, ready to play. The
      // app's trailing-slash convention matters here — Pages serves the
      // exported /[mode]/index.html.
      redirectUrl: `${origin}/${round.slug}/?c=${encodeURIComponent(code)}`,
    });
    return new Response(html, { headers: SHELL_HEADERS });
  }

  return new Response("Not found", { status: 404 });
};
