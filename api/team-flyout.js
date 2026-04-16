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
import { ensureUpcomingSeriesColumns } from '../lib/server/upcoming-series-columns.js';

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

function formatTeam(team, req) {
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

async function loadSelectedTeam(db, { teamId, teamName }) {
  if (teamId) {
    const rows = await db`
      SELECT *
      FROM teams
      WHERE team_id = ${teamId}
      LIMIT 1
    `;
    if (rows[0]) return rows[0];
  }

  const normalizedName = normalize(teamName);
  if (!normalizedName) return null;

  const rows = await db`
    SELECT *
    FROM teams
    WHERE LOWER(COALESCE(name, '')) = ${normalizedName}
       OR LOWER(COALESCE(name_cn, '')) = ${normalizedName}
       OR LOWER(COALESCE(tag, '')) = ${normalizedName}
    LIMIT 1
  `;
  return rows[0] || null;
}

async function loadTeamMapByIds(db, teamIds) {
  const normalizedTeamIds = Array.from(
    new Set(
      (Array.isArray(teamIds) ? teamIds : [])
        .map((teamId) => String(teamId || '').trim())
        .filter(Boolean)
    )
  );
  if (!normalizedTeamIds.length) {
    return new Map();
  }

  const rows = await db`
    SELECT *
    FROM teams
    WHERE team_id::TEXT = ANY(${normalizedTeamIds})
  `;

  return new Map(
    rows
      .filter((team) => team?.team_id !== undefined && team?.team_id !== null)
      .map((team) => [String(team.team_id), team])
  );
}

function formatMatchRow(match, teamMap, req) {
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

function rehydrateActiveSquad(activeSquad, req) {
  if (!Array.isArray(activeSquad)) return [];
  return activeSquad.map((player) => ({
    ...player,
    avatar_url: getMirroredAssetUrl(player?.avatar_url || null, req),
  }));
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
    try {
      await ensureUpcomingSeriesColumns(db);
    } catch {
      // Best-effort schema repair for older databases.
    }
    const selectedTeam = await loadSelectedTeam(db, { teamId, teamName });

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
        SELECT u.*
        FROM upcoming_series u
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

    const relatedTeamIds = [
      selectedTeamId,
      ...recentRows.flatMap((row) => [row?.radiant_team_id, row?.dire_team_id]),
      ...nextMatchRows.flatMap((row) => [row?.radiant_team_id, row?.dire_team_id]),
    ];
    const teamMap = await loadTeamMapByIds(db, relatedTeamIds);
    teamMap.set(selectedTeamId, selectedTeam);

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
      ...formatMatchRow(row, teamMap, req),
      team_hero_ids: Array.isArray(row.team_hero_ids) ? row.team_hero_ids : [],
    }));
    const nextMatch = nextMatchRows[0] ? formatMatchRow(nextMatchRows[0], teamMap, req) : null;

    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({
      team: formatTeam(selectedTeam, req),
      recentMatches,
      nextMatch,
      activeSquad: rehydrateActiveSquad(teamCachePayload?.active_squad, req),
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
