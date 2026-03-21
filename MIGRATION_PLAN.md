# EdgeOne Migration Plan

## 1. Current Architecture Summary

- GitHub hosts the source repository.
- `apps/web` is a Vite + React web app.
- Root `api/*.js` provides the backend using Vercel-style serverless handlers.
- Data is stored in Neon Postgres and accessed through `@neondatabase/serverless`.
- `vercel.json` supplies build settings, rewrites, and cron definitions.

## 2. Target Architecture Summary

- GitHub remains the source of truth.
- Tencent EdgeOne Pages becomes the deployment target.
- `apps/web/dist` remains the static output.
- Existing `/api/*` routes are preserved through an EdgeOne Node Functions catch-all adapter.
- Neon remains unchanged for phase 1.
- GitHub Actions handles build, deploy, and scheduled cron-equivalent calls.

## 3. Why EdgeOne Pages

- It keeps the project on a static-site-plus-functions model close to the existing Vercel shape.
- It supports direct CLI-driven deployment, which is easier to audit and reproduce than a console-only flow.
- It avoids splitting the repo or introducing a separate API host for phase 1.

## 4. Why Neon Stays in Place

- The current backend already uses the Neon serverless driver, which works over HTTP and does not require long-lived TCP pooling.
- The migration target is deployment/runtime compatibility, not database relocation.
- Moving database vendors now would expand scope, increase risk, and slow delivery without helping first launch.

## 5. Migration Steps

1. Audit the repo and identify Vercel coupling, runtime assumptions, and environment variables.
2. Add an EdgeOne Node Functions compatibility adapter that dispatches existing `api/*.js` handlers without changing their outward paths.
3. Create `edgeone.json` with the real build/output/runtime settings and route mappings.
4. Map Vercel cron behavior to GitHub Actions scheduled jobs.
5. Replace the legacy GitHub Pages deployment workflow with an EdgeOne deployment workflow.
6. Generate environment variable templates and operator-facing deployment docs.
7. Verify with web build and targeted adapter tests.

## 6. Risks and Mitigations

- Risk: Vercel `(req, res)` handlers are not directly executable on EdgeOne.
  - Mitigation: route every `/api/*` request through a Node Functions adapter that reconstructs a Node-like request/response surface.
- Risk: mirrored asset URLs depend on a manifest file that may not exist at the same runtime path on EdgeOne.
  - Mitigation: search multiple manifest candidate paths and include the manifest in function packaging config.
- Risk: cron behavior may silently stop after cutting over from Vercel.
  - Mitigation: explicit `edgeone-cron.yml` workflow with the same schedules and paths.
- Risk: mini program traffic could continue targeting the old Vercel domain.
  - Mitigation: require `TARO_APP_API_BASE_URL` to be updated during handoff.

## 7. Manual Steps Required

- Create or confirm the EdgeOne Pages project in the console.
- Generate and store `EDGEONE_API_TOKEN`.
- Fill GitHub Secrets and Variables for the workflows.
- Fill runtime environment variables in EdgeOne Pages.
- Bind the production domain.
- Complete ICP filing for the mainland-facing domain.
- Switch DNS after validation.

## 8. Rollback Plan

- Keep the GitHub repo unchanged as the source of truth.
- Do not delete the Vercel project until EdgeOne production is verified.
- If EdgeOne launch fails, keep traffic on the Vercel domain and redeploy from the previous known-good Vercel setup.
- Because database stays in Neon, rollback does not require data migration reversal.

## 9. Launch Acceptance Checklist

- `npm run build:web` passes on the repository root.
- EdgeOne deployment succeeds from GitHub Actions.
- `/api/tournaments`, `/api/upcoming`, `/api/team-flyout`, `/api/live-hero`, `/api/news`, `/api/player-profile`, `/api/pro-players`, `/api/heroes`, `/api/match-details`, and `/api/cron` return expected responses.
- `/api/mp/*` routes still work.
- Scheduled GitHub Actions jobs can reach the deployed site.
- EdgeOne runtime env values are present and the site can read Neon successfully.
- ICP filing, custom domain, DNS cutover, and secrets population are completed manually.
