# AGENTS.md

## Cursor Cloud specific instructions

### Overview

This is **StudentScoring** — a chess education and student management platform built as a monolithic **Node.js 20.x / Express** server (`server.js`) with WebSocket support. It is **not** a monorepo; everything is a single `package.json`.

### Prerequisites

- **Node.js 20.x** (required by `engines` field in `package.json`). Use `nvm use 20` if multiple versions are installed.
- **PostgreSQL 16** must be running locally. The billing module (`billing/db.js`) calls `createPool()` at require-time and will crash the server if `DATABASE_URL` is absent or the DB is unreachable.
- A `.env` file (copy from `env.example`). At minimum, set:
  - `DATABASE_URL=postgres://studentscoring:studentscoring@localhost:5432/studentscoring`
  - `PGSSLMODE=disable`
  - `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID` — use any non-empty placeholder strings for dev (e.g. `sb-dev-placeholder`); the module validates presence at load time but the sandbox endpoints are only hit when billing features are exercised.
  - `DB_AUTO_MIGRATE=1` to auto-run Postgres migrations on startup.

### Running the application

```bash
npm run dev          # same as npm start — runs node server.js on port 3000
```

Server listens on `http://localhost:3000`. The Teacher Dashboard is at `/`, login at `/login.html`, admin at `/admin.html`, organization management at `/organization.html`.

### Gotchas

- **No ESLint / linter config** exists in the repository. There are no `npm test` or `npm run lint` scripts defined.
- **No automated test suite** exists (no `*.test.*` or `*.spec.*` files).
- The server uses **file-based storage** (`data/` directory) for most entities (students, users, organizations, leaderboards). PostgreSQL is used for billing, blunders, tactics fighter, and migrations.
- `billing/paypal.js` requires `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, and `PAYPAL_WEBHOOK_ID` as environment variables at module load time. The server will crash without them.
- To create the initial admin user: `node scripts/init-admin.js <email> <password> <name>`.
- The `data/` directory is auto-created by the server on startup via `ensureDataDir()`.

### Useful scripts (see `package.json`)

| Script | Purpose |
|--------|---------|
| `npm run dev` / `npm start` | Start the server |
| `npm run init-admin` | Create the first admin user |
| `npm run db:migrate` | Run Postgres migrations manually |
| `npm run db:ping` | Test Postgres connectivity |
