# Phase 4: Application game monoliths

## Decision (2026-05-20)

**Deferred** until a bundler strategy is chosen. Game bundles under `application/*` are browser scripts without a build step today; several exceed 500 lines (e.g. `tactics-fighter.js` ~5100 lines).

## Options

1. **Multi-script (like `public/course-management-*`)** — lowest risk, no build; many `<script>` tags per game HTML.
2. **esbuild per app** — `application/<app>/src/*.ts` → single bundle; one build script per workspace package.
3. **Leave as-is for games** — focus modularization on `packages/` and `public/` org tooling only.

## Recommended next step

Pilot **esbuild** on `application/monster-fight` (already has `packages/application/monster-fight` server core) before touching `tactics-fighter.js`.

## Smoke pattern (when started)

- `GET /application/<app>/<app>.html` 200
- `GET` each referenced JS bundle 200
- Minimal `GET /api/game/...` if applicable
