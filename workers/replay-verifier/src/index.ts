// owdle-replay-verifier
//
// Cron Worker that backfills the session-replay link into Discord feedback
// messages once PostHog has actually processed the recording.
//
// /api/feedback (Pages) posts the Discord message immediately without a link
// and inserts a `pending_replay_links` row, storing the EXACT webhook URL it
// used so this Worker edits the message via the same webhook (Discord only
// lets a webhook edit its own messages). At submit time the replay doesn't
// exist yet (PostHog needs a few minutes), and for some sessions it never
// will: the visitor blocked tracking, or the session fell under the 30s
// replay floor. So this Worker polls — for each pending row it asks PostHog
// whether the recording exists. If yes, it edits the Discord message to add
// the "Watch on PostHog" link and marks the row `linked`. If none has shown
// up after GIVE_UP, the row is `expired` and the message stays linkless,
// which is the correct outcome for a session that was never recorded.

interface D1Result<T> {
  results: T[];
  success: boolean;
}
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<{ success: boolean }>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}
interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface Env {
  DB: D1Database;
  POSTHOG_PROJECT_ID: string;
  POSTHOG_API_HOST?: string;
  // Secret (wrangler secret put): needs the session_recording:read scope.
  POSTHOG_PERSONAL_API_KEY: string;
  // Fallback webhooks for any legacy rows written before webhook_url was
  // stored on the row. New rows carry their own webhook_url, so these are
  // optional and normally unused.
  FEEDBACK_WEBHOOK_URL?: string;
  FEEDBACK_WEBHOOK_URL_DEADLOCKLE?: string;
}

interface PendingRow {
  session_id: string;
  message_id: string;
  source: string;
  created_at: number;
  attempts: number;
  webhook_url?: string | null;
}

// Give the recording time to process before the first check, and stop
// checking once it's clearly never coming.
const READY_AFTER_SEC = 3 * 60;
const GIVE_UP_AFTER_SEC = 30 * 60;
const BATCH = 25;

export default {
  async scheduled(_controller: unknown, env: Env): Promise<void> {
    const nowSec = Math.floor(Date.now() / 1000);
    const readyBefore = nowSec - READY_AFTER_SEC;

    const res = await env.DB.prepare(
      `SELECT session_id, message_id, source, created_at, attempts, webhook_url
         FROM pending_replay_links
        WHERE status = 'pending' AND created_at <= ?
        ORDER BY created_at ASC
        LIMIT ?`,
    )
      .bind(readyBefore, BATCH)
      .all<PendingRow>();

    for (const row of res.results ?? []) {
      try {
        await handleRow(env, row, nowSec);
      } catch (err) {
        console.error(`replay-verifier: row ${row.session_id} failed`, err);
      }
    }
  },
};

async function handleRow(env: Env, row: PendingRow, nowSec: number): Promise<void> {
  const exists = await recordingExists(env, row.session_id);

  if (exists === true) {
    const linked = await addReplayLink(env, row);
    if (linked) {
      await setStatus(env, row, "linked");
      return;
    }
    // Recording is there but the Discord edit failed. Fall through to the
    // age check so a persistently-failing edit can't loop forever.
  }

  if (nowSec - row.created_at > GIVE_UP_AFTER_SEC) {
    await setStatus(env, row, "expired");
  } else {
    await bumpAttempts(env, row);
  }
}

// true = recording exists, false = confirmed absent (404), null = unknown
// (auth or transient error). Only `true` triggers the edit; the rest retry
// until GIVE_UP.
async function recordingExists(env: Env, sessionId: string): Promise<boolean | null> {
  const host = (env.POSTHOG_API_HOST ?? "https://us.posthog.com").replace(/\/$/, "");
  const url = `${host}/api/projects/${env.POSTHOG_PROJECT_ID}/session_recordings/${encodeURIComponent(sessionId)}/`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${env.POSTHOG_PERSONAL_API_KEY}` },
  });
  if (resp.status === 200) return true;
  if (resp.status === 404) return false;
  console.error(`replay-verifier: PostHog ${resp.status} for ${sessionId}`);
  return null;
}

async function addReplayLink(env: Env, row: PendingRow): Promise<boolean> {
  // Prefer the exact webhook that posted the message (stored on the row by
  // /api/feedback) so the edit always targets the right webhook. Fall back
  // to the Worker's own secret for any legacy rows written without it.
  const webhookUrl = row.webhook_url || webhookFor(env, row.source);
  if (!webhookUrl) {
    console.error(`replay-verifier: no webhook for ${row.session_id} (source ${row.source})`);
    return false;
  }

  const host = (env.POSTHOG_API_HOST ?? "https://us.posthog.com").replace(/\/$/, "");
  const replayUrl = `${host}/project/${env.POSTHOG_PROJECT_ID}/replay/${encodeURIComponent(row.session_id)}`;
  const messageUrl = `${webhookUrl}/messages/${encodeURIComponent(row.message_id)}`;

  // Fetch the message we posted earlier and append to its existing embed,
  // rather than reconstructing it — the embed template lives only in
  // /api/feedback, so there's nothing to keep in sync here.
  const getResp = await fetch(messageUrl);
  if (!getResp.ok) {
    console.error(`replay-verifier: GET msg ${row.message_id} -> ${getResp.status}`);
    return false;
  }
  const msg = (await getResp.json()) as { embeds?: DiscordEmbed[] };
  const embed = msg.embeds?.[0];
  if (!embed) return false;

  const fields = embed.fields ?? [];
  if (fields.some((f) => f.name === "Session replay")) return true; // already linked
  fields.push({ name: "Session replay", value: `[Watch on PostHog](${replayUrl})` });
  embed.fields = fields;

  const patchResp = await fetch(messageUrl, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ embeds: [embed] }),
  });
  if (!patchResp.ok) {
    console.error(`replay-verifier: PATCH msg ${row.message_id} -> ${patchResp.status}`);
  }
  return patchResp.ok;
}

function webhookFor(env: Env, source: string): string | undefined {
  return source === "deadlockle" ? env.FEEDBACK_WEBHOOK_URL_DEADLOCKLE : env.FEEDBACK_WEBHOOK_URL;
}

function setStatus(env: Env, row: PendingRow, status: string): Promise<{ success: boolean }> {
  return env.DB.prepare(
    `UPDATE pending_replay_links SET status = ?, attempts = attempts + 1
      WHERE session_id = ? AND message_id = ?`,
  )
    .bind(status, row.session_id, row.message_id)
    .run();
}

function bumpAttempts(env: Env, row: PendingRow): Promise<{ success: boolean }> {
  return env.DB.prepare(
    `UPDATE pending_replay_links SET attempts = attempts + 1
      WHERE session_id = ? AND message_id = ?`,
  )
    .bind(row.session_id, row.message_id)
    .run();
}

interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}
interface DiscordEmbed {
  fields?: DiscordEmbedField[];
  [key: string]: unknown;
}
