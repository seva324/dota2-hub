# Mini Program Migration Notes

This note explains how the WeChat Mini Program fits into the existing `dota2-hub` workspace.

## Relationship To The Web App

- The web app under `apps/web` remains the browser product.
- The mini program under `apps/mp-wechat` is a separate frontend with page-based navigation.
- The mini program does not import the current web UI layer.
- Shared DTOs and request helpers reduce contract drift between the two frontends.

## Relationship To The Backend

- Existing Vercel functions under `api/` remain the source of truth.
- Existing web endpoints stay backward compatible.
- New `/api/mp/*` endpoints provide stable envelopes and mobile-friendly aggregation.
- Business logic stays on the backend in `api/` and `lib/server/`.

## Packaging Strategy

Main package:

- `pages/home/index`
- `pages/upcoming/index`
- `pages/tournaments/index`
- `pages/settings/index`

Subpackages:

- `packages/tournament/pages/detail/index`
- `packages/team/pages/detail/index`
- `packages/match/pages/detail/index`

Reasoning:

- Main package pages are tab-like or high-frequency entry points.
- Detail pages are heavier and better delivered as on-demand bundles.

## Current Client-Side Optimizations

- Lightweight storage + memory caching for mini-program API requests
- Request retry for transient network/server failures
- Normalized user-facing request errors
- Home page cache-first loading with background refresh
- Preload rules for detail subpackages from high-intent entry pages
