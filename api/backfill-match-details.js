import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const OPENDOTA = 'https://api.opendota.com/api';
let sql = null;

function getDb() {
  if (!sql && DATABASE_URL) {
    sql = neon(DATABASE_URL);
  }
  return sql;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const db = getDb();
  if (!db) return res.status(500).json({ error: 'DATABASE_URL not configured' });

  const limit = Math.max(1, Math.min(50, Number(req.query.limit || req.body?.limit || 20)));
  const delayMs = Math.max(200, Math.min(5000, Number(req.query.delay_ms || req.body?.delay_ms || 1100)));

  try {
    await db`
      CREATE TABLE IF NOT EXISTS match_details (
        match_id BIGINT PRIMARY KEY,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    const targets = await db`
      SELECT m.match_id
      FROM matches m
      LEFT JOIN match_details d ON d.match_id = m.match_id
      WHERE d.match_id IS NULL
      ORDER BY m.start_time DESC
      LIMIT ${limit}
    `;

    let inserted = 0;
    let failed = 0;

    for (const row of targets) {
      const matchId = Number(row.match_id);
      if (!Number.isFinite(matchId)) continue;
      try {
        const detail = await fetchJSON(`${OPENDOTA}/matches/${matchId}`);
        await db`
          INSERT INTO match_details (match_id, payload, updated_at)
          VALUES (${Math.trunc(matchId)}, ${JSON.stringify(detail)}::jsonb, NOW())
          ON CONFLICT (match_id) DO UPDATE SET
            payload = EXCLUDED.payload,
            updated_at = NOW()
        `;
        inserted += 1;
      } catch (e) {
        failed += 1;
        console.error(`[Backfill MatchDetails] ${matchId} failed:`, e.message);
      }
      await sleep(delayMs);
    }

    return res.status(200).json({
      success: true,
      scanned: targets.length,
      inserted,
      failed,
      limit,
      delayMs
    });
  } catch (e) {
    console.error('[Backfill MatchDetails] Error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
