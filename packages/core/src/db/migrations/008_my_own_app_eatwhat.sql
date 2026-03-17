-- EatWhat (My Own App) - per admin user state storage
CREATE TABLE IF NOT EXISTS my_own_app_eatwhat_state (
  user_id TEXT PRIMARY KEY,
  state JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


