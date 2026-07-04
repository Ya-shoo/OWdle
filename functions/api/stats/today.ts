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

// Per-mode buckets cover canonical + bonus (Melee) so each mode's own
// solve rate is measurable via ModeStatsLine. This is SEPARATE from the
// tier/rank distribution below, which is canonical-only (CANONICAL_MODES)
// — adding Melee to buckets is safe; the rank allowlist keeps bonus plays
// out of the daily total and the distinct-mode count.
type Mode = "classic" | "quote" | "ability" | "splash" | "sound" | "melee";
const MODES: Mode[] = [
  "classic",
  "quote",
  "ability",
  "splash",
  "sound",
  "melee",
];

// The canonical daily set (mirrors BUILT_MODE_SLUGS in lib/modes.ts). The
// tier distribution and finish-rate denominator filter to these so bonus
// modes like Melee can never enter the daily rank or the "committed to the
// daily" starter count. Pre-quoted for direct HogQL interpolation.
const CANONICAL_MODES_SQL = "'classic','quote','ability','splash','sound'";

type ModeBucket = { won: number; lost: number; gaveUp: number; total: number };
type DailyBucket = {
  finishers: number;
  sweepers: number;
  // Distinct_ids who fired `mode_started` for ≥ 2 distinct modes today.
  // Denominator for the finish-rate stat: finishers / starters_ge2.
  // Filters out single-mode tourists (open Classic, bounce) so the
  // ratio reads "of players who committed to the daily set, what %
  // finished it" rather than including drive-by sampling.
  starters_ge2: number;
  // Sorted-ascending list of every all-5-modes finisher's daily total:
  // sum(total_guesses + hints_used) across their 5 mode_completed
  // events. Lower = better. The client binary-searches its own total
  // into this list to derive a "Top X%" reading + tier band. Omitted
  // when fewer than MIN_TIER_FINISHERS so the badge stays hidden under
  // the noise floor.
  totals?: number[];
};

// Minimum all-5-modes finishers before the tier distribution becomes
// meaningful enough to surface. Below this we omit composites so the
// client hides the badge. 10 = one occupant per 10-percent band at
// the floor.
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
    // Canonical-only: "committed to the daily" means ≥2 of the 5 daily
    // modes started. A Melee (bonus) start must not count toward the
    // finish-rate denominator, or bonus-curious visitors would deflate it.
    `    AND properties.mode IN (${CANONICAL_MODES_SQL})`,
    "  GROUP BY distinct_id",
    "  HAVING count(DISTINCT properties.mode) >= 2",
    ")",
  ].join("\n");

  // Per-finisher daily total. Per mode_completed event:
  //   base       = total_guesses + hints_used
  //   loss_bump  = +0.5 if outcome != 'won'   (tie-break wins above losses
  //                                            at the same slot count)
  //   bonus_credit = -0.5 if bonus_correct = true  (Classic-only signal)
  // Summed across the player's 5 modes. Lower = better. Only counts
  // players who finished all 5 built modes today. Outer SELECT pulls
  // the count and the full sorted-ascending list of every finisher's
  // total so the client can binary-search to derive its Top X% reading.
  // The 0.5 magnitudes mirror LOSS_PENALTY / BONUS_QUESTION_CREDIT in
  // lib/tier.ts — keep them in lockstep.
  const tierQuery = [
    "WITH totals AS (",
    "  SELECT",
    "    distinct_id,",
    "    sum(",
    "      toFloat(properties.total_guesses)",
    "      + toFloat(properties.hints_used)",
    "      + if(properties.outcome = 'won', 0, 0.5)",
    "      - if(properties.bonus_correct = true, 0.5, 0)",
    "    ) AS total",
    "  FROM events",
    "  WHERE event = 'mode_completed'",
    `    AND properties.daily_id = '${day}'`,
    "    AND properties.site = 'owdle'",
    // Canonical-only, two jobs in one filter: the sum must not include a
    // Melee (bonus) completion, AND the distinct-mode count must stay 5
    // for a player who ALSO played Melee — without this, their 6 distinct
    // modes fail `= 5` and they silently drop out of the rank distribution.
    `    AND properties.mode IN (${CANONICAL_MODES_SQL})`,
    "  GROUP BY distinct_id",
    "  HAVING count(DISTINCT properties.mode) = 5",
    ")",
    "SELECT",
    "  count() AS n,",
    "  arraySort(groupArray(total)) AS totals",
    "FROM totals",
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

  // tierRow is [n, [total, total, …]] sorted ascending. Below the floor
  // we drop totals entirely so the client hides the badge.
  const tierRow = (tierRes.results ?? [])[0];
  if (tierRow) {
    const n = Number(tierRow[0]) || 0;
    if (n >= MIN_TIER_FINISHERS) {
      const raw = tierRow[1];
      if (Array.isArray(raw)) {
        daily.totals = raw.map((v) => Number(v) || 0);
      }
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
    // Bonus mode — its own solve-rate bucket. Kept out of the tier/rank
    // query above but measurable here for ModeStatsLine on the Melee card.
    melee: { won: 0, lost: 0, gaveUp: 0, total: 0 },
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
