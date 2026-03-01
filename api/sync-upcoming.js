/**
 * Sync Upcoming Series API
 * Fetches upcoming matches from OpenDota and saves to upcoming_series
 *
 * Usage: POST /api/sync-upcoming
 */

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

function getDb() {
  if (!sql && DATABASE_URL) {
    sql = neon(DATABASE_URL);
  }
  return sql;
}

let sql = null;

const OPENDOTA = 'https://api.opendota.com/api';

const TARGET_LEAGUES = [
  { league_id: 19269, name: 'DreamLeague Season 28', name_cn: '梦联赛 S28' },
  { league_id: 18988, name: 'DreamLeague Season 27', name_cn: '梦联赛 S27' },
  { league_id: 19099, name: 'BLAST Slam VI', name_cn: 'BLAST 锦标赛 VI' },
  { league_id: 19130, name: 'ESL Challenger China', name_cn: 'ESL 挑战者杯 中国' }
];

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Save upcoming series to database
 */
async function saveUpcomingSeries(db, series) {
  if (!db || !series?.id) return;

  try {
    await db`
      INSERT INTO upcoming_series (id, series_id, league_id, radiant_team_id, dire_team_id, start_time, series_type, status, created_at, updated_at)
      VALUES (${series.id}, ${series.series_id}, ${series.league_id}, ${series.radiant_team_id}, ${series.dire_team_id}, ${series.start_time}, ${series.series_type}, ${series.status || 'upcoming'}, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        series_id = EXCLUDED.series_id,
        radiant_team_id = EXCLUDED.radiant_team_id,
        dire_team_id = EXCLUDED.dire_team_id,
        start_time = EXCLUDED.start_time,
        series_type = EXCLUDED.series_type,
        status = EXCLUDED.status,
        updated_at = NOW()
    `;
  } catch (e) {
    console.log(`[Upcoming] Failed to save ${series.id}: ${e.message}`);
  }
}

/**
 * Fetch and save team
 */
async function saveTeam(db, teamId) {
  if (!db || !teamId) return;

  try {
    const teamData = await fetchJSON(`${OPENDOTA}/teams/${teamId}`);
    if (teamData?.team_id) {
      await db`
        INSERT INTO teams (team_id, name, tag, logo_url, region, created_at, updated_at)
        VALUES (${String(teamData.team_id)}, ${teamData.name}, ${teamData.tag || null}, ${teamData.logo_url || null}, ${teamData.region || null}, NOW(), NOW())
        ON CONFLICT (team_id) DO UPDATE SET
          name = EXCLUDED.name,
          tag = EXCLUDED.tag,
          logo_url = EXCLUDED.logo_url,
          region = EXCLUDED.region,
          updated_at = NOW()
      `;
    }
  } catch (e) {
    // Ignore
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const db = getDb();
  if (!db) {
    return res.status(500).json({ error: 'DATABASE_URL not configured' });
  }

  console.log('[Sync Upcoming] Starting...');

  try {
    const now = Math.floor(Date.now() / 1000);
    const thirtyDaysLater = now + 30 * 24 * 60 * 60;

    // Step 1: Clean up past series from upcoming_series table
    console.log('[Sync Upcoming] Cleaning up past series...');
    const deleted = await db`
      DELETE FROM upcoming_series
      WHERE start_time < ${now}
    `;
    console.log(`[Sync Upcoming] Removed ${deleted.count} past series`);

    // Step 2: Remove series that already have matches (already played)
    // Delete any upcoming_series where a matching series now has matches in the matches table
    await db`
      DELETE FROM upcoming_series us
      WHERE EXISTS (
        SELECT 1 FROM matches m
        WHERE m.series_id = us.series_id
        AND m.series_id IS NOT NULL
      )
    `;
    console.log('[Sync Upcoming] Cleaned up series that already have matches');

    // Fetch pro matches (includes upcoming)
    console.log('[Sync Upcoming] Fetching pro matches...');
    const proMatches = await fetchJSON(`${OPENDOTA}/proMatches`);

    // Filter upcoming matches from target leagues
    const upcomingMatches = proMatches.filter(m => {
      if (m.start_time <= now) return false; // Already started
      if (m.start_time > thirtyDaysLater) return false; // Too far in future
      if (!TARGET_LEAGUES.some(l => l.league_id === m.leagueid)) return false;
      return true;
    });

    console.log(`[Sync Upcoming] Found ${upcomingMatches.length} upcoming matches`);

    // Group by series
    const seriesMap = new Map();
    for (const m of upcomingMatches) {
      const seriesId = m.series_id ? String(m.series_id) : `standalone_${m.match_id}`;
      const key = `${m.leagueid}_${seriesId}`;

      if (!seriesMap.has(key)) {
        seriesMap.set(key, {
          id: key,
          series_id: m.series_id ? String(m.series_id) : null,
          league_id: m.leagueid,
          radiant_team_id: m.radiant_team_id ? String(m.radiant_team_id) : null,
          dire_team_id: m.dire_team_id ? String(m.dire_team_id) : null,
          start_time: m.start_time,
          series_type: m.series_type !== undefined ? String(m.series_type) : 'BO3',
          status: 'upcoming'
        });
      }
    }

    // Save teams and series
    for (const series of seriesMap.values()) {
      if (series.radiant_team_id) {
        await saveTeam(db, series.radiant_team_id);
      }
      if (series.dire_team_id) {
        await saveTeam(db, series.dire_team_id);
      }
      await saveUpcomingSeries(db, series);
    }

    console.log('[Sync Upcoming] Complete!');

    return res.status(200).json({
      success: true,
      stats: {
        matches: upcomingMatches.length,
        series: seriesMap.size
      }
    });
  } catch (e) {
    console.error('[Sync Upcoming] Error:', e);
    return res.status(500).json({ error: e.message });
  }
}
