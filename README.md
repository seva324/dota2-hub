# DOTA2 Hub Workspace

This repository now uses a workspace layout so the existing web app and the new WeChat Mini Program can live together while still sharing backend APIs, DTOs, and helper logic.

## Repository Layout

```text
/apps/web
/apps/mp-wechat
/packages/shared-types
/packages/api-client
/api
/lib
/scripts
```

### What lives where

- `apps/web`
  - Existing React + TypeScript + Vite frontend
  - All current UI sections, tests, and web build config
- `apps/mp-wechat`
  - New Taro + React WeChat Mini Program frontend
  - Focused on the MVP pages first
- `packages/shared-types`
  - Shared DTOs
  - Shared response schemas
  - Shared constants
  - Shared formatting helpers
- `packages/api-client`
  - Shared API client factory for existing backend endpoints
  - Designed for both web and mini program callers
- `api`
  - Existing Vercel Serverless Functions
- `lib`
  - Shared backend and server-side data logic
- `scripts`
  - Manual ops, migration, and refresh scripts

## Design Goals

- Preserve the existing web app with minimal disruption
- Keep backend behavior under `/api` as the source of truth
- Add a WeChat Mini Program app without rewriting the backend
- Extract shared contracts and API calling logic only where it reduces duplication
- Prefer incremental, reviewable changes over broad churn

## Workspace Commands

Install dependencies from the repository root:

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

Type-check the WeChat Mini Program app:

```bash
npm run typecheck:mp-wechat
```

Build the WeChat Mini Program app:

```bash
npm run build:mp-wechat
```

## Shared Packages

### `@dota2hub/shared-types`

Contains:

- Legacy front-end type exports used by the existing web app
- Shared API DTO contracts
- Zod schemas for core backend responses
- Shared page-size constants
- Reusable display formatting helpers

### `@dota2hub/api-client`

Contains:

- URL joining helpers
- A generic request-based API client factory
- Endpoint helpers for:
  - upcoming matches
  - tournament list
  - tournament detail
  - team detail
  - match detail

## Notes

- The web app remains buildable from `apps/web`.
- The WeChat Mini Program currently builds from `apps/mp-wechat`.
- The mini program keeps its runtime request wrapper local for now because Taro's default external-package transpilation is stricter than Vite's. The shared API client package is still available for future consolidation.

## Validation

The current workspace refactor has been validated with:

- `npm run build:web`
- `npm run test:web`
- `npm run typecheck:mp-wechat`
- `npm run build:mp-wechat`
