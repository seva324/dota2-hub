# Mini Program API Notes

This document summarizes the backend routes that support the WeChat Mini Program frontend while preserving the existing web API behavior.

## Existing API Inventory

Core competition data:

- `/api/tournaments`
  - Tournament list
  - Tournament detail with paginated series when `tournamentId` is provided
- `/api/upcoming`
  - Upcoming series window
- `/api/team-flyout`
  - Team summary, next match, and paginated recent history
- `/api/match-details`
  - Stored full match payload

Content and derived data:

- `/api/news`
  - Stored news feed with translation fallbacks
- `/api/live-hero`
  - Live hero spotlight and derived live score matching
- `/api/player-profile`
  - Cached player profile payload
- `/api/pro-players`
  - Pro player directory
- `/api/heroes`
  - Hero lookup dictionary
- `/api/teams`
  - Team directory

## New Mini Program Endpoints

All `/api/mp/*` routes return a stable envelope:

```json
{
  "ok": true,
  "data": {},
  "error": null,
  "meta": {
    "generatedAt": "2026-03-10T12:00:00.000Z"
  }
}
```

Error shape:

```json
{
  "ok": false,
  "data": null,
  "error": {
    "code": "SOME_CODE",
    "message": "Human-readable message"
  },
  "meta": {
    "generatedAt": "2026-03-10T12:00:00.000Z"
  }
}
```

### `GET /api/mp/home`

Aggregated home payload for the mini program.

Returns:

- `heroLive`
- `liveMatchCount`
- `upcoming`
- `tournaments`
- `news`

### `GET /api/mp/tournaments`

Paginated tournament list.

Query params:

- `limit`
- `offset`

Returns:

- `items`
- `pagination`

### `GET /api/mp/tournament/:id`

Tournament detail with paginated series.

Query params:

- `limit`
- `offset`

Returns:

- `tournament`
- `items`
- `pagination`

### `GET /api/mp/upcoming`

Paginated upcoming series list.

Query params:

- `days`
- `limit`
- `offset`

Returns:

- `days`
- `items`
- `teams`
- `pagination`

### `GET /api/mp/team/:id`

Team detail plus paginated recent match history.

Query params:

- `limit`
- `offset`

Returns:

- `team`
- `items`
- `nextMatch`
- `activeSquad`
- `topHeroes`
- `stats`
- `pagination`

### `GET /api/mp/match/:id`

Stable envelope around the stored match detail payload.

## Pagination Shape

The mini program routes use a consistent pagination contract:

```json
{
  "total": 42,
  "offset": 10,
  "limit": 10,
  "hasMore": true,
  "nextCursor": 20
}
```

## Shared Contracts

Shared DTOs and zod schemas live in:

- [packages/shared-types/src/contracts.ts](/C:/Users/MOGEEEEEE/WeChatProjects/dota2-hub/packages/shared-types/src/contracts.ts)

Shared client helpers live in:

- [packages/api-client/src/index.ts](/C:/Users/MOGEEEEEE/WeChatProjects/dota2-hub/packages/api-client/src/index.ts)
