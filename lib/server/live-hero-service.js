import {
  buildUnorderedTeamKey,
  fetchHtml,
  fetchLiveSeriesDetails,
  parseHawkHomepageSeriesList,
  selectMatchingLiveSeries,
} from './hawk-live.js';
import {
  ensureHeroLiveScoresTable,
  listRecentActiveHeroLiveScores,
  listActiveHeroLiveScores,
  markHeroLiveScoreEnded,
  upsertHeroLiveScore,
} from './hero-live-score-cache.js';

const LIVE_MATCH_LIMIT = 50;
const UPCOMING_MATCH_LOOKBACK_SECONDS = 15 * 60;

function normalizeLogo(url) {
  if (!url) return null;
  return String(url).replace('steamcdn-a.akamaihd.net', 'cdn.steamstatic.com');
}

function nowIso() {
  return new Date().toISOString();
}

function sanitizeMaxAgeSeconds(value, fallback = 180) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.trunc(parsed);
  if (normalized <= 0) return fallback;
  return normalized;
}

function mapUpcomingRow(row) {
  return {
    upcomingSeriesId: row?.series_id ? String(row.series_id) : row?.id ? String(row.id) : null,
    leagueName: row?.tournament_name || row?.tournament_name_cn || null,
    team1Name: row?.radiant_team_name || null,
    team2Name: row?.dire_team_name || null,
    team1Logo: normalizeLogo(row?.radiant_team_logo),
    team2Logo: normalizeLogo(row?.dire_team_logo),
    startTime: row?.start_time || null,
    bestOf: row?.series_type || null,
    teamKey: buildUnorderedTeamKey(row?.radiant_team_name, row?.dire_team_name),
    source: 'upcoming_series',
    raw: row,
  };
}

export async function loadUpcomingCandidates(db, options = {}) {
  const windowBeforeSeconds = Number(options.windowBeforeSeconds ?? UPCOMING_MATCH_LOOKBACK_SECONDS);
  const windowAfterSeconds = Number(options.windowAfterSeconds ?? 5 * 3600);
  const limit = Number(options.limit ?? 50);
  const now = Math.floor(Date.now() / 1000);
  const upcomingRows = await db.query(
    `SELECT s.*, t.name as tournament_name, t.name_cn as tournament_name_cn,
            rt.name AS radiant_team_name, rt.logo_url AS radiant_team_logo,
            dt.name AS dire_team_name, dt.logo_url AS dire_team_logo
     FROM upcoming_series s
     LEFT JOIN tournaments t ON s.league_id = t.league_id
     LEFT JOIN teams rt ON rt.team_id::text = s.radiant_team_id::text
     LEFT JOIN teams dt ON dt.team_id::text = s.dire_team_id::text
     WHERE s.start_time BETWEEN $1 AND $2
     ORDER BY s.start_time ASC
     LIMIT $3`,
    [now - windowBeforeSeconds, now + windowAfterSeconds, limit]
  );

  return upcomingRows.map(mapUpcomingRow).filter((row) => row.teamKey);
}

function formatPayload(upcoming, seriesWithDetail) {
  const detail = seriesWithDetail.detail;
  const hawk = seriesWithDetail;
  const completedMaps = detail.maps?.filter((map) => map.status === 'completed') || [];
  const latestSeriesStanding = detail.liveMap || completedMaps[completedMaps.length - 1] || null;
  const seriesTeam1Score = hawk.team1Score ?? latestSeriesStanding?.team1SeriesWins ?? 0;
  const seriesTeam2Score = hawk.team2Score ?? latestSeriesStanding?.team2SeriesWins ?? 0;

  return {
    source: 'hawk.live',
    sourceSeriesId: hawk.id,
    sourceSeriesSlug: hawk.slug,
    sourceUrl: hawk.url,
    upcomingSeriesId: upcoming.upcomingSeriesId,
    leagueName: hawk.leagueName || upcoming.leagueName,
    bestOf: hawk.bestOf || detail.bestOf || upcoming.bestOf,
    live: true,
    startedAt: upcoming.startTime,
    fetchedAt: nowIso(),
    teams: [
      {
        side: 'team1',
        name: detail.team1Name || hawk.team1Name || upcoming.team1Name,
        logo: detail.team1Logo || hawk.team1Logo || upcoming.team1Logo,
      },
      {
        side: 'team2',
        name: detail.team2Name || hawk.team2Name || upcoming.team2Name,
        logo: detail.team2Logo || hawk.team2Logo || upcoming.team2Logo,
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

function rowToApiPayload(row) {
  return row?.payload || null;
}

function filterRowsByTargetTeamKey(rows, targetTeamKey) {
  if (!targetTeamKey) return rows;
  return rows.filter((row) => row?.series_key === targetTeamKey);
}

function filterRowsByAllowedTeamKeys(rows, allowedTeamKeys) {
  if (!allowedTeamKeys?.size) return [];
  return rows.filter((row) => row?.series_key && allowedTeamKeys.has(row.series_key));
}

function dedupeBySeriesKey(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    if (!row?.series_key || seen.has(row.series_key)) return false;
    seen.add(row.series_key);
    return true;
  });
}

function describeUpcomingCandidate(candidate, hawkByTeamKey) {
  if (!candidate?.teamKey) {
    return {
      teamKey: null,
      upcomingSeriesId: candidate?.upcomingSeriesId || null,
      teams: [candidate?.team1Name || null, candidate?.team2Name || null],
      status: 'skipped',
      reason: 'missing_team_key',
    };
  }

  const hawkMatches = hawkByTeamKey.get(candidate.teamKey) || [];
  if (!hawkMatches.length) {
    return {
      teamKey: candidate.teamKey,
      upcomingSeriesId: candidate.upcomingSeriesId,
      teams: [candidate.team1Name, candidate.team2Name],
      status: 'missed',
      reason: 'no_matching_hawk_live_series',
    };
  }

  return {
    teamKey: candidate.teamKey,
    upcomingSeriesId: candidate.upcomingSeriesId,
    teams: [candidate.team1Name, candidate.team2Name],
    status: 'matched',
    reason: 'matched_by_team_key',
    hawkSeries: hawkMatches.map((row) => ({
      id: row.id,
      slug: row.slug,
      teams: [row.team1Name, row.team2Name],
      startAt: row.startAt,
      url: row.url,
    })),
  };
}

export async function explainLiveHeroMatching(db, options = {}) {
  if (!db) {
    return {
      upcomingCandidates: [],
      hawkLiveSeries: [],
      matched: [],
      unmatchedUpcoming: [],
    };
  }

  const fetchImpl = options.fetchImpl || fetch;
  const targetTeamKey = options.targetTeamKey || (options.teamA && options.teamB ? buildUnorderedTeamKey(options.teamA, options.teamB) : null);
  const upcomingCandidates = (Array.isArray(options.upcomingCandidates) ? options.upcomingCandidates : await loadUpcomingCandidates(db, options))
    .filter((row) => !targetTeamKey || row.teamKey === targetTeamKey);
  const homeHtml = await fetchHtml('https://hawk.live/', fetchImpl);
  const hawkLiveSeries = parseHawkHomepageSeriesList(homeHtml)
    .filter((row) => !targetTeamKey || row.teamKey === targetTeamKey);
  const matchedPairs = selectMatchingLiveSeries(upcomingCandidates, hawkLiveSeries);
  const hawkByTeamKey = new Map();

  for (const row of hawkLiveSeries) {
    if (!row?.teamKey) continue;
    if (!hawkByTeamKey.has(row.teamKey)) hawkByTeamKey.set(row.teamKey, []);
    hawkByTeamKey.get(row.teamKey).push(row);
  }

  const matchedTeamKeys = new Set(matchedPairs.map((pair) => pair?.upcoming?.teamKey).filter(Boolean));
  const unmatchedUpcoming = upcomingCandidates
    .filter((candidate) => candidate?.teamKey && !matchedTeamKeys.has(candidate.teamKey))
    .map((candidate) => describeUpcomingCandidate(candidate, hawkByTeamKey));

  return {
    upcomingCandidates: upcomingCandidates.map((candidate) => ({
      upcomingSeriesId: candidate.upcomingSeriesId,
      teamKey: candidate.teamKey,
      teams: [candidate.team1Name, candidate.team2Name],
      leagueName: candidate.leagueName,
      startTime: candidate.startTime,
      source: candidate.source,
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
    matched: matchedPairs.map((pair) => ({
      teamKey: pair.upcoming.teamKey,
      reason: 'matched_by_team_key',
      upcoming: {
        upcomingSeriesId: pair.upcoming.upcomingSeriesId,
        teams: [pair.upcoming.team1Name, pair.upcoming.team2Name],
        leagueName: pair.upcoming.leagueName,
        startTime: pair.upcoming.startTime,
      },
      hawk: {
        id: pair.hawk.id,
        slug: pair.hawk.slug,
        teams: [pair.hawk.team1Name, pair.hawk.team2Name],
        leagueName: pair.hawk.leagueName,
        startAt: pair.hawk.startAt,
        url: pair.hawk.url,
      },
    })),
    unmatchedUpcoming,
  };
}

export async function resolveLiveHeroSnapshots(db, options = {}) {
  if (!db) return null;
  await ensureHeroLiveScoresTable(db);
  const fetchImpl = options.fetchImpl || fetch;
  const targetTeamKey = options.targetTeamKey || (options.teamA && options.teamB ? buildUnorderedTeamKey(options.teamA, options.teamB) : null);
  const homeHtml = await fetchHtml('https://hawk.live/', fetchImpl);
  const hawkLiveSeries = parseHawkHomepageSeriesList(homeHtml)
    .filter((row) => !targetTeamKey || row.teamKey === targetTeamKey);
  const upcoming = (Array.isArray(options.upcomingCandidates) ? options.upcomingCandidates : await loadUpcomingCandidates(db, options))
    .filter((row) => !targetTeamKey || row.teamKey === targetTeamKey);
  const matchedPairs = selectMatchingLiveSeries(upcoming, hawkLiveSeries);

  if (!matchedPairs?.length) {
    return [];
  }

  const detailedSeries = await Promise.all(matchedPairs.map(async (matched) => {
    const detailed = await fetchLiveSeriesDetails(matched.hawk, fetchImpl);
    if (!detailed) return null;
    const payload = formatPayload(matched.upcoming, detailed);
    return {
      series_key: matched.upcoming.teamKey,
      upcoming_series_id: matched.upcoming.upcomingSeriesId,
      upcoming_source: matched.upcoming.source,
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
  }));

  return dedupeBySeriesKey(detailedSeries.filter(Boolean));
}

export async function resolveLiveHeroSnapshot(db, options = {}) {
  const snapshots = await resolveLiveHeroSnapshots(db, options);
  return snapshots[0] || null;
}

export async function getLiveHeroPayloads(db, options = {}) {
  if (!db) return [];
  const maxAgeSeconds = sanitizeMaxAgeSeconds(options.maxAgeSeconds, 180);
  const targetTeamKey = options.targetTeamKey || (options.teamA && options.teamB ? buildUnorderedTeamKey(options.teamA, options.teamB) : null);
  const limit = options.limit ?? LIVE_MATCH_LIMIT;
  const upcomingCandidates = await loadUpcomingCandidates(db, options);
  const allowedTeamKeys = new Set(upcomingCandidates.map((row) => row.teamKey).filter(Boolean));
  const cachedRows = filterRowsByAllowedTeamKeys(
    filterRowsByTargetTeamKey(
      await listRecentActiveHeroLiveScores(db, maxAgeSeconds, limit),
      targetTeamKey,
    ),
    allowedTeamKeys,
  );
  if (cachedRows.length && !options.forceRefresh) {
    return cachedRows.map(rowToApiPayload).filter(Boolean);
  }
  const snapshots = await resolveLiveHeroSnapshots(db, {
    ...options,
    targetTeamKey,
    limit,
    upcomingCandidates,
  });
  if (!snapshots.length) {
    return cachedRows.map(rowToApiPayload).filter(Boolean);
  }

  const rows = await Promise.all(snapshots.map((snapshot) => upsertHeroLiveScore(snapshot, db)));
  return rows.map(rowToApiPayload).filter(Boolean);
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
