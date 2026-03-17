-- Tactics Fighter: org-level settings (Stockfish depth cap)
-- This is used to clamp engine analysis depth for both Practice and Builder.

CREATE TABLE IF NOT EXISTS tactics_fighter_settings (
  org_id TEXT PRIMARY KEY,
  stockfish_depth_cap INT NOT NULL DEFAULT 14,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

CREATE INDEX IF NOT EXISTS tactics_fighter_settings_org_idx ON tactics_fighter_settings(org_id);

