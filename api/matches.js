/**
 * Matches API
 * Data: Neon PostgreSQL
 */

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

let sql = null;

function getDb() {
  if (!sql && DATABASE_URL) {
    try {
      sql = neon(DATABASE_URL);
    } catch (e) {
      console.error('[Matches API] Failed to create client:', e.message);
      return null;
    }
  }
  return sql;
}

// Normalize logo URL
function normalizeLogo(url) {
  if (!url) return null;
  return url.replace('steamcdn-a.akamaihd.net', 'cdn.steamstatic.com');
}

// Convert OpenDota series_type to human-readable format
// OpenDota: 0=BO1, 1=BO3, 2=BO5, 3=BO2
function convertSeriesType(seriesType) {
  if (seriesType === null || seriesType === undefined || seriesType === '') return 'BO3';
  const map = {
    0: 'BO1',
    1: 'BO3',
    2: 'BO5',
    3: 'BO2'
  };
  // If already a string (e.g., 'BO3'), return as-is
  if (typeof seriesType === 'string') {
    const normalized = seriesType.toUpperCase();
    if (normalized.startsWith('BO')) return normalized;
    const parsed = Number(seriesType);
    return Number.isInteger(parsed) && map[parsed] ? map[parsed] : 'BO3';
  }
  return map[seriesType] || 'BO3';
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
    // Get teams for lookup
    const teams = await db`SELECT * FROM teams`;
    const teamMap = new Map();
    for (const t of teams) {
      teamMap.set(t.team_id, t);
    }

    // Get matches
    const matches = await db`
      SELECT m.*, s.league_id
      FROM matches m
      LEFT JOIN series s ON m.series_id = s.series_id
      ORDER BY m.start_time DESC
      LIMIT 500
    `;

    const formatted = matches.map(m => {
      const radiantTeam = m.radiant_team_id ? teamMap.get(m.radiant_team_id) : null;
      const direTeam = m.dire_team_id ? teamMap.get(m.dire_team_id) : null;

      return {
        match_id: String(m.match_id),
        series_id: m.series_id ? String(m.series_id) : null,
        radiant_team_id: m.radiant_team_id,
        dire_team_id: m.dire_team_id,
        radiant_team_name: radiantTeam?.name || null,
        dire_team_name: direTeam?.name || null,
        radiant_team_logo: normalizeLogo(radiantTeam?.logo_url),
        dire_team_logo: normalizeLogo(direTeam?.logo_url),
        radiant_score: m.radiant_score,
        dire_score: m.dire_score,
        radiant_win: m.radiant_win ? 1 : 0,
        start_time: m.start_time,
        duration: m.duration,
        league_id: m.league_id,
        series_type: convertSeriesType(m.series_type),
        status: m.status
      };
    });

    return res.status(200).json(formatted);
  } catch (e) {
    console.error('[Matches API] Error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
