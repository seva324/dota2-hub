# Deployment to EdgeOne

## 当前部署方式（2026-08 确认）

- 生产站点 `https://dotahub.cn` 部署在 **EdgeOne Pages**（项目 Provider=Github，通过 GitHub 仓库集成）。
- **已弃用 Vercel**：仓库历史里的 `vercel[bot]` deployments 是旧部署方式，不再使用；`~/.vercel/project.json` 与 `vercel.json` 仅为遗留文件。
- Provider=Github 的 EdgeOne 项目**拒绝 CLI 直传**（`edgeone pages deploy` 会报 `Project exists but has Provider 'Github'... does not support direct folder or zip file deployment`）。
- 因此**部署依赖 EdgeOne 控制台的 Git 集成**（push 到 main 自动构建，或在控制台手动触发构建）。
- ⚠️ 已知问题（2026-08-06）：GitHub push 后**生产未自动更新**（控制台 Git 集成未触发自动构建）。若 push 后生产仍是旧版本，需在 EdgeOne 控制台手动触发构建/部署，并检查集成的自动部署配置。

## What the workflow does

- `.github/workflows/deploy-edgeone.yml`
  - runs on `push` to `main`
  - runs on `pull_request` as a build/test check
  - can be triggered manually with `workflow_dispatch`
  - installs dependencies
  - runs `npm run build:web`
  - runs `npm run test:web`
  - **deploy job 默认跳过**：`if: github.event_name == 'workflow_dispatch' && vars.EDGEONE_DIRECT_DEPLOY == 'true'`。因为生产项目是 Provider=Github，CLI 直传不被支持，部署改由 EdgeOne 控制台 Git 集成负责。
  - 若未来新建 Upload-provider 的 EdgeOne 项目，可设 `EDGEONE_DIRECT_DEPLOY=true` 变量并手动触发 workflow 以启用 CLI 直传。

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

### 部署到生产（Provider=Github 项目）

1. push 到 `main` 后，等待 EdgeOne 控制台 Git 集成自动构建；若未自动更新：
2. 登录 EdgeOne 控制台 → Pages 项目 `dota2-hub` → 手动触发构建/部署（或检查 Git 集成的自动部署设置）。
3. 验证：`https://dotahub.cn/` 的 bundle 文件名是否与本地 `apps/web/dist/assets/index-*.js` 一致。

### 仅跑 CI（不部署）

1. 打开 GitHub Actions 的 `Deploy to EdgeOne` workflow。
2. Click `Run workflow`（只跑 build-and-test；deploy job 因 Provider=Github 跳过）。

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
