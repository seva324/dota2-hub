import { neon } from '@neondatabase/serverless';
import { getMirroredAssetUrl } from '../lib/asset-mirror.js';

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

function parseAccountId(rawValue) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return null;
  const normalized = Math.trunc(parsed);
  return normalized > 0 ? normalized : null;
}

function mapRow(row, req) {
  return {
    name: row.name || null,
    name_cn: row.name_cn || null,
    team_id: row.team_id !== null && row.team_id !== undefined ? String(row.team_id) : null,
    team_name: row.team_name || null,
    country_code: row.country_code || null,
    avatar_url: getMirroredAssetUrl(row.avatar_url || null, req),
    realname: row.realname || null,
    birth_date: row.birth_date || null,
    birth_year: row.birth_year ?? null,
    birth_month: row.birth_month ?? null,
  };
}

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

  const db = getDb();
  if (!db) {
    return res.status(500).json({ error: 'Database not available' });
  }

  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');

  try {
    const accountId = parseAccountId(req.query.account_id ?? req.query.accountId);

    if (accountId) {
      const rows = await db`
        SELECT account_id, name, name_cn, team_id, team_name, country_code, avatar_url, realname, birth_date, birth_year, birth_month
        FROM pro_players
        WHERE account_id = ${accountId}
        LIMIT 1
      `;

      const row = rows[0];
      return res.status(200).json(row ? mapRow(row, req) : null);
    }

    const rows = await db.query(`
      SELECT account_id, name, name_cn, team_id, team_name, country_code, avatar_url, realname, birth_date, birth_year, birth_month
      FROM pro_players
      ORDER BY updated_at DESC NULLS LAST, account_id ASC
    `);

    const payload = {};
    for (const row of rows) {
      payload[String(row.account_id)] = mapRow(row, req);
    }

    return res.status(200).json(payload);
  } catch (e) {
    console.error('[ProPlayers API] Error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
