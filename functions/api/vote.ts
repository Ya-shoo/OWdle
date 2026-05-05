// POST /api/vote  { id, name, image?, released? }
// Records a vote for "next game OWdle should build". Composite primary key
// (game_id, voter_hash) means a voter can vote for the same game at most
// once per month (the hash includes the current month).
import type { Handler } from "../_lib/types";
import { voterHash } from "../_lib/types";

type Body = {
  id?: unknown;
  name?: unknown;
  image?: unknown;
  released?: unknown;
};

const PROJECT = "owdle";
const MAX_VOTES_PER_VOTER_PER_DAY = 20;

export const onRequestPost: Handler = async ({ request, env }) => {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const image = typeof body.image === "string" ? body.image : null;
  const released = typeof body.released === "string" ? body.released : null;

  if (!id || id.length > 64 || !name || name.length > 200) {
    return json({ error: "invalid_payload" }, 400);
  }

  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const hash = await voterHash(ip, PROJECT);
  const now = Math.floor(Date.now() / 1000);
  const dayAgo = now - 86400;

  // Soft per-voter rate limit: cap at N distinct game votes per 24h.
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM votes WHERE voter_hash = ? AND created_at > ?",
  )
    .bind(hash, dayAgo)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= MAX_VOTES_PER_VOTER_PER_DAY) {
    return json({ error: "rate_limited" }, 429);
  }

  await env.DB.prepare(
    `INSERT INTO votes (game_id, voter_hash, game_name, game_image, game_released, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(game_id, voter_hash) DO NOTHING`,
  )
    .bind(id, hash, name, image, released, now)
    .run();

  return json({ ok: true });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
