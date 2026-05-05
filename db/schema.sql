-- D1 schema for the "request next game" feature.
-- One row per (game, voter). Composite primary key naturally dedups.
-- voter_hash is sha256(ip + salt) so we can rate-limit without storing PII.

CREATE TABLE IF NOT EXISTS votes (
  game_id      TEXT    NOT NULL,
  voter_hash   TEXT    NOT NULL,
  game_name    TEXT    NOT NULL,
  game_image   TEXT,
  game_released TEXT,
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (game_id, voter_hash)
);

CREATE INDEX IF NOT EXISTS idx_votes_game_id ON votes(game_id);
CREATE INDEX IF NOT EXISTS idx_votes_created_at ON votes(created_at);
