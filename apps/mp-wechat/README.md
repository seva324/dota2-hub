# `apps/mp-wechat`

Taro + React WeChat Mini Program frontend for the `dota2-hub` workspace.

## Architecture

- Frontend framework: Taro + React
- Runtime target: WeChat Mini Program
- Backend source of truth: Vercel functions under `/api`
- Shared contracts: `@dota2hub/shared-types`
- Shared request helpers: `@dota2hub/api-client`

The mini program is not a direct port of the web UI. It is a separate page-based frontend that reuses backend data contracts and backend aggregation where practical.

## Package Structure

Main package pages:

- `pages/home/index`
- `pages/upcoming/index`
- `pages/tournaments/index`
- `pages/settings/index`

Subpackages:

- `packages/tournament/pages/detail/index`
- `packages/team/pages/detail/index`
- `packages/match/pages/detail/index`

This keeps frequently used list pages in the main package and moves heavier detail experiences out of the startup bundle.

## Workspace Structure

```text
apps/mp-wechat
  config/
  src/
    components/
    pages/
    packages/
    services/
    styles/
    utils/
```

## Environment Variables

Copy from [apps/mp-wechat/.env.example](/C:/Users/MOGEEEEEE/WeChatProjects/dota2-hub/apps/mp-wechat/.env.example) when needed.

Supported variables:

- `TARO_APP_API_BASE_URL`
  - Default: `https://dota2-hub.vercel.app`
  - Use this to point the mini program at preview or local backend environments

## Local Development

Install dependencies from the workspace root:

```bash
npm install
```

Start the WeChat Mini Program build in watch mode:

```bash
npm run dev:weapp -w @dota2hub/mp-wechat
```

Type-check the mini program:

```bash
npm run typecheck -w @dota2hub/mp-wechat
```

Build the mini program:

```bash
npm run build:weapp -w @dota2hub/mp-wechat
```

Open [apps/mp-wechat/dist](/C:/Users/MOGEEEEEE/WeChatProjects/dota2-hub/apps/mp-wechat/dist) in WeChat DevTools as the mini program root.

## Performance Notes

- Detail pages are split into subpackages
- `lazyCodeLoading` is enabled
- Detail subpackages are preloaded from high-intent entry pages
- The request layer retries transient failures once
- Mini-program API requests are lightly cached in memory and storage
- The home page uses cache-first loading with background refresh

## Deployment Notes

1. Deploy backend changes from the workspace root to Vercel if `/api` changed.
2. Set the production `TARO_APP_API_BASE_URL`.
3. Run:

```bash
npm run build:mp-wechat
```

4. Import the built output in WeChat DevTools.
5. Complete WeChat Mini Program upload and review from DevTools.

## WeChat-Specific Setup Notes

- `project.config.json` already uses `dist` as the mini program root.
- The current `appid` is stored in [project.config.json](/C:/Users/MOGEEEEEE/WeChatProjects/dota2-hub/apps/mp-wechat/project.config.json).
- Real-device testing should verify:
  - API domain whitelisting
  - image host whitelisting
  - subpackage download behavior
  - startup performance on a cold launch

## Migration Context

See [docs/mp-migration-notes.md](/C:/Users/MOGEEEEEE/WeChatProjects/dota2-hub/docs/mp-migration-notes.md) for how the mini program relates to the existing web app and backend.
