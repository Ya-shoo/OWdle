// POST /api/vote  { id, name, image?, released? }
// Records a vote for "next game OWdle should build". The votes table is
// shared with Deadlockle (canonical D1: owdle-votes); the `source` column
// records which site the vote came from. Composite primary key
// (game_id, voter_hash) means a voter can vote for the same game at most
// once per 2-day bucket per site (the hash rotates every 2 days and is
// salted with the project name).
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

  // Atomic per-voter rate limit: the count and insert happen in a single
  // statement so concurrent requests can't briefly exceed the cap. The
  // INSERT … SELECT … WHERE pattern only writes a row if the voter is
  // under the daily limit; ON CONFLICT keeps repeat votes idempotent.
  const result = await env.DB.prepare(
    `INSERT INTO votes (game_id, voter_hash, game_name, game_image, game_released, created_at, source)
     SELECT ?, ?, ?, ?, ?, ?, ?
     WHERE (
       SELECT COUNT(*) FROM votes
       WHERE voter_hash = ? AND created_at > ?
     ) < ?
     ON CONFLICT(game_id, voter_hash) DO NOTHING`,
  )
    .bind(
      id,
      hash,
      name,
      image,
      released,
      now,
      PROJECT,
      hash,
      dayAgo,
      MAX_VOTES_PER_VOTER_PER_DAY,
    )
    .run();

  // If no row was inserted AND no row already existed for (game, voter),
  // the voter was over the rate limit. We distinguish from a duplicate
  // (which is a no-op success) by checking whether the row exists.
  const meta = result.meta as { changes?: number } | undefined;
  if (!meta?.changes) {
    const existing = await env.DB.prepare(
      "SELECT 1 FROM votes WHERE game_id = ? AND voter_hash = ?",
    )
      .bind(id, hash)
      .first();
    if (!existing) {
      return json({ error: "rate_limited" }, 429);
    }
  }

  return json({ ok: true });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
