// GET /api/stats/streaks
//
// Returns the current-streak distribution across players active in the
// trailing 30 days, reduced to three percentile cutoffs used by the
// StreakRankBadge to map a player's current streak to an Overwatch rank
// tier (Top 500 / Champion / Grandmaster).
//
// Pool: distinct_ids who fired `daily_completed` (site = 'owdle') in the
// last 30 days, each taken at their latest reported `streak_current`
// (argMax by timestamp). Ranked by that value. This is a ROLLING window,
// not a single Pacific puzzle day, so it lives apart from stats/today.ts.
//
//   cutoffs.top500      = streak at the 99th percentile (top-1% threshold)
//   cutoffs.champion    = 95th percentile (top 5%)
//   cutoffs.grandmaster = 90th percentile (top 10%)
//
// A player whose current streak ≥ a cutoff is within that band. The client
// additionally enforces an absolute floor per tier (lib/streakRank.ts), so
// a small or young pool can't mint cheap ranks.
//
// Caching: single module-scope entry, 1h TTL. The distribution moves
// slowly (≤ +1 streak-day per real day per player), so coarse caching is
// fine. Graceful-empty when PostHog secrets are unset — same pattern as
// stats/today.ts so local Pages dev and unconfigured previews keep working.

import type { Env, Handler } from "../../_lib/types";

type StreakCutoffs = { top500: number; champion: number; grandmaster: number };
type StreaksResponse = { n: number; cutoffs: StreakCutoffs | null };

// Minimum pool size before cutoffs are meaningful enough to surface.
// Mirrors MIN_STREAK_POOL in lib/streakRank.ts — keep the two in lockstep.
const MIN_POOL = 30;

type CacheEntry = { expiresAt: number; payload: StreaksResponse };
let CACHE: CacheEntry | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000;

export const onRequestGet: Handler = async ({ env }) => {
  const now = Date.now();
  if (CACHE && CACHE.expiresAt > now) {
    return ok(CACHE.payload);
  }

  // No PostHog secrets (local Pages dev, unconfigured preview) → empty
  // payload. The client treats null cutoffs as "hide the badge".
  if (!env.POSTHOG_PERSONAL_API_KEY || !env.POSTHOG_PROJECT_ID) {
    return ok(emptyPayload());
  }

  let payload: StreaksResponse;
  try {
    payload = await fetchFromPostHog(env);
  } catch (err) {
    // Supplementary UI — never 5xx the page. Log for Pages tail visibility.
    console.error("stats/streaks: posthog query failed", err);
    payload = emptyPayload();
  }

  CACHE = { expiresAt: now + CACHE_TTL_MS, payload };
  return ok(payload);
};

async function fetchFromPostHog(env: Env): Promise<StreaksResponse> {
  const host = env.POSTHOG_API_HOST ?? "https://us.posthog.com";
  const projectId = env.POSTHOG_PROJECT_ID!;
  const key = env.POSTHOG_PERSONAL_API_KEY!;
  const endpoint = `${host.replace(/\/$/, "")}/api/projects/${encodeURIComponent(projectId)}/query/`;

  // Per-player latest current streak over the trailing 30 days, then the
  // three percentile cutoffs over that per-player distribution. argMax
  // pins each player to their most recent streak_current reading, so a
  // player who lapsed shows their last (soon-stale) value rather than a
  // historical peak — fine, since lapsed players sit at the bottom anyway.
  const query = [
    "WITH per_user AS (",
    "  SELECT",
    "    distinct_id,",
    "    argMax(toFloat(properties.streak_current), timestamp) AS cur",
    "  FROM events",
    "  WHERE event = 'daily_completed'",
    "    AND properties.site = 'owdle'",
    "    AND timestamp > now() - INTERVAL 30 DAY",
    "  GROUP BY distinct_id",
    ")",
    "SELECT",
    "  count() AS n,",
    "  quantile(0.99)(cur) AS c_top500,",
    "  quantile(0.95)(cur) AS c_champion,",
    "  quantile(0.90)(cur) AS c_grandmaster",
    "FROM per_user",
  ].join("\n");

  const res = await hogql(endpoint, key, query);
  const row = (res.results ?? [])[0];
  if (!row) return emptyPayload();

  const n = Number(row[0]) || 0;
  // Below the floor we omit cutoffs so the client hides the badge.
  if (n < MIN_POOL) return { n, cutoffs: null };

  return {
    n,
    cutoffs: {
      top500: Number(row[1]) || 0,
      champion: Number(row[2]) || 0,
      grandmaster: Number(row[3]) || 0,
    },
  };
}

type HogQLResponse = { results?: unknown[][]; columns?: string[] };

async function hogql(
  endpoint: string,
  key: string,
  query: string,
): Promise<HogQLResponse> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HogQL ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as HogQLResponse;
}

function emptyPayload(): StreaksResponse {
  return { n: 0, cutoffs: null };
}

function ok(payload: StreaksResponse): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      // Edge-cache 1h; the streak distribution barely moves intraday.
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
  });
}
