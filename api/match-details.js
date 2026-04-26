import { getDb } from '../lib/db.js';
import { loadMatchDetailPayload } from '../lib/server/mp-api.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const db = getDb();
  if (!db) return res.status(500).json({ error: 'DATABASE_URL not configured' });

  const raw = req.query.match_id ?? req.query.matchId;
  const matchId = Number(raw);
  if (!Number.isFinite(matchId)) {
    return res.status(400).json({ error: 'Invalid match_id' });
  }

  try {
    const payload = await loadMatchDetailPayload(db, Math.trunc(matchId));
    if (!payload) {
      return res.status(404).json({ error: 'Match detail not found in database' });
    }

    return res.status(200).json(payload);
  } catch (e) {
    console.error('[MatchDetails API] Error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
