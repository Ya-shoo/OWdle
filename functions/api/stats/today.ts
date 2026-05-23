// GET /api/stats/today?day=YYYY-MM-DD
//
// Returns aggregated player counts per (mode, outcome) for the requested
// Pacific puzzle day, plus daily-completion counts, a "starters" count
// (distinct_ids who fired mode_started for ≥ 2 distinct modes that day
// — denominator for the finish-rate stat in DailyStatsBand), and a set
// of composite cutoffs derived from today's all-5-modes finishers
// (used by DailyTierBadge to map a player's daily composite to an
// Overwatch rank tier).
// Source of truth is PostHog HogQL on the shared "DailyDles" project —
// filtered to `properties.site = 'owdle'` so Deadlockle's events don't
// leak into our numbers. Players are deduped by `distinct_id`, so a
// single user triggering `mode_completed` twice still counts as one.
//
// Caching: module-scope Map keyed by day, 5 min TTL. Pages Functions
// run isolated per region, so each region warms its own cache; that's
// fine — the data only needs to be approximately fresh.
//
// Graceful degradation: when POSTHOG_PERSONAL_API_KEY or
// POSTHOG_PROJECT_ID are unset, returns 200 with empty buckets so the
// client UI hides the percentage line cleanly instead of erroring.

import type { Env, Handler } from "../../_lib/types";

type Mode = "classic" | "quote" | "ability" | "splash" | "sound";
const MODES: Mode[] = ["classic", "quote", "ability", "splash", "sound"];

type ModeBucket = { won: number; lost: number; gaveUp: number; total: number };
type TierCutoffs = {
  top500: number;
  grandmaster: number;
  diamond: number;
  platinum: number;
  gold: number;
  silver: number;
};
type DailyBucket = {
  finishers: number;
  sweepers: number;
  // Distinct_ids who fired `mode_started` for ≥ 2 distinct modes today.
  // Denominator for the finish-rate stat: finishers / starters_ge2.
  // Filters out single-mode tourists (open Classic, bounce) so the
  // ratio reads "of players who committed to the daily set, what %
  // finished it" rather than including drive-by sampling.
  starters_ge2: number;
  // Composite-score quantiles across today's all-5-modes finishers.
  // Omitted when fewer than MIN_TIER_FINISHERS so the client hides
  // the tier badge under the noise threshold.
  tierCutoffs?: TierCutoffs;
};

// Minimum all-5-modes finishers before the tier cutoffs become
// meaningful enough to surface. Below this we omit tierCutoffs so the
// client hides the badge. 10 = one occupant per tier at the floor.
const MIN_TIER_FINISHERS = 10;

type StatsResponse = {
  day: string;
  modes: Record<Mode, ModeBucket>;
  daily: DailyBucket;
};

type CacheEntry = { expiresAt: number; payload: StatsResponse };
const CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export const onRequestGet: Handler = async ({ request, env }) => {
  const url = new URL(request.url);
  const day = url.searchParams.get("day") ?? "";
  if (!DAY_RE.test(day)) {
    return json({ error: "invalid_day" }, 400);
  }

  const cached = CACHE.get(day);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return ok(cached.payload);
  }

  // When secrets are missing (local Pages dev, unconfigured preview
  // deploys) we surface an empty payload rather than erroring. The
  // client treats empty buckets as "hide the % line" so the result
  // screens just look identical to pre-Phase-3 builds.
  if (!env.POSTHOG_PERSONAL_API_KEY || !env.POSTHOG_PROJECT_ID) {
    const payload = emptyPayload(day);
    return ok(payload);
  }

  let payload: StatsResponse;
  try {
    payload = await fetchFromPostHog(day, env);
  } catch (err) {
    // Don't surface 5xx — the UI is purely supplementary and shouldn't
    // break the page when PostHog is down. Log via console for tail
    // visibility on Workers Logs / Pages logs.
    console.error("stats/today: posthog query failed", err);
    payload = emptyPayload(day);
  }

  CACHE.set(day, { expiresAt: now + CACHE_TTL_MS, payload });
  return ok(payload);
};

async function fetchFromPostHog(
  day: string,
  env: Env,
): Promise<StatsResponse> {
  const host = env.POSTHOG_API_HOST ?? "https://us.posthog.com";
  const projectId = env.POSTHOG_PROJECT_ID!;
  const key = env.POSTHOG_PERSONAL_API_KEY!;
  const endpoint = `${host.replace(/\/$/, "")}/api/projects/${encodeURIComponent(projectId)}/query/`;

  const modeQuery = [
    "SELECT",
    "  properties.mode AS mode,",
    "  properties.outcome AS outcome,",
    "  count(DISTINCT distinct_id) AS cnt",
    "FROM events",
    "WHERE event = 'mode_completed'",
    `  AND properties.daily_id = '${day}'`,
    "  AND properties.site = 'owdle'",
    "GROUP BY mode, outcome",
  ].join("\n");

  const dailyQuery = [
    "SELECT",
    "  count(DISTINCT distinct_id) AS finishers,",
    "  count(DISTINCT if(properties.sweep = true, distinct_id, NULL)) AS sweepers",
    "FROM events",
    "WHERE event = 'daily_completed'",
    `  AND properties.daily_id = '${day}'`,
    "  AND properties.site = 'owdle'",
  ].join("\n");

  // Subquery groups by player, keeps only those with ≥ 2 distinct modes
  // started today, then the outer count yields the denominator for the
  // finish-rate stat. The intentional filter excludes single-mode
  // tourists so finishers/starters_ge2 reflects committed players only.
  const startersQuery = [
    "SELECT count() AS starters_ge2 FROM (",
    "  SELECT distinct_id",
    "  FROM events",
    "  WHERE event = 'mode_started'",
    `    AND properties.daily_id = '${day}'`,
    "    AND properties.site = 'owdle'",
    "  GROUP BY distinct_id",
    "  HAVING count(DISTINCT properties.mode) >= 2",
    ")",
  ].join("\n");

  // Per-finisher composite score = sum across mode_completed events of
  // (won ? (cap - total_guesses) / cap : 0). Only counts players who
  // finished all 5 built modes. Outer SELECT pulls the count and the
  // six quantile cutoffs the client uses to map its own composite to a
  // tier badge. Quantile bands track Yash's spec:
  //   top500 = top 1%, grandmaster = top 10%, diamond = top 30%,
  //   platinum = top 50%, gold = top 70%, silver = top 90%.
  // Below silver → Bronze (no cutoff needed for the catch-all).
  const tierQuery = [
    "WITH composites AS (",
    "  SELECT",
    "    distinct_id,",
    "    sum(",
    "      if(",
    "        properties.outcome = 'won',",
    "        (toFloat(properties.cap) - toFloat(properties.total_guesses)) / toFloat(properties.cap),",
    "        0",
    "      )",
    "    ) AS composite",
    "  FROM events",
    "  WHERE event = 'mode_completed'",
    `    AND properties.daily_id = '${day}'`,
    "    AND properties.site = 'owdle'",
    "  GROUP BY distinct_id",
    "  HAVING count(DISTINCT properties.mode) = 5",
    ")",
    "SELECT",
    "  count() AS n,",
    "  quantile(0.99)(composite) AS top500,",
    "  quantile(0.90)(composite) AS grandmaster,",
    "  quantile(0.70)(composite) AS diamond,",
    "  quantile(0.50)(composite) AS platinum,",
    "  quantile(0.30)(composite) AS gold,",
    "  quantile(0.10)(composite) AS silver",
    "FROM composites",
  ].join("\n");

  // Fire all four queries in parallel — HogQL latency dominates total
  // time, and they're independent.
  const [modeRes, dailyRes, startersRes, tierRes] = await Promise.all([
    hogql(endpoint, key, modeQuery),
    hogql(endpoint, key, dailyQuery),
    hogql(endpoint, key, startersQuery),
    hogql(endpoint, key, tierQuery),
  ]);

  const modes = emptyModes();
  for (const row of modeRes.results ?? []) {
    const mode = row[0];
    const outcome = row[1];
    const cnt = Number(row[2]) || 0;
    if (!isMode(mode)) continue;
    const bucket = modes[mode];
    if (outcome === "won") bucket.won += cnt;
    else if (outcome === "lost") bucket.lost += cnt;
    else if (outcome === "gaveUp") bucket.gaveUp += cnt;
    bucket.total = bucket.won + bucket.lost + bucket.gaveUp;
  }

  const dailyRow = (dailyRes.results ?? [])[0] ?? [0, 0];
  const startersRow = (startersRes.results ?? [])[0] ?? [0];
  const daily: DailyBucket = {
    finishers: Number(dailyRow[0]) || 0,
    sweepers: Number(dailyRow[1]) || 0,
    starters_ge2: Number(startersRow[0]) || 0,
  };

  // tierRow is [n, top500, gm, diamond, platinum, gold, silver]. Below
  // the floor we drop tierCutoffs entirely so the client hides the badge.
  const tierRow = (tierRes.results ?? [])[0];
  if (tierRow) {
    const n = Number(tierRow[0]) || 0;
    if (n >= MIN_TIER_FINISHERS) {
      daily.tierCutoffs = {
        top500: Number(tierRow[1]) || 0,
        grandmaster: Number(tierRow[2]) || 0,
        diamond: Number(tierRow[3]) || 0,
        platinum: Number(tierRow[4]) || 0,
        gold: Number(tierRow[5]) || 0,
        silver: Number(tierRow[6]) || 0,
      };
    }
  }

  return { day, modes, daily };
}

type HogQLResponse = {
  results?: unknown[][];
  columns?: string[];
};

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
    body: JSON.stringify({
      query: { kind: "HogQLQuery", query },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HogQL ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as HogQLResponse;
}

function isMode(v: unknown): v is Mode {
  return typeof v === "string" && (MODES as readonly string[]).includes(v);
}

function emptyModes(): Record<Mode, ModeBucket> {
  return {
    classic: { won: 0, lost: 0, gaveUp: 0, total: 0 },
    quote: { won: 0, lost: 0, gaveUp: 0, total: 0 },
    ability: { won: 0, lost: 0, gaveUp: 0, total: 0 },
    splash: { won: 0, lost: 0, gaveUp: 0, total: 0 },
    sound: { won: 0, lost: 0, gaveUp: 0, total: 0 },
  };
}

function emptyPayload(day: string): StatsResponse {
  return {
    day,
    modes: emptyModes(),
    daily: { finishers: 0, sweepers: 0, starters_ge2: 0 },
  };
}

function ok(payload: StatsResponse): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      // Edge cache for 5 min — matches our in-isolate TTL so even when
      // the isolate is cold the CDN serves the previous warm value.
      "Cache-Control": "public, max-age=60, s-maxage=300",
    },
  });
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
