const { dbQuery, getPool } = require('../db/postgres');

async function query(text, params) {
  return dbQuery(text, params);
}

async function ensureBillingSchema() {
  const pool = getPool();
  if (!pool) {
    console.log('Billing schema: skipped (Postgres not configured).');
    return;
  }
  await query(`
    CREATE TABLE IF NOT EXISTS billing_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS billing_webhook_events (
      id BIGSERIAL PRIMARY KEY,
      paypal_event_id TEXT UNIQUE NOT NULL,
      event_type TEXT,
      resource_type TEXT,
      resource_id TEXT,
      raw JSONB NOT NULL,
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS billing_subscriptions (
      id BIGSERIAL PRIMARY KEY,
      org_id TEXT NOT NULL,
      price_id TEXT,
      paypal_subscription_id TEXT UNIQUE NOT NULL,
      paypal_plan_id TEXT,
      status TEXT,
      currency TEXT,
      billing_type TEXT,
      current_period_end TIMESTAMPTZ,
      grace_until TIMESTAMPTZ,
      cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS billing_subscriptions_org_id_idx ON billing_subscriptions(org_id);

    CREATE TABLE IF NOT EXISTS billing_entitlements (
      org_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      teacher_seats INTEGER NOT NULL DEFAULT 0,
      student_seats INTEGER NOT NULL DEFAULT 0,
      features JSONB NOT NULL DEFAULT '{}'::jsonb,
      current_period_end TIMESTAMPTZ,
      grace_until TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS billing_trials (
      org_id TEXT PRIMARY KEY,
      trial_start TIMESTAMPTZ NOT NULL,
      trial_end TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function getMeta(key) {
  const res = await query('SELECT value FROM billing_meta WHERE key=$1', [key]);
  return res.rows[0]?.value || null;
}

async function setMeta(key, value) {
  await query(
    `
    INSERT INTO billing_meta(key, value, updated_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()
  `,
    [key, value]
  );
}

module.exports = {
  get pool() { return getPool(); },
  query,
  ensureBillingSchema,
  getMeta,
  setMeta
};
