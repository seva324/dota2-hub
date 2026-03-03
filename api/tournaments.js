/**
 * Tournaments API
 * Data: Neon PostgreSQL
 */

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

// League ID to Tournament ID mapping
const LEAGUE_ID_MAP = {
  19269: { id: 'dreamleague-s28', name: 'DreamLeague Season 28', name_cn: '梦联赛 S28', tier: 'S' },
  18988: { id: 'dreamleague-s27', name: 'DreamLeague Season 27', name_cn: '梦联赛 S27', tier: 'S' },
  19099: { id: 'blast-slam-vi', name: 'BLAST Slam VI', name_cn: 'BLAST 锦标赛 VI', tier: 'S' },
  19130: { id: 'esl-challenger-china', name: 'ESL Challenger China', name_cn: 'ESL 挑战者杯 中国', tier: 'S' }
};

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
  // If already a string (e.g., 'BO3'), return as-is
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

  try {
    // Get tournaments
    const tournaments = await db`SELECT * FROM tournaments`;

    // Get series with team info
    const seriesData = await db`
      SELECT s.*, t.name as tournament_name, t.name_cn as tournament_name_cn
      FROM series s
      LEFT JOIN tournaments t ON s.league_id = t.league_id
      ORDER BY s.start_time DESC
    `;

    // Get teams for logo lookup
    const teams = await db`SELECT * FROM teams`;

    // Create team map
    const teamMap = new Map();
    for (const team of teams) {
      teamMap.set(team.team_id, team);
    }

    // Get matches for series
    const matches = await db`
      SELECT m.*, s.league_id
      FROM matches m
      LEFT JOIN series s ON m.series_id = s.series_id
      ORDER BY m.start_time DESC
      LIMIT 500
    `;

    // Build series by tournament
    const seriesByTournament = {};
    const leagueStageWindows = {};

    for (const t of tournaments) {
      leagueStageWindows[t.league_id] = normalizeStageWindows(t.stage_windows);
    }

    // Initialize all target tournaments
    for (const [leagueId, info] of Object.entries(LEAGUE_ID_MAP)) {
      seriesByTournament[info.id] = [];
    }

    // Group matches by series
    const seriesMatches = {};
    for (const m of matches) {
      if (!m.series_id) continue;
      if (!seriesMatches[m.series_id]) {
        seriesMatches[m.series_id] = [];
      }
      seriesMatches[m.series_id].push(m);
    }

    // Build series with games
    for (const s of seriesData) {
      const info = LEAGUE_ID_MAP[s.league_id];
      if (!info) continue;

      const radiantTeam = s.radiant_team_id ? teamMap.get(s.radiant_team_id) : null;
      const direTeam = s.dire_team_id ? teamMap.get(s.dire_team_id) : null;
      const stageInfo = resolveSeriesStage(
        leagueStageWindows[s.league_id] || [],
        Number(s.start_time),
        s.stage
      );

      const games = (seriesMatches[s.series_id] || [])
        .sort((a, b) => a.start_time - b.start_time)
        .map(m => {
          // Use the team from this match, not from series
          const matchRadiantTeam = m.radiant_team_id ? teamMap.get(m.radiant_team_id) : null;
          const matchDireTeam = m.dire_team_id ? teamMap.get(m.dire_team_id) : null;
          return {
            match_id: String(m.match_id),
            radiant_team_name: matchRadiantTeam?.name || radiantTeam?.name || null,
            dire_team_name: matchDireTeam?.name || direTeam?.name || null,
            radiant_team_logo: normalizeLogo(matchRadiantTeam?.logo_url || radiantTeam?.logo_url),
            dire_team_logo: normalizeLogo(matchDireTeam?.logo_url || direTeam?.logo_url),
            radiant_score: m.radiant_score,
            dire_score: m.dire_score,
            radiant_win: m.radiant_win ? 1 : 0,
            start_time: m.start_time,
            duration: m.duration
          };
        });

      seriesByTournament[info.id].push({
        series_id: String(s.series_id),
        series_type: convertSeriesType(s.series_type),
        radiant_team_name: radiantTeam?.name || null,
        dire_team_name: direTeam?.name || null,
        radiant_team_logo: normalizeLogo(radiantTeam?.logo_url),
        dire_team_logo: normalizeLogo(direTeam?.logo_url),
        radiant_score: s.radiant_wins,
        dire_score: s.dire_wins,
        radiant_wins: s.radiant_wins,
        dire_wins: s.dire_wins,
        stage: stageInfo.stage,
        stage_kind: stageInfo.stage_kind,
        games
      });
    }

    // Format tournaments
    const formattedTournaments = tournaments.map(t => {
      const info = LEAGUE_ID_MAP[t.league_id];
      return {
        id: info?.id || String(t.league_id),
        name: info?.name || t.name,
        name_cn: info?.name_cn || t.name_cn,
        tier: info?.tier || t.tier,
        location: t.location,
        status: t.status,
        start_time: t.start_time ?? null,
        end_time: t.end_time ?? null,
        prize_pool_usd: t.prize_pool_usd ?? null
      };
    });

    return res.status(200).json({
      tournaments: formattedTournaments,
      seriesByTournament
    });
  } catch (e) {
    console.error('[Tournaments API] Error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
