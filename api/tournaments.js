/**
 * 获取赛事数据 API
 * 数据源: Redis (由 sync-opendota API 写入)
 * 回退: 本地 JSON 文件
 */

import fs from 'fs';
import path from 'path';

const REDIS_URL = process.env.REDIS_URL;

// Redis client singleton
let redis = null;

async function getRedis() {
  if (!redis && REDIS_URL) {
    const { createClient } = await import('redis');
    redis = createClient({ url: REDIS_URL });
    await redis.connect();
  }
  return redis;
}

// Load teams data for logo matching
function getTeams() {
  try {
    const localPath = path.join(process.cwd(), 'public', 'data', 'teams.json');
    const data = fs.readFileSync(localPath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading local teams:', error);
    return [];
  }
}

// Create a map of team names to logo URLs
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

// Find logo URL for a team name with fuzzy matching
function findTeamLogo(logoMap, teamName) {
  if (!teamName) return null;
  
  const normalizedName = teamName.toLowerCase().trim();
  
  // Exact match first
  if (logoMap.has(normalizedName)) {
    return logoMap.get(normalizedName);
  }
  
  // Fuzzy match: check if any key is contained in the team name or vice versa
  for (const [key, logoUrl] of logoMap.entries()) {
    // Skip short tags that cause false matches
    if (key.length <= 2) continue;
    
    if (normalizedName.includes(key) || key.includes(normalizedName)) {
      return logoUrl;
    }
  }
  
  return null;
}

// Add logos to series data (preserve existing logos if present)
function addLogosToSeries(series, logoMap) {
  return series.map(s => ({
    ...s,
    // Only add logo if not already present
    radiant_team_logo: s.radiant_team_logo || findTeamLogo(logoMap, s.radiant_team_name),
    dire_team_logo: s.dire_team_logo || findTeamLogo(logoMap, s.dire_team_name)
  }));
}

// Fallback to local JSON file
function getLocalTournaments() {
  try {
    const localPath = path.join(process.cwd(), 'public', 'data', 'tournaments.json');
    const data = fs.readFileSync(localPath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading local tournaments:', error);
    return { tournaments: [], seriesByTournament: {} };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Helper to process tournaments data with logos
  function processTournaments(tournamentsData) {
    if (!tournamentsData) return null;
    const teams = getTeams();
    const logoMap = createTeamLogoMap(teams);

    const seriesByTournament = {};
    for (const [tournamentId, series] of Object.entries(tournamentsData.seriesByTournament || {})) {
      seriesByTournament[tournamentId] = addLogosToSeries(series, logoMap);
    }

    return {
      ...tournamentsData,
      seriesByTournament
    };
  }

  try {
    // Try Redis first
    let redisClient;
    try {
      redisClient = await getRedis();
    } catch (redisError) {
      console.log('[Tournaments API] Redis not available:', redisError.message);
    }

    if (redisClient) {
      try {
        const tournaments = await redisClient.get('tournaments');

        if (tournaments) {
          console.log('[Tournaments API] Found data in Redis');
          const parsed = JSON.parse(tournaments);
          const processed = processTournaments(parsed);
          return res.status(200).json(processed);
        } else {
          console.log('[Tournaments API] No data in Redis, using fallback');
        }
      } catch (redisError) {
        console.log('[Tournaments API] Redis get failed:', redisError.message);
      }
    }

    // Fallback to local JSON file
    console.log('[Tournaments API] Using local JSON fallback');
    const localData = getLocalTournaments();
    const processed = processTournaments(localData);

    return res.status(200).json(processed);
  } catch (error) {
    console.error('[Tournaments API] Error:', error);
    // Fallback to local JSON on error
    const localData = getLocalTournaments();
    const processed = processTournaments(localData);

    return res.status(200).json(processed);
  }
}
