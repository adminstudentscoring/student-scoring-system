-- Tactics Fighter Builder (org-scoped library)
-- Category -> Topic -> Subtopic -> Puzzles

CREATE TABLE IF NOT EXISTS tactics_fighter_categories (
  id BIGSERIAL PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, name)
);

CREATE INDEX IF NOT EXISTS tactics_fighter_categories_org_idx
  ON tactics_fighter_categories(org_id);

CREATE TABLE IF NOT EXISTS tactics_fighter_topics (
  id BIGSERIAL PRIMARY KEY,
  org_id TEXT NOT NULL,
  category_id BIGINT NOT NULL REFERENCES tactics_fighter_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (category_id, name)
);

CREATE INDEX IF NOT EXISTS tactics_fighter_topics_org_idx
  ON tactics_fighter_topics(org_id);
CREATE INDEX IF NOT EXISTS tactics_fighter_topics_category_idx
  ON tactics_fighter_topics(category_id);

CREATE TABLE IF NOT EXISTS tactics_fighter_subtopics (
  id BIGSERIAL PRIMARY KEY,
  org_id TEXT NOT NULL,
  topic_id BIGINT NOT NULL REFERENCES tactics_fighter_topics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (topic_id, name)
);

CREATE INDEX IF NOT EXISTS tactics_fighter_subtopics_org_idx
  ON tactics_fighter_subtopics(org_id);
CREATE INDEX IF NOT EXISTS tactics_fighter_subtopics_topic_idx
  ON tactics_fighter_subtopics(topic_id);

CREATE TABLE IF NOT EXISTS tactics_fighter_puzzles (
  id BIGSERIAL PRIMARY KEY,
  org_id TEXT NOT NULL,
  subtopic_id BIGINT NOT NULL REFERENCES tactics_fighter_subtopics(id) ON DELETE CASCADE,
  fen TEXT NOT NULL,
  side_to_move CHAR(1),
  -- Engine request settings
  engine_depth INT,
  multipv INT,
  pv_plies INT,
  -- Engine output (best + N-best lines)
  solutions JSONB,
  meta JSONB,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tactics_fighter_puzzles_org_idx
  ON tactics_fighter_puzzles(org_id);
CREATE INDEX IF NOT EXISTS tactics_fighter_puzzles_subtopic_idx
  ON tactics_fighter_puzzles(subtopic_id);


