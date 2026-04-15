/**
 * Sync Upcoming Series through the legacy sync-liquipedia entrypoint.
 * Fetches upcoming matches from DLTV matches page
 * - Games with starttime > now and starttime < now + 7 days
 *
 * Usage: POST /api/sync-liquipedia
 */

import { neon } from '@neondatabase/serverless';
import { DLTV_MATCHES_URL, parseDltvUpcomingMatchesPage } from './dltv-upcoming.js';
import { ensureUpcomingSeriesColumns } from './upcoming-series-columns.js';

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
 * Fetch team by name from OpenDota
 */
async function saveTeamFromOpenDota(db, teamName) {
  if (!db || !teamName) return null;

  try {
    const existing = await db`SELECT team_id FROM teams WHERE LOWER(name) = ${teamName.toLowerCase()}`;
    if (existing.length > 0) return existing[0].team_id;

    const teams = await fetchJSON(`${OPENDOTA}/teams?search=${encodeURIComponent(teamName)}`);
    const team = teams.find(t => t.name?.toLowerCase() === teamName.toLowerCase());

    if (team?.team_id) {
      await db`
        INSERT INTO teams (team_id, name, tag, logo_url, region, created_at, updated_at)
        VALUES (${String(team.team_id)}, ${team.name}, ${team.tag || null}, ${team.logo_url || null}, ${team.region || null}, NOW(), NOW())
        ON CONFLICT (team_id) DO UPDATE SET
          name = COALESCE(NULLIF(teams.name, ''), NULLIF(EXCLUDED.name, '')),
          tag = EXCLUDED.tag,
          logo_url = EXCLUDED.logo_url,
          updated_at = NOW()
      `;
      return String(team.team_id);
    }
  } catch (e) {
    console.log(`[Liquipedia] Failed to fetch team ${teamName}: ${e.message}`);
  }
  return null;
}

/**
 * Save upcoming series to database
 */
async function saveUpcomingSeries(db, series) {
  if (!db || !series?.id) return false;

  try {
    await db`
      INSERT INTO upcoming_series (
        id, series_id, league_id,
        radiant_team_id, dire_team_id,
        radiant_team_name, radiant_team_name_cn,
        dire_team_name, dire_team_name_cn,
        tournament_name, tournament_name_cn, tournament_tier,
        start_time, series_type, status, created_at, updated_at
      )
      VALUES (
        ${series.id}, ${series.series_id}, ${series.league_id},
        ${series.radiant_team_id}, ${series.dire_team_id},
        ${series.radiant_team_name || null}, ${series.radiant_team_name_cn || null},
        ${series.dire_team_name || null}, ${series.dire_team_name_cn || null},
        ${series.tournament_name || null}, ${series.tournament_name_cn || null}, ${series.tournament_tier || null},
        ${series.start_time}, ${series.series_type || 'BO3'}, ${series.status || 'upcoming'}, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        radiant_team_id = EXCLUDED.radiant_team_id,
        dire_team_id = EXCLUDED.dire_team_id,
        radiant_team_name = EXCLUDED.radiant_team_name,
        radiant_team_name_cn = EXCLUDED.radiant_team_name_cn,
        dire_team_name = EXCLUDED.dire_team_name,
        dire_team_name_cn = EXCLUDED.dire_team_name_cn,
        tournament_name = EXCLUDED.tournament_name,
        tournament_name_cn = EXCLUDED.tournament_name_cn,
        tournament_tier = EXCLUDED.tournament_tier,
        start_time = EXCLUDED.start_time,
        series_type = EXCLUDED.series_type,
        status = EXCLUDED.status,
        updated_at = NOW()
    `;
    return true;
  } catch (e) {
    console.log(`[Liquipedia] Failed to save ${series.id}: ${e.message}`);
    return false;
  }
}

function normalizeName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/[._-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hashTournamentName(name) {
  const input = String(name || '').toLowerCase().trim();
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0; // 32-bit
  }
  return hash || 1;
}

async function ensureTournamentStub(db, leagueId, tournamentName) {
  const normalizedLeagueId = Math.trunc(Number(leagueId));
  const name = String(tournamentName || '').trim();
  if (!db || !Number.isFinite(normalizedLeagueId) || normalizedLeagueId <= 0 || !name) return;

  await db`
    INSERT INTO tournaments (league_id, name, tier, status, updated_at)
    VALUES (${normalizedLeagueId}, ${name}, ${'S'}, ${'upcoming'}, NOW())
    ON CONFLICT (league_id) DO UPDATE SET
      name = CASE
        WHEN tournaments.name IS NULL OR tournaments.name = '' THEN EXCLUDED.name
        ELSE tournaments.name
      END,
      tier = COALESCE(tournaments.tier, EXCLUDED.tier),
      status = COALESCE(tournaments.status, EXCLUDED.status),
      updated_at = NOW()
  `;
}

async function resolveLeagueId(db, tournamentName) {
  const name = String(tournamentName || '').trim();
  const lower = normalizeName(name);
  let resolvedLeagueId = null;

  // 1) First use existing tournaments table by name.
  const exact = await db`SELECT league_id FROM tournaments WHERE LOWER(name) = ${lower} LIMIT 1`;
  if (exact.length > 0) {
    resolvedLeagueId = exact[0].league_id;
  }

  // 2) Heuristic reuse: prefer existing PGL Wallachia season rows if name variants differ.
  if (!resolvedLeagueId && lower.includes('pgl') && lower.includes('wallachia')) {
    const wallachia = await db.query(
      `SELECT league_id
       FROM tournaments
       WHERE LOWER(name) LIKE '%pgl%'
         AND LOWER(name) LIKE '%wallachia%'
       ORDER BY
         CASE
           WHEN LOWER(name) LIKE '%season 7%' OR LOWER(name) LIKE '%s7%' THEN 0
           ELSE 1
         END,
         start_time DESC NULLS LAST,
         league_id ASC
       LIMIT 1`
    );
    if (wallachia.length > 0) resolvedLeagueId = wallachia[0].league_id;
  }

  // 3) Known mappings as fallback.
  if (!resolvedLeagueId && lower.includes('dreamleague') && (lower.includes('28') || lower.includes('season 28'))) resolvedLeagueId = 19269;
  if (!resolvedLeagueId && lower.includes('dreamleague') && (lower.includes('27') || lower.includes('season 27'))) resolvedLeagueId = 18988;
  if (!resolvedLeagueId && lower.includes('blast') && lower.includes('slam') && lower.includes('vi')) resolvedLeagueId = 19099;
  if (!resolvedLeagueId && lower.includes('esl') && lower.includes('challenger') && lower.includes('china')) resolvedLeagueId = 19130;

  // 4) Last resort: synthetic id only for upcoming-series bookkeeping.
  if (!resolvedLeagueId) {
    resolvedLeagueId = 1000000000 + (Math.abs(hashTournamentName(name)) % 1000000000);
    for (let i = 0; i < 10; i++) {
      const existing = await db`SELECT league_id, name FROM tournaments WHERE league_id = ${resolvedLeagueId} LIMIT 1`;
      if (existing.length === 0 || String(existing[0].name || '').toLowerCase() === lower) break;
      resolvedLeagueId++;
    }
    console.log(`[Liquipedia] Unknown tournament mapped to synthetic league_id=${resolvedLeagueId}: ${name}`);
    await ensureTournamentStub(db, resolvedLeagueId, name);
  }

  return resolvedLeagueId;
}

/**
 * Fetch upcoming matches from DLTV matches page.
 */
async function fetchDltvUpcomingMatches() {
  const res = await fetch(DLTV_MATCHES_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Dota2Hub/1.0)'
    }
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const html = await res.text();
  const debug = { responseLength: html.length };

  if (!html.trim()) {
    console.log('[Sync Liquipedia] Empty DLTV matches response');
    return { upcoming: [], debug };
  }

  const now = Math.floor(Date.now() / 1000);
  const weekLater = now + 7 * 24 * 60 * 60;
  const upcoming = parseDltvUpcomingMatchesPage(html, { now, maxStartTime: weekLater });
  debug.matchBlocksFound = upcoming.length;
  console.log(`[Sync Liquipedia] Parsed ${upcoming.length} upcoming DLTV match candidates`);

  return { upcoming, debug };
}

export async function runSyncLiquipedia() {

  const db = getDb();
  if (!db) {
    throw new Error('DATABASE_URL not configured');
  }

  console.log('[Sync Liquipedia] Starting...');

  try {
    const now = Math.floor(Date.now() / 1000);

    await ensureUpcomingSeriesColumns(db);

    // Step 1: Clean up past series and invalid data
    console.log('[Sync Liquipedia] Cleaning up past/invalid series...');
    await db`DELETE FROM upcoming_series WHERE start_time < ${now}`;

    // Also clean up matches where radiant == dire (invalid BYE matches)
    await db`DELETE FROM upcoming_series WHERE radiant_team_id = dire_team_id`;

    // Step 2: Remove series that already have matches
    await db`
      DELETE FROM upcoming_series us
      WHERE EXISTS (
        SELECT 1 FROM matches m
        WHERE m.series_id = us.series_id
        AND m.series_id IS NOT NULL
      )
    `;
    console.log('[Sync Liquipedia] Cleaned up series that already have matches');

    // Step 3: Fetch from DLTV matches while keeping the existing sync entrypoint.
    console.log('[Sync Liquipedia] Fetching upcoming matches from DLTV...');
    let liquipediaUpcoming = [];

    try {
      const result = await fetchDltvUpcomingMatches();
      liquipediaUpcoming = result.upcoming;
    } catch (e) {
      console.log(`[Sync Liquipedia] DLTV fetch failed: ${e.message}`);
    }

    // Step 4: Get teams from database
    console.log('[Sync Liquipedia] Loading teams from database...');
    const allTeams = await db`SELECT team_id, name, tag FROM teams`;
    const teamNameToId = new Map();

    for (const t of allTeams) {
      teamNameToId.set(normalizeName(t.name), t.team_id);
      if (t.tag) {
        teamNameToId.set(normalizeName(t.tag), t.team_id);
      }
    }
    console.log(`[Sync Liquipedia] Loaded ${allTeams.length} teams from database`);

    // Step 5: Save new upcoming series
    let saved = 0;

    for (const m of liquipediaUpcoming) {
      const radiantNameNorm = normalizeName(m.radiantName);
      const direNameNorm = normalizeName(m.direName);

      // Only keep matches where at least one team already exists in teams table.
      let radiantTeamId = teamNameToId.get(radiantNameNorm);
      let direTeamId = teamNameToId.get(direNameNorm);
      if (!radiantTeamId && !direTeamId) continue;

      // If not found, fetch from OpenDota
      if (!radiantTeamId) {
        radiantTeamId = await saveTeamFromOpenDota(db, m.radiantName);
        if (radiantTeamId) teamNameToId.set(radiantNameNorm, radiantTeamId);
      }
      if (!direTeamId) {
        direTeamId = await saveTeamFromOpenDota(db, m.direName);
        if (direTeamId) teamNameToId.set(direNameNorm, direTeamId);
      }

      if (!radiantTeamId && !direTeamId) {
        console.log(`[Liquipedia] Could not resolve both team IDs: ${m.radiantName} -> ${radiantTeamId}, ${m.direName} -> ${direTeamId}`);
        continue;
      }

      const leagueId = await resolveLeagueId(db, m.tournament);

      const fallbackSeriesId = `${leagueId}_${m.radiantName}_vs_${m.direName}`.toLowerCase().replace(/\s+/g, '_');
      const seriesId = m.seriesId ? `dltv_${m.seriesId}` : fallbackSeriesId;
      const id = `${seriesId}_${m.timestamp}`.toLowerCase().replace(/\s+/g, '_');

      const ok = await saveUpcomingSeries(db, {
        id,
        series_id: seriesId,
        league_id: leagueId,
        radiant_team_id: radiantTeamId,
        dire_team_id: direTeamId,
        radiant_team_name: m.radiantName,
        dire_team_name: m.direName,
        tournament_name: m.tournament,
        tournament_tier: 'S',
        start_time: m.timestamp,
        series_type: m.bestOf,
        status: 'upcoming'
      });
      if (ok) saved++;
    }

    console.log(`[Sync Liquipedia] Saved ${saved} upcoming series`);

    return {
      success: true,
      stats: {
        liquipedia: liquipediaUpcoming.length,
        saved
      }
    };
  } catch (e) {
    console.error('[Sync Liquipedia] Error:', e);
    throw e;
  }
}
