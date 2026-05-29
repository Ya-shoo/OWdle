-- D1 schema for the "request next game" feature.
-- This database is shared between OWdle and Deadlockle (canonical: owdle-votes).
-- One row per (game, voter). voter_hash is sha256(ip + project + 2-day bucket)
-- so we can rate-limit without storing PII; the salt rotates every 2 days,
-- and including `project` lets a single IP cast one vote per site (max 2).
-- `source` records which site the vote came from.

CREATE TABLE IF NOT EXISTS votes (
  game_id      TEXT    NOT NULL,
  voter_hash   TEXT    NOT NULL,
  game_name    TEXT    NOT NULL,
  game_image   TEXT,
  game_released TEXT,
  created_at   INTEGER NOT NULL,
  source       TEXT    NOT NULL DEFAULT 'owdle',
  PRIMARY KEY (game_id, voter_hash)
);

CREATE INDEX IF NOT EXISTS idx_votes_game_id ON votes(game_id);
CREATE INDEX IF NOT EXISTS idx_votes_created_at ON votes(created_at);
CREATE INDEX IF NOT EXISTS idx_votes_source ON votes(source);

-- Deferred Discord session-replay links. /api/feedback inserts a row when a
-- feedback submission carries a PostHog session id; the owdle-replay-verifier
-- Worker later edits the Discord message to add the replay link once the
-- recording exists. See db/migration-add-pending-replay-links.sql.
CREATE TABLE IF NOT EXISTS pending_replay_links (
  session_id  TEXT    NOT NULL,
  message_id  TEXT    NOT NULL,
  source      TEXT    NOT NULL DEFAULT 'owdle',
  created_at  INTEGER NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  status      TEXT    NOT NULL DEFAULT 'pending',
  -- The exact Discord webhook URL that posted the message. The verifier
  -- Worker edits via the same webhook (Discord only lets a webhook edit its
  -- own messages), so it never depends on a separately-configured secret.
  webhook_url TEXT,
  PRIMARY KEY (session_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_pending_replay_status ON pending_replay_links(status, created_at);
