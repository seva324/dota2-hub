/**
 * OpenDota Data Sync API
 *
 * Syncs: teams, tournaments, series, matches
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

// Target leagues
const TARGET_LEAGUES = [
  { league_id: 19269, name: 'DreamLeague Season 28', name_cn: '梦联赛 S28', tier: 'S' },
  { league_id: 18988, name: 'DreamLeague Season 27', name_cn: '梦联赛 S27', tier: 'S' },
  { league_id: 19099, name: 'BLAST Slam VI', name_cn: 'BLAST 锦标赛 VI', tier: 'S' },
  { league_id: 19130, name: 'ESL Challenger China', name_cn: 'ESL 挑战者杯 中国', tier: 'S' }
];

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
        region = EXCLUDED.region,
        updated_at = NOW()
    `;
  } catch (e) {
    console.log(`[Teams] Failed to save ${team.name}: ${e.message}`);
  }
}

/**
 * Save tournament to database
 */
async function saveTournament(db, tournament) {
  if (!db || !tournament?.league_id) return;

  try {
    await db`
      INSERT INTO tournaments (league_id, name, name_cn, tier, location, status, start_time, end_time, created_at, updated_at)
      VALUES (${tournament.league_id}, ${tournament.name}, ${tournament.name_cn}, ${tournament.tier}, ${tournament.location || 'Online'}, ${tournament.status || 'completed'}, ${tournament.start_time || null}, ${tournament.end_time || null}, NOW(), NOW())
      ON CONFLICT (league_id) DO UPDATE SET
        name = EXCLUDED.name,
        name_cn = EXCLUDED.name_cn,
        tier = EXCLUDED.tier,
        status = EXCLUDED.status,
        updated_at = NOW()
    `;
  } catch (e) {
    console.log(`[Tournaments] Failed to save ${tournament.name}: ${e.message}`);
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const db = getDb();
  if (!db) {
    return res.status(500).json({ error: 'DATABASE_URL not configured' });
  }

  console.log('[Sync] Starting sync...');

  try {
    // Time window: sync all matches for target leagues (no filter on initial sync)
    // For regular sync, you could add: const twoDaysAgo = now - 2 * 24 * 60 * 60;
    // const relevant = leagueMatches.filter(m => m.start_time > twoDaysAgo);

    // Step 1: Save target tournaments
    console.log('[Sync] Saving tournaments...');
    for (const league of TARGET_LEAGUES) {
      await saveTournament(db, {
        league_id: league.league_id,
        name: league.name,
        name_cn: league.name_cn,
        tier: league.tier,
        location: 'Online',
        status: 'completed',
        start_time: null,
        end_time: null
      });
    }
    console.log('[Sync] Saved tournaments');

    // Step 2: Fetch and process matches
    const allMatches = [];
    const seriesMap = new Map();
    const teamsToFetch = new Set();
    const teamIds = new Set();

    for (const league of TARGET_LEAGUES) {
      console.log(`[Sync] Fetching league ${league.league_id}...`);
      try {
        const leagueMatches = await fetchJSON(`${OPENDOTA}/leagues/${league.league_id}/matches`);

        // Filter to relevant matches
        // No date filter - sync all matches for these leagues
        const relevant = leagueMatches;
        console.log(`[Sync] League ${league.league_id}: ${leagueMatches.length} total, ${relevant.length} relevant`);

        for (const m of relevant) {
          const match = convertMatch(m);
          match.league_id = league.league_id;
          allMatches.push(match);

          // Track team IDs
          if (match.radiant_team_id) teamIds.add(match.radiant_team_id);
          if (match.dire_team_id) teamIds.add(match.dire_team_id);

          // Group by series
          if (match.series_id) {
            if (!seriesMap.has(match.series_id)) {
              // First match in series - determine the two teams
              seriesMap.set(match.series_id, {
                series_id: match.series_id,
                league_id: league.league_id,
                // Store team IDs from first match - these represent the two teams in the series
                radiant_team_id: match.radiant_team_id,
                dire_team_id: match.dire_team_id,
                radiant_wins: 0,
                dire_wins: 0,
                series_type: convertSeriesType(match.series_type),
                status: match.status,
                start_time: match.start_time,
                matches: []
              });
            }
            const series = seriesMap.get(match.series_id);
            series.matches.push(match.match_id);

            // Update wins - use CURRENT match's team IDs
            // radiant_win = 1: radiant side won
            // radiant_win = 0: dire side won
            // Track wins by matching the winner to series' original teams
            if (match.radiant_win) {
              // Current match's radiant team won - but we track wins for series' original teams
              // Check which of the two series teams is the winner
              if (match.radiant_team_id === series.radiant_team_id) {
                series.radiant_wins++;
              } else if (match.radiant_team_id === series.dire_team_id) {
                series.dire_wins++;
              }
            } else {
              // Current match's dire team won
              if (match.dire_team_id === series.radiant_team_id) {
                series.radiant_wins++;
              } else if (match.dire_team_id === series.dire_team_id) {
                series.dire_wins++;
              }
            }
          }
        }
      } catch (e) {
        console.error(`[Sync] Failed to fetch league ${league.league_id}:`, e.message);
      }
    }

    // Step 3: Fix null team names by fetching match details
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

    // Step 6: Save matches
    console.log('[Sync] Saving matches...');
    for (const match of allMatches) {
      await saveMatch(db, match);
    }

    console.log('[Sync] Complete!');

    return res.status(200).json({
      success: true,
      stats: {
        tournaments: TARGET_LEAGUES.length,
        series: seriesMap.size,
        matches: allMatches.length,
        teams: teamIds.size
      }
    });
  } catch (e) {
    console.error('[Sync] Error:', e);
    return res.status(500).json({ error: e.message });
  }
}
