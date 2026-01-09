-- Tactics Fighter Student progress + attempts (org-scoped)

CREATE TABLE IF NOT EXISTS tactics_fighter_student_progress (
  org_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  puzzle_id BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress', -- in_progress | completed
  completed_at TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempts_count INT NOT NULL DEFAULT 0,
  wrong_count INT NOT NULL DEFAULT 0,
  meta JSONB,
  PRIMARY KEY (org_id, student_id, puzzle_id)
);

CREATE INDEX IF NOT EXISTS tactics_fighter_student_progress_org_student_idx
  ON tactics_fighter_student_progress(org_id, student_id);

CREATE TABLE IF NOT EXISTS tactics_fighter_student_attempts (
  id BIGSERIAL PRIMARY KEY,
  org_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  bucket TEXT,
  subtopic_id BIGINT,
  puzzle_id BIGINT NOT NULL,
  attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- The full move sequence so far (UCI), and the latest move
  moves_uci JSONB,
  move_uci TEXT,
  ply_index INT,
  correct_prefix BOOLEAN NOT NULL DEFAULT FALSE,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  chosen_line INT,
  meta JSONB
);

CREATE INDEX IF NOT EXISTS tactics_fighter_student_attempts_org_student_idx
  ON tactics_fighter_student_attempts(org_id, student_id);
CREATE INDEX IF NOT EXISTS tactics_fighter_student_attempts_puzzle_idx
  ON tactics_fighter_student_attempts(puzzle_id);


