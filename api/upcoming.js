/**
 * Upcoming Series API
 * Data: DLTV (https://dltv.org/matches — "match upcoming" cards)
 */

import { getDltvUpcoming } from '../lib/server/dltv-matches-service.js';
import { getCuratedTeamLogoGithubUrl } from '../lib/team-logo-overrides.js';

// DLTV logo paths are relative (e.g. /uploads/teams/...). Prefer curated
// GitHub logos for top teams; otherwise qualify with the DLTV origin.
function resolveLogo(name, relativeLogo) {
  const curated = getCuratedTeamLogoGithubUrl({ name });
  if (curated) return curated;
  if (relativeLogo) return `https://dltv.org${relativeLogo.startsWith('/') ? '' : '/'}${relativeLogo}`;
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const parsedDays = Number.parseInt(String(req.query?.days ?? ''), 10);
  const days = Number.isFinite(parsedDays) && parsedDays > 0 ? Math.min(parsedDays, 14) : 7;

  try {
    const { upcoming, source } = await getDltvUpcoming();

    const result = upcoming
      .filter((row) => row.timestamp >= Math.floor(Date.now() / 1000))
      .map((row) => ({
        id: row.seriesId ? String(row.seriesId) : null,
        series_id: row.seriesId ? String(row.seriesId) : null,
        radiant_team_id: null,
        dire_team_id: null,
        radiant_team_name: row.radiantName || null,
        dire_team_name: row.direName || null,
        radiant_team_name_cn: null,
        dire_team_name_cn: null,
        radiant_team_logo: resolveLogo(row.radiantName, row.radiantLogo),
        dire_team_logo: resolveLogo(row.direName, row.direLogo),
        start_time: row.timestamp,
        series_type: row.bestOf || 'BO3',
        tournament_name: row.tournament || null,
        tournament_name_cn: null,
        tier: 'S',
        status: 'upcoming',
        match_url: row.matchUrl || null,
      }));

    res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30, stale-while-revalidate=120');
    res.setHeader('X-DLTV-Source', source);
    return res.status(200).json({
      days,
      upcoming: result,
      teams: [],
    });
  } catch (e) {
    console.error('[Upcoming API] Error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
