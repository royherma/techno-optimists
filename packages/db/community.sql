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

-- One row per (Challenge, viewer, window). Not a column on challenges: the
-- editorial PATCH rewrites whole columns, and a counter cannot carry the dedupe
-- window a refresh needs. Not challenge_actions either - its PK dedupes one row
-- per person forever and person_id is NOT NULL, so a signed-out reader, who is
-- most readers, has nowhere to go there.
--
-- viewer_key is a hash of IP + User-Agent + the Challenge id, never the address
-- itself. It exists only to make a reload stop counting, so it is salted per
-- Challenge and is useless for following someone between Challenges.
CREATE TABLE IF NOT EXISTS challenge_views (
  challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  viewer_key   TEXT NOT NULL,
  viewed_on    TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (challenge_id, viewer_key, viewed_on)
);
-- The count for a card is COUNT(*) by challenge_id, so that is the index.
CREATE INDEX IF NOT EXISTS views_challenge ON challenge_views(challenge_id);

-- One row per (visitor, day) for the whole site, not per Challenge.
--
-- Deliberately not SUM(challenge_views): that table only records Challenge
-- opens, so the front page, the map and the community page - most of the
-- traffic - would never appear in a number whose whole job is "how many people
-- loaded the site". Summing it would also double-count a reader who opened
-- three Challenges in one visit.
--
-- Same privacy shape as challenge_views: viewer_key is a hash of IP +
-- User-Agent + a fixed site salt, never the address. It exists only to stop a
-- refresh from counting twice, and a day-granularity window means the same
-- reader returning tomorrow is a real second view.
CREATE TABLE IF NOT EXISTS site_views (
  viewer_key TEXT NOT NULL,
  viewed_on  TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (viewer_key, viewed_on)
);
-- The counter is COUNT(*) over the whole table, which the PK already covers.
-- This index serves "views per day" without scanning, for the day the question
-- stops being a single total.
CREATE INDEX IF NOT EXISTS site_views_day ON site_views(viewed_on);
