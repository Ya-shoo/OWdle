// Next.js 16 convention: this file runs on the client before any app
// code, ideal for global analytics init. See
// node_modules/next/dist/docs/01-app/02-guides/analytics.md.
//
// `capture_pageview: 'history_change'` auto-fires $pageview on every
// App Router SPA navigation (pushState/replaceState) — no React route
// listener needed.
//
// Requests go through /ingest (functions/ingest/[[path]].ts) which
// reverse-proxies to us.i.posthog.com — bypasses ad-blockers that
// drop the posthog.com domain (uBlock, Brave default shields).
//
// `site=owdle` super-property is registered on every event so the
// shared dailydles project can split per-site dashboards.

import posthog from "posthog-js";

const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;

if (key && !key.startsWith("phc_REPLACE") && !posthog.__loaded) {
  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "/ingest",
    ui_host: "https://us.posthog.com",
    capture_pageview: "history_change",
    capture_pageleave: true,
    capture_exceptions: true,
    person_profiles: "identified_only",
    // Every event/snapshot is one Cloudflare Pages Function request via
    // /ingest, and the free plan caps at 100k/day. Two cuts keep us under it:
    //  - autocapture off: $autocapture (clicks/changes) was our #1 event by
    //    far (~16k/day) and pure noise — everything we care about has an
    //    explicit event in lib/tracking.ts. Also drops $rageclick/$dead_click.
    //  - session replay sampled to 15%: replay uploads many /s/ snapshot
    //    requests per recorded session. A client sampleRate (0..1) overrides
    //    the project's remote setting and takes precedence (posthog-js).
    autocapture: false,
    session_recording: { sampleRate: 0.15 },
    defaults: "2026-01-30",
  });
  posthog.register({ site: "owdle" });
}
