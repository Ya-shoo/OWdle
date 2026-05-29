-- Run once against the canonical D1 (owdle-votes):
--   wrangler d1 execute owdle-votes --remote --file=db/migration-add-pending-replay-links.sql
--
-- Backs the deferred Discord session-replay links. When feedback is
-- submitted, /api/feedback posts the Discord message immediately WITHOUT a
-- replay link (the recording isn't processed yet, and may never exist if
-- the visitor blocked tracking or the session fell under the 30s replay
-- floor) and inserts a row here. The owdle-replay-verifier Worker (cron)
-- later checks PostHog for the recording and, once it exists, edits the
-- Discord message to add the link.
--
-- Lifecycle: status 'pending' -> 'linked' (recording found, message edited)
-- or 'expired' (still no recording after ~30 min). Shared with Deadlockle
-- via the `source` column, same as the votes/feedback tables.

CREATE TABLE IF NOT EXISTS pending_replay_links (
  session_id  TEXT    NOT NULL,
  message_id  TEXT    NOT NULL,
  source      TEXT    NOT NULL DEFAULT 'owdle',
  created_at  INTEGER NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  status      TEXT    NOT NULL DEFAULT 'pending',
  PRIMARY KEY (session_id, message_id)
);

-- The verifier scans pending rows oldest-first; this index keeps that scan
-- cheap as completed/expired rows accumulate.
CREATE INDEX IF NOT EXISTS idx_pending_replay_status ON pending_replay_links(status, created_at);
