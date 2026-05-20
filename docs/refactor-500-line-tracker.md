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
| 7 application games | deferred | `application/*` | See `docs/refactor-phase4-games.md` | bundler TBD |
| 8 vcpChess | done | `packages/vcp/src/vcpChess.ts` | `packages/vcp/src/vcp/*` | `pnpm test:vcp` |
| 9 vchessImportApplyEngine | done | `packages/billing/src/lib/vchessImportApplyEngine.ts` | `packages/billing/src/lib/vchessImport/*` | `pnpm test:vchess-apply` |
| 10 blundersPublicRoutes | done | `packages/application/blunders/src/routes/blundersPublicRoutes.ts` | `routes/public/*` | `pnpm test:blunders` |
| 11 monsterFightCore | done | `packages/application/monster-fight/src/monsterFight/monsterFightCore.ts` | `monsterFight/core/*` | `pnpm test:monster-fight` |
| 12 public course-management (rest) | done | sales-packages, core, timetable*, settings-general | `*-1.js` … split parts | `pnpm test:static-scripts` |
| 13 Phase 0 oversplit fix | done | modal-1, timetable-*, overlay, checkout-pay, settings-general-1 | semantic sub-splits | `pnpm test:static-scripts` |
| 14 blundersTeacherRoutes | done | `blundersTeacherRoutes.ts` | `routes/teacher/*` | `pnpm test:blunders-teacher` |
| 17 monsterFightHelpers | done | `monsterFightHelpers.ts` (~803) | `helpers/{combat,passives,status,monsterAi,lifecycle}.ts` + barrel | `pnpm test:monster-fight` |
| 18 blunders sync/tagger | done | `blunders/sync.ts`, `blunders/tagger.ts` | `sync/*`, `tagger/*` + barrels | `pnpm test:blunders` |
| 19 blundersInit | done | `server/blundersInit.ts` (~566) | `server/blunders/{storageInit,sharedState,wiring}.ts` + thin init | `pnpm test:blunders` |
| 20 orgSettingsCoreRoutes | done | `orgSettingsCoreRoutes.ts` (~533) | `orgSettingsCore{Read,Write}Routes.ts`, `orgSettingsTimetableHelpers.ts` + wrapper | `pnpm test:settings-holiday` |

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
