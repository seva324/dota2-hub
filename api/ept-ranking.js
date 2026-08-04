/**
 * EPT Ranking API
 * Data: dltv.org/teams (persisted to Neon, refreshed every 24h).
 * Falls back to hardcoded data when DLTV is unreachable.
 */

import { getRanking, RANKING_KEY_EPT } from '../lib/server/rankings-service.js';
import { getMirroredAssetUrl } from '../lib/asset-mirror.js';

const CACHE_CONTROL = 'public, max-age=300, s-maxage=300, stale-while-revalidate=86400';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const result = await getRanking(RANKING_KEY_EPT);
    const teams = result.teams.map((team) => ({
      ...team,
      logo: getMirroredAssetUrl(team.logo, req),
    }));
    res.setHeader('Cache-Control', CACHE_CONTROL);
    return res.status(200).json({
      teams,
      source: result.source,
      updatedAt: result.refreshedAt || undefined,
    });
  } catch (error) {
    console.error('[EPT Ranking] Error:', error instanceof Error ? error.message : String(error));
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
    return res.status(200).json({ teams: [], source: 'error', error: 'Internal error' });
  }
}
