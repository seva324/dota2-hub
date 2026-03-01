/**
 * 获取即将开始的比赛 API
 */

import fs from 'fs';
import path from 'path';
import { neon } from '@neondatabase/serverless';
import { mapTier } from './utils/tier-mapper.js';

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

function getDb() {
  if (!DATABASE_URL) return null;
  return neon(DATABASE_URL);
}

function getTeams() {
  try {
    const localPath = path.join(process.cwd(), 'public', 'data', 'teams.json');
    const data = fs.readFileSync(localPath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('[Upcoming API] Error reading teams:', error);
    return [];
  }
}

function createTeamLogoMap(teams) {
  const logoMap = new Map();
  teams.forEach(team => {
    logoMap.set(team.name.toLowerCase(), team.logo_url);
    if (team.name_cn) {
      logoMap.set(team.name_cn.toLowerCase(), team.logo_url);
    }
    if (team.tag) {
      logoMap.set(team.tag.toLowerCase(), team.logo_url);
    }
  });
  return logoMap;
}

function findTeamLogo(logoMap, teamName) {
  if (!teamName) return null;
  const normalizedName = teamName.toLowerCase().trim();
  if (logoMap.has(normalizedName)) {
    return logoMap.get(normalizedName);
  }
  for (const [key, logoUrl] of logoMap.entries()) {
    if (key.length <= 2) continue;
    if (normalizedName.includes(key) || key.includes(normalizedName)) {
      return logoUrl;
    }
  }
  return null;
}

// Normalize logo URL to use correct Steam CDN domain
function normalizeLogoUrl(url) {
  if (!url) return null;
  return url.replace('steamcdn-a.akamaihd.net', 'cdn.steamstatic.com');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const db = getDb();

    if (!db) {
      return res.status(200).json([]);
    }

    // Query Neon directly
    const matches = await db`
      SELECT * FROM upcoming_matches
      ORDER BY start_time ASC
      LIMIT 50
    `;

    if (matches.length === 0) {
      return res.status(200).json([]);
    }

    // Add logos and tier
    const teams = getTeams();
    const logoMap = createTeamLogoMap(teams);

    const now = Math.floor(Date.now() / 1000);
    const result = matches
      .filter(m => m.start_time > now)
      .map(m => ({
        id: m.id,
        match_id: m.match_id,
        radiant_team_name: m.radiant_team_name,
        radiant_team_name_cn: m.radiant_team_name_cn,
        radiant_team_logo: normalizeLogoUrl(findTeamLogo(logoMap, m.radiant_team_name) || findTeamLogo(logoMap, m.radiant_team_name_cn)),
        dire_team_name: m.dire_team_name,
        dire_team_name_cn: m.dire_team_name_cn,
        dire_team_logo: normalizeLogoUrl(findTeamLogo(logoMap, m.dire_team_name) || findTeamLogo(logoMap, m.dire_team_name_cn)),
        start_time: m.start_time,
        series_type: m.series_type,
        tournament_name: m.tournament_name,
        tournament_name_cn: m.tournament_name_cn,
        tier: mapTier(m.tournament_name, m.league_id),
        status: m.status,
        source: m.source
      }));

    return res.status(200).json(result);
  } catch (error) {
    console.error('[Upcoming] Error:', error.message);
    return res.status(200).json([]);
  }
}
