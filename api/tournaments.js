/**
 * Tournaments API
 * Data: Neon PostgreSQL
 */

import { neon } from '@neondatabase/serverless';
import { getMirroredAssetUrl } from '../lib/asset-mirror.js';
import { buildTournamentBackgroundUrl } from '../lib/tournament-backgrounds.js';
import {
  fetchFeaturedTournamentPayload,
  resolveFeaturedTournamentDefinition,
} from '../lib/server/featured-tournament.js';
import { scoreTournamentNameMatch } from '../lib/server/dltv-events.js';
import { deriveTournamentStatus } from '../lib/server/tournament-status.js';

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const DEFAULT_SERIES_LIMIT = 10;
const MAX_SERIES_LIMIT = 50;
const TOURNAMENT_SUMMARY_CACHE_CONTROL = 'public, max-age=30, s-maxage=120, stale-while-revalidate=300';
const TOURNAMENT_DETAIL_CACHE_CONTROL = 'public, max-age=15, s-maxage=60, stale-while-revalidate=120';
const FEATURED_TOURNAMENT_CACHE_CONTROL = 'public, max-age=30, s-maxage=120, stale-while-revalidate=300';
const FEATURED_TEAM_ALIAS_OVERRIDES = {
  'pgl-wallachia-s7': {
    aurora: 'auroragaming',
    bb: 'betboomteam',
    betboom: 'betboomteam',
    falcons: 'teamfalcons',
    gg: 'gaimingladiators',
    lgd: 'psglgd',
    liquid: 'teamliquid',
    "na'vi": 'natusvincere',
    navi: 'natusvincere',
    pari: 'parivision',
    spirit: 'teamspirit',
    xg: 'xtremegaming',
    xtreme: 'xtremegaming',
    yb: 'yakultbrothers',
    yakult: 'yakultbrothers',
  },
  'pgl-wallachia-s8': {
    aurora: 'aurora',
    bb: 'betboomteam',
    betboom: 'betboomteam',
    falcons: 'teamfalcons',
    gl: 'gamerlegion',
    heroic: 'heroic',
    liquid: 'teamliquid',
    mouz: 'mouz',
    "na'vi": 'natusvincere',
    navi: 'natusvincere',
    pari: 'parivision',
    parivision: 'parivision',
    sar: 'southamericarejects',
    spirit: 'teamspirit',
    tundra: 'tundraesports',
    vici: 'vicigaming',
    vp: 'virtuspro',
    xg: 'xtremegaming',
    xtreme: 'xtremegaming',
    yandex: 'teamyandex',
  },
  'esl-one-birmingham-2026': {
    bb: 'betboomteam',
    betboom: 'betboomteam',
    falcons: 'teamfalcons',
    gg: 'gaimingladiators',
    gl: 'gamerlegion',
    liquid: 'teamliquid',
    mouz: 'mouz',
    nigma: 'nigmagalaxy',
    pari: 'parivision',
    spirit: 'teamspirit',
    tidebound: 'tidebound',
    tundra: 'tundraesports',
    vp: 'virtuspro',
    xg: 'xtremegaming',
    xtreme: 'xtremegaming',
    yandex: 'teamyandex',
    yb: 'yakultbrothers',
    yakult: 'yakultbrothers',
  },
};
const TOURNAMENT_SERIES_LEAGUE_ALIASES = {
  'blast-slam-vii-china-closed-qualifier': [19520],
};
const TOURNAMENT_SERIES_WINDOW_PADDING_SECONDS = 12 * 60 * 60;

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

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeCompact(value) {
  return normalizeText(value).replace(/[^a-z0-9\u4e00-\u9fff]/g, '');
}

function stripCommonTeamAffixes(value) {
  let normalized = normalizeCompact(value);
  const prefixes = ['team'];
  const suffixes = ['team', 'gaming', 'esports', 'esport', 'club'];

  let changed = true;
  while (changed && normalized) {
    changed = false;

    for (const prefix of prefixes) {
      if (normalized.startsWith(prefix) && normalized.length > prefix.length) {
        normalized = normalized.slice(prefix.length);
        changed = true;
      }
    }

    for (const suffix of suffixes) {
      if (normalized.endsWith(suffix) && normalized.length > suffix.length) {
        normalized = normalized.slice(0, -suffix.length);
        changed = true;
      }
    }
  }

  return normalized;
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeStringIds(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [values])
        .map((value) => String(value ?? '').trim())
        .filter(Boolean)
    )
  );
}

function getLookupKeys(value) {
  const raw = normalizeText(value);
  const compact = normalizeCompact(value);
  const stripped = stripCommonTeamAffixes(value);
  return uniqueValues([raw, compact, stripped]);
}

function isChinaRegion(region) {
  const normalized = normalizeText(region).replace(/[\s_-]+/g, '');
  return normalized === 'cn' || normalized === 'china' || normalized === 'prchina' || normalized === '中国';
}

function isCnTeamRow(teamRow) {
  if (!teamRow) return false;
  return isChinaRegion(teamRow.region) || teamRow.is_cn_team === true || teamRow.is_cn_team === 1;
}

function parseFeaturedScore(value) {
  const match = String(value || '').match(/(\d+)\s*-\s*(\d+)/);
  if (!match) return null;
  return {
    left: Number(match[1]),
    right: Number(match[2]),
  };
}

function parseFeaturedStartTime(value) {
  if (!value) return null;
  const normalized = String(value).includes('T') ? String(value) : String(value).replace(' ', 'T');
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : null;
}

function hasNonZeroScore(scores) {
  return scores.some((value) => Number(value || 0) > 0);
}

function normalizeLogo(url, req) {
  return getMirroredAssetUrl(url, req);
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

function getTournamentSeriesLeagueIds(tournament) {
  const directLeagueId = Number(tournament?.league_id);
  const eventSlug = String(tournament?.dltv_event_slug || '').trim().toLowerCase();
  const aliases = TOURNAMENT_SERIES_LEAGUE_ALIASES[eventSlug] || [];
  return Array.from(new Set(
    [directLeagueId, ...aliases]
      .map((leagueId) => Number(leagueId))
      .filter((leagueId) => Number.isFinite(leagueId) && leagueId > 0)
  ));
}

function getTournamentSeriesWindow(tournament) {
  const start = Number(tournament?.start_time);
  const end = Number(tournament?.end_time);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return null;
  return {
    start: start - TOURNAMENT_SERIES_WINDOW_PADDING_SECONDS,
    end: end + TOURNAMENT_SERIES_WINDOW_PADDING_SECONDS,
  };
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

function formatTournament(tournament, req) {
  return {
    id: String(tournament.id || tournament.league_id),
    league_id: tournament.league_id,
    name: tournament.name,
    name_cn: tournament.name_cn,
    tier: tournament.tier,
    location: tournament.location,
    status: deriveTournamentStatus(tournament.start_time ?? null, tournament.end_time ?? null),
    start_time: tournament.start_time ?? null,
    end_time: tournament.end_time ?? null,
    prize_pool: tournament.prize_pool ?? null,
    prize_pool_usd: tournament.prize_pool_usd ?? null,
    start_date: tournament.start_date ?? null,
    end_date: tournament.end_date ?? null,
    image: tournament.image || null,
    location_flag_url: tournament.location_flag_url || null,
    source_url: tournament.source_url || null,
    dltv_event_slug: tournament.dltv_event_slug || null,
    event_group_slug: tournament.event_group_slug || null,
    background_image_url: buildTournamentBackgroundUrl(tournament, req),
  };
}

function getTierPriority(tier) {
  const normalized = String(tier || '').toUpperCase();
  if (normalized === 'S') return 0;
  if (normalized === 'A') return 1;
  if (normalized === 'A-QUAL') return 2;
  if (normalized === 'B') return 3;
  if (normalized === 'C') return 4;
  return 5;
}

function pickRepresentativeTournament(group) {
  return [...group].sort((left, right) => {
    const leftIsMain = left.event_group_slug && left.dltv_event_slug && left.event_group_slug === left.dltv_event_slug ? 0 : 1;
    const rightIsMain = right.event_group_slug && right.dltv_event_slug && right.event_group_slug === right.dltv_event_slug ? 0 : 1;
    if (leftIsMain !== rightIsMain) return leftIsMain - rightIsMain;
    const tierDelta = getTierPriority(left.tier) - getTierPriority(right.tier);
    if (tierDelta !== 0) return tierDelta;
    const startDelta = Number(right.start_time || 0) - Number(left.start_time || 0);
    if (startDelta !== 0) return startDelta;
    return Number(right.end_time || 0) - Number(left.end_time || 0);
  })[0] || null;
}

function getTournamentTrackKey(tournament) {
  const eventSlug = String(tournament?.dltv_event_slug || '').trim().toLowerCase();
  if (eventSlug) return `slug:${eventSlug}`;
  const sourceUrl = String(tournament?.source_url || '').trim().toLowerCase();
  if (sourceUrl) return `source:${sourceUrl}`;
  const name = String(tournament?.name || '').trim().toLowerCase();
  if (name) return `name:${name}`;
  return `league:${String(tournament?.league_id || '')}`;
}

function dedupeTournamentGroup(group) {
  const deduped = new Map();
  for (const row of group || []) {
    const key = getTournamentTrackKey(row);
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, row);
      continue;
    }
    const existingLeagueId = Number(existing.league_id || Number.MAX_SAFE_INTEGER);
    const nextLeagueId = Number(row.league_id || Number.MAX_SAFE_INTEGER);
    if (nextLeagueId < existingLeagueId) {
      deduped.set(key, row);
    }
  }
  return Array.from(deduped.values());
}

function filterSeriesForSelectedTournament(series, tournament) {
  const tournamentName = normalizeText(tournament?.name);
  if (!tournamentName) return series;
  return (series || []).filter((entry) => {
    const seriesName = normalizeText(entry?.tournament_name);
    if (!seriesName) return true;
    const match = scoreTournamentNameMatch(tournamentName, seriesName);
    if (match.hasEditionMismatch || match.hasRegionMismatch) return false;
    if (match.eventHasQualifier !== match.candidateHasQualifier) return false;
    return match.score >= 8;
  });
}

function buildRelatedTournaments(group, representative, req) {
  return dedupeTournamentGroup(group)
    .filter((row) => String(row.league_id) !== String(representative.league_id))
    .sort((left, right) => {
      const startDelta = Number(left.start_time || 0) - Number(right.start_time || 0);
      if (startDelta !== 0) return startDelta;
      return String(left.name || '').localeCompare(String(right.name || ''));
    })
    .map((row) => formatTournament(row, req));
}

async function listTournamentSummaries(db, req) {
  const tournaments = await db`
    SELECT *
    FROM tournaments
    WHERE NULLIF(BTRIM(COALESCE(tier, '')), '') IS NOT NULL
    ORDER BY COALESCE(start_time, 0) DESC, COALESCE(end_time, 0) DESC
  `;

  const groups = new Map();
  for (const tournament of tournaments) {
    const key = String(tournament.event_group_slug || tournament.league_id);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(tournament);
  }

  return [...groups.values()]
    .map((group) => {
      const dedupedGroup = dedupeTournamentGroup(group);
      const representative = pickRepresentativeTournament(dedupedGroup);
      if (!representative) return null;
      return {
        ...formatTournament(representative, req),
        related_tournaments: buildRelatedTournaments(dedupedGroup, representative, req),
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      const startDelta = Number(right.start_time || 0) - Number(left.start_time || 0);
      if (startDelta !== 0) return startDelta;
      return Number(right.end_time || 0) - Number(left.end_time || 0);
    });
}

async function getTournamentById(db, tournamentId) {
  const rows = await db`
    SELECT *
    FROM tournaments
    WHERE CAST(league_id AS TEXT) = ${tournamentId}
    LIMIT 1
  `;
  return rows[0] || null;
}

async function loadTournamentGroup(db, tournament) {
  if (!tournament?.event_group_slug) return [tournament];
  const rows = await db`
    SELECT *
    FROM tournaments
    WHERE event_group_slug = ${tournament.event_group_slug}
    ORDER BY COALESCE(start_time, 0) DESC, COALESCE(end_time, 0) DESC
  `;
  return dedupeTournamentGroup(rows.length > 0 ? rows : [tournament]);
}

async function loadTeams(db) {
  const teams = await db`SELECT * FROM teams`;
  const teamMap = new Map();
  for (const team of teams) {
    teamMap.set(String(team.team_id), team);
  }
  return { teams, teamMap };
}

async function loadTeamMapByIds(db, teamIds) {
  const normalizedTeamIds = normalizeStringIds(teamIds);
  if (normalizedTeamIds.length === 0) {
    return new Map();
  }

  const rows = await db.query(
    `
      SELECT *
      FROM teams
      WHERE team_id::TEXT = ANY($1::text[])
    `,
    [normalizedTeamIds]
  );

  return new Map(
    rows
      .filter((team) => team?.team_id !== undefined && team?.team_id !== null)
      .map((team) => [String(team.team_id), team])
  );
}

function buildFeaturedTeamResolver(teams, featuredTournamentId) {
  const directLookup = new Map();
  const canonicalLookup = new Map();

  const register = (key, team) => {
    if (!key || directLookup.has(key)) return;
    directLookup.set(key, team);
  };

  for (const team of teams) {
    for (const alias of [team.name, team.name_cn, team.tag]) {
      for (const key of getLookupKeys(alias)) {
        register(key, team);
        if (!canonicalLookup.has(key)) {
          canonicalLookup.set(key, team);
        }
      }
    }
  }

  const overrides = FEATURED_TEAM_ALIAS_OVERRIDES[featuredTournamentId] || {};

  return (teamName) => {
    for (const key of getLookupKeys(teamName)) {
      const direct = directLookup.get(key);
      if (direct) return direct;

      const canonicalKey = overrides[key];
      if (!canonicalKey) continue;

      const canonical = canonicalLookup.get(canonicalKey);
      if (canonical) return canonical;
    }

    return null;
  };
}

function buildTeamIdentityKeys(team, teamRow) {
  return new Set(uniqueValues([
    team?.teamId ? String(team.teamId) : '',
    team?.name,
    team?.shortName,
    teamRow?.team_id ? String(teamRow.team_id) : '',
    teamRow?.name,
    teamRow?.name_cn,
    teamRow?.tag,
  ].flatMap((value) => getLookupKeys(value))));
}

function setsIntersect(a, b) {
  for (const value of a) {
    if (b.has(value)) return true;
  }
  return false;
}

async function loadFeaturedSeriesCandidates(db, leagueId) {
  const rows = await db.query(
    `
      SELECT
        s.series_id,
        s.start_time AS series_start_time,
        s.radiant_team_id AS series_radiant_team_id,
        s.dire_team_id AS series_dire_team_id,
        s.radiant_wins,
        s.dire_wins,
        s.series_type,
        m.match_id,
        m.start_time AS match_start_time,
        m.radiant_team_id,
        m.dire_team_id,
        m.radiant_score,
        m.dire_score,
        m.radiant_win,
        m.duration
      FROM series s
      LEFT JOIN matches m ON m.series_id = s.series_id
      WHERE s.league_id = $1
      ORDER BY COALESCE(s.start_time, 0) DESC, COALESCE(m.start_time, 0) DESC, COALESCE(m.match_id, 0) DESC
    `,
    [Number(leagueId)]
  );

  const detailCandidateIds = rows
    .map((row) => Number(row.match_id))
    .filter((value) => Number.isFinite(value) && value > 0);

  let detailIdSet = new Set();
  if (detailCandidateIds.length > 0) {
    try {
      const detailRows = await db.query(
        `
          SELECT match_id
          FROM match_details
          WHERE match_id = ANY($1::bigint[])
        `,
        [detailCandidateIds]
      );
      detailIdSet = new Set(detailRows.map((row) => String(row.match_id)));
    } catch (error) {
      const message = String(error?.message || '');
      if (!message.includes('match_details')) {
        throw error;
      }
    }
  }

  const grouped = new Map();
  for (const row of rows) {
    const seriesId = row.series_id ? String(row.series_id) : null;
    if (!seriesId) continue;

    if (!grouped.has(seriesId)) {
      grouped.set(seriesId, {
        seriesId,
        startTime: Number(row.series_start_time) || 0,
        radiantTeamId: row.series_radiant_team_id ? String(row.series_radiant_team_id) : null,
        direTeamId: row.series_dire_team_id ? String(row.series_dire_team_id) : null,
        radiantWins: Number(row.radiant_wins) || 0,
        direWins: Number(row.dire_wins) || 0,
        seriesType: row.series_type,
        games: [],
      });
    }

    if (row.match_id) {
      grouped.get(seriesId).games.push({
        matchId: String(row.match_id),
        startTime: Number(row.match_start_time) || 0,
        radiantTeamId: row.radiant_team_id ? String(row.radiant_team_id) : null,
        direTeamId: row.dire_team_id ? String(row.dire_team_id) : null,
        radiantScore: Number(row.radiant_score) || 0,
        direScore: Number(row.dire_score) || 0,
        radiantWin: row.radiant_win ? 1 : 0,
        duration: Number(row.duration) || 0,
        hasDetail: detailIdSet.has(String(row.match_id)),
      });
    }
  }

  return [...grouped.values()].map((entry) => {
    const games = [...entry.games].sort((a, b) => {
      if (a.startTime !== b.startTime) return a.startTime - b.startTime;
      return Number(a.matchId) - Number(b.matchId);
    });
    const latestDetailGame = [...games].reverse().find((game) => game.hasDetail) || null;

    return {
      ...entry,
      games,
      detailMatchId: latestDetailGame?.matchId || null,
    };
  });
}

function orientCandidateScore(candidate, directOrder) {
  if (directOrder) {
    return {
      left: candidate.radiantWins,
      right: candidate.direWins,
    };
  }

  return {
    left: candidate.direWins,
    right: candidate.radiantWins,
  };
}

function matchFeaturedSeries(candidates, leftTeam, rightTeam, options = {}) {
  if (!leftTeam || !rightTeam) return null;

  const desiredStart = parseFeaturedStartTime(options.startTime);
  const desiredScore = options.score ? parseFeaturedScore(options.score) : null;
  const leftRow = options.resolveTeamRow?.(leftTeam.name || '') || null;
  const rightRow = options.resolveTeamRow?.(rightTeam.name || '') || null;
  const leftKeys = buildTeamIdentityKeys(leftTeam, leftRow);
  const rightKeys = buildTeamIdentityKeys(rightTeam, rightRow);

  let bestMatch = null;
  let bestPenalty = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const candidateLeftRow = candidate.radiantTeamId ? options.teamMap?.get(candidate.radiantTeamId) : null;
    const candidateRightRow = candidate.direTeamId ? options.teamMap?.get(candidate.direTeamId) : null;
    const candidateLeftKeys = buildTeamIdentityKeys({
      teamId: candidate.radiantTeamId,
      name: candidateLeftRow?.name || null,
    }, candidateLeftRow);
    const candidateRightKeys = buildTeamIdentityKeys({
      teamId: candidate.direTeamId,
      name: candidateRightRow?.name || null,
    }, candidateRightRow);

    const directOrder = setsIntersect(leftKeys, candidateLeftKeys) && setsIntersect(rightKeys, candidateRightKeys);
    const reverseOrder = setsIntersect(leftKeys, candidateRightKeys) && setsIntersect(rightKeys, candidateLeftKeys);

    if (!directOrder && !reverseOrder) continue;

    let penalty = candidate.detailMatchId ? 0 : 5000;

    if (desiredScore) {
      const oriented = orientCandidateScore(candidate, directOrder);
      if (oriented.left !== desiredScore.left || oriented.right !== desiredScore.right) {
        penalty += 10000;
      }
    }

    if (desiredStart && candidate.startTime) {
      penalty += Math.abs(candidate.startTime - desiredStart);
    }

    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestMatch = candidate;
    }
  }

  return bestMatch;
}

function enrichFeaturedTeam(teamName, explicitLogo, req, resolveTeamRow) {
  const teamRow = resolveTeamRow(teamName);
  return {
    teamId: teamRow?.team_id ? String(teamRow.team_id) : null,
    name: teamRow?.name || teamName || 'TBD',
    logoUrl: normalizeLogo(teamRow?.logo_url, req) || explicitLogo || null,
    isCnTeam: isCnTeamRow(teamRow),
    tag: teamRow?.tag || null,
  };
}

function enrichFeaturedPayload(payload, definition, teams, teamMap, seriesCandidates, req) {
  const resolveTeamRow = buildFeaturedTeamResolver(teams, definition.id);

  const standings = payload.groupStage.standings.map((row) => {
    const team = enrichFeaturedTeam(row.teamName, row.logoUrl, req, resolveTeamRow);

    return {
      ...row,
      teamId: team.teamId,
      teamName: team.name,
      logoUrl: team.logoUrl,
      isCnTeam: team.isCnTeam,
      rounds: row.rounds.map((round) => {
        const opponent = enrichFeaturedTeam(round.opponentName, round.opponentLogoUrl, req, resolveTeamRow);
        const matchedSeries = round.pending
          ? null
          : matchFeaturedSeries(
              seriesCandidates,
              { teamId: team.teamId, name: team.name, shortName: team.tag },
              { teamId: opponent.teamId, name: opponent.name, shortName: opponent.tag },
              {
                score: round.score,
                resolveTeamRow,
                teamMap,
              }
            );

        return {
          ...round,
          opponentName: opponent.name,
          opponentTeamId: opponent.teamId,
          opponentLogoUrl: opponent.logoUrl,
          opponentIsCnTeam: opponent.isCnTeam,
          matchId: matchedSeries?.detailMatchId || null,
          siteSeriesId: matchedSeries?.seriesId || null,
        };
      }),
    };
  });

  const enrichSeriesLikeMatch = (match) => {
    const leftTeam = enrichFeaturedTeam(match.teams?.[0]?.name, match.teams?.[0]?.logoUrl, req, resolveTeamRow);
    const rightTeam = enrichFeaturedTeam(match.teams?.[1]?.name, match.teams?.[1]?.logoUrl, req, resolveTeamRow);
    const scoreString = `${match.teams?.[0]?.score ?? ''}-${match.teams?.[1]?.score ?? ''}`;
    const completed = hasNonZeroScore([
      Number(match.teams?.[0]?.score || 0),
      Number(match.teams?.[1]?.score || 0),
    ]);
    const matchedSeries = matchFeaturedSeries(
      seriesCandidates,
      { teamId: leftTeam.teamId, name: leftTeam.name, shortName: leftTeam.tag },
      { teamId: rightTeam.teamId, name: rightTeam.name, shortName: rightTeam.tag },
      {
        startTime: match.startTime,
        score: completed ? scoreString : null,
        resolveTeamRow,
        teamMap,
      }
    );

    return {
      ...match,
      matchId: completed ? matchedSeries?.detailMatchId || null : null,
      siteSeriesId: matchedSeries?.seriesId || null,
      teams: [
        {
          ...match.teams?.[0],
          teamId: leftTeam.teamId,
          name: leftTeam.name,
          logoUrl: leftTeam.logoUrl,
          isCnTeam: leftTeam.isCnTeam,
        },
        {
          ...match.teams?.[1],
          teamId: rightTeam.teamId,
          name: rightTeam.name,
          logoUrl: rightTeam.logoUrl,
          isCnTeam: rightTeam.isCnTeam,
        },
      ],
    };
  };

  const enrichMatchRow = (match) => {
    const leftTeam = enrichFeaturedTeam(match.teams?.[0]?.name, match.teams?.[0]?.logoUrl, req, resolveTeamRow);
    const rightTeam = enrichFeaturedTeam(match.teams?.[1]?.name, match.teams?.[1]?.logoUrl, req, resolveTeamRow);
    const matchedSeries = match.score
      ? matchFeaturedSeries(
          seriesCandidates,
          { teamId: leftTeam.teamId, name: leftTeam.name, shortName: leftTeam.tag },
          { teamId: rightTeam.teamId, name: rightTeam.name, shortName: rightTeam.tag },
          {
            startTime: match.startTime,
            score: match.score,
            resolveTeamRow,
            teamMap,
          }
        )
      : null;

    return {
      ...match,
      matchId: matchedSeries?.detailMatchId || null,
      siteSeriesId: matchedSeries?.seriesId || null,
      teams: [
        {
          ...match.teams?.[0],
          teamId: leftTeam.teamId,
          name: leftTeam.name,
          logoUrl: leftTeam.logoUrl,
          isCnTeam: leftTeam.isCnTeam,
        },
        {
          ...match.teams?.[1],
          teamId: rightTeam.teamId,
          name: rightTeam.name,
          logoUrl: rightTeam.logoUrl,
          isCnTeam: rightTeam.isCnTeam,
        },
      ],
    };
  };

  return {
    ...payload,
    groupStage: {
      ...payload.groupStage,
      standings,
    },
    playoffs: {
      ...payload.playoffs,
      rounds: payload.playoffs.rounds.map((round) => ({
        ...round,
        matches: round.matches.map(enrichSeriesLikeMatch),
      })),
    },
    matches: {
      ...payload.matches,
      upcoming: payload.matches.upcoming.map(enrichMatchRow),
      finished: payload.matches.finished.map(enrichMatchRow),
    },
  };
}

async function loadSeriesPage(db, leagueIds, limit, offset, options = {}) {
  const normalizedLeagueIds = Array.from(
    new Set(
      (Array.isArray(leagueIds) ? leagueIds : [leagueIds])
        .map((leagueId) => Number(leagueId))
        .filter((leagueId) => Number.isFinite(leagueId))
    )
  );
  const timeWindow = options?.timeWindow || null;
  const hasMultiple = normalizedLeagueIds.length > 1;
  const needsDynamicQuery = hasMultiple || Boolean(timeWindow);
  const totalRows = needsDynamicQuery
    ? await db.query(
      `
        SELECT COUNT(*)::int AS count
        FROM series
        WHERE league_id = ANY($1::int[])
          AND ($2::bigint IS NULL OR start_time >= $2)
          AND ($3::bigint IS NULL OR start_time <= $3)
      `,
      [normalizedLeagueIds, timeWindow?.start ?? null, timeWindow?.end ?? null]
    )
    : await db`
      SELECT COUNT(*)::int AS count
      FROM series
      WHERE league_id = ${normalizedLeagueIds[0]}
    `;
  const total = Number(totalRows?.[0]?.count || 0);

  const pageSeries = needsDynamicQuery
    ? await db.query(
      `
        SELECT *
        FROM series
        WHERE league_id = ANY($1::int[])
          AND ($2::bigint IS NULL OR start_time >= $2)
          AND ($3::bigint IS NULL OR start_time <= $3)
        ORDER BY start_time DESC
        LIMIT $4
        OFFSET $5
      `,
      [normalizedLeagueIds, timeWindow?.start ?? null, timeWindow?.end ?? null, limit, offset]
    )
    : await db`
      SELECT *
      FROM series
      WHERE league_id = ${normalizedLeagueIds[0]}
      ORDER BY start_time DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

  return { total, pageSeries };
}

async function loadUpcomingSeriesPage(db, leagueIds, limit, offset, options = {}) {
  const normalizedLeagueIds = Array.from(
    new Set(
      (Array.isArray(leagueIds) ? leagueIds : [leagueIds])
        .map((leagueId) => Number(leagueId))
        .filter((leagueId) => Number.isFinite(leagueId))
    )
  );
  const timeWindow = options?.timeWindow || null;

  const totalRows = await db.query(
    `
      SELECT COUNT(*)::int AS count
      FROM upcoming_series
      WHERE league_id = ANY($1::int[])
        AND ($2::bigint IS NULL OR start_time >= $2)
        AND ($3::bigint IS NULL OR start_time <= $3)
    `,
    [normalizedLeagueIds, timeWindow?.start ?? null, timeWindow?.end ?? null]
  );
  const total = Number(totalRows?.[0]?.count || 0);

  const pageSeries = await db.query(
    `
      SELECT *
      FROM upcoming_series
      WHERE league_id = ANY($1::int[])
        AND ($2::bigint IS NULL OR start_time >= $2)
        AND ($3::bigint IS NULL OR start_time <= $3)
      ORDER BY start_time DESC
      LIMIT $4
      OFFSET $5
    `,
    [normalizedLeagueIds, timeWindow?.start ?? null, timeWindow?.end ?? null, limit, offset]
  );

  return { total, pageSeries };
}

async function loadMatchesBySeriesIds(db, seriesIds) {
  const normalizedSeriesIds = normalizeStringIds(seriesIds);
  if (normalizedSeriesIds.length === 0) {
    return {};
  }

  const rows = await db.query(
    `
      SELECT *
      FROM matches
      WHERE series_id::TEXT = ANY($1::text[])
      ORDER BY series_id::TEXT ASC, start_time ASC
    `,
    [normalizedSeriesIds]
  );

  return rows.reduce((acc, row) => {
    const key = String(row?.series_id || '');
    if (!key) return acc;
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});
}

function collectTeamIds(rows) {
  return normalizeStringIds(
    (rows || []).flatMap((row) => [row?.radiant_team_id, row?.dire_team_id])
  );
}

function buildSeriesPayload(seriesRows, matchesBySeries, teamMap, stageWindows, leagueNameById, req) {
  return seriesRows.map((seriesRow) => {
    const radiantTeam = seriesRow.radiant_team_id ? teamMap.get(String(seriesRow.radiant_team_id)) : null;
    const direTeam = seriesRow.dire_team_id ? teamMap.get(String(seriesRow.dire_team_id)) : null;
    const stageInfo = resolveSeriesStage(stageWindows, Number(seriesRow.start_time), seriesRow.stage);

    const games = (matchesBySeries[String(seriesRow.series_id)] || []).map((matchRow) => {
      const matchRadiantTeam = matchRow.radiant_team_id ? teamMap.get(String(matchRow.radiant_team_id)) : null;
      const matchDireTeam = matchRow.dire_team_id ? teamMap.get(String(matchRow.dire_team_id)) : null;

      return {
        match_id: String(matchRow.match_id),
        radiant_team_id: matchRow.radiant_team_id ? String(matchRow.radiant_team_id) : null,
        dire_team_id: matchRow.dire_team_id ? String(matchRow.dire_team_id) : null,
        radiant_team_name: matchRadiantTeam?.name || radiantTeam?.name || null,
        dire_team_name: matchDireTeam?.name || direTeam?.name || null,
        radiant_team_logo: normalizeLogo(matchRadiantTeam?.logo_url || radiantTeam?.logo_url, req),
        dire_team_logo: normalizeLogo(matchDireTeam?.logo_url || direTeam?.logo_url, req),
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
        league_id: seriesRow.league_id ?? null,
        tournament_name: seriesRow.tournament_name || leagueNameById.get(String(seriesRow.league_id || '')) || null,
        series_type: convertSeriesType(seriesRow.series_type),
        radiant_team_id: seriesRow.radiant_team_id ? String(seriesRow.radiant_team_id) : null,
        dire_team_id: seriesRow.dire_team_id ? String(seriesRow.dire_team_id) : null,
      radiant_team_name: radiantTeam?.name || null,
      dire_team_name: direTeam?.name || null,
      radiant_team_logo: normalizeLogo(radiantTeam?.logo_url, req),
      dire_team_logo: normalizeLogo(direTeam?.logo_url, req),
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

function buildUpcomingSeriesPayload(seriesRows, teamMap, stageWindows, leagueNameById, req) {
  return seriesRows.map((seriesRow) => {
    const radiantTeam = seriesRow.radiant_team_id ? teamMap.get(String(seriesRow.radiant_team_id)) : null;
    const direTeam = seriesRow.dire_team_id ? teamMap.get(String(seriesRow.dire_team_id)) : null;
    const stageInfo = resolveSeriesStage(stageWindows, Number(seriesRow.start_time), null);

    return {
      series_id: String(seriesRow.series_id || seriesRow.id),
      league_id: seriesRow.league_id ?? null,
      tournament_name: seriesRow.tournament_name || leagueNameById.get(String(seriesRow.league_id || '')) || null,
      series_type: convertSeriesType(seriesRow.series_type),
      radiant_team_id: seriesRow.radiant_team_id ? String(seriesRow.radiant_team_id) : null,
      dire_team_id: seriesRow.dire_team_id ? String(seriesRow.dire_team_id) : null,
      radiant_team_name: radiantTeam?.name || seriesRow.radiant_team_name || null,
      dire_team_name: direTeam?.name || seriesRow.dire_team_name || null,
      radiant_team_logo: normalizeLogo(radiantTeam?.logo_url, req),
      dire_team_logo: normalizeLogo(direTeam?.logo_url, req),
      radiant_score: 0,
      dire_score: 0,
      radiant_wins: 0,
      dire_wins: 0,
      stage: stageInfo.stage,
      stage_kind: stageInfo.stage_kind,
      games: [],
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
    const wantsFeatured = String(req.query?.featured || '').trim() === '1';
    if (wantsFeatured) {
      res.setHeader('Cache-Control', FEATURED_TOURNAMENT_CACHE_CONTROL);
      if (!tournamentId) {
        return res.status(400).json({ error: 'tournamentId is required' });
      }

      const definition = resolveFeaturedTournamentDefinition(tournamentId);
      if (!definition) {
        return res.status(404).json({ error: 'Featured tournament not configured' });
      }

      const forceRefresh = String(req.query?.refresh || '').trim() === '1';
      const [payload, { teams, teamMap }, seriesCandidates] = await Promise.all([
        fetchFeaturedTournamentPayload(tournamentId, { forceRefresh }),
        loadTeams(db),
        loadFeaturedSeriesCandidates(db, definition.leagueId),
      ]);

      if (!payload) {
        return res.status(404).json({ error: 'Featured tournament not found' });
      }

      return res.status(200).json(
        enrichFeaturedPayload(payload, definition, teams, teamMap, seriesCandidates, req)
      );
    }

    if (!tournamentId) {
      res.setHeader('Cache-Control', TOURNAMENT_SUMMARY_CACHE_CONTROL);
      const tournaments = await listTournamentSummaries(db, req);
      return res.status(200).json({ tournaments });
    }

    res.setHeader('Cache-Control', TOURNAMENT_DETAIL_CACHE_CONTROL);
    const tournament = await getTournamentById(db, tournamentId);
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }
    const groupedTournaments = await loadTournamentGroup(db, tournament);
    const leagueIds = getTournamentSeriesLeagueIds(tournament);
    const leagueNameById = new Map(leagueIds.map((leagueId) => [String(leagueId), tournament.name || null]));
    for (const row of groupedTournaments) {
      const key = String(row.league_id || '');
      if (!leagueNameById.has(key)) {
        leagueNameById.set(key, row.name || null);
      }
    }
    const timeWindow = getTournamentSeriesWindow(tournament);

    const { total: totalSeries, pageSeries } = await loadSeriesPage(db, leagueIds, limit, offset, { timeWindow });

    const stageWindows = normalizeStageWindows(tournament.stage_windows);
    let total = totalSeries;
    let series = [];

    if (pageSeries.length > 0) {
      const [matchesBySeries, teamMap] = await Promise.all([
        loadMatchesBySeriesIds(db, pageSeries.map((seriesRow) => seriesRow.series_id)),
        loadTeamMapByIds(db, collectTeamIds(pageSeries)),
      ]);

      series = filterSeriesForSelectedTournament(
        buildSeriesPayload(pageSeries, matchesBySeries, teamMap, stageWindows, leagueNameById, req),
        tournament,
      );
    }

    if (pageSeries.length === 0) {
      const upcomingPage = await loadUpcomingSeriesPage(db, leagueIds, limit, offset, { timeWindow });
      const teamMap = await loadTeamMapByIds(db, collectTeamIds(upcomingPage.pageSeries));
      total = upcomingPage.total;
      series = buildUpcomingSeriesPayload(upcomingPage.pageSeries, teamMap, stageWindows, leagueNameById, req);
    }

    return res.status(200).json({
      tournament: {
        ...formatTournament(tournament, req),
        related_tournaments: buildRelatedTournaments(groupedTournaments, tournament, req),
      },
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
