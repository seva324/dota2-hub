/**
 * Upcoming Series API
 * Data: DLTV (https://dltv.org/matches — "match upcoming" cards)
 */

import { getDltvUpcoming } from '../lib/server/dltv-matches-service.js';
import { enrichUpcomingWithEventMatches } from '../lib/server/event-upcoming-enrichment.js';
import { getCuratedTeamLogoGithubUrl } from '../lib/team-logo-overrides.js';
import { getMirroredAssetUrl } from '../lib/asset-mirror.js';

// DLTV logo paths are relative (e.g. /uploads/teams/...). Prefer curated
// GitHub logos for top teams; otherwise qualify with the DLTV origin.
// 最终走 /api/asset-image 代理，保证国内浏览器可加载。
function resolveLogo(name, relativeLogo, req) {
  const curated = getCuratedTeamLogoGithubUrl({ name });
  const raw = curated || (relativeLogo ? `https://dltv.org${relativeLogo.startsWith('/') ? '' : '/'}${relativeLogo}` : null);
  if (!raw) return null;
  return getMirroredAssetUrl(raw, req);
}

/** 从 DLTV eventUrl（/events/<slug>）提取赛事 slug，供前端"赛事名→赛事详情"跳转。 */
function extractEventSlug(eventUrl) {
  const match = String(eventUrl || '').match(/\/events\/([^/?#]+)/i);
  return match ? decodeURIComponent(match[1]) : null;
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
    // base = DLTV /matches 的 upcoming（通常只有最近一天少量场次）。
    // 富化：按 event_slug 拉赛事页 matches 并入，去重后让主列表显示完整 upcoming。
    const { upcoming: baseUpcoming, source } = await getDltvUpcoming();
    const upcoming = await enrichUpcomingWithEventMatches(baseUpcoming, { fetchImpl: req.fetchImpl });

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
        radiant_team_logo: resolveLogo(row.radiantName, row.radiantLogo, req),
        dire_team_logo: resolveLogo(row.direName, row.direLogo, req),
        start_time: row.timestamp,
        series_type: row.bestOf || 'BO3',
        tournament_name: row.tournament || null,
        tournament_name_cn: null,
        tier: 'S',
        status: 'upcoming',
        match_url: row.matchUrl || null,
        event_slug: extractEventSlug(row.eventUrl),
      }));

    // 抓取失败时 source='failed'：不缓存空响应，避免 CDN 缓存污染后续请求。
    if (result.length === 0 || source === 'failed') {
      res.setHeader('Cache-Control', 'no-store');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30, stale-while-revalidate=120');
    }
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
