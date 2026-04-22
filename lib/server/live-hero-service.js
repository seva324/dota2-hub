import {
  buildUnorderedTeamKey,
  fetchHtml,
  fetchLiveSeriesDetails,
  parseHawkHomepageSeriesList,
} from './hawk-live.js';
import {
  ensureHeroLiveScoresTable,
  listRecentActiveHeroLiveScores,
  listActiveHeroLiveScores,
  markHeroLiveScoreEnded,
  upsertHeroLiveScore,
} from './hero-live-score-cache.js';
import {
  readLiveHeroHotCache,
  tryAcquireLiveHeroRefreshLock,
  writeLiveHeroHotCache,
} from './live-hero-hot-cache.js';
import { getMirroredAssetUrl } from '../asset-mirror.js';
import { getCuratedTeamLogoGithubUrl } from '../team-logo-overrides.js';

const LIVE_MATCH_LIMIT = 50;
const LIVE_HERO_HOT_CACHE_FRESH_MS = 4000;
const LIVE_HERO_HOT_CACHE_LOCK_MS = 6000;
const LIVE_HERO_HOT_CACHE_MISSING_GRACE_MS = 15000;
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

let liveHeroHotCacheRefreshPromise = null;

function normalizeLogo(url, req) {
  return getMirroredAssetUrl(url, req);
}

function normalizeTeamLogo(teamName, fallbackUrl, req) {
  const curatedUrl = getCuratedTeamLogoGithubUrl({ name: teamName });
  return normalizeLogo(curatedUrl || fallbackUrl, req);
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

function sanitizeHotCacheFreshMs(value, fallback = LIVE_HERO_HOT_CACHE_FRESH_MS) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.trunc(parsed);
  if (normalized <= 0) return fallback;
  return Math.min(normalized, 30000);
}

function sanitizeHotCacheLockMs(value, fallback = LIVE_HERO_HOT_CACHE_LOCK_MS) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.trunc(parsed);
  if (normalized <= 0) return fallback;
  return Math.min(normalized, 30000);
}

function sanitizeHotCacheMissingGraceMs(value, fallback = LIVE_HERO_HOT_CACHE_MISSING_GRACE_MS) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.trunc(parsed);
  if (normalized <= 0) return fallback;
  return Math.min(normalized, 120000);
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
    `SELECT league_id, name, name_cn, tier
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
    sourceUrl: hawk.url,
    upcomingSeriesId: null,
    leagueName: hawk.leagueName || candidate.leagueName,
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
    liveMap: detail.liveMap || null,
  };
}

function rowToApiPayload(row, req) {
  return hydratePayloadTeamLogos(row?.payload || null, req);
}

function payloadToApiPayload(payload, req) {
  return hydratePayloadTeamLogos(payload || null, req);
}

function snapshotToApiPayload(snapshot, req) {
  return payloadToApiPayload(snapshot?.payload || null, req);
}

function getPayloadSeriesKey(payload) {
  if (!payload) return null;
  if (payload.sourceSeriesId !== null && payload.sourceSeriesId !== undefined) {
    const sourceSeriesId = String(payload.sourceSeriesId).trim();
    if (sourceSeriesId) return `source:${sourceSeriesId}`;
  }
  if (payload.sourceUrl) {
    const sourceUrl = String(payload.sourceUrl).trim();
    if (sourceUrl) return `url:${sourceUrl}`;
  }
  const teamNames = Array.isArray(payload.teams)
    ? payload.teams.map((team) => String(team?.name || '').trim()).filter(Boolean)
    : [];
  if (teamNames.length >= 2) {
    return `teams:${buildUnorderedTeamKey(teamNames[0], teamNames[1])}`;
  }
  return null;
}

function getPayloadFetchedAtMs(payload) {
  const parsed = Date.parse(String(payload?.fetchedAt || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function comparePayloadsForDisplay(a, b) {
  const aStart = toSortTimestamp(a?.startedAt);
  const bStart = toSortTimestamp(b?.startedAt);
  if (aStart !== bStart) return aStart - bStart;
  const aLeague = String(a?.leagueName || '');
  const bLeague = String(b?.leagueName || '');
  if (aLeague !== bLeague) return aLeague.localeCompare(bLeague);
  const aTeams = Array.isArray(a?.teams) ? a.teams.map((team) => team?.name || '').join(' vs ') : '';
  const bTeams = Array.isArray(b?.teams) ? b.teams.map((team) => team?.name || '').join(' vs ') : '';
  return aTeams.localeCompare(bTeams);
}

function filterRowsByTargetTeamKey(rows, targetTeamKey) {
  if (!targetTeamKey) return rows;
  return rows.filter((row) => row?.series_key === targetTeamKey);
}

function dedupeBySeriesKey(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    if (!row?.series_key || seen.has(row.series_key)) return false;
    seen.add(row.series_key);
    return true;
  });
}

function sortRowsByLastSeen(rows) {
  return [...rows].sort((a, b) => {
    const aTime = a?.last_seen_at ? new Date(a.last_seen_at).getTime() : 0;
    const bTime = b?.last_seen_at ? new Date(b.last_seen_at).getTime() : 0;
    return bTime - aTime;
  });
}

function mergeRowsBySeriesKey(primaryRows, secondaryRows = []) {
  const merged = new Map();
  for (const row of secondaryRows) {
    if (!row?.series_key) continue;
    merged.set(row.series_key, row);
  }
  for (const row of primaryRows) {
    if (!row?.series_key) continue;
    merged.set(row.series_key, row);
  }
  return sortRowsByLastSeen(Array.from(merged.values()));
}

function mergeHotCachePayloads(currentPayloads = [], previousPayloads = [], maxMissingGraceMs = LIVE_HERO_HOT_CACHE_MISSING_GRACE_MS) {
  const nowMs = Date.now();
  const merged = new Map();

  for (const payload of currentPayloads) {
    const key = getPayloadSeriesKey(payload);
    if (!key) continue;
    merged.set(key, payload);
  }

  for (const payload of previousPayloads) {
    const key = getPayloadSeriesKey(payload);
    if (!key || merged.has(key)) continue;
    const ageMs = nowMs - getPayloadFetchedAtMs(payload);
    if (ageMs <= maxMissingGraceMs) {
      merged.set(key, payload);
    }
  }

  return Array.from(merged.values()).sort(comparePayloadsForDisplay);
}

function buildLiveHeroHotCacheEntry(payloads = [], previousEntry = null, maxMissingGraceMs = LIVE_HERO_HOT_CACHE_MISSING_GRACE_MS) {
  return {
    payloads: mergeHotCachePayloads(
      Array.isArray(payloads) ? payloads : [],
      Array.isArray(previousEntry?.payloads) ? previousEntry.payloads : [],
      maxMissingGraceMs,
    ),
    refreshedAt: nowIso(),
  };
}

function getLiveHeroHotCacheAgeMs(entry) {
  const refreshedAt = Date.parse(entry?.refreshedAt || '');
  if (!Number.isFinite(refreshedAt)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Date.now() - refreshedAt);
}

function isLiveHeroHotCacheFresh(entry, maxAgeMs) {
  return getLiveHeroHotCacheAgeMs(entry) <= maxAgeMs;
}

function mapHotCachePayloads(entry, req, limit = LIVE_MATCH_LIMIT) {
  return (Array.isArray(entry?.payloads) ? entry.payloads : [])
    .map((payload) => payloadToApiPayload(payload, req))
    .filter(Boolean)
    .slice(0, limit);
}

function shouldUseLiveHeroHotCache(options = {}) {
  return !options.forceRefresh && !options.debug && !options.targetTeamKey && !options.teamA && !options.teamB;
}

async function refreshLiveHeroHotCache(db, options = {}) {
  if (liveHeroHotCacheRefreshPromise && options.forceRefresh !== true) {
    return liveHeroHotCacheRefreshPromise;
  }

  const refreshTask = (async () => {
    const fetchImpl = options.fetchImpl || fetch;
    const limit = sanitizeLimit(options.limit, LIVE_MATCH_LIMIT);
    const maxAgeSeconds = sanitizeMaxAgeSeconds(options.maxAgeSeconds, 180);
    const hotCacheMissingGraceMs = sanitizeHotCacheMissingGraceMs(
      options.hotCacheMissingGraceMs,
      LIVE_HERO_HOT_CACHE_MISSING_GRACE_MS,
    );
    const targetTeamKey = options.targetTeamKey || (options.teamA && options.teamB ? buildUnorderedTeamKey(options.teamA, options.teamB) : null);
    const candidates = await loadDirectLiveCandidates({ ...options, fetchImpl, targetTeamKey });
    const snapshots = await resolveLiveHeroSnapshots(db, {
      ...options,
      fetchImpl,
      targetTeamKey,
      limit,
      candidates,
    });
    let payloads = snapshots
      .map((snapshot) => snapshot?.payload || null)
      .filter(Boolean);

    if (db) {
      const freshRows = snapshots.length
        ? await Promise.all(snapshots.map((snapshot) => upsertHeroLiveScore(snapshot, db)))
        : [];
      const cachedRows = await listRecentActiveHeroLiveScores(db, maxAgeSeconds, limit)
        .then((rows) => filterRowsByTargetTeamKey(rows, targetTeamKey));
      const mergedRows = freshRows.length ? mergeRowsBySeriesKey(freshRows, cachedRows) : cachedRows;
      payloads = mergedRows
        .map((row) => row?.payload || null)
        .filter(Boolean)
        .slice(0, limit);
    }

    const previousEntry = await readLiveHeroHotCache();
    const entry = buildLiveHeroHotCacheEntry(payloads, previousEntry, hotCacheMissingGraceMs);
    await writeLiveHeroHotCache(entry);
    return entry;
  })();

  const trackedRefreshTask = refreshTask.finally(() => {
    if (liveHeroHotCacheRefreshPromise === trackedRefreshTask) {
      liveHeroHotCacheRefreshPromise = null;
    }
  });

  liveHeroHotCacheRefreshPromise = trackedRefreshTask;
  return trackedRefreshTask;
}

async function scheduleLiveHeroHotCacheRefresh(db, options = {}) {
  if (liveHeroHotCacheRefreshPromise) return;
  const lockMs = sanitizeHotCacheLockMs(options.hotCacheLockMs, LIVE_HERO_HOT_CACHE_LOCK_MS);
  const acquired = await tryAcquireLiveHeroRefreshLock(lockMs);
  if (!acquired) return;

  void refreshLiveHeroHotCache(db, options).catch((error) => {
    console.error('[live-hero-service] hot cache refresh failed:', error instanceof Error ? error.message : String(error));
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
  const maxAgeSeconds = sanitizeMaxAgeSeconds(options.maxAgeSeconds, 180);
  const targetTeamKey = options.targetTeamKey || (options.teamA && options.teamB ? buildUnorderedTeamKey(options.teamA, options.teamB) : null);
  const limit = sanitizeLimit(options.limit, LIVE_MATCH_LIMIT);
  const hotCacheFreshMs = sanitizeHotCacheFreshMs(options.hotCacheFreshMs, LIVE_HERO_HOT_CACHE_FRESH_MS);
  let cachedRowsPromise = null;
  const getCachedRows = async () => {
    if (!db) return [];
    if (!cachedRowsPromise) {
      cachedRowsPromise = listRecentActiveHeroLiveScores(db, maxAgeSeconds, limit)
        .then((rows) => filterRowsByTargetTeamKey(rows, targetTeamKey));
    }
    return cachedRowsPromise;
  };

  if (shouldUseLiveHeroHotCache(options)) {
    const hotCacheEntry = await readLiveHeroHotCache();
    const hotCachePayloads = mapHotCachePayloads(hotCacheEntry, options.req, limit);

    if (hotCachePayloads.length && isLiveHeroHotCacheFresh(hotCacheEntry, hotCacheFreshMs)) {
      return hotCachePayloads;
    }

    if (hotCachePayloads.length) {
      await scheduleLiveHeroHotCacheRefresh(db, options);
      return hotCachePayloads;
    }

    try {
      const refreshedEntry = await refreshLiveHeroHotCache(db, options);
      const refreshedPayloads = mapHotCachePayloads(refreshedEntry, options.req, limit);
      if (Array.isArray(refreshedEntry?.payloads)) return refreshedPayloads;
    } catch (error) {
      const fallbackRows = await getCachedRows();
      if (fallbackRows.length) {
        return fallbackRows.map((row) => rowToApiPayload(row, options.req)).filter(Boolean);
      }
      throw error;
    }
  }

  try {
    const snapshots = await resolveLiveHeroSnapshots(db, {
      ...options,
      targetTeamKey,
      limit,
    });

    if (!snapshots.length) {
      const fallbackRows = options.forceRefresh ? [] : await getCachedRows();
      return fallbackRows.map((row) => rowToApiPayload(row, options.req)).filter(Boolean);
    }

    if (!db) {
      return snapshots.map((snapshot) => snapshotToApiPayload(snapshot, options.req)).filter(Boolean);
    }

    const freshRows = await Promise.all(snapshots.map((snapshot) => upsertHeroLiveScore(snapshot, db)));
    const cachedRows = options.forceRefresh ? [] : await getCachedRows();
    const mergedRows = options.forceRefresh ? freshRows : mergeRowsBySeriesKey(freshRows, cachedRows);
    return mergedRows.map((row) => rowToApiPayload(row, options.req)).filter(Boolean);
  } catch (error) {
    const cachedRows = await getCachedRows();
    if (cachedRows.length && !options.forceRefresh) {
      return cachedRows.map((row) => rowToApiPayload(row, options.req)).filter(Boolean);
    }
    throw error;
  }
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
