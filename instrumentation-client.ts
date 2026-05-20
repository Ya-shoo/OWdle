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
    defaults: "2026-01-30",
  });
  posthog.register({ site: "owdle" });
}
