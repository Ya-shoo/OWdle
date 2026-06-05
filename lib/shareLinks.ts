// Builds the pair of URLs a share surface needs: the canonical /r/[code]
// link that goes on the clipboard / into the OS share sheet, and the
// matching /og/r/[code] image the ShareModal shows as its preview.
//
// The share URL is absolute (SITE_URL) — it leaves the app and must work
// wherever it's pasted. The preview URL is RELATIVE in production (the
// modal fetches from the live origin, where Pages serves the OG worker)
// but absolute to the local wrangler instance in dev: `next dev` has no
// Pages Functions runtime, so scripts/og-dev-server.mjs runs them on
// :8799 (port kept in sync there) and the preview renders the real
// card instead of falling back.
//
// Kept separate from lib/shareUrl.ts so the encoder file stays free of
// app imports — Pages Functions bundle shareUrl.ts and must not drag in
// site/React modules.

import type { ModeSlug } from "./modes";
import { SITE_URL } from "./site";
import {
  encodeResults,
  encodeRoundResult,
} from "./shareUrl";

const OG_ORIGIN =
  process.env.NODE_ENV === "development" ? "http://localhost:8799" : "";

export type ShareLinks = {
  url: string;
  ogImageUrl: string;
};

function linksFor(code: string): ShareLinks {
  return {
    url: `${SITE_URL}/r/${code}/`,
    ogImageUrl: `${OG_ORIGIN}/og/r/${code}`,
  };
}

export function roundShareLinks(opts: {
  day: string;
  slug: ModeSlug;
  outcome: "won" | "lost";
  guesses: number;
  hints?: number;
  skips?: number;
}): ShareLinks {
  const { code } = encodeRoundResult(opts);
  return linksFor(code);
}

// The browser-facing src for an OG preview — used by BOTH the
// result-card prefetch and the modal <img>, so their cache keys line
// up exactly. In dev a static marker shifts the URL away from entries
// the browser cached before the og server answered no-store (an
// immutable cache hit never revalidates, so a header fix alone can't
// evict it).
export function ogPreviewSrc(ogImageUrl: string): string {
  if (!ogImageUrl || process.env.NODE_ENV !== "development") {
    return ogImageUrl;
  }
  return `${ogImageUrl}${ogImageUrl.includes("?") ? "&" : "?"}v=dev`;
}

// OG image URL for an already-encoded code — used by surfaces that
// reference a FIXED example card (the share announcement) rather than
// encoding live results.
export function ogImageUrlForCode(code: string): string {
  return `${OG_ORIGIN}/og/r/${code}`;
}

export function dailyShareLinks(opts: {
  day: string;
  results: { slug: ModeSlug; outcome: "won" | "lost"; guesses: number }[];
  hints: number;
  skips: number;
}): ShareLinks {
  const { code } = encodeResults(opts);
  return linksFor(code);
}
