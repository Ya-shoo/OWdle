// GET /api/poll-results  →  aggregated vote counts for every greeter mini-poll.
//
// Powers the dev-hub poll dashboard (/labeler/polls/). Returns raw counts, so
// it's gated by the Bearer ADMIN_SECRET in prod (same as /api/votes-raw and
// /api/feedback-raw); only the local dev helper (no ADMIN_SECRET configured)
// serves it ungated. The poll_votes table is shared across OWdle + Deadlockle,
// so this lists polls from both, each with a per-source (owdle / deadlockle)
// split.
import { type Handler, constantTimeEqual } from "../_lib/types";

type Row = {
  poll_id: string;
  choice: string;
  source: string;
  n: number;
  last: number;
};

type ChoiceTally = {
  choice: string;
  count: number;
  owdle: number;
  deadlockle: number;
};

export const onRequestGet: Handler = async ({ request, env }) => {
  // Raw counts are admin data (cf. /api/votes-raw, /api/feedback-raw). Require
  // the Bearer ADMIN_SECRET when it's configured (prod sets it); when it's
  // absent — the local wrangler-pages-dev helper, no ADMIN_SECRET in .dev.vars —
  // allow it so the dev dashboard's "Local dev" mode keeps reading test data.
  const expected = env.ADMIN_SECRET ? `Bearer ${env.ADMIN_SECRET}` : null;
  if (expected) {
    const auth = request.headers.get("authorization") ?? "";
    if (!constantTimeEqual(auth, expected)) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }
  }
  const rows =
    (
      await env.DB.prepare(
        `SELECT poll_id, choice, source, COUNT(*) AS n, MAX(created_at) AS last
         FROM poll_votes
         GROUP BY poll_id, choice, source`,
      ).all<Row>()
    ).results ?? [];

  const byPoll = new Map<
    string,
    { pollId: string; total: number; last: number; choices: Map<string, ChoiceTally> }
  >();
  for (const r of rows) {
    let p = byPoll.get(r.poll_id);
    if (!p) {
      p = { pollId: r.poll_id, total: 0, last: 0, choices: new Map() };
      byPoll.set(r.poll_id, p);
    }
    p.total += r.n;
    p.last = Math.max(p.last, r.last);
    let c = p.choices.get(r.choice);
    if (!c) {
      c = { choice: r.choice, count: 0, owdle: 0, deadlockle: 0 };
      p.choices.set(r.choice, c);
    }
    c.count += r.n;
    if (r.source === "owdle") c.owdle += r.n;
    else if (r.source === "deadlockle") c.deadlockle += r.n;
  }

  const polls = Array.from(byPoll.values())
    .map((p) => ({
      pollId: p.pollId,
      total: p.total,
      last: p.last,
      choices: Array.from(p.choices.values()).sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.last - a.last)
    .slice(0, 100);

  return new Response(JSON.stringify({ polls }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
};
