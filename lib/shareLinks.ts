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
// up exactly. In dev the marker is PER PAGE LOAD (module-scope Date
// read keeps the impure call out of render): Safari's in-session
// memory cache re-serves images on reload even when the og server
// answered no-store (WebKit quirk — no true hard-reload exists), which
// pinned previews from minutes-old renderer iterations while
// design-tweaking on Deadlockle. A fresh module evaluation → fresh
// query param → the cache can't match. Prefetch/modal parity holds
// because both read the same module constant within a page session.
const DEV_BUST =
  process.env.NODE_ENV === "development" ? Date.now().toString(36) : "";

export function ogPreviewSrc(ogImageUrl: string): string {
  if (!ogImageUrl || process.env.NODE_ENV !== "development") {
    return ogImageUrl;
  }
  return `${ogImageUrl}${ogImageUrl.includes("?") ? "&" : "?"}v=dev-${DEV_BUST}`;
}

// RETRY attempts get a distinct query param in EVERY environment, not
// just dev. WebKit pins a URL's FAILED image load in its in-session
// memory cache — a fresh <img> on the same URL replays the failure
// without touching the network, no-store notwithstanding. That made
// the whole retry ladder (prefetch + modal) a silent no-op on iOS:
// one cold-render 503 and every "retry" re-served the cached error,
// landing on "Preview unavailable" while desktop self-healed. The
// param is invisible server-side (the OG function keys its R2 store
// on the path code alone), so a busted retry renders identical bytes
// and persists under the canonical key. Attempt 0 stays on the
// canonical URL so the prefetch and the modal share one cache entry
// on the success path.
export function ogRetrySrc(ogImageUrl: string, attempt: number): string {
  const base = ogPreviewSrc(ogImageUrl);
  if (attempt <= 0) return base;
  return `${base}${base.includes("?") ? "&" : "?"}r=${attempt}`;
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
