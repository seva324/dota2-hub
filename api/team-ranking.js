/**
 * Team Ranking API
 * Data: dltv.org/ranking (live scrape + in-memory hot cache)
 */

import { getDltvTeamRanking } from '../lib/server/dltv-ranking-service.js';
import { getMirroredAssetUrl } from '../lib/asset-mirror.js';

function resolvePlayerPhoto(photo, req) {
  return getMirroredAssetUrl(photo, req);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const result = await getDltvTeamRanking();
    if (result.teams.length === 0) {
      return res.status(503).json({ error: 'Ranking temporarily unavailable', teams: [] });
    }
    const teams = result.teams.map((team) => ({
      ...team,
      logo: getMirroredAssetUrl(team.logo, req),
      players: team.players.map((player) => ({
        ...player,
        photo: resolvePlayerPhoto(player.photo, req),
      })),
    }));
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600, stale-while-revalidate=1800');
    return res.status(200).json({
      teams,
      source: result.source,
      updatedAt: result.refreshedAt,
    });
  } catch (error) {
    console.error('[Team Ranking API] Error:', error instanceof Error ? error.message : String(error));
    return res.status(500).json({ error: 'Internal error', teams: [] });
  }
}
