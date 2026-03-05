import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

let sql = null;

function getDb() {
  if (!sql && DATABASE_URL) {
    try {
      sql = neon(DATABASE_URL);
    } catch (e) {
      console.error('[ProPlayers API] Failed to create client:', e.message);
      return null;
    }
  }
  return sql;
}

async function ensureTable(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS pro_players (
      account_id BIGINT PRIMARY KEY,
      name VARCHAR(255),
      team_name VARCHAR(255),
      realname VARCHAR(255),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const db = getDb();
  if (!db) {
    return res.status(500).json({ error: 'Database not available' });
  }

  try {
    await ensureTable(db);
    const rows = await db.query(`
      SELECT account_id, name, team_name, realname
      FROM pro_players
      ORDER BY updated_at DESC NULLS LAST, account_id ASC
    `);

    const payload = {};
    for (const row of rows) {
      payload[String(row.account_id)] = {
        name: row.name || null,
        team_name: row.team_name || null,
        realname: row.realname || null
      };
    }

    return res.status(200).json(payload);
  } catch (e) {
    console.error('[ProPlayers API] Error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
