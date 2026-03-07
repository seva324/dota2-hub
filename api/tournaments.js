/**
 * Tournaments API
 * Data: Neon PostgreSQL
 */

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const DEFAULT_SERIES_LIMIT = 10;
const MAX_SERIES_LIMIT = 50;

let sql = null;

function getDb() {
  if (!sql && DATABASE_URL) {
    try {
      sql = neon(DATABASE_URL);
    } catch (e) {
      console.error('[Tournaments API] Failed to create client:', e.message);
      return null;
    }
  }
  return sql;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

// Normalize logo URL
function normalizeLogo(url) {
  if (!url) return null;
  return url.replace('steamcdn-a.akamaihd.net', 'cdn.steamstatic.com');
}

// Convert OpenDota series_type to human-readable format
// OpenDota: 0=BO1, 1=BO3, 2=BO5, 3=BO2
function convertSeriesType(seriesType) {
  if (seriesType === null || seriesType === undefined || seriesType === '') return 'BO3';
  const map = {
    0: 'BO1',
    1: 'BO3',
    2: 'BO5',
    3: 'BO2'
  };
  if (typeof seriesType === 'string') {
    const normalized = seriesType.toUpperCase();
    if (normalized.startsWith('BO')) return normalized;
    const parsed = Number(seriesType);
    return Number.isInteger(parsed) && map[parsed] ? map[parsed] : 'BO3';
  }
  return map[seriesType] || 'BO3';
}

function normalizeStageWindows(rawStageWindows) {
  if (!Array.isArray(rawStageWindows)) return [];
  return rawStageWindows
    .map((w) => ({
      key: w?.key || null,
      label: w?.label || null,
      label_cn: w?.label_cn || null,
      kind: w?.kind || null,
      start: Number(w?.start),
      end: Number(w?.end),
      priority: Number(w?.priority || 0)
    }))
    .filter((w) => Number.isFinite(w.start) && Number.isFinite(w.end) && w.start <= w.end);
}

function resolveSeriesStage(stageWindows, startTime, fallbackStage) {
  if (!Number.isFinite(startTime)) {
    return {
      stage: fallbackStage || 'Main Stage',
      stage_kind: null
    };
  }

  const matched = stageWindows
    .filter((w) => startTime >= w.start && startTime <= w.end)
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return (a.end - a.start) - (b.end - b.start);
    })[0];

  if (!matched) {
    return {
      stage: fallbackStage || 'Main Stage',
      stage_kind: null
    };
  }

  return {
    stage: matched.label || matched.key || fallbackStage || 'Main Stage',
    stage_kind: matched.kind || null
  };
}

function formatTournament(tournament) {
  return {
    id: String(tournament.id || tournament.league_id),
    league_id: tournament.league_id,
    name: tournament.name,
    name_cn: tournament.name_cn,
    tier: tournament.tier,
    location: tournament.location,
    status: tournament.status,
    start_time: tournament.start_time ?? null,
    end_time: tournament.end_time ?? null,
    prize_pool: tournament.prize_pool ?? null,
    prize_pool_usd: tournament.prize_pool_usd ?? null,
    start_date: tournament.start_date ?? null,
    end_date: tournament.end_date ?? null,
    image: tournament.image || null
  };
}

async function listTournamentSummaries(db) {
  const tournaments = await db`
    SELECT *
    FROM tournaments
    ORDER BY COALESCE(start_time, 0) DESC, COALESCE(end_time, 0) DESC
  `;

  return tournaments.map(formatTournament);
}

async function getTournamentById(db, tournamentId) {
  const rows = await db`
    SELECT *
    FROM tournaments
    WHERE CAST(id AS TEXT) = ${tournamentId}
       OR CAST(league_id AS TEXT) = ${tournamentId}
    LIMIT 1
  `;
  return rows[0] || null;
}

async function loadTeamMap(db) {
  const teams = await db`SELECT * FROM teams`;
  const teamMap = new Map();
  for (const team of teams) {
    teamMap.set(team.team_id, team);
  }
  return teamMap;
}

async function loadSeriesPage(db, tournament, limit, offset) {
  const totalRows = await db`
    SELECT COUNT(*)::int AS count
    FROM series
    WHERE league_id = ${tournament.league_id}
  `;
  const total = Number(totalRows?.[0]?.count || 0);

  const pageSeries = await db`
    SELECT *
    FROM series
    WHERE league_id = ${tournament.league_id}
    ORDER BY start_time DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `;

  return { total, pageSeries };
}

async function loadMatchesForSeries(db, seriesId) {
  return db`
    SELECT *
    FROM matches
    WHERE series_id = ${seriesId}
    ORDER BY start_time ASC
  `;
}

function buildSeriesPayload(seriesRows, matchesBySeries, teamMap, stageWindows) {
  return seriesRows.map((seriesRow) => {
    const radiantTeam = seriesRow.radiant_team_id ? teamMap.get(seriesRow.radiant_team_id) : null;
    const direTeam = seriesRow.dire_team_id ? teamMap.get(seriesRow.dire_team_id) : null;
    const stageInfo = resolveSeriesStage(stageWindows, Number(seriesRow.start_time), seriesRow.stage);

    const games = (matchesBySeries[String(seriesRow.series_id)] || []).map((matchRow) => {
      const matchRadiantTeam = matchRow.radiant_team_id ? teamMap.get(matchRow.radiant_team_id) : null;
      const matchDireTeam = matchRow.dire_team_id ? teamMap.get(matchRow.dire_team_id) : null;

      return {
        match_id: String(matchRow.match_id),
        radiant_team_id: matchRow.radiant_team_id ? String(matchRow.radiant_team_id) : null,
        dire_team_id: matchRow.dire_team_id ? String(matchRow.dire_team_id) : null,
        radiant_team_name: matchRadiantTeam?.name || radiantTeam?.name || null,
        dire_team_name: matchDireTeam?.name || direTeam?.name || null,
        radiant_team_logo: normalizeLogo(matchRadiantTeam?.logo_url || radiantTeam?.logo_url),
        dire_team_logo: normalizeLogo(matchDireTeam?.logo_url || direTeam?.logo_url),
        radiant_score: matchRow.radiant_score,
        dire_score: matchRow.dire_score,
        radiant_win: matchRow.radiant_win ? 1 : 0,
        start_time: matchRow.start_time,
        duration: matchRow.duration,
        picks_bans: Array.isArray(matchRow.picks_bans) ? matchRow.picks_bans : []
      };
    });

    return {
      series_id: String(seriesRow.series_id),
      series_type: convertSeriesType(seriesRow.series_type),
      radiant_team_id: seriesRow.radiant_team_id ? String(seriesRow.radiant_team_id) : null,
      dire_team_id: seriesRow.dire_team_id ? String(seriesRow.dire_team_id) : null,
      radiant_team_name: radiantTeam?.name || null,
      dire_team_name: direTeam?.name || null,
      radiant_team_logo: normalizeLogo(radiantTeam?.logo_url),
      dire_team_logo: normalizeLogo(direTeam?.logo_url),
      radiant_score: seriesRow.radiant_wins,
      dire_score: seriesRow.dire_wins,
      radiant_wins: seriesRow.radiant_wins,
      dire_wins: seriesRow.dire_wins,
      stage: stageInfo.stage,
      stage_kind: stageInfo.stage_kind,
      games
    };
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const db = getDb();
  if (!db) {
    return res.status(500).json({ error: 'Database not available' });
  }

  const tournamentId = String(req.query?.tournamentId || '').trim();
  const limit = Math.min(parsePositiveInt(req.query?.limit, DEFAULT_SERIES_LIMIT) || DEFAULT_SERIES_LIMIT, MAX_SERIES_LIMIT);
  const offset = parsePositiveInt(req.query?.offset, 0);

  try {
    if (!tournamentId) {
      const tournaments = await listTournamentSummaries(db);
      return res.status(200).json({ tournaments });
    }

    const tournament = await getTournamentById(db, tournamentId);
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    const [{ total, pageSeries }, teamMap] = await Promise.all([
      loadSeriesPage(db, tournament, limit, offset),
      loadTeamMap(db)
    ]);

    const matchesBySeries = {};
    await Promise.all(
      pageSeries.map(async (seriesRow) => {
        const rows = await loadMatchesForSeries(db, seriesRow.series_id);
        matchesBySeries[String(seriesRow.series_id)] = rows;
      })
    );

    const stageWindows = normalizeStageWindows(tournament.stage_windows);
    const series = buildSeriesPayload(pageSeries, matchesBySeries, teamMap, stageWindows);

    return res.status(200).json({
      tournament: formatTournament(tournament),
      series,
      pagination: {
        limit,
        offset,
        total,
        hasMore: offset + series.length < total
      }
    });
  } catch (e) {
    console.error('[Tournaments API] Error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
