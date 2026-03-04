import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
let sql = null;

function getDb() {
  if (!sql && DATABASE_URL) {
    sql = neon(DATABASE_URL);
  }
  return sql;
}

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
    await db`
      CREATE TABLE IF NOT EXISTS match_details (
        match_id BIGINT PRIMARY KEY,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    const rows = await db`
      SELECT payload
      FROM match_details
      WHERE match_id = ${Math.trunc(matchId)}
      LIMIT 1
    `;

    if (!rows.length) {
      return res.status(404).json({ error: 'Match detail not found in database' });
    }

    return res.status(200).json(rows[0].payload);
  } catch (e) {
    console.error('[MatchDetails API] Error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
