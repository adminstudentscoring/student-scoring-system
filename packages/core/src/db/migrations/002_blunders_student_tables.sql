-- Student Blunders tables (no master).
-- NOTE: We keep puzzle content immutable in blunders_puzzles; user progress lives in blunders_progress.

CREATE TABLE IF NOT EXISTS blunders_puzzles (
  -- Stable unique key: `${orgId}|${studentId}|${gameUrlOrUuid}|${ply}`
  key TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  chesscom_username TEXT,
  game_url TEXT,
  time_class TEXT,
  end_time_sec BIGINT,
  sort_at_ms BIGINT NOT NULL DEFAULT 0,
  student_color TEXT,
  start_fen TEXT,
  opponent_move_uci TEXT,
  opponent_san TEXT,
  blunder_move_uci TEXT,
  blunder_san TEXT,
  best_move_uci TEXT,
  best_cp INTEGER,
  after_cp INTEGER,
  drop_cp INTEGER,
  drop_points DOUBLE PRECISION,
  created_at TIMESTAMPTZ,
  -- Optional: keep original JSON for future fields without migrations
  raw JSONB
);

CREATE INDEX IF NOT EXISTS blunders_puzzles_org_sort_idx ON blunders_puzzles(org_id, sort_at_ms DESC);
CREATE INDEX IF NOT EXISTS blunders_puzzles_org_student_sort_idx ON blunders_puzzles(org_id, student_id, sort_at_ms DESC);
CREATE INDEX IF NOT EXISTS blunders_puzzles_org_student_idx ON blunders_puzzles(org_id, student_id);
CREATE INDEX IF NOT EXISTS blunders_puzzles_best_cp_idx ON blunders_puzzles(best_cp);
CREATE INDEX IF NOT EXISTS blunders_puzzles_drop_points_idx ON blunders_puzzles(drop_points);

-- Progress per (org, student, puzzle key)
CREATE TABLE IF NOT EXISTS blunders_progress (
  org_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  puzzle_key TEXT NOT NULL REFERENCES blunders_puzzles(key) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | completed
  completed_at TIMESTAMPTZ,
  attempts JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (org_id, student_id, puzzle_key)
);

CREATE INDEX IF NOT EXISTS blunders_progress_org_student_status_idx ON blunders_progress(org_id, student_id, status);
CREATE INDEX IF NOT EXISTS blunders_progress_status_idx ON blunders_progress(status);

-- Analyzed games per student (used to skip re-analysis)
CREATE TABLE IF NOT EXISTS blunders_analyzed_games (
  org_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  game_key TEXT NOT NULL, -- game.url or game.uuid
  url TEXT,
  uuid TEXT,
  end_time_sec BIGINT,
  time_class TEXT,
  ply_count INTEGER,
  opponent_rating INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (org_id, student_id, game_key)
);

CREATE INDEX IF NOT EXISTS blunders_analyzed_games_org_student_idx ON blunders_analyzed_games(org_id, student_id);
CREATE INDEX IF NOT EXISTS blunders_analyzed_games_org_end_time_idx ON blunders_analyzed_games(org_id, end_time_sec DESC);


