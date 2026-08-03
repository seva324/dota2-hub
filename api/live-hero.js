import { getDb } from '../lib/db.js';
import { getLiveHeroPayloads } from '../lib/server/live-hero-service.js';

const LIVE_HERO_CACHE_CONTROL = 'public, max-age=30, s-maxage=30, stale-while-revalidate=60';
const LIVE_HERO_NO_STORE_CACHE_CONTROL = 'no-store';

function shouldBypassSharedCache(query) {
  return String(query?.refresh || '') === '1' || String(query?.debug || '') === '1';
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
    const db = getDb();
    const forceRefresh = String(req.query?.refresh || '') === '1';
    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 20));

    // HAWK live 链路（与小程序一致）：热缓存（Neon）30s 新鲜 + Neon hero_live_scores 持久化。
    // 传 req 让 hydratePayloadTeamLogos 走 curated/mirror/代理 解析 LOGO。
    const payloads = await getLiveHeroPayloads(db, {
      maxAgeSeconds: 180,
      limit,
      forceRefresh,
      req,
    });
    const liveHeroes = Array.isArray(payloads) ? payloads.filter(Boolean) : [];
    const live = liveHeroes[0] || null;

    // 无 live 时不缓存空响应，避免 CDN 缓存空数据污染后续请求。
    if (liveHeroes.length === 0) {
      res.setHeader('Cache-Control', 'no-store');
    }

    return res.status(200).json({
      live: live || null,
      liveMatches: liveHeroes,
      meta: {
        hasLive: liveHeroes.length > 0,
        liveCount: liveHeroes.length,
        generatedAt: new Date().toISOString(),
        source: liveHeroes.length > 0 ? 'hawk' : 'none',
      },
    });
  } catch (error) {
    console.error('[Live Hero API] Error:', error instanceof Error ? error.message : String(error));
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
      live: null,
      liveMatches: [],
      meta: {
        hasLive: false,
        liveCount: 0,
        generatedAt: new Date().toISOString(),
        source: 'none',
      },
    });
  }
}
