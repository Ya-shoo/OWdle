// GET /api/votes-raw  (Authorization: Bearer <ADMIN_SECRET>)
// Per-row admin view of the shared votes table — useful for spot-checking
// who voted for what and when. `voter_hash` is the salted sha256 (not an
// IP), so identity is not recoverable; the value is only useful for
// linking multiple votes by the same anonymized voter within a 2-day
// window. Supports ?since=<unix>&limit=<n>&source=owdle|deadlockle.
import type { Handler } from "../_lib/types";
import { constantTimeEqual } from "../_lib/types";

type Row = {
  game_id: string;
  game_name: string;
  voter_hash: string;
  source: string;
  created_at: number;
};

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 2000;

export const onRequestGet: Handler = async ({ request, env }) => {
  const auth = request.headers.get("authorization") ?? "";
  const expected = env.ADMIN_SECRET ? `Bearer ${env.ADMIN_SECRET}` : "";
  if (!expected || !constantTimeEqual(auth, expected)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const since = Number(url.searchParams.get("since") ?? 0) || 0;
  const limit = Math.min(
    Math.max(1, Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT) || DEFAULT_LIMIT),
    MAX_LIMIT,
  );
  const source = url.searchParams.get("source");
  const sourceFilter = source === "owdle" || source === "deadlockle" ? source : null;

  const sql = `SELECT game_id, game_name, voter_hash, source, created_at
               FROM votes
               WHERE created_at >= ?
                 ${sourceFilter ? "AND source = ?" : ""}
               ORDER BY created_at DESC
               LIMIT ?`;

  const stmt = sourceFilter
    ? env.DB.prepare(sql).bind(since, sourceFilter, limit)
    : env.DB.prepare(sql).bind(since, limit);

  const result = await stmt.all<Row>();

  return new Response(JSON.stringify({ results: result.results ?? [] }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
};
