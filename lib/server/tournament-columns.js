export async function ensureTournamentColumns(db) {
  await db`ALTER TABLE tournaments ALTER COLUMN id TYPE TEXT`;
  await db`ALTER TABLE tournaments ALTER COLUMN name TYPE TEXT`;
  await db`ALTER TABLE tournaments ALTER COLUMN name_cn TYPE TEXT`;
  await db`ALTER TABLE tournaments ALTER COLUMN tier TYPE TEXT`;
  await db`ALTER TABLE tournaments ALTER COLUMN location TYPE TEXT`;
  await db`ALTER TABLE tournaments ALTER COLUMN status TYPE TEXT`;
  await db`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS prize_pool TEXT`;
  await db`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS image TEXT`;
  await db`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS location_flag_url TEXT`;
  await db`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS source_url TEXT`;
  await db`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS dltv_event_slug TEXT`;
  await db`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS dltv_parent_slug TEXT`;
  await db`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS event_group_slug TEXT`;
  await db`CREATE INDEX IF NOT EXISTS idx_tournaments_dltv_event_slug ON tournaments(dltv_event_slug)`;
  await db`CREATE INDEX IF NOT EXISTS idx_tournaments_event_group_slug ON tournaments(event_group_slug)`;
}
