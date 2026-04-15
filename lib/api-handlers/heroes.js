import { neon } from '@neondatabase/serverless';
import { getMirroredAssetUrl } from '../asset-mirror.js';

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

let sql = null;

function getDb() {
  if (!sql && DATABASE_URL) {
    try {
      sql = neon(DATABASE_URL);
    } catch (e) {
      console.error('[Heroes API] Failed to create client:', e.message);
      return null;
    }
  }
  return sql;
}

async function ensureTable(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS heroes (
      hero_id INTEGER PRIMARY KEY,
      name VARCHAR(255),
      name_cn VARCHAR(255),
      img VARCHAR(255),
      img_url VARCHAR(500),
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
      SELECT hero_id, name, name_cn, img, img_url
      FROM heroes
      ORDER BY hero_id ASC
    `);

    const payload = {};
    for (const row of rows) {
      payload[String(row.hero_id)] = {
        id: Number(row.hero_id),
        name: row.name || null,
        name_cn: row.name_cn || row.name || null,
        img: row.img || null,
        img_url: getMirroredAssetUrl(row.img_url || (row.img ? `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/heroes/${row.img}_lg.png` : null), req)
      };
    }

    return res.status(200).json(payload);
  } catch (e) {
    console.error('[Heroes API] Error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
