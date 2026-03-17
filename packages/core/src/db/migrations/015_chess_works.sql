-- Chess Works: org-scoped works library + assignments + review/history

CREATE TABLE IF NOT EXISTS chess_works_folders (
  id BIGSERIAL PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_no INT NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS chess_works_folders_org_idx ON chess_works_folders(org_id);

CREATE TABLE IF NOT EXISTS chess_works_works (
  id BIGSERIAL PRIMARY KEY,
  org_id TEXT NOT NULL,
  folder_id BIGINT,
  title TEXT NOT NULL DEFAULT '',
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS chess_works_works_org_idx ON chess_works_works(org_id);
CREATE INDEX IF NOT EXISTS chess_works_works_org_folder_idx ON chess_works_works(org_id, folder_id);

CREATE TABLE IF NOT EXISTS chess_works_groups (
  id BIGSERIAL PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, name)
);
CREATE INDEX IF NOT EXISTS chess_works_groups_org_idx ON chess_works_groups(org_id);

CREATE TABLE IF NOT EXISTS chess_works_group_members (
  id BIGSERIAL PRIMARY KEY,
  org_id TEXT NOT NULL,
  group_id BIGINT NOT NULL,
  student_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, group_id, student_id)
);
CREATE INDEX IF NOT EXISTS chess_works_group_members_org_idx ON chess_works_group_members(org_id);
CREATE INDEX IF NOT EXISTS chess_works_group_members_group_idx ON chess_works_group_members(group_id);
CREATE INDEX IF NOT EXISTS chess_works_group_members_student_idx ON chess_works_group_members(student_id);

CREATE TABLE IF NOT EXISTS chess_works_assignments (
  id BIGSERIAL PRIMARY KEY,
  org_id TEXT NOT NULL,
  work_id BIGINT NOT NULL,
  assigned_to_type TEXT NOT NULL, -- 'student' | 'group'
  assigned_to_id TEXT NOT NULL,   -- student_id or group_id (as text)
  assigned_by TEXT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, work_id, assigned_to_type, assigned_to_id)
);
CREATE INDEX IF NOT EXISTS chess_works_assignments_org_idx ON chess_works_assignments(org_id);
CREATE INDEX IF NOT EXISTS chess_works_assignments_work_idx ON chess_works_assignments(work_id);
CREATE INDEX IF NOT EXISTS chess_works_assignments_to_idx ON chess_works_assignments(assigned_to_type, assigned_to_id);

CREATE TABLE IF NOT EXISTS chess_works_submissions (
  id BIGSERIAL PRIMARY KEY,
  org_id TEXT NOT NULL,
  work_id BIGINT NOT NULL,
  student_id TEXT NOT NULL,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, work_id, student_id)
);
CREATE INDEX IF NOT EXISTS chess_works_submissions_org_idx ON chess_works_submissions(org_id);
CREATE INDEX IF NOT EXISTS chess_works_submissions_work_student_idx ON chess_works_submissions(work_id, student_id);

CREATE TABLE IF NOT EXISTS chess_works_reviews (
  id BIGSERIAL PRIMARY KEY,
  org_id TEXT NOT NULL,
  work_id BIGINT NOT NULL,
  student_id TEXT NOT NULL,
  marks JSONB NOT NULL DEFAULT '[]'::jsonb, -- per-item: correct|incorrect|half
  finished BOOLEAN NOT NULL DEFAULT FALSE,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, work_id, student_id)
);
CREATE INDEX IF NOT EXISTS chess_works_reviews_org_idx ON chess_works_reviews(org_id);
CREATE INDEX IF NOT EXISTS chess_works_reviews_work_student_idx ON chess_works_reviews(work_id, student_id);

