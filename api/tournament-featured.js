import {
  fetchFeaturedTournamentPayload,
  resolveFeaturedTournamentDefinition,
} from '../lib/server/featured-tournament.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const tournamentId = String(req.query?.tournamentId || '').trim();
  if (!tournamentId) {
    return res.status(400).json({ error: 'tournamentId is required' });
  }

  const definition = resolveFeaturedTournamentDefinition(tournamentId);
  if (!definition) {
    return res.status(404).json({ error: 'Featured tournament not configured' });
  }

  try {
    const payload = await fetchFeaturedTournamentPayload(tournamentId);
    if (!payload) {
      return res.status(404).json({ error: 'Featured tournament not found' });
    }
    return res.status(200).json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load featured tournament';
    console.error('[Featured Tournament API] Error:', message);
    return res.status(500).json({ error: message });
  }
}
