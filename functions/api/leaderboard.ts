// GET /api/leaderboard
// Public top-N most-voted games. We deliberately omit the raw count from
// the response — the order IS the data, and hiding the count keeps people
// from gaming the rank or feeling discouraged when their pick is at "1
// vote". Edge-cached briefly so we don't hammer D1 on busy days.
import type { Handler } from "../_lib/types";

type Row = {
  game_id: string;
  game_name: string;
  game_image: string | null;
  game_released: string | null;
};

const CACHE_TTL_SECONDS = 30;
const LIMIT = 10;

export const onRequestGet: Handler = async ({ request, env, waitUntil }) => {
  const url = new URL(request.url);
  // @ts-expect-error caches.default is a Workers global
  const cache = caches.default as Cache;
  const cacheKey = new Request(url.origin + url.pathname, { method: "GET" });

  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const result = await env.DB.prepare(
    `SELECT
       game_id,
       MAX(game_name)     AS game_name,
       MAX(game_image)    AS game_image,
       MAX(game_released) AS game_released
     FROM votes
     GROUP BY game_id
     ORDER BY COUNT(*) DESC, MAX(created_at) DESC
     LIMIT ?`,
  )
    .bind(LIMIT)
    .all<Row>();

  const response = new Response(
    JSON.stringify({ results: result.results ?? [] }),
    {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": `public, max-age=${CACHE_TTL_SECONDS}`,
      },
    },
  );
  waitUntil(cache.put(cacheKey, response.clone()));
  return response;
};
