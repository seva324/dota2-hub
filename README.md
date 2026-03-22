# DOTA2 Hub Workspace

`dota2-hub` is a workspace repository containing:

- a React + Vite web app in `apps/web`
- a Taro + React WeChat Mini Program in `apps/mp-wechat`
- shared API contracts in `packages/*`
- a backend API surface preserved under `/api/*`

The repository is now prepared for deployment on Tencent EdgeOne Pages, while keeping Neon Postgres and the existing backend logic.

## Project Structure

```text
/apps/web
/apps/mp-wechat
/packages/shared-types
/packages/api-client
/api
/lib
/node-functions
/scripts
```

## Runtime Shape

- Web frontend: Vite static build from `apps/web`
- Server-side API: existing `api/*.js` handlers, executed through EdgeOne Node Functions
- Database: Neon Postgres via `@neondatabase/serverless`
- Deployment: GitHub Actions -> EdgeOne Pages

## Local Development

Install dependencies from the repo root:

```bash
npm install
```

Run the web app:

```bash
npm run dev
```

Build the web app:

```bash
npm run build:web
```

Run web tests:

```bash
npm run test:web
```

## EdgeOne Deployment

Primary deployment workflow:

- `.github/workflows/deploy-edgeone.yml`

Scheduled API jobs replacing Vercel cron:

- `.github/workflows/edgeone-cron.yml`

Key repo files for EdgeOne:

- `edgeone.json`
- `node-functions/api/[[route]].js`
- `lib/server/edgeone-node-handler.js`
- `lib/server/edgeone-api-router.js`

Detailed operator instructions:

- `DEPLOYMENT.md`
- `HANDOFF_CHECKLIST.md`
- `GO_LIVE_CHECKLIST.md`

## Environment Variables

Use `.env.example` as the template for local development and runtime configuration.

Operator-facing details:

- `ENVIRONMENT_VARIABLES.md`
- `DB_CONNECTIVITY_NOTES.md`

Important runtime variables:

- `DATABASE_URL` or `POSTGRES_URL`
- `SITE_BASE_URL`
- `PUBLIC_SITE_URL`
- `OPENDOTA_API_KEY`
- `MINIMAX_API_KEY`
- `TARO_APP_API_BASE_URL` for the mini program

## API Compatibility

The following paths remain the primary backend contract:

- `/api/tournaments`
- `/api/upcoming`
- `/api/team-flyout`
- `/api/match-details`
- `/api/news`
- `/api/pro-players`
- `/api/player-profile`
- `/api/heroes`
- `/api/live-hero`
- `/api/cron`
- `/api/mp/*`

Also preserved as aliases for scheduled jobs:

- `/api/sync-news`
- `/api/sync-liquipedia`

Function-by-function migration notes:

- `FUNCTION_MIGRATION_MATRIX.md`

## Common Questions

### Does this migration move the database?

No. Neon stays in place for phase 1.

### Does this migration split the frontend and backend into two repos?

No. The repo remains intact and deploys as one EdgeOne Pages project.

### What still needs to be done manually?

- create or confirm EdgeOne project settings
- fill secrets
- fill EdgeOne runtime env vars
- bind the production domain
- complete ICP filing
- switch DNS after validation

See `HANDOFF_CHECKLIST.md` for the exact operator steps.

## Rollback

- Keep the current Vercel deployment available until EdgeOne production passes acceptance checks.
- If the EdgeOne deployment fails, do not switch DNS.
- Because the database is unchanged, rollback is operational only and does not require data migration reversal.

## Migration Documents

- `MIGRATION_AUDIT.md`
- `MIGRATION_PLAN.md`
- `EDGEONE_MAPPING_NOTES.md`
- `DB_CONNECTIVITY_NOTES.md`
- `CHANGELOG_EDGEONE_MIGRATION.md`
