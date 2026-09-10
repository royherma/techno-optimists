-- Techno Optimists - product database (D1: techno-optimists)
-- Analytics lives in a SEPARATE D1 (schema-analytics.sql) so a telemetry burst
-- can never queue the product database. creators-of-today learned this the hard
-- way and split it after the fact; we start split.

DROP TABLE IF EXISTS challenge_actions;
DROP TABLE IF EXISTS updates;
DROP TABLE IF EXISTS challenges;
DROP TABLE IF EXISTS people;

CREATE TABLE people (
  id               TEXT PRIMARY KEY,
  handle           TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  avatar_url       TEXT,
  location         TEXT,
  skills           TEXT NOT NULL DEFAULT '[]',   -- json array
  roles            TEXT NOT NULL DEFAULT '[]',   -- json array of Role
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE challenges (
  id               TEXT PRIMARY KEY,
  slug             TEXT NOT NULL UNIQUE,
  -- How it entered the world: problem | idea | experiment | build. Kept for life.
  type             TEXT NOT NULL,
  -- Lifecycle position: spot | understand | ideas | build | test | learn | improve.
  stage            TEXT NOT NULL DEFAULT 'spot',
  title            TEXT NOT NULL,
  summary          TEXT NOT NULL,
  body             TEXT,
  media            TEXT NOT NULL DEFAULT '[]',   -- json array of Media
  location         TEXT,
  tags             TEXT NOT NULL DEFAULT '[]',   -- json array
  author_id        TEXT NOT NULL REFERENCES people(id),
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  -- Feed sorts on this, not created_at: a 3-month-old Challenge that got a test
  -- result yesterday is the most interesting thing on the site.
  last_activity_at TEXT NOT NULL DEFAULT (datetime('now')),
  -- SEED ONLY. Demo counts so the feed shows realistic scale before real users
  -- exist. The API adds this to the true COUNT() from challenge_actions.
  -- Delete this column and its uses the day real traffic lands.
  seed_actions     TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_challenges_activity ON challenges(last_activity_at DESC);
CREATE INDEX idx_challenges_created  ON challenges(created_at DESC);
CREATE INDEX idx_challenges_type     ON challenges(type, last_activity_at DESC);

-- ONE table for all seven typed actions, discriminated by `kind`.
-- Deliberately not three tables (likes/ratings/saves) doing one job.
CREATE TABLE challenge_actions (
  challenge_id     TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  person_id        TEXT NOT NULL REFERENCES people(id),
  -- have_problem | want_this | have_idea | can_help | will_test | building_this | follow
  kind             TEXT NOT NULL,
  -- Set only when kind='can_help': research|code|hardware|design|expertise|testing|funding|other
  help_kind        TEXT,
  note             TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (challenge_id, person_id, kind)
);

-- Counts-by-kind for a feed page is the hottest query on the site.
CREATE INDEX idx_actions_challenge ON challenge_actions(challenge_id, kind);
CREATE INDEX idx_actions_person    ON challenge_actions(person_id, created_at DESC);

-- The progress log. Every meaningful development, oldest to newest.
CREATE TABLE updates (
  id               TEXT PRIMARY KEY,
  challenge_id     TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  author_id        TEXT NOT NULL REFERENCES people(id),
  -- Non-null when this update moved the Challenge to a new stage.
  stage            TEXT,
  body             TEXT NOT NULL,
  media            TEXT NOT NULL DEFAULT '[]',
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_updates_challenge ON updates(challenge_id, created_at DESC);
