import { getLiveDetail } from '../lib/server/live-detail-service.js';
import { getMirroredAssetUrl } from '../lib/asset-mirror.js';

// 高频实时走 CDN：15s 缓存挡掉大部分轮询，回源时才抓 hawk.live，全程不碰 Neon。
const LIVE_DETAIL_CACHE_CONTROL = 'public, max-age=15, s-maxage=15, stale-while-revalidate=30';

function shouldBypassSharedCache(query) {
  return String(query?.refresh || '') === '1' || String(query?.debug || '') === '1';
}

/** hawk 队标 URL 统一走 mirror → 代理 → 原样，与全站一致。 */
function rebaseLogo(url, req) {
  if (!url) return null;
  return getMirroredAssetUrl(url, req) || url;
}

function rebaseTeamLogo(payload, req) {
  if (!payload?.team1 && !payload?.team2) return payload;
  return {
    ...payload,
    team1: payload.team1 ? { ...payload.team1, logoUrl: rebaseLogo(payload.team1.logoUrl, req) } : payload.team1,
    team2: payload.team2 ? { ...payload.team2, logoUrl: rebaseLogo(payload.team2.logoUrl, req) } : payload.team2,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', shouldBypassSharedCache(req.query) ? 'no-store' : LIVE_DETAIL_CACHE_CONTROL);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const seriesId = String(req.query?.series_id || '').trim();
  if (!seriesId) {
    return res.status(400).json({ error: 'missing series_id' });
  }
  if (!/^\d+$/.test(seriesId)) {
    return res.status(400).json({ error: 'invalid series_id' });
  }

  try {
    // 前端 live 卡片已带 hawk slug（见 LiveHeroPayload），用于构造 detail URL，避免回源抓首页匹配。
    const slug = String(req.query?.slug || '').trim() || null;
    const champ = String(req.query?.champ || '').trim() || null;
    const forceRefresh = String(req.query?.refresh || '') === '1';
    const result = await getLiveDetail({ seriesId, slug, champ, forceRefresh });

    if (!result || result.source === 'not_found') {
      // 查不到不缓存，避免 CDN 缓存 404 污染后续请求。
      res.setHeader('Cache-Control', 'no-store');
      return res.status(404).json({ error: 'live series not found', seriesId });
    }
    if (result.source === 'timeout') {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ ...rebaseTeamLogo(result, req), cached: false });
    }
    if (result.source === 'error') {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(502).json({ error: 'upstream fetch failed', seriesId });
    }

    return res.status(200).json(rebaseTeamLogo(result, req));
  } catch (error) {
    console.error('[Live Detail API] Error:', error instanceof Error ? error.message : String(error));
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
}
