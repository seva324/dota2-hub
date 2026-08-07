import {
  buildUnorderedTeamKey,
  fetchHtml,
  fetchLiveSeriesDetails,
  parseHawkHomepageSeriesList,
} from './hawk-live.js';
import {
  ensureHeroLiveScoresTable,
  listActiveHeroLiveScores,
  markHeroLiveScoreEnded,
  upsertHeroLiveScore,
} from './hero-live-score-cache.js';
import { getMirroredAssetUrl } from '../asset-mirror.js';
import { getCuratedTeamLogoGithubUrl } from '../team-logo-overrides.js';
import { resolveDltvLiveLogo } from './dltv-live-logo.js';

const LIVE_MATCH_LIMIT = 50;
const LEAGUE_STOPWORDS = new Set([
  'season',
  'stage',
  'group',
  'groups',
  'playoff',
  'playoffs',
  'qualifier',
  'qualifiers',
  'closed',
  'open',
  'regional',
  'regionals',
  'episode',
  'series',
  'world',
  'tour',
  'cup',
  'event',
  'division',
  'dota',
  'international',
]);

function normalizeLogo(url, req) {
  return getMirroredAssetUrl(url, req);
}

function normalizeTeamLogo(teamName, fallbackUrl, req) {
  const curatedUrl = getCuratedTeamLogoGithubUrl({ name: teamName });
  if (curatedUrl) return normalizeLogo(curatedUrl, req);
  // 本地(curated/mirror) 匹配不到 → 回退 DLTV live LOGO（后台预载索引，同步查找）
  const dltvUrl = resolveDltvLiveLogo(teamName);
  if (dltvUrl) return normalizeLogo(dltvUrl, req);
  return normalizeLogo(fallbackUrl, req);
}

function hydratePayloadTeamLogos(payload, req) {
  if (!payload || !Array.isArray(payload.teams)) return payload || null;
  return {
    ...payload,
    teams: payload.teams.map((team) => ({
      ...team,
      logo: normalizeTeamLogo(team?.name, team?.logo, req),
    })),
  };
}

function nowIso() {
  return new Date().toISOString();
}

function toSortTimestamp(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return Math.trunc(parsed / 1000);
  }
  return 0;
}

function sanitizeMaxAgeSeconds(value, fallback = 180) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.trunc(parsed);
  if (normalized <= 0) return fallback;
  return normalized;
}

function sanitizeLimit(value, fallback = LIVE_MATCH_LIMIT) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.trunc(parsed);
  if (normalized <= 0) return fallback;
  return Math.min(normalized, LIVE_MATCH_LIMIT);
}

function sanitizeDetailTimeoutMs(value, fallback = 4000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.trunc(parsed);
  if (normalized <= 0) return fallback;
  return Math.min(normalized, 15000);
}

export function normalizeLeagueName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[():[\],]/g, ' ')
    .replace(/\b(group stage|playoffs|playoff|closed qualifier|open qualifier|qualifier|qualifiers)\b/g, ' ')
    .replace(/\bs\d+\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractLeagueTokens(value) {
  return Array.from(new Set(
    normalizeLeagueName(value)
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token && token.length >= 3 && !LEAGUE_STOPWORDS.has(token) && !/^\d+$/.test(token))
  ));
}

function scoreLeagueMatch(leagueTokens, matcher) {
  if (!leagueTokens.length || !matcher?.tokens?.length) return 0;
  let score = 0;
  for (const token of matcher.tokens) {
    if (leagueTokens.includes(token)) score += 1;
  }
  return score;
}

export async function loadTournamentLeagueMatchers(db, options = {}) {
  const limit = Number(options.tournamentLimit ?? 400);
  const rows = await db.query(
    `SELECT league_id, name, name_cn, tier, dltv_event_slug
     FROM tournaments
     WHERE COALESCE(name, '') <> ''
     ORDER BY updated_at DESC NULLS LAST, league_id DESC
     LIMIT $1`,
    [limit]
  );

  return rows.map((row) => ({
    leagueId: row.league_id ? String(row.league_id) : null,
    name: row.name || null,
    nameCn: row.name_cn || null,
    tier: row.tier || null,
    dltvEventSlug: row.dltv_event_slug || null,
    normalized: normalizeLeagueName(row.name || row.name_cn || ''),
    tokens: extractLeagueTokens(row.name || row.name_cn || ''),
  }));
}

export function matchLeagueNameToTournaments(leagueName, tournamentMatchers) {
  const normalizedLeagueName = normalizeLeagueName(leagueName);
  const leagueTokens = extractLeagueTokens(leagueName);

  return tournamentMatchers
    .map((matcher) => {
      const fullMatch = Boolean(
        normalizedLeagueName &&
        matcher.normalized &&
        (
          normalizedLeagueName === matcher.normalized ||
          normalizedLeagueName.includes(matcher.normalized) ||
          matcher.normalized.includes(normalizedLeagueName)
        )
      );
      const score = fullMatch ? Math.max(2, matcher.tokens.length) : scoreLeagueMatch(leagueTokens, matcher);
      return {
        ...matcher,
        score,
        fullMatch,
      };
    })
    .filter((matcher) => matcher.score > 0)
    .sort((a, b) => b.score - a.score || Number(b.fullMatch) - Number(a.fullMatch) || (a.name || '').localeCompare(b.name || ''))
    .slice(0, 5);
}

function mapHawkLiveCandidate(row, tournamentMatches = []) {
  return {
    sourceSeriesId: row?.id ? String(row.id) : null,
    sourceSeriesSlug: row?.slug || null,
    sourceUrl: row?.url || null,
    leagueName: row?.leagueName || null,
    team1Name: row?.team1Name || null,
    team2Name: row?.team2Name || null,
    team1Logo: normalizeTeamLogo(row?.team1Name, row?.team1Logo),
    team2Logo: normalizeTeamLogo(row?.team2Name, row?.team2Logo),
    startTime: row?.startAt || null,
    bestOf: row?.bestOf || null,
    teamKey: row?.teamKey || buildUnorderedTeamKey(row?.team1Name, row?.team2Name),
    source: 'hawk.live',
    tournamentMatches,
    raw: row,
  };
}

export async function loadDirectLiveCandidates(options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const targetTeamKey = options.targetTeamKey || (options.teamA && options.teamB ? buildUnorderedTeamKey(options.teamA, options.teamB) : null);
  const homeHtml = await fetchHtml('https://hawk.live/', fetchImpl);
  return parseHawkHomepageSeriesList(homeHtml)
    .filter((row) => !targetTeamKey || row.teamKey === targetTeamKey)
    .map((row) => mapHawkLiveCandidate(row));
}

export async function loadLeagueMatchedLiveCandidates(db, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const targetTeamKey = options.targetTeamKey || (options.teamA && options.teamB ? buildUnorderedTeamKey(options.teamA, options.teamB) : null);
  const tournamentMatchers = Array.isArray(options.tournamentMatchers)
    ? options.tournamentMatchers
    : await loadTournamentLeagueMatchers(db, options);
  const homeHtml = await fetchHtml('https://hawk.live/', fetchImpl);
  const hawkLiveSeries = parseHawkHomepageSeriesList(homeHtml)
    .filter((row) => !targetTeamKey || row.teamKey === targetTeamKey);

  const matched = [];
  const unmatched = [];

  for (const row of hawkLiveSeries) {
    const tournamentMatches = matchLeagueNameToTournaments(row.leagueName, tournamentMatchers);
    if (tournamentMatches.length > 0) {
      matched.push(mapHawkLiveCandidate(row, tournamentMatches));
    } else {
      unmatched.push(mapHawkLiveCandidate(row, []));
    }
  }

  return { matched, unmatched, hawkLiveSeries, tournamentMatchers };
}

function formatPayload(candidate, seriesWithDetail) {
  const detail = seriesWithDetail.detail;
  const hawk = seriesWithDetail;
  const completedMaps = detail.maps?.filter((map) => map.status === 'completed') || [];
  const latestSeriesStanding = detail.liveMap || completedMaps[completedMaps.length - 1] || null;
  const seriesTeam1Score = hawk.team1Score ?? latestSeriesStanding?.team1SeriesWins ?? 0;
  const seriesTeam2Score = hawk.team2Score ?? latestSeriesStanding?.team2SeriesWins ?? 0;

  const team1Name = detail.team1Name || hawk.team1Name || candidate.team1Name;
  const team2Name = detail.team2Name || hawk.team2Name || candidate.team2Name;

  return {
    source: 'hawk.live',
    sourceSeriesId: hawk.id,
    sourceSeriesSlug: hawk.slug,
    sourceChampionshipSlug: hawk.championshipSlug || null,
    sourceUrl: hawk.url,
    upcomingSeriesId: null,
    leagueName: hawk.leagueName || candidate.leagueName,
    // 匹配到本站赛事时透传 DLTV 赛事 slug，前端 live 卡片"赛事名→赛事详情"跳转用
    event_slug: candidate.tournamentMatches?.[0]?.dltvEventSlug || null,
    bestOf: hawk.bestOf || detail.bestOf || candidate.bestOf,
    live: true,
    startedAt: candidate.startTime,
    fetchedAt: nowIso(),
    teams: [
      {
        side: 'team1',
        name: team1Name,
        logo: normalizeTeamLogo(team1Name, detail.team1Logo || hawk.team1Logo || candidate.team1Logo),
      },
      {
        side: 'team2',
        name: team2Name,
        logo: normalizeTeamLogo(team2Name, detail.team2Logo || hawk.team2Logo || candidate.team2Logo),
      },
    ],
    seriesScore: `${seriesTeam1Score} - ${seriesTeam2Score}`,
    seriesScoreBreakdown: {
      team1: seriesTeam1Score,
      team2: seriesTeam2Score,
    },
    maps: detail.maps || [],
    // 局间/选人阶段 detail.liveMap 为 null：回退到最后一场已完成对局（有比分+经济），
    // 否则前端 live 卡片读不到 liveMap 的 team1NetWorthLead，经济/比分全丢。
    liveMap: latestSeriesStanding || null,
  };
}

function payloadToApiPayload(payload, req) {
  return hydratePayloadTeamLogos(payload || null, req);
}

function snapshotToApiPayload(snapshot, req) {
  return payloadToApiPayload(snapshot?.payload || null, req);
}

function dedupeBySeriesKey(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    if (!row?.series_key || seen.has(row.series_key)) return false;
    seen.add(row.series_key);
    return true;
  });
}

export async function explainLiveHeroMatching(db, options = {}) {
  if (!db) {
    return {
      tournamentMatchers: [],
      hawkLiveSeries: [],
      matched: [],
      unmatchedHawkSeries: [],
    };
  }

  const { matched, unmatched, hawkLiveSeries, tournamentMatchers } = await loadLeagueMatchedLiveCandidates(db, options);

  return {
    tournamentMatchers: tournamentMatchers.slice(0, 30).map((matcher) => ({
      leagueId: matcher.leagueId,
      name: matcher.name,
      tier: matcher.tier,
      tokens: matcher.tokens,
    })),
    hawkLiveSeries: hawkLiveSeries.map((row) => ({
      id: row.id,
      slug: row.slug,
      teamKey: row.teamKey,
      teams: [row.team1Name, row.team2Name],
      leagueName: row.leagueName,
      startAt: row.startAt,
      url: row.url,
    })),
    matched: matched.map((candidate) => ({
      teamKey: candidate.teamKey,
      reason: 'matched_by_league_name',
      hawk: {
        id: candidate.sourceSeriesId,
        slug: candidate.sourceSeriesSlug,
        teams: [candidate.team1Name, candidate.team2Name],
        leagueName: candidate.leagueName,
        startAt: candidate.startTime,
        url: candidate.sourceUrl,
      },
      tournamentMatches: candidate.tournamentMatches.map((matcher) => ({
        leagueId: matcher.leagueId,
        name: matcher.name,
        score: matcher.score,
        fullMatch: matcher.fullMatch,
      })),
    })),
    unmatchedHawkSeries: unmatched.map((candidate) => ({
      teamKey: candidate.teamKey,
      reason: 'no_matching_tournament_keyword',
      hawk: {
        id: candidate.sourceSeriesId,
        slug: candidate.sourceSeriesSlug,
        teams: [candidate.team1Name, candidate.team2Name],
        leagueName: candidate.leagueName,
        startAt: candidate.startTime,
        url: candidate.sourceUrl,
      },
    })),
  };
}

export async function resolveLiveHeroSnapshots(db, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const targetTeamKey = options.targetTeamKey || (options.teamA && options.teamB ? buildUnorderedTeamKey(options.teamA, options.teamB) : null);
  const limit = sanitizeLimit(options.limit, LIVE_MATCH_LIMIT);
  const detailTimeoutMs = sanitizeDetailTimeoutMs(options.detailTimeoutMs, 4000);
  const sourceCandidates = Array.isArray(options.candidates)
    ? options.candidates
    : Array.isArray(options.leagueMatchedCandidates)
      ? options.leagueMatchedCandidates
      : (options.matchByTournament === true && db)
        ? (await loadLeagueMatchedLiveCandidates(db, { ...options, fetchImpl })).matched
        : await loadDirectLiveCandidates({ ...options, fetchImpl, targetTeamKey });
  const candidates = sourceCandidates
    .filter((row) => !targetTeamKey || row.teamKey === targetTeamKey)
    .slice(0, limit);

  if (!candidates.length) {
    return [];
  }

  const detailedSeries = await Promise.allSettled(candidates.map(async (candidate) => {
    const controller = new AbortController();
    let timer = null;
    try {
      const detailed = await Promise.race([
        fetchLiveSeriesDetails(candidate.raw, fetchImpl, { signal: controller.signal }),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error(`live_hero_detail_timeout_${detailTimeoutMs}`));
          }, detailTimeoutMs);
        }),
      ]);
      if (!detailed) return null;
      const payload = formatPayload(candidate, detailed);
      return {
        series_key: candidate.teamKey,
        upcoming_series_id: null,
        upcoming_source: candidate.source,
        source_series_id: detailed.id,
        source_slug: detailed.slug,
        league_name: payload.leagueName,
        team1_name: payload.teams[0]?.name,
        team2_name: payload.teams[1]?.name,
        status: 'live',
        is_live: true,
        payload,
        last_seen_at: payload.fetchedAt,
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }));

  return dedupeBySeriesKey(
    detailedSeries.flatMap((result) => (
      result.status === 'fulfilled' && result.value
        ? [result.value]
        : []
    ))
  );
}

export async function getLiveHeroPayloads(db, options = {}) {
  const targetTeamKey = options.targetTeamKey || (options.teamA && options.teamB ? buildUnorderedTeamKey(options.teamA, options.teamB) : null);
  const limit = sanitizeLimit(options.limit, LIVE_MATCH_LIMIT);

  // 高频请求路径零 Neon：直接回源抓 hawk.live 返回（CDN 30s 缓存挡高频轮询）。
  // hero_live_scores 的持久化交给低频 runLiveHeroMonitorCycle（cron / monitor 脚本）。
  const snapshots = await resolveLiveHeroSnapshots(db, {
    ...options,
    targetTeamKey,
    limit,
  });

  return snapshots.map((snapshot) => snapshotToApiPayload(snapshot, options.req)).filter(Boolean);
}

export async function getLiveHeroPayload(db, options = {}) {
  const payloads = await getLiveHeroPayloads(db, { ...options, limit: 1 });
  return payloads[0] || null;
}

export async function runLiveHeroMonitorCycle(db, options = {}) {
  if (!db) return { live: null, ended: [], missed: [] };
  await ensureHeroLiveScoresTable(db);
  const activeRows = await listActiveHeroLiveScores(db);
  const snapshots = await resolveLiveHeroSnapshots(db, options);
  const activeByKey = new Map(activeRows.map((row) => [row.series_key, row]));
  const ended = [];
  const missed = [];

  for (const snapshot of snapshots) {
    await upsertHeroLiveScore(snapshot, db);
    activeByKey.delete(snapshot.series_key);
  }

  const confirmedEndedKeys = new Set(Array.isArray(options.confirmEndedSeriesKeys) ? options.confirmEndedSeriesKeys : []);

  for (const [seriesKey, row] of activeByKey) {
    if (confirmedEndedKeys.has(seriesKey)) {
      const endedRow = await markHeroLiveScoreEnded(seriesKey, { status: 'ended', ended_at: nowIso() }, db);
      if (endedRow) ended.push(endedRow);
      continue;
    }
    missed.push(row);
  }

  return { live: snapshots[0] || null, liveSnapshots: snapshots, ended, missed };
}

/** 低频持久化（cron 每 ~5min 调）：抓 hawk → upsert hero_live_scores（含 notify）。
 *  active 但长时间（endedThresholdMs，默认 15min）未出现在快照里的系列标记为 ended。 */
export async function persistLiveHeroSnapshots(db, options = {}) {
  if (!db) return { live: null, liveSnapshots: [], ended: [], missed: [] };
  const endedThresholdMs = Number(options.endedThresholdMs) || 15 * 60 * 1000;
  const activeRows = await listActiveHeroLiveScores(db);
  const confirmEndedSeriesKeys = activeRows
    .filter((row) => Date.now() - new Date(row.last_seen_at).getTime() > endedThresholdMs)
    .map((row) => row.series_key);
  return runLiveHeroMonitorCycle(db, { ...options, confirmEndedSeriesKeys });
}
