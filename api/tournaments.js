/**
 * 获取赛事数据 API
 */

import fs from 'fs';
import path from 'path';

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

  try {
    // Try to import @vercel/kv dynamically to avoid build errors
    let kv;
    try {
      const kvModule = await import('@vercel/kv');
      kv = kvModule.kv;
    } catch (importError) {
      console.log('KV not available, using local file');
      kv = null;
    }

    if (kv) {
      const tournaments = await kv.get('tournaments');
      
      if (tournaments) {
        // Load teams for logo matching
        const teams = getTeams();
        const logoMap = createTeamLogoMap(teams);
        
        // Add logos to series data
        const seriesByTournament = {};
        for (const [tournamentId, series] of Object.entries(tournaments.seriesByTournament || {})) {
          seriesByTournament[tournamentId] = addLogosToSeries(series, logoMap);
        }
        
        // Return full object with tournaments and seriesByTournament with logos
        return res.status(200).json({
          ...tournaments,
          seriesByTournament
        });
      }
    }
    
    // Fallback to local JSON file - return full object with logos
    const teams = getTeams();
    const logoMap = createTeamLogoMap(teams);
    const localData = getLocalTournaments();
    
    // Add logos to series data
    const seriesByTournament = {};
    for (const [tournamentId, series] of Object.entries(localData.seriesByTournament || {})) {
      seriesByTournament[tournamentId] = addLogosToSeries(series, logoMap);
    }
    
    return res.status(200).json({
      ...localData,
      seriesByTournament
    });
  } catch (error) {
    console.error('Error:', error);
    // Fallback to local JSON on error with logos
    const teams = getTeams();
    const logoMap = createTeamLogoMap(teams);
    const localData = getLocalTournaments();
    
    const seriesByTournament = {};
    for (const [tournamentId, series] of Object.entries(localData.seriesByTournament || {})) {
      seriesByTournament[tournamentId] = addLogosToSeries(series, logoMap);
    }
    
    return res.status(200).json({
      ...localData,
      seriesByTournament
    });
  }
}
