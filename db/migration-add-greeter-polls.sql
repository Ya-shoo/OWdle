-- Run once against the canonical D1 (owdle-votes), shared with Deadlockle:
--   npx wrangler d1 execute owdle-votes --remote --file=db/migration-add-greeter-polls.sql
-- And for the local dev miniflare D1 (so the og helper can serve polls):
--   npx wrangler d1 execute owdle-votes --local  --file=db/migration-add-greeter-polls.sql
--
-- Upgrading a DB that already had poll_votes from BEFORE the ip_bucket column
-- existed (CREATE TABLE IF NOT EXISTS can't add a column to an existing table):
--   npx wrangler d1 execute owdle-votes --remote --command "ALTER TABLE poll_votes ADD COLUMN ip_bucket TEXT"
--   npx wrangler d1 execute owdle-votes --remote --command "CREATE INDEX IF NOT EXISTS idx_poll_votes_ip ON poll_votes(ip_bucket, created_at)"
--
-- Backs the avatar-greeter mini-polls. A pinned Discord announcement can carry
-- /slash-token options (parsed by functions/api/greeter.ts); clicking one
-- records a vote here via functions/api/greeter-poll.ts.
--
-- One row per (poll, voter). poll_id is the Discord message id (e.g.
-- "msg:1520..."). voter_hash is sha256(ip + project + poll_id) — POLL-STABLE
-- (no time rotation like the votes table), so a visitor votes at most once per
-- poll; ON CONFLICT lets them change their pick. The `source` column shares
-- the table across OWdle + Deadlockle, same as votes/feedback.
--
-- ip_bucket is sha256(ip + project + 2-day bucket) — the ROTATING per-IP hash
-- (the same one votes/feedback use), stored so functions/api/greeter-poll.ts
-- can enforce an atomic per-IP write cap across all polls. The poll-stable
-- voter_hash embeds poll_id, so it alone can't see an IP's cross-poll volume.
-- Nullable: rows written before this column existed just don't count toward
-- the limit.
CREATE TABLE IF NOT EXISTS poll_votes (
  poll_id    TEXT    NOT NULL,
  voter_hash TEXT    NOT NULL,
  choice     TEXT    NOT NULL,
  source     TEXT    NOT NULL DEFAULT 'owdle',
  created_at INTEGER NOT NULL,
  ip_bucket  TEXT,
  PRIMARY KEY (poll_id, voter_hash)
);

-- Tally queries group by poll_id; keep that cheap as polls accumulate.
CREATE INDEX IF NOT EXISTS idx_poll_votes_poll ON poll_votes(poll_id);

-- The per-IP rate-limit count filters on ip_bucket + created_at.
CREATE INDEX IF NOT EXISTS idx_poll_votes_ip ON poll_votes(ip_bucket, created_at);
