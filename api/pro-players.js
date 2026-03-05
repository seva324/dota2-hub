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
      name_cn VARCHAR(255),
      team_id BIGINT,
      team_name VARCHAR(255),
      country_code VARCHAR(8),
      avatar_url TEXT,
      realname VARCHAR(255),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await db.query(`ALTER TABLE pro_players ADD COLUMN IF NOT EXISTS name_cn VARCHAR(255)`);
  await db.query(`ALTER TABLE pro_players ADD COLUMN IF NOT EXISTS team_id BIGINT`);
  await db.query(`ALTER TABLE pro_players ADD COLUMN IF NOT EXISTS country_code VARCHAR(8)`);
  await db.query(`ALTER TABLE pro_players ADD COLUMN IF NOT EXISTS avatar_url TEXT`);
  await db.query(`ALTER TABLE pro_players ADD COLUMN IF NOT EXISTS birth_date DATE`);
  await db.query(`ALTER TABLE pro_players ADD COLUMN IF NOT EXISTS birth_year INTEGER`);
  await db.query(`ALTER TABLE pro_players ADD COLUMN IF NOT EXISTS birth_month INTEGER`);
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
      SELECT account_id, name, name_cn, team_id, team_name, country_code, avatar_url, realname, birth_date, birth_year, birth_month
      FROM pro_players
      ORDER BY updated_at DESC NULLS LAST, account_id ASC
    `);

    const payload = {};
    for (const row of rows) {
      payload[String(row.account_id)] = {
        name: row.name || null,
        name_cn: row.name_cn || null,
        team_id: row.team_id !== null && row.team_id !== undefined ? String(row.team_id) : null,
        team_name: row.team_name || null,
        country_code: row.country_code || null,
        avatar_url: row.avatar_url || null,
        realname: row.realname || null,
        birth_date: row.birth_date || null,
        birth_year: row.birth_year ?? null,
        birth_month: row.birth_month ?? null
      };
    }

    return res.status(200).json(payload);
  } catch (e) {
    console.error('[ProPlayers API] Error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
