-- Baseline: schema migrations table.
-- We keep migrations idempotent and tracked by filename.

CREATE TABLE IF NOT EXISTS schema_migrations (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


