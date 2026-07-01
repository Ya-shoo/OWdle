// Avatar-greeter mini-polls.
//   POST /api/greeter-poll  { pollId, choice }  → record/replace this voter's
//                                                  pick, return the live tally
//   GET  /api/greeter-poll?pollId=...            → return the live tally
//
// One vote per (poll, voter); voter_hash is a POLL-STABLE ip hash so a person
// votes once per poll (changeable). Tallies are public so voters see live
// result bars. The poll's valid options live in the pinned Discord message
// (parsed by /api/greeter) — this endpoint records whatever `choice` it's sent
// (validated for length/charset) and the UI only renders the known options, so
// any stray rows are harmless. The public POST is per-IP write-rate-limited
// (like votes.ts / feedback.ts) so it can't flood the shared free-tier D1.
// CORS is open (* ) so the dev client on :3000 can reach the wrangler functions
// host on :8799; in prod it's same-origin.
import type { Handler, D1 } from "../_lib/types";
import { pollVoterHash, voterHash } from "../_lib/types";

const PROJECT = "owdle";
const CHOICE_RE = /^[\w-]{1,40}$/;
const MAX_POLL_ID = 80;
// Per-IP write cap (mirrors votes.ts / feedback.ts) so the public POST can't
// flood the shared free-tier D1. Counts this IP's poll-vote rows over the last
// 24h across ALL polls — generous enough that normal voting (and changing your
// pick) never trips it, low enough to bound a flood.
const MAX_POLL_VOTES_PER_VOTER_PER_DAY = 20;

// Public shape: PERCENTAGES ONLY — never raw vote counts or the total (those
// stay in the admin-gated /api/poll-results dev dashboard). The client renders
// its result bars straight from these percentages.
type Tally = {
  pollId: string;
  percentages: Record<string, number>;
  mine: string | null;
};

export const onRequestPost: Handler = async ({ request, env }) => {
  let body: { pollId?: unknown; choice?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const pollId = typeof body.pollId === "string" ? body.pollId.trim() : "";
  const choice = typeof body.choice === "string" ? body.choice.trim() : "";
  if (!pollId || pollId.length > MAX_POLL_ID || !CHOICE_RE.test(choice)) {
    return json({ error: "invalid_payload" }, 400);
  }

  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  // Two hashes from the same IP: `voter` is POLL-STABLE (the one-vote-per-poll
  // dedup key); `ipBucket` ROTATES every 2 days like votes/feedback and is what
  // the rate limit counts — the poll-stable hash embeds pollId, so it alone
  // can't see an IP's writes across different polls.
  const voter = await pollVoterHash(ip, PROJECT, pollId);
  const ipBucket = await voterHash(ip, PROJECT);
  const now = Math.floor(Date.now() / 1000);
  const dayAgo = now - 86400;

  // Atomic per-IP rate limit: the count and the write happen in one statement
  // so concurrent requests can't briefly exceed the cap. The INSERT … SELECT …
  // WHERE only produces a row when this IP is under the daily limit; when it is,
  // ON CONFLICT still lets a repeat voter change their pick (one row per poll).
  const result = await env.DB.prepare(
    `INSERT INTO poll_votes (poll_id, voter_hash, choice, source, created_at, ip_bucket)
     SELECT ?, ?, ?, ?, ?, ?
     WHERE (
       SELECT COUNT(*) FROM poll_votes
       WHERE ip_bucket = ? AND created_at > ?
     ) < ?
     ON CONFLICT(poll_id, voter_hash)
       DO UPDATE SET choice = excluded.choice, created_at = excluded.created_at`,
  )
    .bind(
      pollId,
      voter,
      choice,
      PROJECT,
      now,
      ipBucket,
      ipBucket,
      dayAgo,
      MAX_POLL_VOTES_PER_VOTER_PER_DAY,
    )
    .run();

  // changes === 0 ⇒ the gate blocked the write (over the per-IP cap). A
  // successful re-vote reports changes ≥ 1 via DO UPDATE, so unlike votes.ts
  // there's no duplicate case to disambiguate here.
  const meta = result.meta as { changes?: number } | undefined;
  if (!meta?.changes) {
    return json({ error: "rate_limited" }, 429);
  }

  return json(await tally(env.DB, pollId, voter));
};

export const onRequestGet: Handler = async ({ request, env }) => {
  const pollId = (new URL(request.url).searchParams.get("pollId") ?? "").trim();
  if (!pollId || pollId.length > MAX_POLL_ID) {
    return json({ error: "invalid_payload" }, 400);
  }
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const voter = await pollVoterHash(ip, PROJECT, pollId);
  return json(await tally(env.DB, pollId, voter));
};

// Preflight for the cross-origin dev POST (application/json body isn't a
// "simple" request). No-op in prod (same-origin).
export const onRequestOptions: Handler = async () =>
  new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      "access-control-max-age": "86400",
    },
  });

async function tally(db: D1, pollId: string, voter: string): Promise<Tally> {
  const rows =
    (
      await db
        .prepare(
          `SELECT choice, COUNT(*) AS n FROM poll_votes WHERE poll_id = ? GROUP BY choice`,
        )
        .bind(pollId)
        .all<{ choice: string; n: number }>()
    ).results ?? [];
  const counts: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    counts[r.choice] = r.n;
    total += r.n;
  }
  // Project to percentages server-side so the raw per-option counts and total
  // never leave the server (the public surface is percentages-only).
  const percentages: Record<string, number> = {};
  for (const choice in counts) {
    percentages[choice] = total > 0 ? Math.round((counts[choice] / total) * 100) : 0;
  }
  const mine = await db
    .prepare(`SELECT choice FROM poll_votes WHERE poll_id = ? AND voter_hash = ?`)
    .bind(pollId, voter)
    .first<string>("choice");
  return { pollId, percentages, mine: mine ?? null };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
}
