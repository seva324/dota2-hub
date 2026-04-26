/**
 * Matches API
 * Data: Neon PostgreSQL
 */

import { getDb } from '../lib/db.js';
import { getMirroredAssetUrl } from '../lib/asset-mirror.js';
import { handleMpRoute } from '../lib/server/mp-route-handler.js';

function normalizeLogo(url, req) {
  return getMirroredAssetUrl(url, req);
}

function convertSeriesType(seriesType) {
  if (seriesType === null || seriesType === undefined || seriesType === '') return 'BO3';
  const map = {
    0: 'BO1',
    1: 'BO3',
    2: 'BO5',
    3: 'BO2'
  };
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

  if (req.query?.__mp) {
    return handleMpRoute(req, res, db);
  }

  try {
    const normalize = (value) => String(value || '').trim().toLowerCase();
    const requestedTeamId = req.query.team_id ? String(req.query.team_id).trim() : '';
    const requestedTeamName = req.query.team_name ? String(req.query.team_name).trim() : '';
    const requestedLimit = Math.max(
      1,
      Math.min(
        500,
        Number(req.query.limit) || (requestedTeamId || requestedTeamName ? 120 : 200)
      )
    );

    let teamIds = [];
    if (requestedTeamId) {
      teamIds = [requestedTeamId];
    } else if (requestedTeamName) {
      const needle = normalize(requestedTeamName);
      const matchingTeams = await db`
        SELECT team_id FROM teams
        WHERE LOWER(name) = ${needle}
           OR LOWER(tag) = ${needle}
           OR LOWER(COALESCE(name_cn, '')) = ${needle}
        LIMIT 5
      `;
      teamIds = matchingTeams.map((t) => String(t.team_id)).filter(Boolean);
    }

    let matches;
    if (teamIds.length > 0) {
      matches = await db.query(
        `
          SELECT m.*, s.league_id,
                 rt.name AS radiant_team_name, rt.logo_url AS radiant_team_logo,
                 dt.name AS dire_team_name, dt.logo_url AS dire_team_logo
          FROM matches m
          LEFT JOIN series s ON m.series_id = s.series_id
          LEFT JOIN teams rt ON rt.team_id = m.radiant_team_id
          LEFT JOIN teams dt ON dt.team_id = m.dire_team_id
          WHERE CAST(m.radiant_team_id AS TEXT) = ANY($1::text[])
             OR CAST(m.dire_team_id AS TEXT) = ANY($1::text[])
          ORDER BY m.start_time DESC
          LIMIT $2
        `,
        [teamIds, requestedLimit]
      );
    } else {
      matches = await db.query(
        `
          SELECT m.*, s.league_id,
                 rt.name AS radiant_team_name, rt.logo_url AS radiant_team_logo,
                 dt.name AS dire_team_name, dt.logo_url AS dire_team_logo
          FROM matches m
          LEFT JOIN series s ON m.series_id = s.series_id
          LEFT JOIN teams rt ON rt.team_id = m.radiant_team_id
          LEFT JOIN teams dt ON dt.team_id = m.dire_team_id
          ORDER BY m.start_time DESC
          LIMIT $1
        `,
        [requestedLimit]
      );
    }

    const formatted = matches.map((m) => ({
      match_id: String(m.match_id),
      series_id: m.series_id ? String(m.series_id) : null,
      radiant_team_id: m.radiant_team_id,
      dire_team_id: m.dire_team_id,
      radiant_team_name: m.radiant_team_name || null,
      dire_team_name: m.dire_team_name || null,
      radiant_team_logo: normalizeLogo(m.radiant_team_logo, req),
      dire_team_logo: normalizeLogo(m.dire_team_logo, req),
      radiant_score: m.radiant_score,
      dire_score: m.dire_score,
      radiant_win: m.radiant_win ? 1 : 0,
      start_time: m.start_time,
      duration: m.duration,
      league_id: m.league_id,
      series_type: convertSeriesType(m.series_type),
      status: m.status,
    }));

    return res.status(200).json(formatted);
  } catch (e) {
    console.error('[Matches API] Error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
