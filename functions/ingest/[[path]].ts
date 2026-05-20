// Reverse proxy for PostHog. The browser SDK posts to /ingest/* on this
// origin instead of us.i.posthog.com, which is necessary because both
// uBlock Origin and Brave's default shields block the posthog.com domain
// outright — without this proxy we'd be silently dropping ~20-30% of
// events from privacy-conscious users.
//
// PostHog uses two upstream hosts in the US region:
//   /ingest/static/*  ->  us-assets.i.posthog.com  (array.js, recordings)
//   /ingest/*         ->  us.i.posthog.com         (event ingestion)
//
// Strip the /ingest prefix, route by path, and forward verbatim.

import type { Handler } from "../_lib/types";

const INGEST_HOST = "https://us.i.posthog.com";
const ASSETS_HOST = "https://us-assets.i.posthog.com";

export const onRequest: Handler = async ({ request }) => {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/ingest/, "") || "/";
  const upstream = path.startsWith("/static/") ? ASSETS_HOST : INGEST_HOST;
  const target = upstream + path + url.search;

  // Drop host so fetch sets it from `target`. cf-connecting-ip would
  // otherwise confuse upstream geo detection; PostHog will fall back to
  // the connecting socket which here is Cloudflare's edge — losing some
  // geo precision but keeping the ingest clean.
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("cf-connecting-ip");

  return fetch(target, {
    method: request.method,
    headers,
    body:
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : request.body,
    redirect: "manual",
  });
};
