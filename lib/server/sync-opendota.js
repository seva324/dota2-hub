/**
 * OpenDota Data Sync API
 *
 * Syncs: teams, series, matches, match_details
 * Storage: Neon PostgreSQL only
 *
 * Usage: POST /api/cron?action=sync-opendota
 */

import { getDb } from '../db.js';
import { getCuratedTeamLogoGithubUrl } from '../team-logo-overrides.js';

const OPENDOTA = 'https://api.opendota.com/api';
const OPENDOTA_API_KEY = process.env.OPENDOTA_API_KEY;

export function isTransientDbError(error) {
  const message = String(error?.message || '');
  const source = String(error?.sourceError?.message || '');
  const code = String(error?.sourceError?.code || error?.code || '');
  return /fetch failed|ECONNRESET|UND_ERR_SOCKET|socket|ENOTFOUND|ETIMEDOUT|ECONNREFUSED/i.test(`${message} ${source} ${code}`);
}

export async function withOpenDotaDbRetry(run, label = 'sync-opendota-db', maxAttempts = 4) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (!isTransientDbError(error) || attempt >= maxAttempts) {
        throw error;
      }
      const delayMs = 400 * attempt;
      console.warn(`[sync-opendota-db-retry] ${label} failed attempt ${attempt}/${maxAttempts}: ${error?.message || error}. retrying in ${delayMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

async function queryDbWithRetry(db, sqlText, params = [], label = 'query') {
  return withOpenDotaDbRetry(() => db.query(sqlText, params), label);
}

async function execDbWithRetry(run, label = 'exec') {
  return withOpenDotaDbRetry(run, label);
}


async function fetchJSON(url) {
  const requestUrl = new URL(url);
  if (OPENDOTA_API_KEY && requestUrl.hostname === 'api.opendota.com') {
    requestUrl.searchParams.set('api_key', OPENDOTA_API_KEY);
  }
  const res = await fetch(requestUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchExistingMatchIds(db, matchIds) {
  if (!db || !Array.isArray(matchIds) || matchIds.length === 0) return new Set();

  const normalized = matchIds
    .map((id) => Math.trunc(Number(id)))
    .filter((id) => Number.isFinite(id));
  if (normalized.length === 0) return new Set();

  const rows = await queryDbWithRetry(
    db,
    `SELECT match_id::BIGINT AS match_id
     FROM matches
     WHERE match_id = ANY($1::bigint[])`,
    [normalized],
    'fetchExistingMatchIds'
  );

  return new Set(rows.map((row) => String(row.match_id)));
}

async function fetchExistingSeriesScores(db, seriesIds) {
  if (!db || !Array.isArray(seriesIds) || seriesIds.length === 0) return new Map();

  const normalized = Array.from(
    new Set(
      seriesIds
        .map((id) => String(id ?? '').trim())
        .filter(Boolean)
    )
  );
  if (normalized.length === 0) return new Map();

  const rows = await queryDbWithRetry(
    db,
    `SELECT series_id::TEXT AS series_id, radiant_team_id, dire_team_id, radiant_wins, dire_wins
     FROM series
     WHERE series_id::TEXT = ANY($1::text[])`,
    [normalized],
    'fetchExistingSeriesScores'
  );

  return new Map(rows.map((row) => [String(row.series_id), row]));
}

async function ensureTournamentStub(db, leagueId, leagueName) {
  const normalizedLeagueId = Math.trunc(Number(leagueId));
  if (!db || !Number.isFinite(normalizedLeagueId) || normalizedLeagueId <= 0) return;

  const normalizedName = String(leagueName || '').trim() || `OpenDota League ${normalizedLeagueId}`;
  await execDbWithRetry(() => db`
      INSERT INTO tournaments (league_id, name, tier, status, updated_at)
      VALUES (${normalizedLeagueId}, ${normalizedName}, ${null}, ${null}, NOW())
      ON CONFLICT (league_id) DO UPDATE SET
        name = CASE
          WHEN tournaments.name IS NULL OR tournaments.name = '' THEN EXCLUDED.name
          ELSE tournaments.name
        END,
        updated_at = NOW()
    `,
    `ensureTournamentStub:${normalizedLeagueId}`
  );
}

async function refreshSeriesScores(db, seriesIds) {
  if (!db || !Array.isArray(seriesIds) || seriesIds.length === 0) return;

  const normalized = Array.from(
    new Set(
      seriesIds
        .map((id) => String(id ?? '').trim())
        .filter(Boolean)
    )
  );
  if (normalized.length === 0) return;

  const rows = await queryDbWithRetry(
    db,
    `SELECT
       s.series_id::TEXT AS series_id,
       COALESCE(SUM(CASE
         WHEN m.radiant_win = true AND m.radiant_team_id::TEXT = s.radiant_team_id::TEXT THEN 1
         WHEN m.radiant_win = false AND m.dire_team_id::TEXT = s.radiant_team_id::TEXT THEN 1
         ELSE 0
       END), 0)::INT AS radiant_wins,
       COALESCE(SUM(CASE
         WHEN m.radiant_win = true AND m.radiant_team_id::TEXT = s.dire_team_id::TEXT THEN 1
         WHEN m.radiant_win = false AND m.dire_team_id::TEXT = s.dire_team_id::TEXT THEN 1
         ELSE 0
       END), 0)::INT AS dire_wins
     FROM series s
     LEFT JOIN matches m ON m.series_id::TEXT = s.series_id::TEXT
     WHERE s.series_id::TEXT = ANY($1::text[])
     GROUP BY s.series_id, s.radiant_team_id, s.dire_team_id`,
    [normalized],
    'refreshSeriesScores:select'
  );

  for (const row of rows) {
    await execDbWithRetry(() => db`
        UPDATE series
        SET radiant_wins = ${Number(row.radiant_wins || 0)},
            dire_wins = ${Number(row.dire_wins || 0)},
            updated_at = NOW()
        WHERE series_id = ${String(row.series_id)}
      `,
      `refreshSeriesScores:update:${String(row.series_id)}`
    );
  }
}

const SERIES_FALLBACK_WINDOW_SECONDS = 2 * 60 * 60;

function normalizeSeriesPair(teamA, teamB) {
  return [String(teamA || '').trim(), String(teamB || '').trim()]
    .filter(Boolean)
    .sort()
    .join('::');
}

export function resolveFallbackSeriesId(targetMatch, candidateSeriesRows, windowSeconds = SERIES_FALLBACK_WINDOW_SECONDS) {
  const targetLeagueId = Number(targetMatch?.league_id || 0);
  const targetStart = Number(targetMatch?.start_time || 0);
  const targetPair = normalizeSeriesPair(targetMatch?.radiant_team_id, targetMatch?.dire_team_id);

  if (!targetLeagueId || !targetStart || !targetPair || !Array.isArray(candidateSeriesRows) || candidateSeriesRows.length === 0) {
    return null;
  }

  const matched = candidateSeriesRows
    .filter((row) => Number(row?.league_id || 0) === targetLeagueId)
    .filter((row) => normalizeSeriesPair(row?.radiant_team_id, row?.dire_team_id) === targetPair)
    .map((row) => ({
      series_id: row.series_id ? String(row.series_id) : null,
      start_time: Number(row.start_time || 0),
      distance: Math.abs(Number(row.start_time || 0) - targetStart),
    }))
    .filter((row) => row.series_id && row.start_time && row.distance <= windowSeconds)
    .sort((a, b) => {
      if (a.distance !== b.distance) return a.distance - b.distance;
      return b.start_time - a.start_time;
    })[0];

  return matched?.series_id || null;
}

async function backfillMissingSeriesIds(db, matchIds = []) {
  if (!db) return { scanned: 0, matched: 0, seriesIds: [] };

  const normalizedMatchIds = Array.from(
    new Set(
      (Array.isArray(matchIds) ? matchIds : [])
        .map((id) => Math.trunc(Number(id)))
        .filter((id) => Number.isFinite(id) && id > 0)
    )
  );

  const targetRows = await queryDbWithRetry(
    db,
    `
      SELECT
        m.match_id::TEXT AS match_id,
        m.start_time,
        m.radiant_team_id::TEXT AS radiant_team_id,
        m.dire_team_id::TEXT AS dire_team_id,
        CASE
          WHEN COALESCE(md.payload->>'leagueid', '') ~ '^[0-9]+$' THEN (md.payload->>'leagueid')::BIGINT
          ELSE NULL
        END AS league_id
      FROM matches m
      JOIN match_details md ON md.match_id = m.match_id
      WHERE m.series_id IS NULL
        AND m.radiant_team_id IS NOT NULL
        AND m.dire_team_id IS NOT NULL
        AND COALESCE(md.payload->>'leagueid', '') ~ '^[0-9]+$'
        AND ($1::bigint[] IS NULL OR m.match_id = ANY($1::bigint[]))
    `,
    [normalizedMatchIds.length ? normalizedMatchIds : null],
    'backfillMissingSeriesIds:targets'
  );

  if (!targetRows.length) {
    return { scanned: 0, matched: 0, seriesIds: [] };
  }

  const leagueIds = Array.from(
    new Set(
      targetRows
        .map((row) => Number(row.league_id || 0))
        .filter((id) => Number.isFinite(id) && id > 0)
    )
  );

  if (!leagueIds.length) {
    return { scanned: targetRows.length, matched: 0, seriesIds: [] };
  }

  const candidateSeriesRows = await queryDbWithRetry(
    db,
    `
      SELECT
        series_id::TEXT AS series_id,
        league_id,
        radiant_team_id::TEXT AS radiant_team_id,
        dire_team_id::TEXT AS dire_team_id,
        start_time
      FROM series
      WHERE league_id = ANY($1::bigint[])
        AND radiant_team_id IS NOT NULL
        AND dire_team_id IS NOT NULL
        AND start_time IS NOT NULL
    `,
    [leagueIds],
    'backfillMissingSeriesIds:candidates'
  );

  let matched = 0;
  const touchedSeriesIds = new Set();

  for (const row of targetRows) {
    const seriesId = resolveFallbackSeriesId(row, candidateSeriesRows);
    if (!seriesId) continue;

    const result = await queryDbWithRetry(
      db,
      `
        UPDATE matches
        SET series_id = $2, updated_at = NOW()
        WHERE match_id = $1
          AND series_id IS NULL
        RETURNING match_id
      `,
      [Number(row.match_id), seriesId],
      `backfillMissingSeriesIds:update:${Number(row.match_id)}`
    );

    if (Array.isArray(result)) {
      if (result.length > 0) {
        matched += result.length;
        touchedSeriesIds.add(seriesId);
      }
    } else if (result && typeof result.rowCount === 'number' && result.rowCount > 0) {
      matched += result.rowCount;
      touchedSeriesIds.add(seriesId);
    }
  }

  return {
    scanned: targetRows.length,
    matched,
    seriesIds: Array.from(touchedSeriesIds),
  };
}

/**
 * Save team to database
 */
async function saveTeam(db, team) {
  if (!db || !team?.team_id) return;

  try {
    const preferredLogoUrl = getCuratedTeamLogoGithubUrl(team) || team.logo_url || null;
    await execDbWithRetry(() => db`
        INSERT INTO teams (team_id, name, tag, logo_url, region, created_at, updated_at)
        VALUES (${String(team.team_id)}, ${team.name}, ${team.tag || null}, ${preferredLogoUrl}, ${team.region || null}, NOW(), NOW())
        ON CONFLICT (team_id) DO UPDATE SET
          name = COALESCE(NULLIF(teams.name, ''), NULLIF(EXCLUDED.name, '')),
          tag = EXCLUDED.tag,
          logo_url = EXCLUDED.logo_url,
          region = COALESCE(NULLIF(EXCLUDED.region, ''), teams.region),
          updated_at = NOW()
      `,
      `saveTeam:${String(team.team_id)}`
    );
  } catch (e) {
    console.log(`[Teams] Failed to save ${team.name}: ${e.message}`);
  }
}

async function ensureTeamStub(db, { team_id, name = null, tag = null, logo_url = null, region = null } = {}) {
  if (!db || !team_id) return;
  await saveTeam(db, {
    team_id,
    name: String(name || '').trim() || `OpenDota Team ${team_id}`,
    tag,
    logo_url,
    region,
  });
}

/**
 * Save series to database
 */
async function saveSeries(db, series) {
  if (!db || !series?.series_id) return;

  try {
    await execDbWithRetry(() => db`
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
      `,
      `saveSeries:${String(series.series_id)}`
    );
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
    await execDbWithRetry(() => db`
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
      `,
      `saveMatch:${parseInt(match.match_id)}`
    );
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
    await execDbWithRetry(() => db`
        INSERT INTO match_details (match_id, payload, updated_at)
        VALUES (${Math.trunc(Number(matchId))}, ${JSON.stringify(detail)}::jsonb, NOW())
        ON CONFLICT (match_id) DO UPDATE SET
          payload = EXCLUDED.payload,
          updated_at = NOW()
      `,
      `saveMatchDetail:${Math.trunc(Number(matchId))}`
    );
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
    const cutoff24h = now - (24 * 60 * 60);

    // Step 1: Tournament sync disabled (manually maintained)
    // console.log('[Sync] Saving tournaments...');
    // ... disabled by design
    // console.log('[Sync] Saved tournaments');

    // Step 2: Fetch and process new pro matches from last 24h
    const allMatches = [];
    const seriesMap = new Map();
    const leagueNames = new Map();
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

    const recentMatches = (Array.isArray(proMatches) ? proMatches : [])
      .filter((m) => Number(m?.start_time) >= cutoff24h && Number(m?.start_time) <= now);
    const existingMatchIds = await fetchExistingMatchIds(
      db,
      recentMatches.map((m) => Number(m?.match_id)).filter((id) => Number.isFinite(id))
    );
    const relevant = recentMatches.filter((m) => !existingMatchIds.has(String(m?.match_id)));
    const existingSeriesScores = await fetchExistingSeriesScores(
      db,
      relevant.map((m) => Number(m?.series_id)).filter((id) => Number.isFinite(id))
    );
    console.log(`[Sync] proMatches: ${proMatches.length || 0} total, ${recentMatches.length} in last 24h, ${relevant.length} new`);

    for (const m of relevant) {
      const match = convertMatch(m);
      const leagueId = Number(m.leagueid || match.league_id || 0);
      match.league_id = Number.isFinite(leagueId) && leagueId > 0 ? leagueId : null;
      if (match.league_id) {
        leagueNames.set(match.league_id, String(m.league_name || '').trim() || null);
      }

      if (seenMatchIds.has(match.match_id)) continue;
      seenMatchIds.add(match.match_id);
      allMatches.push(match);

      if (match.radiant_team_id) teamIds.add(match.radiant_team_id);
      if (match.dire_team_id) teamIds.add(match.dire_team_id);

      if (match.series_id) {
        if (!seriesMap.has(match.series_id)) {
          const existingSeries = existingSeriesScores.get(match.series_id);
          seriesMap.set(match.series_id, {
            series_id: match.series_id,
            league_id: match.league_id,
            radiant_team_id: match.radiant_team_id || (existingSeries?.radiant_team_id ? String(existingSeries.radiant_team_id) : null),
            dire_team_id: match.dire_team_id || (existingSeries?.dire_team_id ? String(existingSeries.dire_team_id) : null),
            radiant_wins: Number(existingSeries?.radiant_wins || 0),
            dire_wins: Number(existingSeries?.dire_wins || 0),
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
    for (const match of allMatches) {
      if (match.radiant_team_id) {
        await ensureTeamStub(db, {
          team_id: match.radiant_team_id,
          name: match.radiant_team_name,
        });
      }
      if (match.dire_team_id) {
        await ensureTeamStub(db, {
          team_id: match.dire_team_id,
          name: match.dire_team_name,
        });
      }
    }

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
          await ensureTeamStub(db, { team_id: String(teamId) });
        }
      }
    }

    // Step 5: Ensure tournaments + save series
    for (const [leagueId, leagueName] of leagueNames) {
      await ensureTournamentStub(db, leagueId, leagueName);
    }

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

    const newMatchIds = allMatches.map((match) => Number(match.match_id)).filter((id) => Number.isFinite(id));
    const fallbackSeries = newMatchIds.length
      ? await backfillMissingSeriesIds(db, newMatchIds)
      : { scanned: 0, matched: 0, seriesIds: [] };

    await refreshSeriesScores(db, Array.from(new Set([...seriesMap.keys(), ...fallbackSeries.seriesIds])));

    console.log('[Sync] Complete!');

    return {
      success: true,
      newMatchIds,
      stats: {
        tournaments: leagueNames.size,
        series: seriesMap.size,
        matches: allMatches.length,
        teams: teamIds.size,
        fallbackSeriesScanned: fallbackSeries.scanned,
        fallbackSeriesMatched: fallbackSeries.matched
      }
    };
  } catch (e) {
    console.error('[Sync] Error:', e);
    throw e;
  }
}
