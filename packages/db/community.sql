-- Additive, repeatable migration. Never use schema.sql against existing data.
CREATE TABLE IF NOT EXISTS challenge_comments (
  id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL REFERENCES challenges(id),
  author_id TEXT NOT NULL REFERENCES people(id),
  parent_id TEXT REFERENCES challenge_comments(id),
  kind TEXT NOT NULL DEFAULT 'comment' CHECK(kind IN ('comment','idea','question','evidence','test_result')),
  body TEXT NOT NULL,
  request_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(author_id, request_id)
);
CREATE INDEX IF NOT EXISTS comments_challenge ON challenge_comments(challenge_id);
CREATE INDEX IF NOT EXISTS comments_author_time ON challenge_comments(author_id, created_at);
