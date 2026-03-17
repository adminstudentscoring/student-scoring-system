# AGENTS.md

## Cursor Cloud specific instructions

### Overview

This is **StudentScoring** — a chess education and student management platform built as a **pnpm monorepo** with **Node.js 20.x / Express** server (`server.ts`) and WebSocket support. The project uses pnpm workspaces.

**Workspace packages:**
- **Root** (`student-scoring-system`): Express server, routes, billing, game modules.
- **`@student-scoring/core`** (`packages/core`): Shared types, auth, middleware, storage, config, database, and lib utilities. The barrel export is `packages/core/src/index.ts`.

### Prerequisites

- **Node.js 20.x** (required by `engines` field in `package.json`). Use `nvm use 20` if multiple versions are installed.
- **pnpm** as the package manager (workspace root has `pnpm-workspace.yaml`). Run `pnpm install` (not `npm install`).
- **PostgreSQL 16** must be running locally. The billing module (`billing/db.ts`) calls `createPool()` at require-time and will crash the server if `DATABASE_URL` is absent or the DB is unreachable.
- A `.env` file (copy from `env.example`). At minimum, set:
  - `DATABASE_URL=postgres://studentscoring:studentscoring@localhost:5432/studentscoring`
  - `PGSSLMODE=disable`
  - `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID` — use any non-empty placeholder strings for dev (e.g. `sb-dev-placeholder`); the module validates presence at load time but the sandbox endpoints are only hit when billing features are exercised.
  - `DB_AUTO_MIGRATE=1` to auto-run Postgres migrations on startup.

### Running the application

```bash
pnpm dev          # runs tsx watch server.ts on port 3000
# or: pnpm start  (npx tsx server.ts)
```

Server listens on `http://localhost:3000`. The Teacher Dashboard is at `/`, login at `/login.html`, admin at `/admin.html`, organization management at `/organization.html`.

### Monorepo structure

```
pnpm-workspace.yaml   # declares packages/* and apps/*
packages/core/        # @student-scoring/core — shared auth, types, middleware, storage, config, db, lib
server.ts             # main Express server (root workspace)
server/routes/        # route handlers
billing/              # PayPal billing module
```

Import from core in root files:
```typescript
const { authenticateUser, LEVELS, getRankInfo } = require('@student-scoring/core');
```

For submodules not re-exported by the barrel (e.g. direct db access):
```typescript
const appDb = require('@student-scoring/core/src/db/postgres');
```

### Gotchas

- **ESLint** is configured via flat config (`eslint.config.js`, ESLint 10+) for both `.js` and `.ts` files. `@typescript-eslint` is used for TypeScript-specific rules. Run `pnpm lint`. Most rules are set to warn. For type checking `.ts` files, also run `pnpm typecheck` (`tsc --noEmit`).
- **Integration tests** use Node.js built-in test runner + supertest. Run `pnpm test`. Tests hit a running server on `http://localhost:3000`, so start the server first or the test helper will spawn one automatically.
- `GET /api/students` uses `optionalAuth` and returns 200 without a token — use `POST /api/students` to test auth-required student routes.
- The server uses **file-based storage** (`data/` directory) for most entities (students, users, organizations, leaderboards). PostgreSQL is used for billing, blunders, tactics fighter, and migrations.
- `billing/paypal.ts` requires `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, and `PAYPAL_WEBHOOK_ID` as environment variables at module load time. The server will crash without them.
- The `data/` directory is auto-created by the server on startup via `ensureDataDir()`.
- **pnpm build scripts**: `bcrypt`, `sharp`, `esbuild`, and `electron` are allowed to run build scripts via `pnpm.onlyBuiltDependencies` in root `package.json`. If adding new native deps, add them there.
- The `middleware/auth.ts` and `middleware/dataIsolation.ts` (now in `packages/core/src/`) import `billing/access` via a long relative path (`../../../../billing/access`). This is because billing hasn't been moved to the core package yet.
- SQL migrations live in `packages/core/src/db/migrations/`. The `db/migrate.ts` module uses `__dirname` to find them.

### Useful scripts (see `package.json`)

| Script | Purpose |
|--------|---------|
| `pnpm dev` / `pnpm start` | Start the server |
| `pnpm init-admin` | Create the first admin user |
| `pnpm db:migrate` | Run Postgres migrations manually |
| `pnpm db:ping` | Test Postgres connectivity |
| `pnpm lint` | Run ESLint on `.js` and `.ts` files (flat config, warnings + TS rules) |
| `pnpm typecheck` | Run `tsc --noEmit` on `.ts` files |
| `pnpm test` | Run integration tests (server must be running) |
