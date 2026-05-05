// GET /api/search?q=<query>
// Proxies RAWG so the API key stays server-side. Edge-cached for 1 hour to
// stay well under RAWG's 20k req/month free tier.
import type { Handler } from "../_lib/types";

type RawgGame = {
  id: number;
  name: string;
  released: string | null;
  background_image: string | null;
};

type Trimmed = {
  id: string;
  name: string;
  released: string | null;
  image: string | null;
};

const CACHE_TTL_SECONDS = 3600;

export const onRequestGet: Handler = async ({ request, env, waitUntil }) => {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 2 || q.length > 100) {
    return json({ results: [] });
  }

  // Normalize cache key — case-insensitive query, ignore other params
  const cacheUrl = new URL(url.origin + url.pathname);
  cacheUrl.searchParams.set("q", q.toLowerCase());
  // @ts-expect-error caches.default is a Workers global
  const cache = caches.default as Cache;
  const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });

  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  if (!env.RAWG_API_KEY) {
    return json({ error: "search_unavailable" }, 503);
  }

  const rawgUrl = `https://api.rawg.io/api/games?key=${env.RAWG_API_KEY}&search=${encodeURIComponent(
    q,
  )}&page_size=8&search_precise=true`;

  const upstream = await fetch(rawgUrl);
  if (!upstream.ok) {
    return json({ error: "upstream_failed" }, 502);
  }
  const data = (await upstream.json()) as { results?: RawgGame[] };
  const trimmed: Trimmed[] = (data.results ?? []).map((g) => ({
    id: String(g.id),
    name: g.name,
    released: g.released,
    image: g.background_image,
  }));

  const response = json({ results: trimmed });
  response.headers.set("cache-control", `public, max-age=${CACHE_TTL_SECONDS}`);
  waitUntil(cache.put(cacheKey, response.clone()));
  return response;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
