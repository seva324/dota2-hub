import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);

const toEpoch = (dateStr, endOfDay = false) => {
  const suffix = endOfDay ? 'T23:59:59Z' : 'T00:00:00Z';
  return Math.floor(new Date(`${dateStr}${suffix}`).getTime() / 1000);
};

const tournamentMeta = {
  19269: { start: '2026-02-03', end: '2026-03-02', prize: 1000000 },
  18988: { start: '2025-11-10', end: '2025-12-08', prize: 1000000 },
  19130: { start: '2026-01-27', end: '2026-02-02', prize: 100000 },
  19099: { start: '2026-02-03', end: '2026-02-16', prize: 1000000 }
};

await sql.query('BEGIN');
try {
  await sql.query(`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS prize_pool_usd integer`);

  // Prepare target series rows to satisfy FK before updating matches.
  await sql.query(`
    INSERT INTO series (series_id, league_id, radiant_team_id, dire_team_id, radiant_wins, dire_wins, series_type, status, start_time, created_at, updated_at)
    SELECT '1065067', league_id, radiant_team_id, dire_team_id, radiant_wins, dire_wins, series_type, status, start_time, created_at, NOW()
    FROM series
    WHERE series_id = '1065068'
    ON CONFLICT (series_id) DO NOTHING
  `);

  // Series ID cleanup in matches.
  await sql.query(`UPDATE matches SET series_id = '1069113' WHERE series_id = '1069095'`);
  await sql.query(`UPDATE matches SET series_id = '1065067' WHERE series_id = '1065068'`);

  // Remove old duplicate/stale series rows.
  await sql.query(`DELETE FROM series WHERE series_id IN ('1069095', '1065068')`);

  // Re-aggregate affected series from matches.
  await sql.query(`
    WITH target AS (
      SELECT unnest(ARRAY['1069113','1065067']) AS series_id
    ), first_match AS (
      SELECT x.series_id, x.radiant_team_id AS canon_radiant, x.dire_team_id AS canon_dire, x.start_time AS min_start
      FROM (
        SELECT m.series_id, m.radiant_team_id, m.dire_team_id, m.start_time,
               ROW_NUMBER() OVER (PARTITION BY m.series_id ORDER BY m.start_time, m.match_id) AS rn
        FROM matches m
        JOIN target t ON t.series_id = m.series_id
      ) x
      WHERE x.rn = 1
    ), agg AS (
      SELECT m.series_id,
             f.canon_radiant,
             f.canon_dire,
             f.min_start,
             SUM(CASE WHEN (m.radiant_win = true  AND m.radiant_team_id = f.canon_radiant) OR (m.radiant_win = false AND m.dire_team_id = f.canon_radiant) THEN 1 ELSE 0 END)::int AS radiant_wins,
             SUM(CASE WHEN (m.radiant_win = true  AND m.radiant_team_id = f.canon_dire) OR (m.radiant_win = false AND m.dire_team_id = f.canon_dire) THEN 1 ELSE 0 END)::int AS dire_wins
      FROM matches m
      JOIN first_match f ON f.series_id = m.series_id
      GROUP BY m.series_id, f.canon_radiant, f.canon_dire, f.min_start
    )
    UPDATE series s
    SET radiant_team_id = a.canon_radiant,
        dire_team_id = a.canon_dire,
        radiant_wins = a.radiant_wins,
        dire_wins = a.dire_wins,
        start_time = a.min_start,
        status = 'finished',
        updated_at = NOW()
    FROM agg a
    WHERE s.series_id = a.series_id
  `);

  // Patch 4 tournaments start/end/prize.
  for (const [leagueIdStr, meta] of Object.entries(tournamentMeta)) {
    const leagueId = Number(leagueIdStr);
    await sql.query(
      `UPDATE tournaments
       SET start_time = $1,
           end_time = $2,
           prize_pool_usd = $3,
           updated_at = NOW()
       WHERE league_id = $4`,
      [toEpoch(meta.start, false), toEpoch(meta.end, true), meta.prize, leagueId]
    );
  }

  await sql.query('COMMIT');

  const verifySeries = await sql.query(`
    SELECT s.series_id, s.league_id, s.radiant_team_id, s.dire_team_id, s.radiant_wins, s.dire_wins, s.series_type, s.start_time,
           (SELECT COUNT(*)::int FROM matches m WHERE m.series_id = s.series_id) AS match_count
    FROM series s
    WHERE s.series_id IN ('1069113', '1065067', '1069095', '1065068')
    ORDER BY s.series_id
  `);

  const verifyTournaments = await sql.query(`
    SELECT league_id, name, start_time, end_time, prize_pool_usd
    FROM tournaments
    WHERE league_id IN (18988,19099,19130,19269)
    ORDER BY league_id
  `);

  console.log('VERIFY_SERIES');
  console.log(JSON.stringify(verifySeries, null, 2));
  console.log('VERIFY_TOURNAMENTS');
  console.log(JSON.stringify(verifyTournaments, null, 2));
} catch (e) {
  await sql.query('ROLLBACK');
  throw e;
}
