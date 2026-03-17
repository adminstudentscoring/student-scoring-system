-- Tactics Fighter Photo Recognize jobs (org-scoped)

CREATE TABLE IF NOT EXISTS tf_photo_recognize_jobs (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  subtopic_id BIGINT NOT NULL,
  created_by TEXT,
  status TEXT NOT NULL DEFAULT 'queued', -- queued | running | done | error
  message TEXT,
  total_files INT NOT NULL DEFAULT 0,
  total_segments INT NOT NULL DEFAULT 0,
  total_fens INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tf_photo_recognize_jobs_org_id_idx ON tf_photo_recognize_jobs(org_id);
CREATE INDEX IF NOT EXISTS tf_photo_recognize_jobs_subtopic_id_idx ON tf_photo_recognize_jobs(subtopic_id);

CREATE TABLE IF NOT EXISTS tf_photo_recognize_items (
  id BIGSERIAL PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES tf_photo_recognize_jobs(id) ON DELETE CASCADE,
  idx INT NOT NULL,
  fen TEXT NOT NULL,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_id, idx)
);

CREATE INDEX IF NOT EXISTS tf_photo_recognize_items_job_id_idx ON tf_photo_recognize_items(job_id);


