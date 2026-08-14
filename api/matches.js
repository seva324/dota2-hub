/**
 * Matches API
 * Data: DLTV (https://dltv.org/results — "match finished" cards)
 * `?__mp` 路由保留给微信小程序，走 Neon DB。
 */

import { getDb } from '../lib/db.js';
import { getDltvResults } from '../lib/server/dltv-matches-service.js';
import { prewarmMatchPages } from '../lib/server/dltv-match-page-service.js';
import { handleMpRoute } from '../lib/server/mp-route-handler.js';
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

/** 从 DLTV matchUrl（/matches/<seriesId>/<slug>）提取详情页 slug。 */
function extractSlugFromMatchUrl(matchUrl) {
  if (!matchUrl) return undefined;
  const match = String(matchUrl).match(/\/matches\/\d+\/([^/?#]+)/i);
  return match?.[1] || undefined;
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

  // 微信小程序路由：保留 DB 支持。
  if (req.query?.__mp) {
    const db = getDb();
    if (!db) return res.status(500).json({ error: 'Database not available' });
    return handleMpRoute(req, res, db);
  }

  const requestedLimit = Math.max(1, Math.min(500, Number(req.query.limit) || 24));

  try {
    const { results, source } = await getDltvResults();

    // 首页结果列表很快（results 走 live 同源列表抓取 + 2min 缓存），顺手后台预热一个
    // 更广的详情页集合（前 12 场）：用户点击 results/upcoming 卡片时更可能命中 match-page
    // 缓存，减少冷抓取超时。fire-and-forget，不阻塞本次响应；内部按 3 并发分批，防 dltv 限流。
    prewarmMatchPages(
      results.slice(0, 12).map((row) => ({
        seriesId: row.seriesId,
        slug: extractSlugFromMatchUrl(row.matchUrl),
      })),
    );

    const formatted = results.slice(0, requestedLimit).map((row) => ({
      match_id: row.seriesId ? String(row.seriesId) : null,
      series_id: row.seriesId ? String(row.seriesId) : null,
      radiant_team_id: null,
      dire_team_id: null,
      radiant_team_name: row.radiantName || null,
      dire_team_name: row.direName || null,
      radiant_team_logo: resolveLogo(row.radiantName, row.radiantLogo, req),
      dire_team_logo: resolveLogo(row.direName, row.direLogo, req),
      radiant_score: row.radiantScore ?? null,
      dire_score: row.direScore ?? null,
      radiant_win: (row.radiantScore ?? 0) > (row.direScore ?? 0) ? 1 : 0,
      start_time: row.startTime ?? null,
      duration: null,
      league_id: null,
      tournament_name: row.tournament || null,
      series_type: row.bestOf || 'BO3',
      status: 'completed',
      match_url: row.matchUrl || null,
      event_slug: extractEventSlug(row.eventUrl),
    }));

    // 抓取失败时 source='failed'：不缓存空响应，避免 CDN 缓存污染后续请求。
    if (formatted.length === 0 || source === 'failed') {
      res.setHeader('Cache-Control', 'no-store');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=180');
    }
    res.setHeader('X-DLTV-Source', source);
    return res.status(200).json(formatted);
  } catch (e) {
    console.error('[Matches API] Error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
