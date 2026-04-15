import {
  enrichRecentMatchesWithTeamHeroes,
  getTeamFlyoutCachePayload,
} from './team-flyout-cache.js';
import { toChinaReachableAssetUrl } from '../asset-image-proxy.js';
import { getLiveHeroPayloads } from './live-hero-service.js';
import { ensureUpcomingSeriesColumns } from './upcoming-series-columns.js';
import { toChinaReachableBo3ImageUrl } from './bo3-images.js';
import { buildTournamentBackgroundUrl } from '../tournament-backgrounds.js';

export const MP_DEFAULT_LIMIT = 10;
export const MP_MAX_LIMIT = 50;
export const MP_DEFAULT_UPCOMING_DAYS = 2;
const TEAM_HISTORY_WINDOW_SECONDS = 90 * 24 * 60 * 60;
const MP_PUBLIC_ORIGIN_FALLBACK = 'https://dotahub.cn';

export function setApiCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export function handleOptions(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  return false;
}

export function createMeta() {
  return {
    generatedAt: new Date().toISOString(),
  };
}

export function sendApiSuccess(res, data, status = 200) {
  return res.status(status).json({
    ok: true,
    data,
    error: null,
    meta: createMeta(),
  });
}

export function sendApiError(res, status, code, message, details) {
  return res.status(status).json({
    ok: false,
    data: null,
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
    },
    meta: createMeta(),
  });
}

export function parsePositiveInt(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

export function parsePagination(query, defaults = {}) {
  const limit = parsePositiveInt(
    query?.limit,
    defaults.limit ?? MP_DEFAULT_LIMIT,
    { min: 1, max: defaults.maxLimit ?? MP_MAX_LIMIT }
  );
  const offset = parsePositiveInt(query?.offset, defaults.offset ?? 0, { min: 0 });
  return { limit, offset };
}

export function buildPagination(total, offset, limit, itemCount) {
  const hasMore = offset + itemCount < total;
  return {
    total,
    offset,
    limit,
    hasMore,
    nextCursor: hasMore ? offset + itemCount : null,
  };
}

export function normalizeLogo(url, options = {}) {
  if (!url) return null;
  const normalized = String(url).replace('steamcdn-a.akamaihd.net', 'cdn.steamstatic.com');
  return toChinaReachableAssetUrl(normalized, {
    publicOrigin:
      options.publicOrigin ||
      process.env.PUBLIC_SITE_ORIGIN ||
      process.env.PUBLIC_SITE_URL ||
      process.env.VITE_PUBLIC_SITE_ORIGIN ||
      process.env.SITE_URL ||
      process.env.SITE_BASE_URL ||
      MP_PUBLIC_ORIGIN_FALLBACK,
  }) || normalized;
}

export function convertSeriesType(seriesType) {
  if (seriesType === null || seriesType === undefined || seriesType === '') return 'BO3';
  const map = {
    0: 'BO1',
    1: 'BO3',
    2: 'BO5',
    3: 'BO2',
  };

  if (typeof seriesType === 'string') {
    const normalized = seriesType.toUpperCase();
    if (normalized.startsWith('BO')) return normalized;
    const parsed = Number(seriesType);
    return Number.isInteger(parsed) && map[parsed] ? map[parsed] : 'BO3';
  }

  return map[seriesType] || 'BO3';
}

export function normalizeStageWindows(rawStageWindows) {
  if (!Array.isArray(rawStageWindows)) return [];
  return rawStageWindows
    .map((window) => ({
      key: window?.key || null,
      label: window?.label || null,
      kind: window?.kind || null,
      start: Number(window?.start),
      end: Number(window?.end),
      priority: Number(window?.priority || 0),
    }))
    .filter((window) => Number.isFinite(window.start) && Number.isFinite(window.end) && window.start <= window.end);
}

export function resolveSeriesStage(stageWindows, startTime, fallbackStage) {
  if (!Number.isFinite(startTime)) {
    return {
      stage: fallbackStage || 'Main Stage',
      stage_kind: null,
    };
  }

  const matched = stageWindows
    .filter((window) => startTime >= window.start && startTime <= window.end)
    .sort((left, right) => {
      if (right.priority !== left.priority) return right.priority - left.priority;
      return (left.end - left.start) - (right.end - right.start);
    })[0];

  return {
    stage: matched?.label || matched?.key || fallbackStage || 'Main Stage',
    stage_kind: matched?.kind || null,
  };
}

export function formatTournament(row, req) {
  return {
    id: String(row.id || row.league_id),
    league_id: row.league_id ?? null,
    name: row.name || '',
    name_cn: row.name_cn || null,
    tier: row.tier || null,
    location: row.location || null,
    status: row.status || null,
    start_time: row.start_time ?? null,
    end_time: row.end_time ?? null,
    prize_pool: row.prize_pool ?? null,
    prize_pool_usd: row.prize_pool_usd ?? null,
    start_date: row.start_date ?? null,
    end_date: row.end_date ?? null,
    image: row.image || null,
    background_image_url: buildTournamentBackgroundUrl(row, req),
  };
}

export function formatTeam(row, options = {}) {
  if (!row) return null;
  return {
    team_id: row.team_id !== undefined && row.team_id !== null ? String(row.team_id) : null,
    id: row.id !== undefined && row.id !== null ? String(row.id) : null,
    name: row.name || null,
    name_cn: row.name_cn || null,
    tag: row.tag || null,
    logo_url: normalizeLogo(row.logo_url, options),
    region: row.region || null,
    is_cn_team: row.is_cn_team ?? null,
  };
}

export function formatNewsSummary(row, options = {}) {
  return {
    id: String(row.id),
    title: row.title_zh || row.title_en || '',
    summary: row.summary_zh || row.summary_en || null,
    source: row.source || null,
    url: row.url || null,
    image_url: toChinaReachableBo3ImageUrl(row.image_url, row.url || 'https://bo3.gg', options) || null,
    published_at: Number(row.published_at || 0),
    category: row.category || null,
  };
}

export async function loadTeamMap(db) {
  const rows = await db`SELECT * FROM teams`;
  const teamMap = new Map();
  for (const row of rows) {
    if (row?.team_id !== undefined && row?.team_id !== null) {
      teamMap.set(String(row.team_id), row);
    }
  }
  return teamMap;
}

function formatMatchDetailTeam(payloadTeam, fallbackTeamId, teamMap, options = {}) {
  const base = payloadTeam && typeof payloadTeam === 'object' ? payloadTeam : {};
  const mapKey = base.team_id ?? base.id ?? fallbackTeamId;
  const teamRow = mapKey !== undefined && mapKey !== null && mapKey !== ''
    ? teamMap.get(String(mapKey))
    : null;

  return {
    ...base,
    team_id: base.team_id ?? teamRow?.team_id ?? fallbackTeamId ?? null,
    id: base.id ?? teamRow?.id ?? teamRow?.team_id ?? fallbackTeamId ?? null,
    name: teamRow?.name || base.name || null,
    tag: teamRow?.tag || base.tag || null,
    logo_url: normalizeLogo(teamRow?.logo_url || base.logo_url || null, options),
  };
}

export function formatMatchDetailPayload(payload, teamMap, options = {}) {
  if (!payload) return null;
  const resolvedTeamMap = teamMap instanceof Map ? teamMap : new Map();

  return {
    ...payload,
    radiant_team: formatMatchDetailTeam(
      payload.radiant_team,
      payload.radiant_team_id,
      resolvedTeamMap,
      options,
    ),
    dire_team: formatMatchDetailTeam(
      payload.dire_team,
      payload.dire_team_id,
      resolvedTeamMap,
      options,
    ),
  };
}

export async function listTournamentSummaries(db, { limit, offset, req = null } = {}) {
  const countRows = await db`
    SELECT COUNT(*)::int AS count
    FROM tournaments
    WHERE NULLIF(BTRIM(COALESCE(tier, '')), '') IS NOT NULL
  `;
  const total = Number(countRows?.[0]?.count || 0);

  const shouldPage = Number.isFinite(limit) && Number.isFinite(offset);
  const rows = shouldPage
    ? await db`
        SELECT *
        FROM tournaments
        WHERE NULLIF(BTRIM(COALESCE(tier, '')), '') IS NOT NULL
        ORDER BY COALESCE(start_time, 0) DESC, COALESCE(end_time, 0) DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `
    : await db`
        SELECT *
        FROM tournaments
        WHERE NULLIF(BTRIM(COALESCE(tier, '')), '') IS NOT NULL
        ORDER BY COALESCE(start_time, 0) DESC, COALESCE(end_time, 0) DESC
      `;

  const items = rows.map((row) => formatTournament(row, req));
  return {
    items,
    pagination: buildPagination(total, offset ?? 0, limit ?? (items.length || total), items.length),
  };
}

export async function getTournamentRowById(db, tournamentId) {
  const rows = await db`
    SELECT *
    FROM tournaments
    WHERE CAST(league_id AS TEXT) = ${String(tournamentId)}
    LIMIT 1
  `;
  return rows[0] || null;
}

export async function loadTournamentDetailPayload(db, tournamentId, { limit, offset, req = null, publicOrigin = '' }) {
  const tournament = await getTournamentRowById(db, tournamentId);
  if (!tournament) return null;

  const [{ countRows, pageSeries }, teamMap] = await Promise.all([
    (async () => {
      const countRows = await db`
        SELECT COUNT(*)::int AS count
        FROM series
        WHERE league_id = ${tournament.league_id}
      `;
      const pageSeries = await db`
        SELECT *
        FROM series
        WHERE league_id = ${tournament.league_id}
        ORDER BY start_time DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `;
      return { countRows, pageSeries };
    })(),
    loadTeamMap(db),
  ]);

  const matchesBySeries = {};
  await Promise.all(
    pageSeries.map(async (seriesRow) => {
      const rows = await db`
        SELECT *
        FROM matches
        WHERE series_id = ${seriesRow.series_id}
        ORDER BY start_time ASC
      `;
      matchesBySeries[String(seriesRow.series_id)] = rows;
    })
  );

  const stageWindows = normalizeStageWindows(tournament.stage_windows);
  const items = pageSeries.map((seriesRow) => {
    const radiantTeam = seriesRow.radiant_team_id ? teamMap.get(String(seriesRow.radiant_team_id)) : null;
    const direTeam = seriesRow.dire_team_id ? teamMap.get(String(seriesRow.dire_team_id)) : null;
    const stageInfo = resolveSeriesStage(stageWindows, Number(seriesRow.start_time), seriesRow.stage);

    return {
      series_id: String(seriesRow.series_id),
      series_type: convertSeriesType(seriesRow.series_type),
      radiant_team_id: seriesRow.radiant_team_id ? String(seriesRow.radiant_team_id) : null,
      dire_team_id: seriesRow.dire_team_id ? String(seriesRow.dire_team_id) : null,
      radiant_team_name: radiantTeam?.name || null,
      dire_team_name: direTeam?.name || null,
      radiant_team_logo: normalizeLogo(radiantTeam?.logo_url, { publicOrigin }),
      dire_team_logo: normalizeLogo(direTeam?.logo_url, { publicOrigin }),
      radiant_score: seriesRow.radiant_wins ?? null,
      dire_score: seriesRow.dire_wins ?? null,
      radiant_wins: seriesRow.radiant_wins ?? null,
      dire_wins: seriesRow.dire_wins ?? null,
      stage: stageInfo.stage,
      stage_kind: stageInfo.stage_kind,
      games: (matchesBySeries[String(seriesRow.series_id)] || []).map((matchRow) => {
        const matchRadiantTeam = matchRow.radiant_team_id ? teamMap.get(String(matchRow.radiant_team_id)) : null;
        const matchDireTeam = matchRow.dire_team_id ? teamMap.get(String(matchRow.dire_team_id)) : null;

        return {
          match_id: String(matchRow.match_id),
          radiant_team_id: matchRow.radiant_team_id ? String(matchRow.radiant_team_id) : null,
          dire_team_id: matchRow.dire_team_id ? String(matchRow.dire_team_id) : null,
          radiant_team_name: matchRadiantTeam?.name || radiantTeam?.name || null,
          dire_team_name: matchDireTeam?.name || direTeam?.name || null,
          radiant_team_logo: normalizeLogo(matchRadiantTeam?.logo_url || radiantTeam?.logo_url, { publicOrigin }),
          dire_team_logo: normalizeLogo(matchDireTeam?.logo_url || direTeam?.logo_url, { publicOrigin }),
          radiant_score: matchRow.radiant_score ?? null,
          dire_score: matchRow.dire_score ?? null,
          radiant_win: matchRow.radiant_win ? 1 : 0,
          start_time: matchRow.start_time ?? null,
          duration: matchRow.duration ?? null,
          picks_bans: Array.isArray(matchRow.picks_bans) ? matchRow.picks_bans : [],
        };
      }),
    };
  });

  const total = Number(countRows?.[0]?.count || 0);
  return {
    tournament: formatTournament(tournament, req),
    items,
    pagination: buildPagination(total, offset, limit, items.length),
  };
}

export async function loadUpcomingPayload(db, { days = MP_DEFAULT_UPCOMING_DAYS, limit, offset, publicOrigin = '' }) {
  try {
    await ensureUpcomingSeriesColumns(db);
  } catch {
    // Best-effort schema repair for older databases.
  }
  const now = Math.floor(Date.now() / 1000);
  const maxStartTime = now + days * 86400;

  const [countRows, rows, teamMap] = await Promise.all([
    db`
      SELECT COUNT(*)::int AS count
      FROM upcoming_series
      WHERE start_time > ${now}
        AND start_time <= ${maxStartTime}
    `,
    db`
      SELECT s.*
      FROM upcoming_series s
      WHERE s.start_time > ${now}
        AND s.start_time <= ${maxStartTime}
      ORDER BY s.start_time ASC
      LIMIT ${limit}
      OFFSET ${offset}
    `,
    loadTeamMap(db),
  ]);

  const items = rows.map((row) => {
    const radiantTeam = row.radiant_team_id ? teamMap.get(String(row.radiant_team_id)) : null;
    const direTeam = row.dire_team_id ? teamMap.get(String(row.dire_team_id)) : null;
    return {
      id: row.id,
      series_id: row.series_id ? String(row.series_id) : null,
      radiant_team_id: row.radiant_team_id ? String(row.radiant_team_id) : null,
      dire_team_id: row.dire_team_id ? String(row.dire_team_id) : null,
      radiant_team_name: radiantTeam?.name || null,
      dire_team_name: direTeam?.name || null,
      radiant_team_logo: normalizeLogo(radiantTeam?.logo_url, { publicOrigin }),
      dire_team_logo: normalizeLogo(direTeam?.logo_url, { publicOrigin }),
      start_time: row.start_time,
      series_type: convertSeriesType(row.series_type),
      tournament_name: row.tournament_name || null,
      tournament_name_cn: row.tournament_name_cn || null,
      tier: row.tournament_tier || 'S',
      status: row.status || null,
    };
  });

  const total = Number(countRows?.[0]?.count || 0);
  return {
    days,
    items,
    teams: Array.from(teamMap.values()).map((row) => formatTeam(row, { publicOrigin })),
    pagination: buildPagination(total, offset, limit, items.length),
  };
}

function formatTeamMatchRow(match, teamMap, options = {}) {
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
    radiant_team_logo: normalizeLogo(radiantTeam?.logo_url || match.radiant_team_logo, options),
    dire_team_logo: normalizeLogo(direTeam?.logo_url || match.dire_team_logo, options),
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

export async function loadTeamDetailPayload(db, teamId, { limit, offset, publicOrigin = '' }) {
  try {
    await ensureUpcomingSeriesColumns(db);
  } catch {
    // Best-effort schema repair for older databases.
  }
  const teams = await db`SELECT * FROM teams`;
  const teamMap = new Map();
  teams.forEach((team) => {
    if (team?.team_id !== undefined && team?.team_id !== null) {
      teamMap.set(String(team.team_id), team);
    }
  });

  const selectedTeam = teamMap.get(String(teamId));
  if (!selectedTeam) return null;

  const selectedTeamId = String(selectedTeam.team_id);
  const now = Math.floor(Date.now() / 1000);
  const minStartTime = now - TEAM_HISTORY_WINDOW_SECONDS;
  const teamCachePayloadPromise = getTeamFlyoutCachePayload(db, selectedTeamId).catch(() => null);

  const [countRows, recentRows, recentStatsRows, nextMatchRows] = await Promise.all([
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
    enrichRecentMatchesWithTeamHeroes(db, recentRows, selectedTeamId).catch(() =>
      recentRows.map((row) => ({ ...row, team_hero_ids: [] }))
    ),
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
  const items = enrichedRecentRows.map((row) => ({
    ...formatTeamMatchRow(row, teamMap, { publicOrigin }),
    team_hero_ids: Array.isArray(row.team_hero_ids) ? row.team_hero_ids : [],
  }));
  const total = Number(countRows?.[0]?.count || 0);

  return {
    team: formatTeam(selectedTeam, { publicOrigin }),
    items,
    nextMatch: nextMatchRows[0] ? formatTeamMatchRow(nextMatchRows[0], teamMap, { publicOrigin }) : null,
    activeSquad: Array.isArray(teamCachePayload?.active_squad) ? teamCachePayload.active_squad : [],
    topHeroes: Array.isArray(teamCachePayload?.top_heroes_90d) ? teamCachePayload.top_heroes_90d : [],
    stats: {
      wins,
      losses,
      winRate: decided > 0 ? Math.round((wins / decided) * 100) : 0,
    },
    pagination: buildPagination(total, offset, limit, items.length),
  };
}

export async function loadMatchDetailPayload(db, matchId, options = {}) {
  await db`
    CREATE TABLE IF NOT EXISTS match_details (
      match_id BIGINT PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  const rows = await db`
    SELECT payload
    FROM match_details
    WHERE match_id = ${Math.trunc(Number(matchId))}
    LIMIT 1
  `;

  if (!rows[0]?.payload) return null;
  const teamMap = options.teamMap instanceof Map ? options.teamMap : await loadTeamMap(db);
  return formatMatchDetailPayload(rows[0].payload, teamMap, options);
}

export async function loadStoredNewsSummaries(db, limit = 6, options = {}) {
  try {
    const rows = await db`
      SELECT id, source, url, category, image_url, published_at, title_en, summary_en, title_zh, summary_zh
      FROM news_articles
      ORDER BY published_at DESC, updated_at DESC
      LIMIT ${limit}
    `;
    return rows.map((row) => formatNewsSummary(row, options));
  } catch (error) {
    console.warn('[MP API] Failed to load news summaries:', error instanceof Error ? error.message : error);
    return [];
  }
}

export async function loadHomePayload(db, options = {}) {
  const requestOptions = options && typeof options === 'object' && !('headers' in options) ? options : { req: options };
  const { req = null, publicOrigin = '', ...newsOptions } = requestOptions;
  const [tournamentsResult, upcomingResult, news, liveMatches] = await Promise.all([
    listTournamentSummaries(db, { limit: 6, offset: 0, req }),
    loadUpcomingPayload(db, { days: MP_DEFAULT_UPCOMING_DAYS, limit: 6, offset: 0, publicOrigin }),
    loadStoredNewsSummaries(db, 6, { ...newsOptions, publicOrigin }),
    getLiveHeroPayloads(db, { maxAgeSeconds: 180 }).catch(() => []),
  ]);

  return {
    heroLive: liveMatches[0] || null,
    liveMatchCount: Array.isArray(liveMatches) ? liveMatches.length : 0,
    upcoming: upcomingResult.items,
    tournaments: tournamentsResult.items,
    news,
  };
}
