import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

const TARGET_LEAGUE_ID = 19361;
const LEGACY_LEAGUE_ID = 1547890490;
const OPENDOTA_BASE = 'https://api.opendota.com/api';

function loadEnv(filePath) {
  const envText = readFileSync(filePath, 'utf8');
  for (const line of envText.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

function dayStart(dateStr) {
  return Math.floor(new Date(`${dateStr}T00:00:00Z`).getTime() / 1000);
}

function dayEnd(dateStr) {
  return Math.floor(new Date(`${dateStr}T23:59:59Z`).getTime() / 1000);
}

const CCT_STAGE_WINDOWS = [
  {
    key: 'group_stage',
    label: 'Group Stage',
    label_cn: '小组赛',
    kind: 'group',
    start: dayStart('2026-02-28'),
    end: dayEnd('2026-03-02'),
    priority: 10
  },
  {
    key: 'playoffs',
    label: 'Playoffs',
    label_cn: '淘汰赛',
    kind: 'playoff',
    start: dayStart('2026-03-04'),
    end: dayEnd('2026-03-08'),
    priority: 20
  }
];

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function fetchWithRetry(url, retries = 3) {
  let lastErr = null;
  for (let i = 0; i < retries; i++) {
    try {
      return await fetchJSON(url);
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    }
  }
  throw lastErr;
}

async function main() {
  loadEnv('/Users/ein/dota2-hub/.env.vercel');
  const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);

  console.log('[CCT] Fetching all matches from OpenDota league 19361...');
  const leagueMatches = await fetchWithRetry(`${OPENDOTA_BASE}/leagues/${TARGET_LEAGUE_ID}/matches`);
  console.log(`[CCT] OpenDota returned ${leagueMatches.length} matches`);

  const uniqueTeamIds = Array.from(
    new Set(
      leagueMatches.flatMap((m) => [Number(m.radiant_team_id), Number(m.dire_team_id)]).filter((n) => Number.isFinite(n) && n > 0)
    )
  );
  console.log(`[CCT] Unique teams in league matches: ${uniqueTeamIds.length}`);

  const existingTeams = uniqueTeamIds.length
    ? await sql.query(`SELECT team_id FROM teams WHERE team_id = ANY($1::text[])`, [uniqueTeamIds.map(String)])
    : [];
  const existingSet = new Set(existingTeams.map((t) => Number(t.team_id)));
  const missingTeamIds = uniqueTeamIds.filter((id) => !existingSet.has(id));

  let fetchedTeams = 0;
  for (const teamId of missingTeamIds) {
    try {
      const team = await fetchWithRetry(`${OPENDOTA_BASE}/teams/${teamId}`);
      await sql.query(
        `INSERT INTO teams (team_id, name, tag, logo_url, region, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,NOW(),NOW())
         ON CONFLICT (team_id) DO UPDATE SET
           name=EXCLUDED.name,
           tag=EXCLUDED.tag,
           logo_url=EXCLUDED.logo_url,
           region=COALESCE(NULLIF(EXCLUDED.region,''), teams.region),
           updated_at=NOW()`,
        [
          String(team.team_id || teamId),
          team.name || `Team ${teamId}`,
          team.tag || null,
          team.logo_url || null,
          team.region || null
        ]
      );
      fetchedTeams++;
    } catch (e) {
      console.warn(`[CCT] Failed to fetch team ${teamId}: ${e.message}`);
    }
  }
  console.log(`[CCT] Fetched/updated missing teams: ${fetchedTeams}`);

  const seriesMap = new Map();
  for (const m of leagueMatches) {
    const seriesId = m.series_id ? String(m.series_id) : null;
    if (!seriesId) continue;

    if (!seriesMap.has(seriesId)) {
      seriesMap.set(seriesId, {
        series_id: seriesId,
        league_id: TARGET_LEAGUE_ID,
        radiant_team_id: m.radiant_team_id ? String(m.radiant_team_id) : null,
        dire_team_id: m.dire_team_id ? String(m.dire_team_id) : null,
        radiant_wins: 0,
        dire_wins: 0,
        series_type: typeof m.series_type === 'number' ? (m.series_type === 2 ? 'BO5' : m.series_type === 3 ? 'BO2' : m.series_type === 0 ? 'BO1' : 'BO3') : 'BO3',
        status: Number(m.start_time) < Math.floor(Date.now() / 1000) - 3600 ? 'finished' : (Number(m.start_time) < Math.floor(Date.now() / 1000) ? 'live' : 'upcoming'),
        start_time: Number(m.start_time) || null
      });
    }

    const s = seriesMap.get(seriesId);
    const winnerTeamId = m.radiant_win ? String(m.radiant_team_id || '') : String(m.dire_team_id || '');
    if (winnerTeamId && winnerTeamId === s.radiant_team_id) s.radiant_wins += 1;
    if (winnerTeamId && winnerTeamId === s.dire_team_id) s.dire_wins += 1;
  }

  await sql.query('BEGIN');
  try {
    const targetExists = await sql.query(`SELECT 1 FROM tournaments WHERE league_id = $1 LIMIT 1`, [TARGET_LEAGUE_ID]);
    if (targetExists.length === 0) {
      await sql.query(
        `INSERT INTO tournaments (league_id, name, name_cn, tier, location, status, start_time, end_time, prize_pool_usd, stage_windows, updated_at)
         SELECT $1, name, name_cn, tier, location, status, start_time, end_time, prize_pool_usd, stage_windows, NOW()
         FROM tournaments
         WHERE league_id = $2`,
        [TARGET_LEAGUE_ID, LEGACY_LEAGUE_ID]
      );
    }

    await sql.query(`UPDATE series SET league_id = $1 WHERE league_id = $2`, [TARGET_LEAGUE_ID, LEGACY_LEAGUE_ID]);
    await sql.query(`UPDATE upcoming_series SET league_id = $1 WHERE league_id = $2`, [TARGET_LEAGUE_ID, LEGACY_LEAGUE_ID]);
    await sql.query(`DELETE FROM tournaments WHERE league_id = $1`, [LEGACY_LEAGUE_ID]);

    await sql.query(
      `UPDATE tournaments
       SET stage_windows = $1::jsonb,
           updated_at = NOW()
       WHERE league_id = $2`,
      [JSON.stringify(CCT_STAGE_WINDOWS), TARGET_LEAGUE_ID]
    );

    for (const s of seriesMap.values()) {
      await sql.query(
        `INSERT INTO series (series_id, league_id, radiant_team_id, dire_team_id, radiant_wins, dire_wins, series_type, status, start_time, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())
         ON CONFLICT (series_id) DO UPDATE SET
           league_id=EXCLUDED.league_id,
           radiant_team_id=EXCLUDED.radiant_team_id,
           dire_team_id=EXCLUDED.dire_team_id,
           radiant_wins=EXCLUDED.radiant_wins,
           dire_wins=EXCLUDED.dire_wins,
           series_type=EXCLUDED.series_type,
           status=EXCLUDED.status,
           start_time=COALESCE(EXCLUDED.start_time, series.start_time),
           updated_at=NOW()`,
        [
          s.series_id,
          s.league_id,
          s.radiant_team_id,
          s.dire_team_id,
          s.radiant_wins,
          s.dire_wins,
          s.series_type,
          s.status,
          s.start_time
        ]
      );
    }

    for (const m of leagueMatches) {
      await sql.query(
        `INSERT INTO matches (match_id, series_id, radiant_team_id, dire_team_id, radiant_score, dire_score, radiant_win, start_time, duration, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())
         ON CONFLICT (match_id) DO UPDATE SET
           series_id=EXCLUDED.series_id,
           radiant_team_id=EXCLUDED.radiant_team_id,
           dire_team_id=EXCLUDED.dire_team_id,
           radiant_score=EXCLUDED.radiant_score,
           dire_score=EXCLUDED.dire_score,
           radiant_win=EXCLUDED.radiant_win,
           start_time=EXCLUDED.start_time,
           duration=EXCLUDED.duration,
           updated_at=NOW()`,
        [
          Number(m.match_id),
          m.series_id ? String(m.series_id) : null,
          m.radiant_team_id ? String(m.radiant_team_id) : null,
          m.dire_team_id ? String(m.dire_team_id) : null,
          Number(m.radiant_score || 0),
          Number(m.dire_score || 0),
          Boolean(m.radiant_win),
          Number(m.start_time || 0),
          Number(m.duration || 0)
        ]
      );
    }

    await sql.query('COMMIT');
  } catch (e) {
    await sql.query('ROLLBACK');
    throw e;
  }

  const verify = await sql.query(
    `SELECT
       t.league_id,
       t.name,
       jsonb_array_length(COALESCE(t.stage_windows, '[]'::jsonb))::int AS stage_count,
       COALESCE((SELECT COUNT(*) FROM series s WHERE s.league_id = t.league_id),0)::int AS series_count,
       COALESCE((SELECT COUNT(*) FROM matches m JOIN series s2 ON s2.series_id = m.series_id WHERE s2.league_id = t.league_id),0)::int AS match_count
     FROM tournaments t
     WHERE t.league_id = $1`,
    [TARGET_LEAGUE_ID]
  );

  console.log('[CCT] Verification:');
  console.log(JSON.stringify(verify, null, 2));
}

main().catch((e) => {
  console.error('[CCT] Failed:', e);
  process.exit(1);
});
