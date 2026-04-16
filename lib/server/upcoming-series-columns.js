export async function ensureUpcomingSeriesColumns(db) {
  await db`ALTER TABLE upcoming_series ADD COLUMN IF NOT EXISTS radiant_team_name TEXT`;
  await db`ALTER TABLE upcoming_series ADD COLUMN IF NOT EXISTS radiant_team_name_cn TEXT`;
  await db`ALTER TABLE upcoming_series ADD COLUMN IF NOT EXISTS dire_team_name TEXT`;
  await db`ALTER TABLE upcoming_series ADD COLUMN IF NOT EXISTS dire_team_name_cn TEXT`;
  await db`ALTER TABLE upcoming_series ADD COLUMN IF NOT EXISTS tournament_name TEXT`;
  await db`ALTER TABLE upcoming_series ADD COLUMN IF NOT EXISTS tournament_name_cn TEXT`;
  await db`ALTER TABLE upcoming_series ADD COLUMN IF NOT EXISTS tournament_tier TEXT`;
  await db`ALTER TABLE upcoming_series ADD COLUMN IF NOT EXISTS tournament_source_url TEXT`;
  await db`ALTER TABLE upcoming_series ADD COLUMN IF NOT EXISTS tournament_event_slug TEXT`;
  await db`ALTER TABLE upcoming_series ADD COLUMN IF NOT EXISTS tournament_parent_slug TEXT`;
  await db`ALTER TABLE upcoming_series ADD COLUMN IF NOT EXISTS tournament_group_slug TEXT`;
}
