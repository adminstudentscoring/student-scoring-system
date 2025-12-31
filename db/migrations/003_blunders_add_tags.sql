-- Add tagging (A) support to Postgres-backed blunders
-- Safe to run multiple times.

ALTER TABLE blunders_puzzles
  ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE blunders_puzzles
  ADD COLUMN IF NOT EXISTS tagger_version TEXT;

ALTER TABLE blunders_puzzles
  ADD COLUMN IF NOT EXISTS tagged_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS blunders_puzzles_tags_gin_idx
  ON blunders_puzzles USING GIN (tags);


