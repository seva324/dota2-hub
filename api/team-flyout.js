/**
 * Team flyout API
 * Returns team summary, next match, and paginated recent matches for a team.
 */
import { neon } from '@neondatabase/serverless';
import { getMirroredAssetUrl } from '../lib/asset-mirror.js';
import {
  enrichRecentMatchesWithTeamHeroes,
  getTeamFlyoutCachePayload,
} from '../lib/server/team-flyout-cache.js';

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;
const HISTORY_WINDOW_SECONDS = 90 * 24 * 60 * 60;

let sql = null;

function getDb() {
  if (!sql && DATABASE_URL) {
    try {
      sql = neon(DATABASE_URL);
    } catch (error) {
      console.error('[TeamFlyout API] Failed to create client:', error.message);
      return null;
    }
  }
  return sql;
}

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeLogo(url, req) {
  return getMirroredAssetUrl(url, req);
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

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

function formatTeam(team) {
  if (!team) return null;
  return {
    team_id: team.team_id ? String(team.team_id) : null,
    id: team.id ? String(team.id) : null,
    name: team.name || null,
    name_cn: team.name_cn || null,
    tag: team.tag || null,
    logo_url: normalizeLogo(team.logo_url, req),
    region: team.region || null,
    is_cn_team: team.is_cn_team ?? null,
  };
}

function formatMatchRow(match, teamMap) {
  const radiantId = match.radiant_team_id ? String(match.radiant_team_id) : null;
  const direId = match.dire_team_id ? String(match.dire_team_id) : null;
  const radiantTeam = radiantId ? teamMap.get(radiantId) : null;
  const direTeam = direId ? teamMap.get(direId) : null;

  return {
    match_id: String(match.match_id ?? match.id ?? ''),
    id: match.id ? String(match.id) : null,
    series_id: match.series_id ? String(match.series_id) : null,
    radiant_team_id: radiantId,
    dire_team_id: direId,
    radiant_team_name: radiantTeam?.name || match.radiant_team_name || null,
    dire_team_name: direTeam?.name || match.dire_team_name || null,
    radiant_team_logo: normalizeLogo(radiantTeam?.logo_url || match.radiant_team_logo, req),
    dire_team_logo: normalizeLogo(direTeam?.logo_url || match.dire_team_logo, req),
    radiant_score: match.radiant_score ?? null,
    dire_score: match.dire_score ?? null,
    radiant_win: match.radiant_win ? 1 : 0,
    start_time: match.start_time ?? null,
    duration: match.duration ?? null,
    league_id: match.league_id ?? null,
    series_type: convertSeriesType(match.series_type),
    status: match.status || null,
    tournament_name: match.tournament_name || null,
    tournament_name_cn: match.tournament_name_cn || null,
    tournament_tier: match.tournament_tier || null,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const db = getDb();
  if (!db) {
    return res.status(500).json({ error: 'Database not available' });
  }

  const teamId = String(req.query?.teamId || req.query?.team_id || '').trim();
  const teamName = String(req.query?.name || '').trim();
  const offset = parsePositiveInt(req.query?.offset, 0);
  const limit = Math.min(parsePositiveInt(req.query?.limit, DEFAULT_LIMIT) || DEFAULT_LIMIT, MAX_LIMIT);

  if (!teamId && !teamName) {
    return res.status(400).json({ error: 'teamId or name is required' });
  }

  try {
    const teams = await db`SELECT * FROM teams`;
    const teamMap = new Map();
    teams.forEach((team) => {
      if (team?.team_id !== undefined && team?.team_id !== null) {
        teamMap.set(String(team.team_id), team);
      }
    });

    const selectedTeam = teams.find((team) => {
      const currentTeamId = team?.team_id ? String(team.team_id) : null;
      if (teamId && currentTeamId === teamId) return true;

      const aliases = [team?.name, team?.name_cn, team?.tag];
      return aliases.some((alias) => normalize(alias) === normalize(teamName));
    });

    if (!selectedTeam?.team_id) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const selectedTeamId = String(selectedTeam.team_id);
    const now = Math.floor(Date.now() / 1000);
    const minStartTime = now - HISTORY_WINDOW_SECONDS;
    const teamCachePayloadPromise = getTeamFlyoutCachePayload(db, selectedTeamId).catch((error) => {
      console.warn('[TeamFlyout API] Failed to load team cache:', error?.message || error);
      return null;
    });

    const [recentCountRows, recentRows, recentStatsRows, nextMatchRows] = await Promise.all([
      db`
        SELECT COUNT(*)::int AS count
        FROM matches
        WHERE (radiant_team_id = ${selectedTeamId} OR dire_team_id = ${selectedTeamId})
          AND start_time <= ${now}
          AND start_time >= ${minStartTime}
      `,
      db`
        SELECT m.*, s.league_id, t.name AS tournament_name, t.name_cn AS tournament_name_cn, t.tier AS tournament_tier
        FROM matches m
        LEFT JOIN series s ON m.series_id = s.series_id
        LEFT JOIN tournaments t ON s.league_id = t.league_id
        WHERE (m.radiant_team_id = ${selectedTeamId} OR m.dire_team_id = ${selectedTeamId})
          AND m.start_time <= ${now}
          AND m.start_time >= ${minStartTime}
        ORDER BY m.start_time DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `,
      db`
        SELECT radiant_team_id, dire_team_id, radiant_win
        FROM matches
        WHERE (radiant_team_id = ${selectedTeamId} OR dire_team_id = ${selectedTeamId})
          AND start_time <= ${now}
          AND start_time >= ${minStartTime}
      `,
      db`
        SELECT u.*, t.name AS tournament_name, t.name_cn AS tournament_name_cn, t.tier AS tournament_tier
        FROM upcoming_series u
        LEFT JOIN tournaments t ON u.league_id = t.league_id
        WHERE (u.radiant_team_id = ${selectedTeamId} OR u.dire_team_id = ${selectedTeamId})
          AND u.start_time > ${now}
        ORDER BY u.start_time ASC
        LIMIT 1
      `,
    ]);

    const [teamCachePayload, enrichedRecentRows] = await Promise.all([
      teamCachePayloadPromise,
      enrichRecentMatchesWithTeamHeroes(db, recentRows, selectedTeamId).catch((error) => {
        console.warn('[TeamFlyout API] Failed to enrich recent matches:', error?.message || error);
        return recentRows.map((row) => ({ ...row, team_hero_ids: [] }));
      }),
    ]);

    const wins = recentStatsRows.filter((match) => {
      const isRadiant = String(match.radiant_team_id || '') === selectedTeamId;
      if (match.radiant_win === null || match.radiant_win === undefined) return false;
      return isRadiant ? Boolean(match.radiant_win) : !Boolean(match.radiant_win);
    }).length;
    const losses = recentStatsRows.filter((match) => {
      const isRadiant = String(match.radiant_team_id || '') === selectedTeamId;
      if (match.radiant_win === null || match.radiant_win === undefined) return false;
      return isRadiant ? !Boolean(match.radiant_win) : Boolean(match.radiant_win);
    }).length;
    const decided = wins + losses;
    const total = Number(recentCountRows?.[0]?.count || 0);
    const recentMatches = enrichedRecentRows.map((row) => ({
      ...formatMatchRow(row, teamMap),
      team_hero_ids: Array.isArray(row.team_hero_ids) ? row.team_hero_ids : [],
    }));
    const nextMatch = nextMatchRows[0] ? formatMatchRow(nextMatchRows[0], teamMap) : null;

    return res.status(200).json({
      team: formatTeam(selectedTeam),
      recentMatches,
      nextMatch,
      activeSquad: Array.isArray(teamCachePayload?.active_squad) ? teamCachePayload.active_squad : [],
      topHeroes: Array.isArray(teamCachePayload?.top_heroes_90d) ? teamCachePayload.top_heroes_90d : [],
      stats: {
        wins,
        losses,
        winRate: decided > 0 ? Math.round((wins / decided) * 100) : 0,
      },
      pagination: {
        limit,
        offset,
        total,
        hasMore: offset + recentMatches.length < total,
        nextCursor: offset + recentMatches.length < total ? offset + recentMatches.length : null,
      },
    });
  } catch (error) {
    console.error('[TeamFlyout API] Error:', error instanceof Error ? error.message : error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'team flyout failed' });
  }
}
