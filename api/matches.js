/**
 * 获取比赛数据 API
 * 数据源: Neon PostgreSQL (primary), Local JSON (fallback)
 */

import { neon } from '@neondatabase/serverless';
import fs from 'fs';
import path from 'path';

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

let sql = null;

function getDb() {
  if (!sql && DATABASE_URL) {
    try {
      sql = neon(DATABASE_URL);
    } catch (error) {
      console.error('[Matches API] Failed to create Neon client:', error.message);
      return null;
    }
  }
  return sql;
}

// Fallback to local JSON file
function getLocalMatches() {
  try {
    const localPath = path.join(process.cwd(), 'public', 'data', 'matches.json');
    const data = fs.readFileSync(localPath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading local matches:', error);
    return [];
  }
}

// Normalize logo URL to use correct Steam CDN domain
function normalizeLogoUrl(url) {
  if (!url) return null;
  return url.replace('steamcdn-a.akamaihd.net', 'cdn.steamstatic.com');
}

// Query matches from Neon
async function getMatchesFromNeon(db) {
  if (!db) return null;

  try {
    const matches = await db`
      SELECT match_id, radiant_team_id, radiant_team_name, radiant_team_name_cn,
             radiant_team_logo, dire_team_id, dire_team_name, dire_team_name_cn,
             dire_team_logo, radiant_score, dire_score, radiant_win,
             start_time, duration, league_id, series_type, status
      FROM matches
      ORDER BY start_time DESC
      LIMIT 500
    `;

    if (matches.length === 0) {
      return null;
    }

    return matches.map(m => ({
      match_id: String(m.match_id),
      radiant_team_id: m.radiant_team_id || 'unknown',
      radiant_team_name: m.radiant_team_name || null,
      radiant_team_name_cn: m.radiant_team_name_cn,
      radiant_team_logo: normalizeLogoUrl(m.radiant_team_logo),
      dire_team_id: m.dire_team_id || 'unknown',
      dire_team_name: m.dire_team_name || null,
      dire_team_name_cn: m.dire_team_name_cn,
      dire_team_logo: normalizeLogoUrl(m.dire_team_logo),
      radiant_score: m.radiant_score || 0,
      dire_score: m.dire_score || 0,
      radiant_win: m.radiant_win ? 1 : 0,
      // radiant_game_wins/dire_game_wins 需要通过 series_id 查询系列赛所有比赛来计算，暂时使用 radiant_win 作为单场结果
      radiant_game_wins: m.radiant_win ? 1 : 0,
      dire_game_wins: m.radiant_win ? 0 : 1,
      start_time: m.start_time,
      duration: m.duration,
      league_id: m.league_id,
      series_type: m.series_type || 'BO3',
      status: m.status
    }));
  } catch (e) {
    console.error('[Matches API] Neon query failed:', e.message);
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Try Neon first
    const db = getDb();
    if (db) {
      const neonData = await getMatchesFromNeon(db);
      if (neonData && neonData.length > 0) {
        console.log('[Matches API] Found data in Neon');
        return res.status(200).json(neonData);
      }
    }

    // Fallback to local JSON file
    console.log('[Matches API] Using local JSON fallback');
    const localMatches = getLocalMatches();
    const sortedMatches = localMatches
      .sort((a, b) => b.start_time - a.start_time)
      .slice(0, 500);
    return res.status(200).json(sortedMatches);
  } catch (error) {
    console.error('Error:', error);
    // Fallback to local JSON on error
    const localMatches = getLocalMatches();
    const sortedMatches = localMatches
      .sort((a, b) => b.start_time - a.start_time)
      .slice(0, 500);
    return res.status(200).json(sortedMatches);
  }
}
