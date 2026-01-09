-- Tactics Fighter Builder: add practice bucket scoping (beginner/400up/...)
-- Categories are unique per (org_id, bucket, name)

ALTER TABLE tactics_fighter_categories
  ADD COLUMN IF NOT EXISTS bucket TEXT NOT NULL DEFAULT 'beginner';

-- Drop old uniqueness (org_id, name) so the same name can exist across buckets.
ALTER TABLE tactics_fighter_categories
  DROP CONSTRAINT IF EXISTS tactics_fighter_categories_org_id_name_key;

-- Prefer a unique index (idempotent) for the new uniqueness.
CREATE UNIQUE INDEX IF NOT EXISTS tactics_fighter_categories_org_bucket_name_uq
  ON tactics_fighter_categories(org_id, bucket, name);

CREATE INDEX IF NOT EXISTS tactics_fighter_categories_org_bucket_idx
  ON tactics_fighter_categories(org_id, bucket);


