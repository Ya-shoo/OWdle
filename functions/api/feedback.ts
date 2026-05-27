// POST /api/feedback  { body }
// Stores a short free-form feedback message (1-150 chars). The table is
// shared with Deadlockle on the canonical owdle-votes D1; the `source`
// column records which site the submission came from so we can filter
// per site when reading the feedback back via the CLI.
//
// Rate limit: per-IP via the same salted+bucketed hash used for votes,
// enforced atomically with INSERT … SELECT … WHERE so concurrent requests
// can't briefly exceed the cap. No PII is stored.
import type { Env, Handler } from "../_lib/types";
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
  // dialog opened. When present we deep-link the Discord embed straight
  // to the replay; when absent (PostHog blocked, recording not yet
  // bootstrapped) we just omit the field.
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

  // Fire-and-forget Discord notification. waitUntil lets the response
  // return to the user immediately while the webhook POST drains in the
  // background; if Discord is slow or down, the submission still
  // succeeds. Errors are swallowed deliberately — the D1 row is the
  // source of truth, the notification is a courtesy.
  if (env.FEEDBACK_WEBHOOK_URL) {
    const replayUrl = buildReplayUrl(env, sessionId);
    const fields = replayUrl
      ? [{ name: "Session replay", value: `[Watch on PostHog](${replayUrl})` }]
      : undefined;
    const payload = {
      embeds: [
        {
          title: `New feedback · OWdle`,
          description: body,
          color: EMBED_COLOR,
          url: SITE_URL,
          fields,
          timestamp: new Date().toISOString(),
          footer: { text: `submitter ${hash.slice(0, 8)}` },
        },
      ],
    };
    waitUntil(
      fetch(env.FEEDBACK_WEBHOOK_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }).then(
        () => {},
        () => {},
      ),
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

// Returns a deep link to the PostHog replay for this session, or null
// when the session id is missing (PostHog blocked / not initialized).
// PostHog's UI routes use the project API token (the phc_… client key)
// in the URL path, NOT the numeric project ID. This matches the URL
// that posthog-js's get_session_replay_url() generates internally.
// The token is a public client key (already in the frontend JS bundle).
const POSTHOG_PROJECT_TOKEN_DEFAULT = "phc_AE5pvD5WozNPsftsUMBMKwaCWcjHhLjTVfdyRowmP7A5";

function buildReplayUrl(env: Env, sessionId: string | null): string | null {
  if (!sessionId) return null;
  const token = env.POSTHOG_PROJECT_TOKEN || POSTHOG_PROJECT_TOKEN_DEFAULT;
  const host = (env.POSTHOG_API_HOST ?? "https://us.posthog.com").replace(/\/$/, "");
  return `${host}/project/${encodeURIComponent(token)}/replay/${encodeURIComponent(sessionId)}`;
}
