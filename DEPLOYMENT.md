# Deployment to EdgeOne

## What the workflow does

- `.github/workflows/deploy-edgeone.yml`
  - runs on `push` to `main`
  - runs on `pull_request` as a build/test check
  - can be triggered manually with `workflow_dispatch`
  - installs dependencies
  - runs `npm run build:web`
  - runs `npm run test:web`
  - deploys the repo root to EdgeOne Pages with `edgeone pages deploy`

- `.github/workflows/edgeone-cron.yml`
  - reproduces the old Vercel cron behavior through scheduled GitHub Actions calls against the deployed site

## GitHub Secrets and Variables

### Required GitHub Secrets

- `EDGEONE_API_TOKEN`
  - EdgeOne Pages API token used by the deploy workflow
- `EDGEONE_PROJECT_NAME`
  - Existing EdgeOne Pages project name, for example `dota2-hub`
- `EDGEONE_SITE_URL`
  - Full deployed base URL used by the scheduled cron workflow, for example `https://your-production-domain.example.com`

### Recommended GitHub Variables

- `EDGEONE_DEPLOY_ENV`
  - default `production`
- `EDGEONE_DEPLOY_AREA`
  - default `global`

## Runtime variables that belong in EdgeOne Pages, not GitHub Actions

- `DATABASE_URL` or `POSTGRES_URL`
- `OPENDOTA_API_KEY`
- `MINIMAX_API_KEY`
- `MINIMAX_TEXT_API_KEY` if used
- `MINIMAX_API_URL`
- `MINIMAX_MODEL`
- `SITE_BASE_URL`
- `PUBLIC_SITE_URL`
- optional integrations such as `FIRECRAWL_API_KEY`, `REDIS_URL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`

## How to trigger manually

### Manual deploy

1. Open the `Deploy to EdgeOne` workflow in GitHub Actions.
2. Click `Run workflow`.
3. Select the branch.
4. Run it.

### Manual cron job

1. Open the `EdgeOne Scheduled API Jobs` workflow.
2. Click `Run workflow`.
3. Set `target` to one of:
   - `/api/cron?action=sync-opendota`
   - `/api/sync-news`
   - `/api/sync-liquipedia`
   - `/api/cron?action=refresh-derived-data-incremental`

## Failure triage

- Deploy fails before EdgeOne CLI starts:
  - check `EDGEONE_API_TOKEN`
  - check `EDGEONE_PROJECT_NAME`
- Build fails:
  - run `npm ci`
  - run `npm run build:web`
- Tests fail:
  - run `npm run test:web`
- Runtime API errors after deploy:
  - check EdgeOne runtime env vars
  - verify Neon connectivity
  - verify `SITE_BASE_URL` / `PUBLIC_SITE_URL`
- Scheduled workflow fails:
  - check `EDGEONE_SITE_URL`
  - confirm the production domain is already live
