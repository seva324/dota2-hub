# EdgeOne Migration Changelog

## Files Changed

- `edgeone.json`
  - Added EdgeOne build/output/runtime config and route/cache mappings.
- `node-functions/api/[[route]].js`
  - Added EdgeOne Node Functions catch-all entrypoint.
- `lib/server/edgeone-node-handler.js`
  - Added request/response adapter from EdgeOne `Request` to existing Vercel-style handlers.
- `lib/server/edgeone-api-router.js`
  - Added route resolution, `/api/mp/*` support, and cron alias mapping.
- `lib/asset-mirror.js`
  - Made manifest lookup resilient to EdgeOne build/package layouts.
- `.github/workflows/deploy-edgeone.yml`
  - Added reproducible EdgeOne deployment workflow.
- `.github/workflows/edgeone-cron.yml`
  - Added scheduled workflow replacing Vercel cron.
- `.github/workflows/deploy.yml`
  - Removed outdated GitHub Pages deployment workflow.
- `.env.example`
  - Added secret-safe runtime variable template.
- `README.md`
  - Rewrote deployment/runtime docs around EdgeOne.
- `MIGRATION_AUDIT.md`
  - Added repo audit and risk grading.
- `MIGRATION_PLAN.md`
  - Added executable migration plan.
- `EDGEONE_MAPPING_NOTES.md`
  - Added Vercel-to-EdgeOne mapping notes.
- `FUNCTION_MIGRATION_MATRIX.md`
  - Added API migration matrix.
- `DEPLOYMENT.md`
  - Added operator deployment guide.
- `ENVIRONMENT_VARIABLES.md`
  - Added environment variable catalog.
- `DB_CONNECTIVITY_NOTES.md`
  - Added Neon compatibility notes.
- `HANDOFF_CHECKLIST.md`
  - Added operator handoff checklist.
- `GO_LIVE_CHECKLIST.md`
  - Added launch validation checklist.
- `apps/web/src/test/edgeone-node-handler.test.ts`
  - Added regression tests for EdgeOne route adaptation.

## Key Decisions

- Chose GitHub Actions over console-only Git integration for deployment because it is easier to audit, review, and reproduce.
- Kept Neon in place to minimize risk and preserve current data access logic.
- Kept existing `api/*.js` handlers intact and inserted a compatibility layer instead of rewriting the backend.
- Replaced Vercel cron with scheduled GitHub Actions requests.

## Manual Confirmation Still Required

- EdgeOne API token creation
- GitHub Secrets population
- EdgeOne runtime environment variable population
- Custom domain binding
- ICP filing
- DNS cutover
- Mini program `TARO_APP_API_BASE_URL` update if the mini program is part of launch scope

## Remaining Risks

- The mini program package still defaults to the legacy Vercel API base unless `TARO_APP_API_BASE_URL` is explicitly set.
- `@vercel/node` remains in dev dependencies as leftover coupling, though it is unused in the migrated runtime.
- `/api/generate-report` is still referenced by the web UI without a matching backend file; this is a pre-existing gap.
- Large frontend chunks remain and may need later optimization, but they do not block EdgeOne deployment.
