-- Run once against the canonical D1 (owdle-votes):
--   wrangler d1 execute owdle-votes --remote --file=db/migration-add-replay-webhook-url.sql
--
-- Adds webhook_url to pending_replay_links. /api/feedback now stores the exact
-- Discord webhook URL it posted with, and the owdle-replay-verifier Worker edits
-- the message via that same webhook (Discord only lets a webhook edit its own
-- messages). This removes the worker's dependence on a separately-configured
-- FEEDBACK_WEBHOOK_URL secret, which is fragile and easy to mismatch.

ALTER TABLE pending_replay_links ADD COLUMN webhook_url TEXT;
