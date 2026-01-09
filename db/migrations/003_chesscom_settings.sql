-- Chess.com settings (org-scoped, per-student)
-- Stores teacher-managed Chess.com credentials used by Student Dashboard "Chess.com" application.

CREATE TABLE IF NOT EXISTS chesscom_settings (
  org_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  chess_id TEXT NOT NULL,
  password TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (org_id, student_id)
);

CREATE INDEX IF NOT EXISTS chesscom_settings_org_idx ON chesscom_settings(org_id);


