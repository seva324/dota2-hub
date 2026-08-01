import { getDltvLive } from '../lib/server/dltv-matches-service.js';
import { getCuratedTeamLogoGithubUrl } from '../lib/team-logo-overrides.js';

const LIVE_HERO_CACHE_CONTROL = 'public, max-age=10, s-maxage=10, stale-while-revalidate=30';
const LIVE_HERO_NO_STORE_CACHE_CONTROL = 'no-store';

function shouldBypassSharedCache(query) {
  return String(query?.refresh || '') === '1' || String(query?.debug || '') === '1';
}

// DLTV logo paths are relative (e.g. /uploads/teams/...). Prefer curated
// GitHub logos for top teams; otherwise qualify with the DLTV origin.
function resolveLogo(name, relativeLogo) {
  const curated = getCuratedTeamLogoGithubUrl({ name });
  if (curated) return curated;
  if (relativeLogo) return `https://dltv.org${relativeLogo.startsWith('/') ? '' : '/'}${relativeLogo}`;
  return null;
}

// Map a parsed DLTV live match onto the frontend's LiveHeroPayload shape.
// DLTV has no per-map history on the list page: build a single "live" map
// from the current kills / game time, and use series wins for the series score.
function toLiveHeroPayload(match) {
  const team1Score = match.seriesWins1 ?? 0;
  const team2Score = match.seriesWins2 ?? 0;
  const gameTime = match.gameTime ?? null;
  const matchId = match.matchId ? String(match.matchId) : null;

  const map = {
    matchId,
    label: 'Map 1',
    status: 'live',
    team1Score: match.radiantKills ?? null,
    team2Score: match.direKills ?? null,
    team1NetWorthLead: match.radiantNetWorth != null || match.direNetWorth != null
      ? (match.radiantNetWorth ?? 0) - (match.direNetWorth ?? 0)
      : null,
    team1TotalGold: match.radiantNetWorth ?? null,
    team2TotalGold: match.direNetWorth ?? null,
    gameTime,
  };

  return {
    source: 'dltv',
    sourceUrl: match.matchUrl || null,
    sourceSeriesId: match.seriesId ? String(match.seriesId) : null,
    leagueName: match.tournament || '',
    stage: match.stage || null,
    bestOf: match.bestOf || 'BO3',
    seriesScore: `${team1Score}:${team2Score}`,
    seriesScoreBreakdown: { team1: team1Score, team2: team2Score },
    live: true,
    startedAt: null,
    viewerCount: null,
    teams: [
      { side: 'team1', name: match.radiantName, logo: resolveLogo(match.radiantName, match.radiantLogo) },
      { side: 'team2', name: match.direName, logo: resolveLogo(match.direName, match.direLogo) },
    ],
    maps: [map],
    liveMap: map,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', shouldBypassSharedCache(req.query) ? LIVE_HERO_NO_STORE_CACHE_CONTROL : LIVE_HERO_CACHE_CONTROL);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const forceRefresh = String(req.query?.refresh || '') === '1';
    const { live: liveMatches, source } = await getDltvLive({ forceRefresh });
    const liveHeroes = liveMatches.map(toLiveHeroPayload);
    const live = liveHeroes[0] || null;

    return res.status(200).json({
      live: live || null,
      liveMatches: liveHeroes,
      meta: {
        hasLive: liveHeroes.length > 0,
        liveCount: liveHeroes.length,
        generatedAt: new Date().toISOString(),
        source: liveHeroes.length > 0 ? 'dltv' : source,
      },
    });
  } catch (error) {
    console.error('[Live Hero API] Error:', error instanceof Error ? error.message : String(error));
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
      live: null,
      liveMatches: [],
      debug: null,
      meta: {
        hasLive: false,
        liveCount: 0,
        generatedAt: new Date().toISOString(),
        source: 'dltv',
      },
    });
  }
}
