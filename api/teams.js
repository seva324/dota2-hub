/**
 * Teams API
 * Data: Neon PostgreSQL
 */

import { neon } from '@neondatabase/serverless';
import { getMirroredAssetUrl } from '../lib/asset-mirror.js';

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

let sql = null;

function getDb() {
  if (!sql && DATABASE_URL) {
    try {
      sql = neon(DATABASE_URL);
    } catch (e) {
      console.error('[Teams API] Failed to create client:', e.message);
      return null;
    }
  }
  return sql;
}

function normalizeLogo(url, req) {
  return getMirroredAssetUrl(url, req);
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
    const colRows = await db.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'teams'`
    );
    const available = new Set(colRows.map((r) => String(r.column_name)));

    const baseFields = ['team_id', 'name', 'name_cn', 'tag', 'logo_url', 'region'];
    const optionalFields = ['id', 'is_cn_team'].filter((f) => available.has(f));
    const selectFields = [...baseFields.filter((f) => available.has(f)), ...optionalFields];

    const rows = await db.query(`SELECT ${selectFields.join(', ')} FROM teams`);

    const teams = rows.map((team) => ({
      team_id: team.team_id ? String(team.team_id) : null,
      id: team.id ? String(team.id) : null,
      name: team.name || null,
      name_cn: team.name_cn || null,
      tag: team.tag || null,
      logo_url: normalizeLogo(team.logo_url, req),
      region: team.region || null,
      is_cn_team: team.is_cn_team
    }));

    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=1800, stale-while-revalidate=3600');
    return res.status(200).json(teams);
  } catch (e) {
    console.error('[Teams API] Error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
