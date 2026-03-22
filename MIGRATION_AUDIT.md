# EdgeOne Migration Audit

## A. Framework and Build Inventory

- Frontend framework: React 19 + Vite 7 in `apps/web`
- Additional frontend: Taro + React mini program in `apps/mp-wechat`
- Package manager: npm with root `package-lock.json`
- Workspace layout: npm workspaces (`apps/*`, `packages/*`)
- Primary build command: `npm run build:web`
- Web output directory: `apps/web/dist`
- Current Node expectations:
  - Vercel project shows Node `24.x`
  - local toolchain uses Node `v24.14.0`
  - EdgeOne migration pins `22.11.0` in `edgeone.json` and GitHub Actions for a stable, currently supported deployment target
- Custom server: none
- Middleware file: none found
- Edge runtime code: none found
- Serverless API style: flat root-level `api/*.js` handlers using Vercel-style `(req, res)`

## B. Vercel Coupling Points

### Direct platform files and runtime assumptions

- `vercel.json`
  - `framework: "vite"`
  - `installCommand: "npm install"`
  - `buildCommand: "npm run build:web"`
  - `outputDirectory: "apps/web/dist"`
  - rewrite `/api/mp/:route* -> /api/matches?__mp=:route*`
  - cron triggers for:
    - `/api/cron?action=sync-opendota`
    - `/api/sync-news`
    - `/api/sync-liquipedia`
    - `/api/cron?action=refresh-derived-data-incremental`
- Root `api/*.js`
  - Vercel serverless-style handlers are the core backend surface
  - Shared by web and mini program callers
- `apps/web/package.json`
  - contains unused `@vercel/node` dev dependency
- Runtime env references
  - `VERCEL_URL` fallback in `lib/asset-mirror.js`
  - `.env.vercel` contains Vercel-injected metadata and secrets snapshots
- Hardcoded Vercel URLs
  - `packages/shared-types/src/constants.ts`
  - `lib/asset-mirror.js`
  - docs and a few tests

### Vercel-specific capabilities in active use

- Rewrites: yes
- Cron jobs: yes
- Blob / KV / Edge Config / Analytics / Image / ISR / SSR framework integration: not detected
- Middleware / Edge Runtime: not detected

## C. Database and Environment Variables

### Database access

- Database: Neon Postgres
- Driver: `@neondatabase/serverless`
- Primary entry point: `lib/db.js`
- API handlers frequently create their own singleton `neon(DATABASE_URL)` client at module scope
- Main runtime env lookup: `DATABASE_URL || POSTGRES_URL`
- No ORM detected
- No Prisma / Drizzle / Knex / Supabase runtime detected in the request path

### Environment variable files found

- `.env.local`
- `.env.vercel`

### Environment variables referenced in code

- Core runtime:
  - `DATABASE_URL`
  - `POSTGRES_URL`
  - `SITE_BASE_URL`
  - `PUBLIC_SITE_URL`
  - `NEXT_PUBLIC_SITE_URL`
  - `VERCEL_URL`
- Data sync / AI:
  - `OPENDOTA_API_KEY`
  - `MINIMAX_API_KEY`
  - `MINIMAX_TEXT_API_KEY`
  - `MINIMAX_API_URL`
  - `MINIMAX_MODEL`
  - `FIRECRAWL_API_KEY`
  - `GPT_API_KEY`
- Scheduling / ops:
  - `D2HUB_CRON_MIN_INTERVAL_MIN`
  - `D2HUB_OPENDOTA_PIPELINE_MIN_INTERVAL_MIN`
  - `CRON_MIN_INTERVAL_MIN`
  - `TELEGRAM_BOT_TOKEN`
  - `TELEGRAM_CHAT_ID`
  - `TG_BOT_TOKEN`
  - `TG_CHAT_ID`
  - `TELEGRAM_TIMEOUT_MS`
  - `TELEGRAM_TEXT`
- XHS automation:
  - `XHS_AUTO_POST`
  - `XHS_AI_REWRITE`
  - `XHS_POST_PRESET`
  - `XHS_REVERSE_CLI`
  - `XHS_CODEX_BIN`
  - `XHS_CODEX_MODEL`
  - `XHS_REWRITE_TIMEOUT_MS`
  - `XHS_REWRITE_PROMPT_FILE`
  - `NEWS_TRANSLATE_CODEX_MODEL`
- Mini program:
  - `TARO_APP_API_BASE_URL`

### Connection and lifecycle notes

- The Neon serverless driver is already HTTP-based, which is a good fit for EdgeOne serverless execution.
- Current code generally uses lazy singleton initialization, not eager top-level connection opening.
- The biggest runtime compatibility risk was not the driver itself, but locating the mirrored asset manifest from a non-Vercel filesystem layout.

## D. Risk Grading

### P0: must fix for first deploy to work

- EdgeOne had no serverless entrypoint compatible with the existing Vercel `api/*.js` handlers.
  - Fixed by adding a Node Functions catch-all adapter under `node-functions/api/[[route]].js`.
- Asset mirror manifest lookup assumed a Vercel/local filesystem shape.
  - Fixed by making `lib/asset-mirror.js` search multiple candidate manifest paths, including build and `.edgeone` layouts.
- Existing GitHub workflow deployed to GitHub Pages, not EdgeOne.
  - Fixed by replacing it with `deploy-edgeone.yml`.

### P1: recommended now to avoid functional gaps

- Vercel cron jobs were platform-specific.
  - Fixed by adding `edgeone-cron.yml` with equivalent schedules and the migrated API paths.
- `sync-news` and `sync-liquipedia` were referenced by Vercel cron config but did not exist as standalone files.
  - Fixed by supporting these as aliases to `/api/cron?action=...` in the EdgeOne adapter and `edgeone.json`.
- Mini program default API base still points at `https://dota2-hub.vercel.app` unless overridden by `TARO_APP_API_BASE_URL`.
  - Left as-is for minimal churn; must be changed in deployment config before the mini program is pointed at production.

### P2: later cleanup, not required for phase 1 launch

- `@vercel/node` remains as an unused dev dependency.
- Some docs and tests still mention the Vercel preset domain because it is currently the default API base for the mini program package.
- `/api/generate-report` is referenced by the web UI but no matching API handler exists in this repository.
  - This is a pre-existing issue, not introduced by the EdgeOne migration.
