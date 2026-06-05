// owdle-replay-verifier
//
// Cron Worker that backfills the session-replay link into Discord feedback
// messages once PostHog has actually processed the recording.
//
// /api/feedback (Pages, on BOTH sites — OWdle and Deadlockle) posts the
// Discord message immediately without a link and inserts a
// `pending_replay_links` row, storing the EXACT webhook URL it used so this
// Worker edits the message via the same webhook (Discord only lets a
// webhook edit its own messages). At submit time the replay doesn't exist
// yet (PostHog needs a few minutes), and for some sessions it never will:
// the visitor blocked tracking, the recording trigger never activated, or
// the session fell under the 30s replay floor. So this Worker polls — for
// each pending row it asks PostHog whether the recording exists.
//
// - Recording found: edit the message to add "Watch on PostHog" plus the
//   recording length and the date the link stops working (recordings are
//   deleted after the project's 30-day retention), and mark the row
//   `linked`.
// - Still nothing after GIVE_UP: stamp the message "No recording" so the
//   absence reads as a decision rather than a silent failure, and mark the
//   row `expired`. The stamp is only written when PostHog cleanly 404'd;
//   transient/auth errors expire silently so a broken API key can't write
//   a confident lie into the channel.

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

// Metadata parsed from PostHog's recording detail endpoint. All fields are
// garnish for the Discord link text — a 200 alone is enough to link.
interface RecordingMeta {
  durationSec: number | null;
  startTime: string | null;
  retentionDays: number | null;
  ongoing: boolean;
}

// Give the recording time to process before the first check, and stop
// checking once it's clearly never coming. 6h is generous on purpose:
// recordings normally list within minutes of the trigger event, but
// PostHog ingestion incidents can lag hours, and the polling is cheap at
// this feedback volume (a row costs one API call per 2-minute cron tick).
const READY_AFTER_SEC = 3 * 60;
const GIVE_UP_AFTER_SEC = 6 * 60 * 60;
const BATCH = 25;

// Recordings are deleted after the project's retention period, so the link
// in Discord has a shelf life. Used when the API response doesn't carry
// retention_period_days.
const DEFAULT_RETENTION_DAYS = 30;

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
  const rec = await fetchRecording(env, row.session_id);

  if (rec) {
    const linked = await upsertReplayField(env, row, linkFieldValue(env, row, rec));
    if (linked) {
      await setStatus(env, row, "linked");
      return;
    }
    // Recording is there but the Discord edit failed. Fall through to the
    // age check so a persistently-failing edit can't loop forever.
  }

  if (nowSec - row.created_at > GIVE_UP_AFTER_SEC) {
    if (rec === false) {
      // Clean 404 the whole way to the deadline: the session was never
      // recorded. Say so on the message — a reader shouldn't have to guess
      // whether the missing link means "no recording" or "verifier broke".
      await upsertReplayField(env, row, "No recording (tracking blocked or session under 30s)");
    }
    await setStatus(env, row, "expired");
  } else {
    await bumpAttempts(env, row);
  }
}

// RecordingMeta = recording exists, false = confirmed absent (404),
// null = unknown (auth or transient error). Only an existing recording
// triggers the link edit; 404 keeps retrying until GIVE_UP then stamps
// "No recording"; null retries until GIVE_UP then expires silently.
//
// Semantics verified against the live API: the detail endpoint returns
// 404 {"code":"not_found"} for session ids with no stored replay data and
// 200 with metadata only when the recording is actually viewable — it is
// the same lookup the PostHog replay page itself does.
async function fetchRecording(env: Env, sessionId: string): Promise<RecordingMeta | false | null> {
  const host = (env.POSTHOG_API_HOST ?? "https://us.posthog.com").replace(/\/$/, "");
  const url = `${host}/api/projects/${env.POSTHOG_PROJECT_ID}/session_recordings/${encodeURIComponent(sessionId)}/`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${env.POSTHOG_PERSONAL_API_KEY}` },
  });
  if (resp.status === 200) {
    const meta: RecordingMeta = {
      durationSec: null,
      startTime: null,
      retentionDays: null,
      ongoing: false,
    };
    try {
      const data = (await resp.json()) as {
        recording_duration?: unknown;
        start_time?: unknown;
        retention_period_days?: unknown;
        ongoing?: unknown;
      };
      if (typeof data.recording_duration === "number") meta.durationSec = data.recording_duration;
      if (typeof data.start_time === "string") meta.startTime = data.start_time;
      if (typeof data.retention_period_days === "number") meta.retentionDays = data.retention_period_days;
      meta.ongoing = data.ongoing === true;
    } catch {
      // Metadata is decoration; the 200 already established existence.
    }
    return meta;
  }
  if (resp.status === 404) return false;
  console.error(`replay-verifier: PostHog ${resp.status} for ${sessionId}`);
  return null;
}

// "[Watch on PostHog](…) · 3m 39s · until Jul 4". Duration and expiry are
// best-effort: omitted when the API didn't provide enough to compute them.
// The expiry date is the day PostHog deletes the recording (start time +
// retention), after which the link 404s — putting it on the message stops
// a months-later click-through from reading as a bug.
function linkFieldValue(env: Env, row: PendingRow, rec: RecordingMeta): string {
  const host = (env.POSTHOG_API_HOST ?? "https://us.posthog.com").replace(/\/$/, "");
  const replayUrl = `${host}/project/${env.POSTHOG_PROJECT_ID}/replay/${encodeURIComponent(row.session_id)}`;
  let value = `[Watch on PostHog](${replayUrl})`;

  if (typeof rec.durationSec === "number" && rec.durationSec > 0) {
    // An ongoing session keeps growing past the snapshot we read, so mark
    // the figure as a floor.
    value += ` · ${fmtDuration(rec.durationSec)}${rec.ongoing ? "+" : ""}`;
  }

  if (rec.startTime) {
    const startMs = Date.parse(rec.startTime);
    if (Number.isFinite(startMs)) {
      const days = rec.retentionDays ?? DEFAULT_RETENTION_DAYS;
      const expiry = new Date(startMs + days * 86_400_000);
      const label = expiry.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "America/Los_Angeles",
      });
      value += ` · until ${label}`;
    }
  }

  return value;
}

function fmtDuration(totalSec: number): string {
  const s = Math.round(totalSec);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return rs ? `${m}m ${rs}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h ${rm}m` : `${h}h`;
}

// Adds (or leaves in place) the "Session replay" field on the feedback
// message's embed. Returns true when the field is present afterwards.
async function upsertReplayField(env: Env, row: PendingRow, value: string): Promise<boolean> {
  // Prefer the exact webhook that posted the message (stored on the row by
  // /api/feedback) so the edit always targets the right webhook. Fall back
  // to the Worker's own secret for any legacy rows written without it.
  const webhookUrl = row.webhook_url || webhookFor(env, row.source);
  if (!webhookUrl) {
    console.error(`replay-verifier: no webhook for ${row.session_id} (source ${row.source})`);
    return false;
  }

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
  if (fields.some((f) => f.name === "Session replay")) return true; // already stamped
  fields.push({ name: "Session replay", value });
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
