const HAWK_BASE_URL = 'https://hawk.live';
const ENTITY_MAP = {
  '&quot;': '"',
  '&#34;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
};

const TEAM_ALIAS_MAP = new Map([
  ['aurora gaming', 'aurora'],
  ['team spirit', 'spirit'],
  ['betboom team', 'betboom'],
  ['natus vincere', 'navi'],
  ['xtreme gaming', 'xtreme'],
  ['psg lgd', 'lgd'],
  ['psglgd', 'lgd'],
  ['pari vision', 'parivision'],
  ['team liquid', 'liquid'],
  ['team falcons', 'falcons'],
  ['tundra esports', 'tundra'],
  ['vici gaming', 'vici'],
  ['yakult brothers', 'yakult'],
]);

function decodeHtmlEntities(value = '') {
  return String(value).replace(/&(quot|#34|#39|apos|amp|lt|gt);/g, (token) => ENTITY_MAP[token] || token);
}

function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function normalizeTeamName(value) {
  const decoded = decodeHtmlEntities(String(value || '').toLowerCase())
    .replace(/[_./-]+/g, ' ')
    .replace(/\band\b/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\u4e00-\u9fff\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!decoded) return '';
  const directAlias = TEAM_ALIAS_MAP.get(decoded);
  if (directAlias) return directAlias;

  const compact = decoded.replace(/\b(team|esports|gaming|club|gg|dota|the)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return TEAM_ALIAS_MAP.get(compact) || compact || decoded;
}

export function buildUnorderedTeamKey(teamA, teamB) {
  return [normalizeTeamName(teamA), normalizeTeamName(teamB)].filter(Boolean).sort().join('::');
}

export function buildHawkSeriesUrl(championshipSlug, seriesSlug) {
  if (!championshipSlug || !seriesSlug) return null;
  return `${HAWK_BASE_URL}/dota-2/matches/${championshipSlug}/${seriesSlug}`;
}

export function extractInertiaPageData(html) {
  const match = String(html || '').match(/<div[^>]+id="app"[^>]+data-page="([\s\S]*?)"[^>]*>/i);
  if (!match) return null;
  const decoded = decodeHtmlEntities(match[1]);
  return safeJsonParse(decoded, null);
}

export function parseHawkHomepageSeriesList(html) {
  const page = extractInertiaPageData(html);
  const rows = page?.props?.seriesList;
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => ({
    id: row?.id ? String(row.id) : null,
    slug: row?.slug || null,
    championshipSlug: row?.championship?.slug || null,
    leagueName: row?.championship?.name || null,
    bestOf: row?.bestOf ?? null,
    startAt: row?.startAt || null,
    team1Name: row?.team1?.name || null,
    team1Logo: row?.team1?.logoUrl || null,
    team2Name: row?.team2?.name || null,
    team2Logo: row?.team2?.logoUrl || null,
    team1Score: Number.isFinite(row?.team1Score) ? row.team1Score : null,
    team2Score: Number.isFinite(row?.team2Score) ? row.team2Score : null,
    currentMatchNumber: Number.isFinite(row?.currentMatchNumber) ? row.currentMatchNumber : null,
    teamKey: buildUnorderedTeamKey(row?.team1?.name, row?.team2?.name),
    url: buildHawkSeriesUrl(row?.championship?.slug, row?.slug),
  })).filter((row) => row.teamKey && row.url);
}

function mapStateScore(match, state) {
  if (!state) return null;
  const radiantScore = Number.isFinite(state?.radiantScore) ? state.radiantScore : 0;
  const direScore = Number.isFinite(state?.direScore) ? state.direScore : 0;
  const team1IsRadiant = match?.isTeam1Radiant !== false;
  return team1IsRadiant
    ? { team1: radiantScore, team2: direScore }
    : { team1: direScore, team2: radiantScore };
}

function mapNetWorthLead(match, state) {
  if (!state || !Number.isFinite(state?.radiantNetWorthAdvantage)) return null;
  const radiantLead = Number(state.radiantNetWorthAdvantage);
  const team1IsRadiant = match?.isTeam1Radiant !== false;
  const team1Lead = team1IsRadiant ? radiantLead : -radiantLead;
  const team2Lead = -team1Lead;
  return {
    team1: team1Lead > 0 ? team1Lead : null,
    team2: team2Lead > 0 ? team2Lead : null,
  };
}

function didTeam1WinMap(match) {
  if (typeof match?.isRadiantWinner !== 'boolean') return null;
  const team1IsRadiant = match?.isTeam1Radiant !== false;
  return team1IsRadiant ? match.isRadiantWinner : !match.isRadiantWinner;
}

function formatScore(score) {
  if (!score || !Number.isFinite(score.team1) || !Number.isFinite(score.team2)) return null;
  return `${score.team1} - ${score.team2}`;
}

export function summarizeSeriesDetail(html) {
  const page = extractInertiaPageData(html);
  const series = page?.props?.seriesPageData;
  if (!series) return null;

  let cumulativeTeam1 = 0;
  let cumulativeTeam2 = 0;
  let liveMap = null;
  const maps = [];

  for (const match of Array.isArray(series.matches) ? series.matches : []) {
    const matchNumber = Number(match?.number) || maps.length + 1;
    const winnerTeam1 = didTeam1WinMap(match);
    const states = Array.isArray(match?.states) ? match.states : [];
    const latestState = states.length > 0 ? states[states.length - 1] : null;
    const latestScore = mapStateScore(match, latestState);
    const latestNetWorthLead = mapNetWorthLead(match, latestState);
    const latestScoreText = formatScore(latestScore);
    const matchId = match?.id ? String(match.id) : null;

    if (winnerTeam1 === true) {
      cumulativeTeam1 += 1;
      maps.push({
        matchId,
        label: `Map ${matchNumber}`,
        number: matchNumber,
        status: 'completed',
        score: latestScoreText,
        displayScore: latestScoreText,
        result: 'team1',
        team1SeriesWins: cumulativeTeam1,
        team2SeriesWins: cumulativeTeam2,
        team1Score: latestScore?.team1 ?? null,
        team2Score: latestScore?.team2 ?? null,
        team1NetWorthLead: latestNetWorthLead?.team1 ?? null,
        team2NetWorthLead: latestNetWorthLead?.team2 ?? null,
        gameTime: Number.isFinite(latestState?.gameTime) ? latestState.gameTime : null,
      });
      continue;
    }

    if (winnerTeam1 === false) {
      cumulativeTeam2 += 1;
      maps.push({
        matchId,
        label: `Map ${matchNumber}`,
        number: matchNumber,
        status: 'completed',
        score: latestScoreText,
        displayScore: latestScoreText,
        result: 'team2',
        team1SeriesWins: cumulativeTeam1,
        team2SeriesWins: cumulativeTeam2,
        team1Score: latestScore?.team1 ?? null,
        team2Score: latestScore?.team2 ?? null,
        team1NetWorthLead: latestNetWorthLead?.team1 ?? null,
        team2NetWorthLead: latestNetWorthLead?.team2 ?? null,
        gameTime: Number.isFinite(latestState?.gameTime) ? latestState.gameTime : null,
      });
      continue;
    }

    if (latestScore) {
      liveMap = {
        matchId,
        label: `Map ${matchNumber}`,
        number: matchNumber,
        status: 'live',
        score: `${latestScore.team1} - ${latestScore.team2}`,
        gameTime: Number.isFinite(latestState?.gameTime) ? latestState.gameTime : null,
        team1Score: latestScore.team1,
        team2Score: latestScore.team2,
        team1SeriesWins: cumulativeTeam1,
        team2SeriesWins: cumulativeTeam2,
        team1NetWorthLead: latestNetWorthLead?.team1 ?? null,
        team2NetWorthLead: latestNetWorthLead?.team2 ?? null,
      };
      maps.push({
        matchId,
        label: `Map ${matchNumber}`,
        number: matchNumber,
        status: 'live',
        score: `${latestScore.team1} - ${latestScore.team2}`,
        displayScore: `${latestScore.team1} - ${latestScore.team2}`,
        team1SeriesWins: cumulativeTeam1,
        team2SeriesWins: cumulativeTeam2,
        team1Score: latestScore.team1,
        team2Score: latestScore.team2,
        team1NetWorthLead: latestNetWorthLead?.team1 ?? null,
        team2NetWorthLead: latestNetWorthLead?.team2 ?? null,
        gameTime: Number.isFinite(latestState?.gameTime) ? latestState.gameTime : null,
      });
    }
  }

  return {
    id: series?.id ? String(series.id) : null,
    slug: series?.slug || null,
    bestOf: series?.bestOf ?? null,
    team1Name: series?.team1?.name || null,
    team1Logo: series?.team1?.logoUrl || null,
    team2Name: series?.team2?.name || null,
    team2Logo: series?.team2?.logoUrl || null,
    maps,
    liveMap,
  };
}

function parseSeriesDetailMatch(match) {
  if (!match || typeof match !== 'object') return null;
  const isTeam1Radiant = match?.isTeam1Radiant !== false;
  const rawStates = Array.isArray(match?.states)
    ? match.states.filter((state) => state && typeof state === 'object')
    : [];
  const latestState = rawStates[rawStates.length - 1] || null;

  const winnerTeam1 = didTeam1WinMap(match);
  const score = mapStateScore(match, latestState);
  // 带符号净财富领先：正值 = team1 经济领先，负值 = team1 落后
  const rawAdv = Number.isFinite(Number(latestState?.radiantNetWorthAdvantage))
    ? Number(latestState.radiantNetWorthAdvantage)
    : null;
  const team1NetWorthLead = rawAdv == null ? null : (isTeam1Radiant ? rawAdv : -rawAdv);
  const team2NetWorthLead = team1NetWorthLead == null ? null : -team1NetWorthLead;

  return {
    matchId: match?.id != null ? String(match.id) : null,
    number: Number(match?.number) || 0,
    isTeam1Radiant,
    status: winnerTeam1 != null ? 'completed' : rawStates.length > 0 ? 'live' : 'upcoming',
    winner: winnerTeam1 === true ? 'team1' : winnerTeam1 === false ? 'team2' : null,
    team1Score: score?.team1 ?? null,
    team2Score: score?.team2 ?? null,
    gameTime: Number.isFinite(Number(latestState?.gameTime)) ? Number(latestState.gameTime) : null,
    team1NetWorthLead,
    team2NetWorthLead,
    buildingState: latestState?.buildingState ?? null,
    picks: (Array.isArray(match?.picks) ? match.picks : []).map((pick) => ({
      isRadiant: pick?.isRadiant !== false,
      hero: {
        id: pick?.hero?.id ?? null,
        name: pick?.hero?.name || null,
        codeName: pick?.hero?.codeName || null,
      },
      player: {
        id: pick?.player?.id ?? null,
        name: pick?.player?.name || null,
        officialName: pick?.player?.officialName ?? null,
      },
    })),
    states: rawStates.map((state) => ({
      id: state?.id != null ? String(state.id) : null,
      gameTime: Number.isFinite(Number(state?.gameTime)) ? Number(state.gameTime) : 0,
      radiantScore: Number.isFinite(Number(state?.radiantScore)) ? Number(state.radiantScore) : 0,
      direScore: Number.isFinite(Number(state?.direScore)) ? Number(state.direScore) : 0,
      radiantNetWorthAdvantage: Number.isFinite(Number(state?.radiantNetWorthAdvantage)) ? Number(state.radiantNetWorthAdvantage) : 0,
    })),
    odds: (Array.isArray(match?.oddsBundles) ? match.oddsBundles : []).map((bundle) => {
      const odds = Array.isArray(bundle?.odds) ? bundle.odds : [];
      const latest = odds[odds.length - 1] || {};
      return {
        provider: bundle?.oddsProviderCodeName || null,
        isTeam1First: bundle?.isTeam1First !== false,
        firstTeamWin: latest?.firstTeamWin ?? null,
        secondTeamWin: latest?.secondTeamWin ?? null,
      };
    }),
  };
}

/** 完整 series detail 页解析：供 live detail 页使用（比分/净财富/建筑/BP/经济曲线/赔率）。 */
export function parseSeriesDetailPayload(html, options = {}) {
  const page = extractInertiaPageData(html);
  const series = page?.props?.seriesPageData;
  if (!series) return null;

  const championship = series?.championship || {};
  const team1 = series?.team1 || {};
  const team2 = series?.team2 || {};

  const maps = (Array.isArray(series?.matches) ? series.matches : [])
    .map(parseSeriesDetailMatch)
    .filter(Boolean);

  let team1Wins = 0;
  let team2Wins = 0;
  for (const map of maps) {
    if (map.winner === 'team1') team1Wins += 1;
    else if (map.winner === 'team2') team2Wins += 1;
  }

  return {
    source: 'hawk.live',
    sourceUrl: options.url || buildHawkSeriesUrl(championship?.slug, series?.slug) || null,
    seriesId: series?.id != null ? String(series.id) : null,
    slug: series?.slug || null,
    championship: championship?.id != null
      ? { id: Number(championship.id), name: championship?.name || null, slug: championship?.slug || null }
      : null,
    bestOf: Number.isFinite(Number(series?.bestOf)) ? Number(series.bestOf) : null,
    startAt: series?.startAt || null,
    team1: { id: team1?.id != null ? String(team1.id) : null, name: team1?.name || null, logoUrl: team1?.logoUrl || null },
    team2: { id: team2?.id != null ? String(team2.id) : null, name: team2?.name || null, logoUrl: team2?.logoUrl || null },
    team1Wins,
    team2Wins,
    currentMapNumber: maps.find((map) => map.status === 'live')?.number ?? null,
    maps,
  };
}

export async function fetchHtml(url, fetchImpl = fetch, options = {}) {
  const response = await fetchImpl(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; Dota2Hub/1.0; +https://github.com/seva324/dota2-hub)',
      accept: 'text/html,application/xhtml+xml',
    },
    signal: options.signal,
  });
  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status} for ${url}`);
  }
  return response.text();
}

export async function fetchLiveSeriesDetails(seriesRow, fetchImpl = fetch, options = {}) {
  if (!seriesRow?.url) return null;
  const html = await fetchHtml(seriesRow.url, fetchImpl, options);
  const detail = summarizeSeriesDetail(html);
  if (!detail) return null;
  return {
    ...seriesRow,
    detail,
  };
}

export function selectMatchingLiveSeries(upcomingRows, hawkSeriesRows) {
  const byKey = new Map();
  for (const row of hawkSeriesRows) {
    if (!row?.teamKey) continue;
    if (!byKey.has(row.teamKey)) byKey.set(row.teamKey, []);
    byKey.get(row.teamKey).push(row);
  }

  const selected = [];
  const usedSeriesIds = new Set();
  for (const upcoming of upcomingRows) {
    const key = buildUnorderedTeamKey(upcoming?.team1Name || upcoming?.radiant_team_name, upcoming?.team2Name || upcoming?.dire_team_name);
    const matches = byKey.get(key);
    if (!matches?.length) continue;
    const chosen = matches.find((row) => !usedSeriesIds.has(row.id || row.url)) || matches[0];
    const identity = chosen.id || chosen.url;
    if (identity) usedSeriesIds.add(identity);
    selected.push({ upcoming, hawk: chosen });
  }
  return selected;
}
