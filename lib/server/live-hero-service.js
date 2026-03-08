import {
  buildUnorderedTeamKey,
  fetchHtml,
  fetchLiveSeriesDetails,
  parseHawkHomepageSeriesList,
  selectMatchingLiveSeries,
} from './hawk-live.js';
import {
  ensureHeroLiveScoresTable,
  getCurrentHeroLiveScore,
  listActiveHeroLiveScores,
  markHeroLiveScoreEnded,
  upsertHeroLiveScore,
} from './hero-live-score-cache.js';

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
  const windowBeforeSeconds = Number(options.windowBeforeSeconds ?? 6 * 3600);
  const windowAfterSeconds = Number(options.windowAfterSeconds ?? 14 * 3600);
  const recentSeriesWindowSeconds = Number(options.recentSeriesWindowSeconds ?? 18 * 3600);
  const limit = Number(options.limit ?? 30);
  const now = Math.floor(Date.now() / 1000);
  const upcomingRows = await db.query(
    `SELECT s.*, t.name as tournament_name, t.name_cn as tournament_name_cn
     FROM upcoming_series s
     LEFT JOIN tournaments t ON s.league_id = t.league_id
     WHERE s.start_time BETWEEN $1 AND $2
     ORDER BY s.start_time ASC
     LIMIT $3`,
    [now - windowBeforeSeconds, now + windowAfterSeconds, limit]
  );

  const candidates = upcomingRows.map(mapUpcomingRow).filter((row) => row.teamKey);
  const seenKeys = new Set(candidates.map((row) => row.teamKey));

  const recentSeriesRows = await db.query(
    `SELECT s.series_id, s.start_time, s.series_type, s.league_id,
            rt.name AS radiant_team_name, rt.logo_url AS radiant_team_logo,
            dt.name AS dire_team_name, dt.logo_url AS dire_team_logo,
            t.name AS tournament_name, t.name_cn AS tournament_name_cn
     FROM series s
     LEFT JOIN teams rt ON rt.team_id::text = s.radiant_team_id::text
     LEFT JOIN teams dt ON dt.team_id::text = s.dire_team_id::text
     LEFT JOIN tournaments t ON s.league_id = t.league_id
     WHERE s.start_time BETWEEN $1 AND $2
     ORDER BY s.start_time DESC
     LIMIT $3`,
    [now - recentSeriesWindowSeconds, now + windowAfterSeconds, limit]
  );

  for (const row of recentSeriesRows) {
    const mapped = mapUpcomingRow({
      ...row,
      id: row.series_id,
      status: 'recent_series',
      series_id: row.series_id,
    });
    if (!mapped.teamKey || seenKeys.has(mapped.teamKey)) continue;
    seenKeys.add(mapped.teamKey);
    mapped.source = 'recent_series';
    candidates.push(mapped);
  }

  return candidates;
}

function formatPayload(upcoming, seriesWithDetail) {
  const detail = seriesWithDetail.detail;
  const hawk = seriesWithDetail;
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
    seriesScore: `${hawk.team1Score ?? detail.maps?.filter((m) => m.status === 'completed').slice(-1)[0]?.team1SeriesWins ?? 0} - ${hawk.team2Score ?? detail.maps?.filter((m) => m.status === 'completed').slice(-1)[0]?.team2SeriesWins ?? 0}`,
    seriesScoreBreakdown: {
      team1: hawk.team1Score ?? 0,
      team2: hawk.team2Score ?? 0,
    },
    maps: detail.maps || [],
    liveMap: detail.liveMap || null,
  };
}

function rowToApiPayload(row) {
  return row?.payload || null;
}

export async function resolveLiveHeroSnapshot(db, options = {}) {
  if (!db) return null;
  await ensureHeroLiveScoresTable(db);
  const fetchImpl = options.fetchImpl || fetch;
  const targetTeamKey = options.targetTeamKey || (options.teamA && options.teamB ? buildUnorderedTeamKey(options.teamA, options.teamB) : null);
  const homeHtml = await fetchHtml('https://hawk.live/', fetchImpl);
  const hawkLiveSeries = parseHawkHomepageSeriesList(homeHtml)
    .filter((row) => !targetTeamKey || row.teamKey === targetTeamKey);
  const upcoming = (await loadUpcomingCandidates(db, options))
    .filter((row) => !targetTeamKey || row.teamKey === targetTeamKey);
  const matched = selectMatchingLiveSeries(upcoming, hawkLiveSeries);

  if (!matched) {
    return null;
  }

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
}

export async function getLiveHeroPayload(db, options = {}) {
  if (!db) return null;
  const maxAgeSeconds = sanitizeMaxAgeSeconds(options.maxAgeSeconds, 180);
  const cached = await getCurrentHeroLiveScore(db, maxAgeSeconds);
  if (cached?.payload && !options.forceRefresh) {
    return cached.payload;
  }
  const snapshot = await resolveLiveHeroSnapshot(db, options);
  if (!snapshot) return cached?.payload || null;
  const row = await upsertHeroLiveScore(snapshot, db);
  return rowToApiPayload(row);
}

export async function runLiveHeroMonitorCycle(db, options = {}) {
  if (!db) return { live: null, ended: [], missed: [] };
  await ensureHeroLiveScoresTable(db);
  const activeRows = await listActiveHeroLiveScores(db);
  const snapshot = await resolveLiveHeroSnapshot(db, options);
  const activeByKey = new Map(activeRows.map((row) => [row.series_key, row]));
  const ended = [];
  const missed = [];

  if (snapshot) {
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

  return { live: snapshot, ended, missed };
}
