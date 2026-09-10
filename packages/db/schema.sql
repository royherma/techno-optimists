-- Techno Optimists - product database (D1: techno-optimists)
-- Analytics lives in a SEPARATE D1 (schema-analytics.sql) so a telemetry burst
-- can never queue the product database. creators-of-today learned this the hard
-- way and split it after the fact; we start split.

DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS magic_links;
DROP TABLE IF EXISTS identities;
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

-- ---------------------------------------------------------------------------
-- Auth. Email magic links only: no passwords to leak, no OAuth dependency on a
-- company that can change its terms. A person is created on first successful
-- link click, never before - an unclicked link must not litter the people table.
-- ---------------------------------------------------------------------------

-- Email lives here, NOT on people. people is read by every feed query and gets
-- returned to other users; email is private and must never ride along by
-- accident on a SELECT p.*.
CREATE TABLE identities (
  person_id      TEXT PRIMARY KEY REFERENCES people(id) ON DELETE CASCADE,
  email          TEXT NOT NULL UNIQUE,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at  TEXT
);

-- A pending magic link. Stores a SHA-256 of the token, never the token itself:
-- a leaked database read must not let anyone log in as anyone.
CREATE TABLE magic_links (
  token_hash  TEXT PRIMARY KEY,
  email       TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL,
  -- Set when redeemed. A link works exactly once.
  used_at     TEXT
);

CREATE INDEX idx_magic_links_email ON magic_links(email, created_at DESC);

-- Live sessions. Same hashing rule as magic_links, same reason.
CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY,
  person_id   TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL,
  user_agent  TEXT
);

CREATE INDEX idx_sessions_person ON sessions(person_id, created_at DESC);
