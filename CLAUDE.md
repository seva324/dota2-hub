# Project Context

Framework: React 18
Language: TypeScript
Bundler: Vite
Testing: Jest + React Testing Library
Lint: ESLint
Formatter: Prettier

## Commands

Install: npm install
Dev: npm run dev
Build: npm run build
Test: npm run test
Lint: npm run lint

## Architecture Rules

- Functional components only
- Hooks over classes
- No inline large logic in JSX
- Services in /services
- Reusable components in /components
- Feature-based folder structure

## Code Standards

- Strict TypeScript
- No any
- No console.log in production
- Prefer composition over inheritance
- Avoid prop drilling

## Match Aggregation Rules (OpenDota Data)

### 1. Data Source
- OpenDota API: `proMatches` and `leagues/{league_id}/matches`
- Key fields: `match_id`, `series_id`, `radiant_name`, `dire_name`, `radiant_win`, `league_id`

### 2. Series ID Grouping
- **Always use OpenDota's `series_id`** for grouping matches into series
- Do NOT concatenate team names as series_id
- Fallback only if `series_id` is null: use first digits of `match_id`

### 3. Win/Loss Calculation
- **Use `radiant_win` field** (not score) to determine winner
- `radiant_win = 1` means radiant team won
- `radiant_win = 0` means dire team won
- **Critical**: Same team may be on radiant in one match and dire in another
- For each match:
  - If `radiant_win = 1`: radiant team gets +1 win
  - If `radiant_win = 0`: dire team gets +1 win

### 4. Team Names
- **Use original OpenDota names directly** - do NOT convert/translate
- Do NOT use `identify()` function to modify team names
- Store `radiant_team_name` and `dire_team_name` as-is from OpenDota

### 5. League ID Mapping
- Known leagues in `LEAGUE_IDS` object (sync-opendota.js)
- Mapping: `19269` → `dreamleague-s28`, `18988` → `dreamleague-s27`, etc.
- League ID comes from `league_id` field in match data

### 6. Database Schema
- `matches` table must include: `match_id`, `series_id`, `league_id`, `radiant_team_name`, `dire_team_name`, `radiant_win`
- `series_id` is critical for correct aggregation
