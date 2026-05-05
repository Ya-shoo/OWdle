// GET /api/votes  (Authorization: Bearer <ADMIN_SECRET>)
// Returns the top voted games. Gated by the ADMIN_SECRET Pages secret so
// the tally isn't public — set with `wrangler pages secret put ADMIN_SECRET`.
import type { Handler } from "../_lib/types";

type Row = {
  game_id: string;
  game_name: string;
  game_image: string | null;
  game_released: string | null;
  votes: number;
};

export const onRequestGet: Handler = async ({ request, env }) => {
  const auth = request.headers.get("authorization") ?? "";
  if (!env.ADMIN_SECRET || auth !== `Bearer ${env.ADMIN_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await env.DB.prepare(
    `SELECT
       game_id,
       MAX(game_name)     AS game_name,
       MAX(game_image)    AS game_image,
       MAX(game_released) AS game_released,
       COUNT(*)           AS votes
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
