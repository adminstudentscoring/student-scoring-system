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
| 8 vcp (Phase 2) | done | `packages/vcp/src/vcpChess.ts` (1688 lines) | `packages/vcp/src/vcp/*` | `pnpm test:vcp` |

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
