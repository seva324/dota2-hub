/**
 * OpenDota Data Sync API
 *
 * Syncs: teams, series, matches, match_details
 * Storage: Neon PostgreSQL only
 *
 * Usage: POST /api/sync-opendota
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


async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Save team to database
 */
async function saveTeam(db, team) {
  if (!db || !team?.team_id) return;

  try {
    await db`
      INSERT INTO teams (team_id, name, tag, logo_url, region, created_at, updated_at)
      VALUES (${String(team.team_id)}, ${team.name}, ${team.tag || null}, ${team.logo_url || null}, ${team.region || null}, NOW(), NOW())
      ON CONFLICT (team_id) DO UPDATE SET
        name = EXCLUDED.name,
        tag = EXCLUDED.tag,
        logo_url = EXCLUDED.logo_url,
        region = COALESCE(NULLIF(EXCLUDED.region, ''), teams.region),
        updated_at = NOW()
    `;
  } catch (e) {
    console.log(`[Teams] Failed to save ${team.name}: ${e.message}`);
  }
}

/**
 * Save series to database
 */
async function saveSeries(db, series) {
  if (!db || !series?.series_id) return;

  try {
    await db`
      INSERT INTO series (series_id, league_id, radiant_team_id, dire_team_id, radiant_wins, dire_wins, series_type, status, start_time, created_at, updated_at)
      VALUES (${series.series_id}, ${series.league_id}, ${series.radiant_team_id}, ${series.dire_team_id}, ${series.radiant_wins || 0}, ${series.dire_wins || 0}, ${series.series_type}, ${series.status || 'completed'}, ${series.start_time}, NOW(), NOW())
      ON CONFLICT (series_id) DO UPDATE SET
        radiant_team_id = EXCLUDED.radiant_team_id,
        dire_team_id = EXCLUDED.dire_team_id,
        radiant_wins = EXCLUDED.radiant_wins,
        dire_wins = EXCLUDED.dire_wins,
        series_type = EXCLUDED.series_type,
        status = EXCLUDED.status,
        updated_at = NOW()
    `;
  } catch (e) {
    console.log(`[Series] Failed to save ${series.series_id}: ${e.message}`);
  }
}

/**
 * Save match to database
 */
async function saveMatch(db, match) {
  if (!db || !match?.match_id) return;

  try {
    await db`
      INSERT INTO matches (match_id, series_id, radiant_team_id, dire_team_id, radiant_score, dire_score, radiant_win, start_time, duration, created_at, updated_at)
      VALUES (${parseInt(match.match_id)}, ${match.series_id}, ${match.radiant_team_id}, ${match.dire_team_id}, ${match.radiant_score || 0}, ${match.dire_score || 0}, ${match.radiant_win ? true : false}, ${match.start_time}, ${match.duration || 0}, NOW(), NOW())
      ON CONFLICT (match_id) DO UPDATE SET
        series_id = EXCLUDED.series_id,
        radiant_team_id = EXCLUDED.radiant_team_id,
        dire_team_id = EXCLUDED.dire_team_id,
        radiant_score = EXCLUDED.radiant_score,
        dire_score = EXCLUDED.dire_score,
        radiant_win = EXCLUDED.radiant_win,
        duration = EXCLUDED.duration,
        updated_at = NOW()
    `;
  } catch (e) {
    console.log(`[Matches] Failed to save ${match.match_id}: ${e.message}`);
  }
}

/**
 * Save match detail payload (same write pattern as backfill-match-details API)
 */
async function saveMatchDetail(db, matchId, detail) {
  if (!db || !matchId || !detail) return;

  try {
    await db`
      INSERT INTO match_details (match_id, payload, updated_at)
      VALUES (${Math.trunc(Number(matchId))}, ${JSON.stringify(detail)}::jsonb, NOW())
      ON CONFLICT (match_id) DO UPDATE SET
        payload = EXCLUDED.payload,
        updated_at = NOW()
    `;
  } catch (e) {
    console.log(`[MatchDetails] Failed to save ${matchId}: ${e.message}`);
  }
}

/**
 * Convert OpenDota series_type to human-readable format
 * 0 = BO1, 1 = BO3, 2 = BO5, 3 = BO2
 */
function convertSeriesType(seriesType) {
  const map = {
    0: 'BO1',
    1: 'BO3',
    2: 'BO5',
    3: 'BO2'
  };
  if (seriesType === null || seriesType === undefined || seriesType === '') return 'BO3';
  if (typeof seriesType === 'string') {
    const normalized = seriesType.toUpperCase();
    if (normalized.startsWith('BO')) return normalized;
    const parsed = Number(seriesType);
    return Number.isInteger(parsed) && map[parsed] ? map[parsed] : 'BO3';
  }
  return map[seriesType] || 'BO3';
}

/**
 * Convert OpenDota match to our format
 */
function convertMatch(m) {
  const now = Date.now() / 1000;
  const status = m.start_time < now - 3600 ? 'finished' : m.start_time < now ? 'live' : 'upcoming';
  const radiantWin = m.radiant_win === true || m.radiant_win === 1;

  return {
    match_id: String(m.match_id),
    series_id: m.series_id ? String(m.series_id) : null,
    radiant_team_id: m.radiant_team_id ? String(m.radiant_team_id) : null,
    dire_team_id: m.dire_team_id ? String(m.dire_team_id) : null,
    radiant_team_name: m.radiant_name || null,
    dire_team_name: m.dire_name || null,
    radiant_score: m.radiant_score || 0,
    dire_score: m.dire_score || 0,
    radiant_win: radiantWin ? 1 : 0,
    start_time: m.start_time,
    duration: m.duration || 0,
    league_id: m.leagueid,
    series_type: convertSeriesType(m.series_type),
    status
  };
}

export async function runSyncOpenDota() {

  const db = getDb();
  if (!db) {
    throw new Error('DATABASE_URL not configured');
  }

  console.log('[Sync] Starting sync...');

  try {
    const now = Math.floor(Date.now() / 1000);
    const cutoff48h = now - (48 * 60 * 60);

    // Step 1: Tournament sync disabled (manually maintained)
    // console.log('[Sync] Saving tournaments...');
    // ... disabled by design
    // console.log('[Sync] Saved tournaments');

    // Step 2: Fetch and process pro matches from last 48h
    const allMatches = [];
    const seriesMap = new Map();
    const teamsToFetch = new Set();
    const teamIds = new Set();
    const seenMatchIds = new Set();

    let proMatches = [];
    try {
      proMatches = await fetchJSON(`${OPENDOTA}/proMatches`);
    } catch (e) {
      console.error('[Sync] Failed to fetch proMatches:', e.message);
      proMatches = [];
    }

    const relevant = (Array.isArray(proMatches) ? proMatches : [])
      .filter((m) => Number(m?.start_time) >= cutoff48h && Number(m?.start_time) <= now);
    console.log(`[Sync] proMatches: ${proMatches.length || 0} total, ${relevant.length} in last 48h`);

    for (const m of relevant) {
      const match = convertMatch(m);
      const leagueId = Number(m.leagueid || match.league_id || 0);
      match.league_id = Number.isFinite(leagueId) && leagueId > 0 ? leagueId : null;

      if (seenMatchIds.has(match.match_id)) continue;
      seenMatchIds.add(match.match_id);
      allMatches.push(match);

      if (match.radiant_team_id) teamIds.add(match.radiant_team_id);
      if (match.dire_team_id) teamIds.add(match.dire_team_id);

      if (match.series_id) {
        if (!seriesMap.has(match.series_id)) {
          seriesMap.set(match.series_id, {
            series_id: match.series_id,
            league_id: match.league_id,
            radiant_team_id: match.radiant_team_id,
            dire_team_id: match.dire_team_id,
            radiant_wins: 0,
            dire_wins: 0,
            series_type: match.series_type || 'BO3',
            status: match.status,
            start_time: match.start_time,
            matches: []
          });
        }

        const series = seriesMap.get(match.series_id);
        series.matches.push(match.match_id);

        if (match.radiant_win) {
          if (match.radiant_team_id === series.radiant_team_id) {
            series.radiant_wins++;
          } else if (match.radiant_team_id === series.dire_team_id) {
            series.dire_wins++;
          }
        } else {
          if (match.dire_team_id === series.radiant_team_id) {
            series.radiant_wins++;
          } else if (match.dire_team_id === series.dire_team_id) {
            series.dire_wins++;
          }
        }
      }
    }

    // Step 3: Fix null team IDs by fetching one match detail from each affected series
    console.log('[Sync] Fetching match details for null team names...');
    const seriesWithNullTeams = [];
    for (const [seriesId, series] of seriesMap) {
      if (!series.radiant_team_id || !series.dire_team_id) {
        seriesWithNullTeams.push(series);
      }
    }

    for (const series of seriesWithNullTeams) {
      if (series.matches?.length > 0) {
        try {
          const details = await fetchJSON(`${OPENDOTA}/matches/${series.matches[0]}`);
          await saveMatchDetail(db, series.matches[0], details);
          if (details.radiant_team_id) series.radiant_team_id = String(details.radiant_team_id);
          if (details.dire_team_id) series.dire_team_id = String(details.dire_team_id);
          if (details.radiant_name) {
            // Also save team info
            teamsToFetch.add(details.radiant_team_id);
          }
          if (details.dire_name) {
            teamsToFetch.add(details.dire_team_id);
          }
        } catch (e) {
          // Ignore
        }
      }
    }

    // Step 4: Fetch team details for team IDs we have
    console.log('[Sync] Fetching team details...');
    for (const teamId of teamIds) {
      try {
        const teamData = await fetchJSON(`${OPENDOTA}/teams/${teamId}`);
        if (teamData?.team_id) {
          await saveTeam(db, teamData);
        }
      } catch (e) {
        // Ignore
      }
    }

    // Also fetch teams from null series
    for (const teamId of teamsToFetch) {
      if (!teamIds.has(String(teamId))) {
        try {
          const teamData = await fetchJSON(`${OPENDOTA}/teams/${teamId}`);
          if (teamData?.team_id) {
            await saveTeam(db, teamData);
          }
        } catch (e) {
          // Ignore
        }
      }
    }

    // Step 5: Save series
    console.log('[Sync] Saving series...');
    for (const series of seriesMap.values()) {
      await saveSeries(db, series);
    }

    // Step 6: Save matches and match_details
    console.log('[Sync] Saving matches...');
    for (const match of allMatches) {
      await saveMatch(db, match);
      try {
        const details = await fetchJSON(`${OPENDOTA}/matches/${match.match_id}`);
        await saveMatchDetail(db, match.match_id, details);
      } catch (e) {
        console.log(`[MatchDetails] Fetch failed ${match.match_id}: ${e.message}`);
      }
    }

    console.log('[Sync] Complete!');

    return {
      success: true,
      stats: {
        tournaments: 0,
        series: seriesMap.size,
        matches: allMatches.length,
        teams: teamIds.size
      }
    });
  } catch (e) {
    console.error('[Sync] Error:', e);
    throw e;
  }
}
