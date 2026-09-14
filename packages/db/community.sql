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

-- ---------------------------------------------------------------------------
-- Donated inference. A person connects their own AI provider account and the
-- site spends their credits on work they initiate. See
-- docs/2026-09-14-donated-inference.md and apps/api/src/ai-accounts.ts.
-- ---------------------------------------------------------------------------

-- One connected account per person. `provider` is a column and not an assumed
-- constant because OpenRouter is the only consumer OAuth flow that exists
-- today, not the only one that ever will.
CREATE TABLE IF NOT EXISTS ai_accounts (
  person_id     TEXT PRIMARY KEY REFERENCES people(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL DEFAULT 'openrouter',
  -- AES-GCM, `iv.ciphertext` in base64url. The AES key is derived from the
  -- AI_KEY_SECRET Worker secret, so a database dump cannot bill anyone.
  key_encrypted TEXT NOT NULL,
  -- What the provider shows the donor in their own key list, so the charge on
  -- their side is identifiable rather than anonymous.
  label         TEXT,
  connected_at  TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at  TEXT,
  -- Set when the provider rejects the key with a 401. The row is kept rather
  -- than deleted so the settings page can say "reconnect", not "connect".
  revoked_at    TEXT
);

-- A pending OAuth attempt. The PKCE verifier never reaches the browser: it is
-- held here against a random state value, and the callback looks it up by
-- state. Keyed by state rather than by person so a donor who starts the flow
-- twice does not have their first attempt silently overwritten.
CREATE TABLE IF NOT EXISTS ai_oauth_attempts (
  state      TEXT PRIMARY KEY,
  person_id  TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  provider   TEXT NOT NULL,
  verifier   TEXT NOT NULL,
  next       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  used_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_ai_attempts_person ON ai_oauth_attempts(person_id, created_at DESC);

-- One row per run, on the donor's key. This table is what makes the donation
-- visible: attribution is per-run and not a single sponsor field on a thread,
-- because three people can each donate a run to the same thread.
CREATE TABLE IF NOT EXISTS ai_runs (
  id           TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  person_id    TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  action       TEXT NOT NULL,
  model        TEXT NOT NULL,
  provider     TEXT NOT NULL DEFAULT 'openrouter',
  -- Reported by the provider. Nullable: a provider that does not return a cost
  -- still produced a real run, and guessing a number would be worse than none.
  cost_usd     REAL,
  output       TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ai_runs_challenge ON ai_runs(challenge_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_runs_person ON ai_runs(person_id, created_at DESC);
