# Refactor tracker: files under 500 lines

Goal: split files over 500 lines into smaller modules; each step has smoke tests and its own commit.

## Progress

| Step | Status | Original file(s) | New module(s) | Smoke test |
|------|--------|------------------|---------------|------------|
| 0 Test helper | done | — | `test/helpers/testServer.ts` | (used by smokes) |
| 1 orgCrudRoutes | done | `packages/platform/src/routes/orgCrudRoutes.ts` | `packages/platform/src/routes/org/*` | `pnpm test:timetable` |
| 2 organizationsBillingRoutes | done | `packages/billing/src/routes/organizationsBillingRoutes.ts` | `packages/billing/src/routes/org/*` | `pnpm test:orders` + `pnpm test:lesson-quota` |
| 3 server.ts wiring | done | `server.ts` | `server/*.ts` | `pnpm test` |
| 4 platform routes | done | studentsRoutes, adminOrganizationsRoutes, orgSettingsRoutes | students/, admin/, settings/ | `pnpm test:students`, `pnpm test:settings-holiday` |
| 5 public course-management | done | `public/course-management-sales-orders.js` | `course-management-sales-orders-*.js` | `pnpm test:static-scripts` |
| 6 eslint max-lines | done | — | `eslint.config.js` | `pnpm lint` |
| 7 application games | done | `application/*` monoliths | `application/<app>/src/*` + esbuild bundles | `pnpm build:applications`, `pnpm test:application-static` |
| 8 vcpChess | done | `packages/vcp/src/vcpChess.ts` | `packages/vcp/src/vcp/*` | `pnpm test:vcp` |
| 9 vchessImportApplyEngine | done | `packages/billing/src/lib/vchessImportApplyEngine.ts` | `packages/billing/src/lib/vchessImport/*` | `pnpm test:vchess-apply` |
| 10 blundersPublicRoutes | done | `packages/application/blunders/src/routes/blundersPublicRoutes.ts` | `routes/public/*` | `pnpm test:blunders` |
| 11 monsterFightCore | done | `packages/application/monster-fight/src/monsterFight/monsterFightCore.ts` | `monsterFight/core/*` | `pnpm test:monster-fight` |
| 12 public course-management (rest) | done | sales-packages, core, timetable*, settings-general | `*-1.js` … split parts | `pnpm test:static-scripts` |
| 13 Phase 0 oversplit fix | done | modal-1, timetable-*, overlay, checkout-pay, settings-general-1 | semantic sub-splits | `pnpm test:static-scripts` |
| 14 blundersTeacherRoutes | done | `blundersTeacherRoutes.ts` | `routes/teacher/*` | `pnpm test:blunders-teacher` |
| 15 chessWorksRoutes | done | `chessWorksRoutes.ts` | `chessWorks{Shared,Teacher,Public}Routes.ts` + wrapper | `pnpm test:chess-works` |
| 16 tacticsFighter routes | done | `tacticsFighterPuzzles.ts`, `tacticsFighterAdmin.ts` | `routes/puzzles/*`, `routes/admin/*` + wrappers | `pnpm test:tactics-fighter-tree` |
| 17 monsterFightHelpers | done | `monsterFightHelpers.ts` (~803) | `helpers/{combat,passives,status,monsterAi,lifecycle}.ts` + barrel | `pnpm test:monster-fight` |
| 18 blunders sync/tagger | done | `blunders/sync.ts`, `blunders/tagger.ts` | `sync/*`, `tagger/*` + barrels | `pnpm test:blunders` |
| 19 blundersInit | done | `server/blundersInit.ts` (~566) | `server/blunders/{storageInit,sharedState,wiring}.ts` + thin init | `pnpm test:blunders` |
| 20 orgSettingsCoreRoutes | done | `orgSettingsCoreRoutes.ts` (~533) | `orgSettingsCore{Read,Write}Routes.ts`, `orgSettingsTimetableHelpers.ts` + wrapper | `pnpm test:settings-holiday` |
| 21 public course-management (phase 2.2) | done | courses, packages, accounting, sales-core, sales-orders-student | `*-1.js` … `*-3.js` + stubs | `pnpm test:static-scripts` |
| 22 public teacher (phase 2.3) | done | teacher-core, teacher-students, teacher-games, teacher-classview | `teacher-*-{1..3}.js` + stubs | `pnpm test:static-scripts` |
| 23 public admin (phase 2.3) | done | admin-subscription-setting, admin-organization-tools, admin-organization-settings | `admin-*-{1..3}.js` + stubs | `pnpm test:static-scripts` |
| 24 public class-view + student (phase 2.4) | done | class-view.js, student.js | `class-view-{1..4}.js`, `student-{1,2}.js` + stubs | `pnpm test:static-scripts` |
| 25 chess-analysis-app (phase 2.4) | done | `chess-analysis/chess-analysis-app.js` (~670) | `chess-analysis-app-shared.js`, `-{1..3}.js` + ESM entry | manual / index.html |
| 26 static-scripts expansion (phase 2.1) | done | — | `test/static-scripts-smoke.test.ts` covers org/teacher/admin/class-view | `pnpm test:static-scripts` |
| 27 esbuild pilot + rollout (phase 3) | done | 19 application game JS monoliths | `src/main.js` + legacy modules; `pnpm build:applications` | `pnpm test:application-static` |
| 28 vchess-invoice-parse (phase 4) | done | `scripts/lib/vchess-invoice-parse.ts` (~635) | `vchess-invoice-parse/{types,exportRows,money,description,parseInvoice}.ts` + barrel | `pnpm invoice-parse-smoke` |
| 29 main.js electron split (phase 4) | done | `main.js` (~527) | `electron/{state,server,window,ipc}.js` + thin `main.js` | `node --check main.js` |

HTML cache bust: `?v=20260521-split3` on organization.html, teacher.html, admin.html, class-view.html, student.html, chess-analysis/index.html.

**Note:** Generated esbuild bundles (`application/*/*.js` outputs) remain &gt;500 lines by design; source lives under `application/<app>/src/`. `tacticsFighterPuzzlesBuilderRoutes.ts` (~607) and `chessWorksTeacherRoutes.ts` (~716) may be split in a follow-up.

## Workflow per step

```bash
pnpm typecheck          # if .ts changed
pnpm test:<domain>      # domain smoke
pnpm test               # regression
git add … && git commit && git push
```

## Files still over 500 lines (baseline: 59)

Run to refresh:

```bash
find . -type f \( -name "*.js" -o -name "*.ts" \) ! -path "*/node_modules/*" ! -path "*/.git/*" -exec wc -l {} + | awk '$1 > 500 { print }' | sort -rn
```
