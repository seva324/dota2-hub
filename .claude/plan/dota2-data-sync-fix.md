# Implementation Plan: Fix Dota2-Hub Data Sync Issues

## Task Type
- [x] Backend (API sync and storage)
- [ ] Frontend

## Constraint
- **Vercel Free Plan**: Only daily scheduled tasks (UTC 00:00 = 北京时间 08:00)

---

## Problem Summary

### Problem 1: Tournament Section Not Updating
- `sync-opendota.js` saves to **Redis** (`r.set('tournaments', ...)`)
- But `tournaments.js` API reads from **Vercel KV** or local JSON - NOT Redis!
- Data is stored but never read from the right place

### Problem 2: Upcoming Section Empty
- `sync-liquipedia.js` saves to Redis (and tries KV)
- But `upcoming.js` API reads from Vercel KV or local JSON - NOT Redis!
- Local `upcoming.json` is empty `[]`

---

## Solution Architecture

```
                    ┌─────────────────┐
                    │  GitHub Actions │
                    │  (Daily 08:00)  │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
              ▼                             ▼
    ┌─────────────────┐         ┌─────────────────┐
    │ /api/sync-      │         │ /api/sync-      │
    │   opendota      │         │ liquipedia      │
    └────────┬────────┘         └────────┬────────┘
             │                          │
             ▼                          ▼
         ┌──────────────────────────────┐
         │          Redis / Neon DB      │
         │  - tournaments (sync-opendota)│
         │  - upcoming (sync-liquipedia) │
         └───────────────┬───────────────┘
                         │
        ┌────────────────┴────────────────┐
        ▼                                 ▼
┌───────────────┐               ┌───────────────┐
│ tournaments.js│               │  upcoming.js  │
│   (READ)     │               │    (READ)     │
└───────────────┘               └───────────────┘
```

---

## Implementation Steps

### Step 1: Fix tournaments.js - Read from Redis
**File**: `api/tournaments.js`
- Add Redis connection using `REDIS_URL` env var
- Read from Redis key `tournaments`
- Keep local JSON as fallback if Redis unavailable

### Step 2: Fix upcoming.js - Read from Redis
**File**: `api/upcoming.js`
- Add Redis connection using `REDIS_URL` env var
- Read from Redis key `upcoming`
- Keep local JSON as fallback if Redis unavailable

### Step 3: Create daily sync workflow
**File**: `.github/workflows/daily-sync.yml`
- Schedule: Daily at UTC 00:00 (北京时间 08:00)
- Step 1: Call `/api/sync-opendota` to sync tournament data
- Step 2: Call `/api/sync-liquipedia` to sync upcoming matches
- Use `workflow_dispatch` for manual trigger

### Step 4: Alternative - Add sync buttons to frontend (Optional)
- Add manual sync buttons in admin section
- Users can manually trigger sync anytime

---

## Key Files

| File | Operation | Description |
|------|-----------|-------------|
| `api/tournaments.js` | Modify | Read from Redis instead of Vercel KV |
| `api/upcoming.js` | Modify | Read from Redis instead of Vercel KV |
| `.github/workflows/daily-sync.yml` | Create | Daily sync at 08:00 北京时间 |

---

## Redis Key Schema

| Key | Source | Description |
|-----|--------|-------------|
| `tournaments` | sync-opendota | Tournament + seriesByTournament |
| `upcoming` | sync-liquipedia | Upcoming matches array |
| `matches` | sync-opendota | All matches (for reference) |

---

## Risks and Mitigation

| Risk | Mitigation |
|------|------------|
| Redis connection fails | Fall back to local JSON files |
| Daily sync too infrequent | Add manual sync button in UI |
| Neon DB connection | User confirms REDIS_URL points to Neon |

---

## Note on Free Plan Limitation

Since Vercel free plan only allows daily scheduled tasks:
- Data updates once per day at ~08:00 北京时间
- For real-time updates, consider adding a "Sync Now" button in the frontend
