// GET /api/feedback-raw  (Authorization: Bearer <ADMIN_SECRET>)
// Per-row admin view of the shared feedback table. Mirrors the auth
// pattern of /api/votes-raw — the helper script (scripts/
// feedback-admin-server.mjs) reads ADMIN_SECRET from .env.secrets and
// adds the Bearer header server-side, so the secret never reaches the
// browser. `submitter_hash` is the salted sha256 used for rate-limiting
// at write time; like voter_hash it isn't reversible to an IP.
// Supports ?since=<unix>&limit=<n>&source=owdle|deadlockle.
import type { Handler } from "../_lib/types";
import { constantTimeEqual } from "../_lib/types";

type Row = {
  body: string;
  source: string;
  submitter_hash: string;
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

  const sql = `SELECT body, source, submitter_hash, created_at
               FROM feedback
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
