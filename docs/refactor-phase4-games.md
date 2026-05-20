# Phase 4: Application game monoliths

## Decision (2026-05-20)

**esbuild** chosen for browser game bundles under `application/*`.

- Source: `application/<app>/src/main.js` (+ modules)
- Output: `application/<app>/<app>.js` (single IIFE bundle, loaded by HTML / application-window)
- Build: `pnpm build:<app>` or aggregate `pnpm build:applications`
- Smoke: `pnpm test:application-static`

`core.js` for tactics-fighter and blunders stays a separate script where HTML loads it before the app bundle (`window.__TacticsFighterCore`, `window.BlundersCore`).

## Rejected / deferred

1. **Multi-script only** — still valid for apps without a build step; higher HTML churn.
2. **Leave as-is** — no longer the default for games over ~500 lines.

## Rollout pattern

Use `scripts/split-application-js.sh <app-name>` to scaffold `src/main.js` + legacy copy, then:

1. Extract 2–3 self-contained modules (html/utils, constants, debug, settings, etc.).
2. Wire legacy file with `import` from those modules.
3. Add `"build:<app>"` to root `package.json`.
4. Run `pnpm build:<app>` before deploy / smoke tests.
5. Extend `test/application-static-smoke.test.ts` for standalone HTML entries.

| App | Build script | src/ layout | Status |
|-----|--------------|-------------|--------|
| monster-fight | `build:monster-fight` | main, game-legacy, html-utils, images, constants | **done** (pilot) |
| monster-fight-shell | `build:monster-fight-shell` | main, game-legacy | **done** |
| tactics-fighter | `build:tactics-fighter` | main, app-legacy, debug, settings | **done** |
| tactics-fighter core | `build:tactics-fighter-core` | core-main, core-legacy | **done** |
| blunders | `build:blunders` (+ core/teacher/student) | main + per-role entries | **done** |
| chess-light / solitaire / works / maze | `build:chess-*`, `build:maze-runner` | main, game-legacy | **done** |
| hope-mate / running-queen / royal-exchange | respective `build:*` | main, game-legacy | **done** |
| vchess-platform / normal-chess | `build:vchess-platform`, `build:vchess-normal-chess` | main + normal-chess entry | **done** |
| truceboard | `build:truceboard` | main, game-legacy | **done** |
| eatwhat | `build:eatwhat` | eatwhat-main, eatwhat-legacy | **done** |

## Smoke pattern

- `GET /application/<app>/<app>.html` (or `index.html`) → 200
- `GET /application/<app>/<app>.js` → 200, body contains expected globals
- Run: `pnpm test:application-static`
- Optional: existing API smokes (`pnpm test:monster-fight`, `pnpm test:tactics-fighter-tree`, …)

## esbuild flags (standard)

```bash
esbuild application/<app>/src/main.js \
  --bundle \
  --format=iife \
  --outfile=application/<app>/<app>.js
```

Edit source under `src/`; never hand-edit the generated bundle except after rebuilding.
