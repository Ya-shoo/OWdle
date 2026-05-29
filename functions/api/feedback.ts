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

type Body = { body?: unknown; session_id?: unknown };

const PROJECT = "owdle";
const SITE_URL = "https://playowdle.com";
// OWdle brand orange. Used as the embed accent in Discord so the
// notification reads as "this came from OWdle" at a glance even when
// the channel is shared with Deadlockle alerts.
const EMBED_COLOR = 0xff8847;
const MAX_FEEDBACK_PER_SUBMITTER_PER_DAY = 5;
const MAX_BODY_LEN = 150;
// PostHog session IDs are UUIDv7 strings. The regex is loose on purpose —
// PostHog occasionally rotates formats, so we accept any UUID-shape and
// just refuse obvious garbage that could embed-inject Discord markdown.
const SESSION_ID_RE = /^[a-zA-Z0-9-]{8,64}$/;

export const onRequestPost: Handler = async ({ request, env, waitUntil }) => {
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

  // Optional PostHog session id captured by FeedbackButton when the
  // dialog opened. When present, we post the Discord message now and
  // record a pending row so the verifier Worker can add the replay link
  // once the recording exists. When absent (PostHog blocked / not yet
  // bootstrapped) the message simply never gets a link.
  const sessionId =
    typeof payload.session_id === "string" && SESSION_ID_RE.test(payload.session_id)
      ? payload.session_id
      : null;

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

  // Discord notification, sent in the background via waitUntil so the user
  // gets their response immediately. The replay link is deliberately NOT
  // included here: at submit time the session recording doesn't exist yet
  // (PostHog needs a few minutes to process it) and may never exist (the
  // visitor blocked tracking, or the session was under the 30s replay
  // floor). So we post the message now, then record a pending row keyed by
  // the Discord message id; the owdle-replay-verifier Worker edits the
  // message to add the "Watch on PostHog" link once the recording lands.
  if (env.FEEDBACK_WEBHOOK_URL) {
    const webhookUrl = env.FEEDBACK_WEBHOOK_URL;
    const messagePayload = {
      embeds: [
        {
          title: `New feedback · OWdle`,
          description: body,
          color: EMBED_COLOR,
          url: SITE_URL,
          timestamp: new Date().toISOString(),
          footer: { text: `submitter ${hash.slice(0, 8)}` },
        },
      ],
    };
    waitUntil(
      (async () => {
        try {
          // `?wait=true` makes Discord return the created message object so
          // we can capture its id; without it the POST returns 204 empty.
          const resp = await fetch(`${webhookUrl}?wait=true`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(messagePayload),
          });
          if (!sessionId || !resp.ok) return;
          const msg = (await resp.json()) as { id?: string };
          if (!msg.id) return;
          // INSERT OR IGNORE so a retry can't duplicate. The surrounding
          // try/catch means a missing table (e.g. before the migration
          // runs) never breaks the submission; the feedback row is saved.
          // Store the exact webhook URL used so the verifier Worker edits
          // this message via the same webhook (Discord only lets a webhook
          // edit its own messages) — no separate worker secret to keep in
          // sync, and no way to mismatch.
          await env.DB.prepare(
            `INSERT OR IGNORE INTO pending_replay_links
               (session_id, message_id, source, created_at, attempts, status, webhook_url)
             VALUES (?, ?, ?, ?, 0, 'pending', ?)`,
          )
            .bind(sessionId, msg.id, PROJECT, now, webhookUrl)
            .run();
        } catch {
          // Swallow: the Discord notification and replay link are courtesies.
        }
      })(),
    );
  }

  return json({ ok: true });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
