# Database Connectivity Notes

## Current access pattern

- Database vendor remains Neon Postgres.
- The runtime driver is `@neondatabase/serverless`.
- Most API files do:
  - read `DATABASE_URL || POSTGRES_URL`
  - lazily create a singleton `neon(...)` client
  - reuse that client for request handling

## Compatibility judgment for EdgeOne

- Phase 1 compatibility: acceptable
- Reason:
  - Neon serverless uses HTTP rather than long-lived TCP sockets
  - existing code does not depend on Prisma engines, pg-native, or process-persistent pools in the request path
  - the adapter keeps the Node-style handler contract without rewriting database logic

## Minimal changes made

- No database logic was rewritten.
- No schema changes were introduced.
- `lib/asset-mirror.js` was adjusted so the API layer can still find its mirrored asset manifest after EdgeOne packaging.
- The request path now runs through an EdgeOne Node Functions adapter, but all database calls still land in the original `api/*.js` handlers and shared server modules.

## Remaining considerations

- Heavy cron-style sync jobs can still be slow because they execute as serverless functions.
- `nodeFunctionsConfig.maxDuration` was set to `60` to reduce timeouts for sync endpoints.
- If future jobs grow further, they should move from request-triggered cron endpoints to dedicated batch workers, but that is outside phase 1.

## If later migrating to a mainland Postgres provider

- Keep the current query layer and switch only the connection string first.
- Validate latency and SSL requirements in a staging project.
- Preserve `DATABASE_URL` / `POSTGRES_URL` compatibility to avoid code churn.
- Move one environment at a time and compare read/write behavior before cutover.
