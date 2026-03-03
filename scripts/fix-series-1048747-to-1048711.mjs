import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);

await sql.query('BEGIN');
try {
  await sql.query(`UPDATE matches SET series_id = '1048711' WHERE series_id = '1048747'`);
  await sql.query(`DELETE FROM series WHERE series_id = '1048747'`);

  await sql.query(`
    WITH first_match AS (
      SELECT x.series_id, x.radiant_team_id AS canon_radiant, x.dire_team_id AS canon_dire, x.start_time AS min_start
      FROM (
        SELECT m.series_id, m.radiant_team_id, m.dire_team_id, m.start_time,
               ROW_NUMBER() OVER (PARTITION BY m.series_id ORDER BY m.start_time, m.match_id) AS rn
        FROM matches m
        WHERE m.series_id = '1048711'
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

  await sql.query('COMMIT');

  const verify = await sql.query(`
    SELECT s.series_id, s.radiant_team_id, s.dire_team_id, s.radiant_wins, s.dire_wins,
           (SELECT COUNT(*)::int FROM matches m WHERE m.series_id = s.series_id) AS match_count
    FROM series s
    WHERE s.series_id IN ('1048711','1048747')
    ORDER BY s.series_id
  `);
  console.log(JSON.stringify(verify, null, 2));
} catch (e) {
  await sql.query('ROLLBACK');
  throw e;
}
