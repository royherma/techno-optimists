-- Techno Optimists - product database (D1: techno-optimists)
-- Analytics lives in a SEPARATE D1 (schema-analytics.sql) so a telemetry burst
-- can never queue the product database. creators-of-today learned this the hard
-- way and split it after the fact; we start split.

DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS magic_links;
DROP TABLE IF EXISTS identities;
DROP TABLE IF EXISTS challenge_actions;
DROP TABLE IF EXISTS challenge_comments;
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
  -- Where it actually is, when the author placed it. NULL is the common case and
  -- always will be: a Challenge is complete without coordinates, and the map is
  -- an optional view of the subset that carries them - never a required field.
  -- Distinct from `location`, which is the human label ("Chiang Mai, Thailand")
  -- and is what every text surface renders. These two are set independently:
  -- a pin with no label and a label with no pin are both valid rows.
  lat              REAL,
  lng              REAL,
  tags             TEXT NOT NULL DEFAULT '[]',   -- json array
  emoji            TEXT,                       -- optional, admin-curated
  author_id        TEXT NOT NULL REFERENCES people(id),
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  -- Feed sorts on this, not created_at: a 3-month-old Challenge that got a test
  -- result yesterday is the most interesting thing on the site.
  last_activity_at TEXT NOT NULL DEFAULT (datetime('now')),
  -- SEED ONLY. Demo counts so the feed shows realistic scale before real users
  -- exist. The API adds this to the true COUNT() from challenge_actions.
  -- Delete this column and its uses the day real traffic lands.
  seed_actions     TEXT NOT NULL DEFAULT '{}',

  -- ---------------------------------------------------------------------------
  -- Provenance. Set when a Challenge was logged on someone else's behalf rather
  -- than posted by the person living it - a researcher reading a news report, a
  -- forum thread, a paper.
  --
  -- These are NOT the same fact as author_id, and collapsing them would be the
  -- bug. author_id is who typed it into this site; these three say where the
  -- claim actually came from. A Challenge sourced from a Sri Lankan farmer's
  -- account in a newspaper is authored by @atlas and sourced from that paper,
  -- and the card has to be able to say so - otherwise the site is quietly
  -- claiming a stranger's problem as its own reporting.
  --
  -- NULL is the normal case and always will be: someone posting their own
  -- problem has no source to cite, and a row without these is complete.

  -- Where the claim came from. A URL in practice, but not constrained to one:
  -- "phone call with a co-op manager, 2026-09" is a real provenance and a
  -- column that rejected it would push it into the body where nothing can read
  -- it. Rendering treats an http(s) value as a link and anything else as text.
  source_url       TEXT,
  -- Human label for the source: 'Nepali Times', 'r/permaculture', 'Gavi'.
  -- Kept separate from the URL so a card can credit the outlet without making
  -- the reader parse a hostname, and so two rows citing one outlet group.
  source_name      TEXT,
  -- Free note on how this was verified, for rows where the URL alone does not
  -- carry it: which claim in the article we relied on, what stayed unconfirmed.
  source_note      TEXT,
  -- When the row was imported in bulk rather than posted. Doubles as the flag
  -- for "this is an imported row" - the one query that matters for pulling a
  -- bad batch back out is WHERE imported_at IS NOT NULL, and a boolean column
  -- would answer that without telling you which batch.
  imported_at      TEXT
);

-- Pulling one import batch back out, and listing everything Atlas logged, are
-- both this index. Partial so the rows people actually posted cost nothing.
CREATE INDEX idx_challenges_imported ON challenges(imported_at DESC) WHERE imported_at IS NOT NULL;

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
  -- Admin flag. Lives here and not on people for the same reason email does:
  -- people is returned to other users, and who can moderate is nobody else's
  -- business. PublicPerson is structurally unable to carry it from here.
  --
  -- This column is a CACHE, not the source of truth. The ADMIN_EMAILS secret,
  -- read by apps/api/src/admin.ts, decides - and every session resolve rewrites
  -- this to match. So changing that secret takes effect on the next request for
  -- accounts that already exist - including revoking, when an address leaves it.
  -- An unset secret therefore demotes everyone rather than leaving this column
  -- standing, which is deliberate: the secret is the only source of truth.
  is_admin       INTEGER NOT NULL DEFAULT 0,
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
  used_at     TEXT,
  -- Who asked. This table IS the rate limiter: the hourly per-email and per-IP
  -- counts are COUNT(*) over the two indexes below. Nullable because a request
  -- without CF-Connecting-IP (a local curl) still has to be able to sign in.
  ip          TEXT
);

CREATE INDEX idx_magic_links_email ON magic_links(email, created_at DESC);
CREATE INDEX idx_magic_links_ip ON magic_links(ip, created_at DESC);

-- Live sessions. Same hashing rule as magic_links, same reason.
CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY,
  person_id   TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL,
  user_agent  TEXT
);

CREATE INDEX idx_sessions_person ON sessions(person_id, created_at DESC);

-- Reach as a ring count 1..5, indexing IMPACT_TIERS in packages/types. Nullable
-- because unspecified is a real and common state: a Challenge is complete
-- without one, and every surface leaves it unmarked rather than guessing a tier.
-- Added to existing databases by scripts/migrate-community.mjs, which ALTERs
-- only when the column is missing.
ALTER TABLE challenges ADD COLUMN impact INTEGER;

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

-- Mirrored from community.sql, like challenge_comments above: a database built
-- fresh from this file must have every table the API selects from, or the feed
-- and detail routes fail on the missing relation.
CREATE TABLE IF NOT EXISTS challenge_views (
  challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  viewer_key   TEXT NOT NULL,
  viewed_on    TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (challenge_id, viewer_key, viewed_on)
);
CREATE INDEX IF NOT EXISTS views_challenge ON challenge_views(challenge_id);
CREATE INDEX IF NOT EXISTS comments_author_time ON challenge_comments(author_id, created_at);

-- Site-wide hit counter: one row per visitor per day, for any page, not just a
-- Challenge. See the longer note in community.sql for why this is not a SUM
-- over challenge_views.
CREATE TABLE IF NOT EXISTS site_views (
  viewer_key TEXT NOT NULL,
  viewed_on  TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (viewer_key, viewed_on)
);
CREATE INDEX IF NOT EXISTS site_views_day ON site_views(viewed_on);
