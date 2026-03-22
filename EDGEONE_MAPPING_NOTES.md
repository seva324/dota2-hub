# EdgeOne Mapping Notes

## `vercel.json` to `edgeone.json`

| Vercel setting | Previous value | EdgeOne result | Notes |
| --- | --- | --- | --- |
| `framework` | `vite` | omitted | EdgeOne CLI auto-builds from repo config; the build command is explicit. |
| `installCommand` | `npm install` | `installCommand: "npm install"` | 1:1 mapping. |
| `buildCommand` | `npm run build:web` | `buildCommand: "npm run build:web"` | 1:1 mapping. |
| `outputDirectory` | `apps/web/dist` | `outputDirectory: "apps/web/dist"` | 1:1 mapping. |
| `rewrites[0]` | `/api/mp/:route* -> /api/matches?__mp=:route*` | handled in Node Functions adapter, not in `edgeone.json` | EdgeOne config validation rejected the query-string destination form; the compatibility layer now performs the same mapping internally. |
| `crons` | 4 scheduled routes | moved to `.github/workflows/edgeone-cron.yml` | EdgeOne Pages config does not expose Vercel-style cron entries in `edgeone.json`. Equivalent schedules now live in GitHub Actions for reproducibility. |

## Unsupported or non-1:1 items

### `name`

- Requested target: put project name in `edgeone.json`
- Actual outcome: omitted from `edgeone.json`
- Reason: current EdgeOne CLI config schema does not define a `name` field
- Replacement:
  - deployment workflow uses `EDGEONE_PROJECT_NAME`
  - CLI deploy command uses `-n "$EDGEONE_PROJECT_NAME"`
- Behavior impact: none at runtime; project identity moves from config file to deployment input

### Vercel cron aliases

- Previous config referenced `/api/sync-news` and `/api/sync-liquipedia`, but these were not standalone files.
- Replacement:
  - Node Functions adapter now maps them to `/api/cron?action=sync-news` and `/api/cron?action=sync-liquipedia`
  - `edgeone.json` rewrites mirror that behavior
  - `edgeone-cron.yml` triggers the alias paths
- Behavior impact: no intended external path change

### Mini-program rewrite

- Previous behavior: Vercel rewrote `/api/mp/:route*` to `/api/matches?__mp=:route*`
- EdgeOne replacement:
  - `node-functions/api/[[route]].js` catches `/api/mp/*`
  - `lib/server/edgeone-api-router.js` dispatches those requests to `api/matches.js`
  - `req.query.__mp` is populated with the path suffix, preserving the old handler contract
- Reason for not keeping it in `edgeone.json`:
  - EdgeOne CLI config validation rejected the query-string destination form
- Behavior impact: outward URL remains the same; implementation moved from config rewrite to runtime adapter

### Response caching

- Vercel previously relied mostly on handler-level response headers.
- EdgeOne result:
  - handler-level cache headers stay intact
  - `edgeone.json` adds explicit static cache rules for `/assets/*` and `/images/mirror/*`
- Behavior impact: static asset caching becomes more explicit
