// GET /api/votes  (Authorization: Bearer <ADMIN_SECRET>)
// Returns the top voted games. Gated by the ADMIN_SECRET Pages secret so
// the tally isn't public — set with `wrangler pages secret put ADMIN_SECRET`.
import type { Handler } from "../_lib/types";
import { constantTimeEqual } from "../_lib/types";

type Row = {
  game_id: string;
  game_name: string;
  game_image: string | null;
  game_released: string | null;
  votes: number;
  votes_owdle: number;
  votes_deadlockle: number;
};

export const onRequestGet: Handler = async ({ request, env }) => {
  const auth = request.headers.get("authorization") ?? "";
  const expected = env.ADMIN_SECRET ? `Bearer ${env.ADMIN_SECRET}` : "";
  if (!expected || !constantTimeEqual(auth, expected)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await env.DB.prepare(
    `SELECT
       game_id,
       MAX(game_name)     AS game_name,
       MAX(game_image)    AS game_image,
       MAX(game_released) AS game_released,
       COUNT(*)           AS votes,
       SUM(CASE WHEN source = 'owdle'      THEN 1 ELSE 0 END) AS votes_owdle,
       SUM(CASE WHEN source = 'deadlockle' THEN 1 ELSE 0 END) AS votes_deadlockle
     FROM votes
     GROUP BY game_id
     ORDER BY votes DESC, MAX(created_at) DESC
     LIMIT 50`,
  ).all<Row>();

  return new Response(JSON.stringify({ results: result.results }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
};
