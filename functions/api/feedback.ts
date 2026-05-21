// POST /api/feedback  { body }
// Stores a short free-form feedback message (1-150 chars). The table is
// shared with Deadlockle on the canonical owdle-votes D1; the `source`
// column records which site the submission came from so we can filter
// per site when reading the feedback back via the CLI.
//
// Rate limit: per-IP via the same salted+bucketed hash used for votes,
// enforced atomically with INSERT … SELECT … WHERE so concurrent requests
// can't briefly exceed the cap. No PII is stored.
import type { Handler } from "../_lib/types";
import { voterHash } from "../_lib/types";

type Body = { body?: unknown };

const PROJECT = "owdle";
const MAX_FEEDBACK_PER_SUBMITTER_PER_DAY = 5;
const MAX_BODY_LEN = 150;

export const onRequestPost: Handler = async ({ request, env }) => {
  let payload: Body;
  try {
    payload = (await request.json()) as Body;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const raw = typeof payload.body === "string" ? payload.body : "";
  const body = raw.trim();

  if (!body || body.length > MAX_BODY_LEN) {
    return json({ error: "invalid_payload" }, 400);
  }

  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const hash = await voterHash(ip, PROJECT);
  const now = Math.floor(Date.now() / 1000);
  const dayAgo = now - 86400;

  const result = await env.DB.prepare(
    `INSERT INTO feedback (body, source, submitter_hash, created_at)
     SELECT ?, ?, ?, ?
     WHERE (
       SELECT COUNT(*) FROM feedback
       WHERE submitter_hash = ? AND created_at > ?
     ) < ?`,
  )
    .bind(
      body,
      PROJECT,
      hash,
      now,
      hash,
      dayAgo,
      MAX_FEEDBACK_PER_SUBMITTER_PER_DAY,
    )
    .run();

  const meta = result.meta as { changes?: number } | undefined;
  if (!meta?.changes) {
    return json({ error: "rate_limited" }, 429);
  }

  return json({ ok: true });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
