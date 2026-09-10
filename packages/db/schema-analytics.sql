-- Techno Optimists - analytics database (D1: to-analytics)
-- Separate from the product DB on purpose. Writes here are fire-and-forget and
-- must never be able to slow a feed read.

CREATE TABLE IF NOT EXISTS pageviews (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  path        TEXT NOT NULL,
  referrer    TEXT,
  country     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pageviews_created ON pageviews(created_at DESC);
