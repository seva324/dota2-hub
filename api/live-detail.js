import { getDb } from '../lib/db.js';
import { getLiveDetail } from '../lib/server/live-detail-service.js';

const LIVE_DETAIL_CACHE_CONTROL = 'public, max-age=15, s-maxage=15, stale-while-revalidate=30';

function shouldBypassSharedCache(query) {
  return String(query?.refresh || '') === '1' || String(query?.debug || '') === '1';
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
  // 缓存表 series_id 为 BIGINT：非数字直接 400，避免 NaN 绑定触发 PG 类型错误
  if (!/^\d+$/.test(seriesId)) {
    return res.status(400).json({ error: 'invalid series_id' });
  }

  try {
    const db = getDb();
    const forceRefresh = String(req.query?.refresh || '') === '1';
    const result = await getLiveDetail(db, { seriesId, forceRefresh });

    if (!result || result.source === 'not_found') {
      // 查不到不缓存，避免 CDN 缓存 404 污染后续请求。
      res.setHeader('Cache-Control', 'no-store');
      return res.status(404).json({ error: 'live series not found', seriesId });
    }
    if (result.source === 'timeout') {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ ...result, cached: false });
    }
    if (result.source === 'error') {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(502).json({ error: 'upstream fetch failed', seriesId });
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error('[Live Detail API] Error:', error instanceof Error ? error.message : String(error));
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
}
