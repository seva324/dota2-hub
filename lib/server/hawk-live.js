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

function didTeam1WinMap(match) {
  if (typeof match?.isRadiantWinner !== 'boolean') return null;
  const team1IsRadiant = match?.isTeam1Radiant !== false;
  return team1IsRadiant ? match.isRadiantWinner : !match.isRadiantWinner;
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
    const liveScore = mapStateScore(match, latestState);

    if (winnerTeam1 === true) {
      cumulativeTeam1 += 1;
      maps.push({
        matchId: match?.id ? String(match.id) : null,
        label: `Map ${matchNumber}`,
        number: matchNumber,
        status: 'completed',
        score: `${cumulativeTeam1} - ${cumulativeTeam2}`,
        team1SeriesWins: cumulativeTeam1,
        team2SeriesWins: cumulativeTeam2,
      });
      continue;
    }

    if (winnerTeam1 === false) {
      cumulativeTeam2 += 1;
      maps.push({
        matchId: match?.id ? String(match.id) : null,
        label: `Map ${matchNumber}`,
        number: matchNumber,
        status: 'completed',
        score: `${cumulativeTeam1} - ${cumulativeTeam2}`,
        team1SeriesWins: cumulativeTeam1,
        team2SeriesWins: cumulativeTeam2,
      });
      continue;
    }

    if (liveScore) {
      liveMap = {
        matchId: match?.id ? String(match.id) : null,
        label: `Map ${matchNumber}`,
        number: matchNumber,
        status: 'live',
        score: `${liveScore.team1} - ${liveScore.team2}`,
        gameTime: Number.isFinite(latestState?.gameTime) ? latestState.gameTime : null,
        team1Score: liveScore.team1,
        team2Score: liveScore.team2,
        team1SeriesWins: cumulativeTeam1,
        team2SeriesWins: cumulativeTeam2,
      };
      maps.push({
        matchId: match?.id ? String(match.id) : null,
        label: `Map ${matchNumber}`,
        number: matchNumber,
        status: 'live',
        score: `${cumulativeTeam1} - ${cumulativeTeam2}`,
        team1SeriesWins: cumulativeTeam1,
        team2SeriesWins: cumulativeTeam2,
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

export async function fetchHtml(url, fetchImpl = fetch) {
  const response = await fetchImpl(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; Dota2Hub/1.0; +https://github.com/seva324/dota2-hub)',
      accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status} for ${url}`);
  }
  return response.text();
}

export async function fetchLiveSeriesDetails(seriesRow, fetchImpl = fetch) {
  if (!seriesRow?.url) return null;
  const html = await fetchHtml(seriesRow.url, fetchImpl);
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

  for (const upcoming of upcomingRows) {
    const key = buildUnorderedTeamKey(upcoming?.team1Name || upcoming?.radiant_team_name, upcoming?.team2Name || upcoming?.dire_team_name);
    const matches = byKey.get(key);
    if (!matches?.length) continue;
    return { upcoming, hawk: matches[0] };
  }
  return null;
}

export { HAWK_BASE_URL };
