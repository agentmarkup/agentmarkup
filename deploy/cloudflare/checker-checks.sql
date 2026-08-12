CREATE TABLE IF NOT EXISTS checker_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requested_input TEXT NOT NULL,
  normalized_url TEXT NOT NULL,
  origin TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  homepage_status INTEGER NOT NULL,
  llms_status INTEGER NOT NULL,
  robots_status INTEGER NOT NULL,
  sitemap_status INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_checker_checks_checked_at
  ON checker_checks (checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_checker_checks_normalized_url
  ON checker_checks (normalized_url);

CREATE TABLE IF NOT EXISTS checker_request_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_hash TEXT NOT NULL,
  normalized_url TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  challenge_passed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_checker_request_events_ip_requested_at
  ON checker_request_events (ip_hash, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_checker_request_events_normalized_requested_at
  ON checker_request_events (normalized_url, requested_at DESC);

CREATE TABLE IF NOT EXISTS checker_cache (
  normalized_url TEXT PRIMARY KEY,
  response_json TEXT NOT NULL,
  cached_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_checker_cache_expires_at
  ON checker_cache (expires_at);
