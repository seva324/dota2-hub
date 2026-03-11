/**
 * Upcoming Series API
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
      console.error('[Upcoming API] Failed to create client:', e.message);
      return null;
    }
  }
  return sql;
}

// Normalize logo URL
function normalizeLogo(url, req) {
  return getMirroredAssetUrl(url, req);
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
    // Get upcoming series (status = 'upcoming' and start_time > now)
    const now = Math.floor(Date.now() / 1000);
    const parsedDays = Number.parseInt(String(req.query?.days ?? ''), 10);
    const days = Number.isFinite(parsedDays) && parsedDays > 0 ? Math.min(parsedDays, 14) : 2;
    const maxStartTime = now + days * 86400;

    const upcoming = await db`
      SELECT s.*, t.name as tournament_name, t.name_cn as tournament_name_cn, t.tier as tournament_tier
      FROM upcoming_series s
      LEFT JOIN tournaments t ON s.league_id = t.league_id
      WHERE s.start_time > ${now}
        AND s.start_time <= ${maxStartTime}
      ORDER BY s.start_time ASC
      LIMIT 50
    `;

    // Get teams for logo lookup
    const teams = await db`SELECT * FROM teams`;
    const teamMap = new Map();
    for (const t of teams) {
      teamMap.set(t.team_id, t);
    }

    const result = upcoming.map(s => {
      const radiantTeam = s.radiant_team_id ? teamMap.get(s.radiant_team_id) : null;
      const direTeam = s.dire_team_id ? teamMap.get(s.dire_team_id) : null;

      return {
        id: s.id,
        series_id: s.series_id ? String(s.series_id) : null,
        radiant_team_id: s.radiant_team_id,
        dire_team_id: s.dire_team_id,
        radiant_team_name: radiantTeam?.name || null,
        dire_team_name: direTeam?.name || null,
        radiant_team_logo: normalizeLogo(radiantTeam?.logo_url, req),
        dire_team_logo: normalizeLogo(direTeam?.logo_url, req),
        start_time: s.start_time,
        series_type: convertSeriesType(s.series_type),
        tournament_name: s.tournament_name || null,
        tournament_name_cn: s.tournament_name_cn || null,
        tier: s.tournament_tier || 'S',
        status: s.status
      };
    });

    return res.status(200).json({
      days,
      upcoming: result,
      teams: teams.map(t => ({
        team_id: t.team_id,
        name: t.name,
        name_cn: t.name_cn,
        tag: t.tag,
        logo_url: normalizeLogo(t.logo_url, req),
        region: t.region,
        is_cn_team: t.is_cn_team
      }))
    });
  } catch (e) {
    console.error('[Upcoming API] Error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
