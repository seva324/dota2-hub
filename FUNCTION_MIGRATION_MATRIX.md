# Function Migration Matrix

| Original file | Original path | Original runtime assumption | New function file | New path | Compatibility | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `api/cron.js` | `/api/cron` | Vercel Node serverless `(req, res)` | `node-functions/api/[[route]].js` -> dispatch to `api/cron.js` | `/api/cron` | 100% for path/method/body/query | Also serves cron aliases below. |
| `api/heroes.js` | `/api/heroes` | Vercel Node serverless `(req, res)` | `node-functions/api/[[route]].js` -> dispatch to `api/heroes.js` | `/api/heroes` | 100% | No route change. |
| `api/live-hero.js` | `/api/live-hero` | Vercel Node serverless `(req, res)` | `node-functions/api/[[route]].js` -> dispatch to `api/live-hero.js` | `/api/live-hero` | 100% | No route change. |
| `api/match-details.js` | `/api/match-details` | Vercel Node serverless `(req, res)` | `node-functions/api/[[route]].js` -> dispatch to `api/match-details.js` | `/api/match-details` | 100% | No route change. |
| `api/matches.js` | `/api/matches` | Vercel Node serverless `(req, res)` | `node-functions/api/[[route]].js` -> dispatch to `api/matches.js` | `/api/matches` | 100% | Mini program rewrite target preserved. |
| `api/news.js` | `/api/news` | Vercel Node serverless `(req, res)` | `node-functions/api/[[route]].js` -> dispatch to `api/news.js` | `/api/news` | 100% | No route change. |
| `api/player-profile.js` | `/api/player-profile` | Vercel Node serverless `(req, res)` | `node-functions/api/[[route]].js` -> dispatch to `api/player-profile.js` | `/api/player-profile` | 100% | No route change. |
| `api/pro-players.js` | `/api/pro-players` | Vercel Node serverless `(req, res)` | `node-functions/api/[[route]].js` -> dispatch to `api/pro-players.js` | `/api/pro-players` | 100% | No route change. |
| `api/team-flyout.js` | `/api/team-flyout` | Vercel Node serverless `(req, res)` | `node-functions/api/[[route]].js` -> dispatch to `api/team-flyout.js` | `/api/team-flyout` | 100% | No route change. |
| `api/teams.js` | `/api/teams` | Vercel Node serverless `(req, res)` | `node-functions/api/[[route]].js` -> dispatch to `api/teams.js` | `/api/teams` | 100% | No route change. |
| `api/tournaments.js` | `/api/tournaments` | Vercel Node serverless `(req, res)` | `node-functions/api/[[route]].js` -> dispatch to `api/tournaments.js` | `/api/tournaments` | 100% | No route change. |
| `api/upcoming.js` | `/api/upcoming` | Vercel Node serverless `(req, res)` | `node-functions/api/[[route]].js` -> dispatch to `api/upcoming.js` | `/api/upcoming` | 100% | No route change. |
| virtual rewrite | `/api/mp/:route*` | Vercel rewrite to `api/matches.js` with `__mp` query | `node-functions/api/[[route]].js` | `/api/mp/:route*` | 100% on outward path | The adapter populates `req.query.__mp` exactly like the old rewrite target. |
| virtual cron alias | `/api/sync-news` | Vercel cron target only | `node-functions/api/[[route]].js` | `/api/sync-news` | compatible alias | Implemented as `/api/cron?action=sync-news` alias. |
| virtual cron alias | `/api/sync-liquipedia` | Vercel cron target only | `node-functions/api/[[route]].js` | `/api/sync-liquipedia` | compatible alias | Implemented as `/api/cron?action=sync-liquipedia` alias. |
