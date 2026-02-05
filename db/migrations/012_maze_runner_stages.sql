-- Maze Runner: org-scoped stages library
-- Each stage belongs to a difficulty bucket and has a numeric stage_no.

CREATE TABLE IF NOT EXISTS maze_runner_stages (
  id BIGSERIAL PRIMARY KEY,
  org_id TEXT NOT NULL,
  difficulty TEXT NOT NULL DEFAULT 'easy',
  stage_no INT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, difficulty, stage_no)
);

CREATE INDEX IF NOT EXISTS maze_runner_stages_org_idx
  ON maze_runner_stages(org_id);

CREATE INDEX IF NOT EXISTS maze_runner_stages_org_diff_idx
  ON maze_runner_stages(org_id, difficulty);

