// GET /api/stats/lifetime
//
// All-time count of completed rounds across every OWdle mode, for the
// homepage "OWdle has been played N times" counter, plus a per-second rate
// so the client can tick the number up smoothly between polls.
//
// The number is a FLOOR: PostHog analytics started 2026-05-22 and dropped
// events during the July free-tier cap, so the true figure is higher. That's
// fine for a "played N times so far" flourish — we never overstate it.
//
// Cost control: we do NOT re-scan all history per request. A baked baseline
// (measured once via PostHog) covers everything up to BASELINE_AS_OF_EPOCH;
// each request only counts the bounded, recent delta since then. That keeps
// the scan cheap AND synchronous — an unbounded full-history count can trip
// PostHog's async execution and come back with no `results` array (the same
// footgun documented in functions/api/stats/today.ts). Accuracy holds even
// if the baseline is never refreshed (total is always baseline + everything
// since); re-baking BASELINE_TOTAL/BASELINE_AS_OF_EPOCH together just keeps
// the delta window small. Cached 60s in-isolate + 5min at the edge.

import type { Env, Handler } from "../../_lib/types";

// Measured 2026-07-27 via PostHog: count(mode_completed, site='owdle') as of
// BASELINE_AS_OF_EPOCH (Unix seconds — timezone-agnostic on purpose).
const BASELINE_TOTAL = 98201;
const BASELINE_AS_OF_EPOCH = 1785199075;
// Last-24h count at baseline time (2861) / 86400s — the fallback tick rate
// used when the live query is unavailable, so the counter still climbs.
const FALLBACK_RATE_PER_SEC = 2861 / 86400;

type LifetimeResponse = {
  total: number;
  ratePerSec: number;
  asOf: number; // server epoch ms when total was computed (debug/reference)
};

let CACHE: { expiresAt: number; payload: LifetimeResponse } | null = null;
const CACHE_TTL_MS = 60 * 1000;

export const onRequestGet: Handler = async ({ env }) => {
  const now = Date.now();
  if (CACHE && CACHE.expiresAt > now) return ok(CACHE.payload);

  // Fallback keeps the badge alive (baseline + a plausible rate) if secrets
  // are missing or PostHog is down.
  let payload: LifetimeResponse = {
    total: BASELINE_TOTAL,
    ratePerSec: FALLBACK_RATE_PER_SEC,
    asOf: now,
  };

  if (env.POSTHOG_PERSONAL_API_KEY && env.POSTHOG_PROJECT_ID) {
    try {
      payload = await fetchLifetime(env, now);
    } catch (err) {
      console.error("stats/lifetime: posthog query failed", err);
      // keep the baseline fallback
    }
  }

  CACHE = { expiresAt: now + CACHE_TTL_MS, payload };
  return ok(payload);
};

async function fetchLifetime(
  env: Env,
  nowMs: number,
): Promise<LifetimeResponse> {
  const host = (env.POSTHOG_API_HOST ?? "https://us.posthog.com").replace(
    /\/$/,
    "",
  );
  const endpoint = `${host}/api/projects/${encodeURIComponent(
    env.POSTHOG_PROJECT_ID!,
  )}/query/`;
  // Bounded to events since the baked baseline -> cheap and synchronous. The
  // `count()` is the delta; `last24h` gives the current tick rate.
  const query = [
    "SELECT",
    "  count() AS delta,",
    "  countIf(timestamp > now() - INTERVAL 1 HOUR) AS last1h,",
    "  countIf(timestamp > now() - INTERVAL 24 HOUR) AS last24h",
    "FROM events",
    "WHERE properties.site = 'owdle'",
    "  AND event = 'mode_completed'",
    `  AND timestamp > fromUnixTimestamp(${BASELINE_AS_OF_EPOCH})`,
  ].join("\n");

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.POSTHOG_PERSONAL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HogQL ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as { results?: unknown[][] };
  const row = data.results?.[0] ?? [];
  const delta = Number(row[0]) || 0;
  const last1h = Number(row[1]) || 0;
  const last24h = Number(row[2]) || 0;
  // Prefer the last hour so the counter reflects the CURRENT pace (livelier
  // when people are actually on the site), but floor it at half the 24h
  // average so a dead overnight hour doesn't freeze it completely.
  const rate1h = last1h / 3600;
  const rate24h = last24h / 86400;
  const ratePerSec = Math.max(rate1h, rate24h * 0.5) || FALLBACK_RATE_PER_SEC;
  return {
    total: BASELINE_TOTAL + delta,
    ratePerSec,
    asOf: nowMs,
  };
}

function ok(payload: LifetimeResponse): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=60, s-maxage=300",
    },
  });
}
