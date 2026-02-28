/**
 * 获取赛事数据 API
 * 数据源: Neon PostgreSQL (primary), Local JSON (fallback)
 */

import fs from 'fs';
import path from 'path';
import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

// Neon SQL client singleton
let sql = null;

function getDb() {
  if (!sql && DATABASE_URL) {
    try {
      sql = neon(DATABASE_URL);
    } catch (error) {
      console.error('[Tournaments API] Failed to create Neon client:', error.message);
      return null;
    }
  }
  return sql;
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

// Query tournaments from Neon
async function getTournamentsFromNeon(db) {
  if (!db) return null;

  try {
    // Get tournaments
    const tournaments = await db`
      SELECT id, name, name_cn, tier, location, status, league_id
      FROM tournaments
      ORDER BY league_id DESC
    `;

    if (tournaments.length === 0) {
      return null;
    }

    // Get series for each tournament
    const seriesByTournament = {};

    for (const t of tournaments) {
      const series = await db`
        SELECT series_id, tournament_id, radiant_team_name, dire_team_name,
               radiant_team_logo, dire_team_logo, radiant_wins, dire_wins, series_type
        FROM tournament_series
        WHERE tournament_id = ${t.id}
      `;

      seriesByTournament[t.id] = series.map(s => ({
        series_id: s.series_id,
        series_type: s.series_type,
        radiant_team_name: s.radiant_team_name,
        dire_team_name: s.dire_team_name,
        radiant_team_logo: s.radiant_team_logo,
        dire_team_logo: s.dire_team_logo,
        radiant_wins: s.radiant_wins,
        dire_wins: s.dire_wins,
        games: [] // Games would require another query
      }));
    }

    return {
      tournaments: tournaments.map(t => ({
        id: t.id,
        name: t.name,
        name_cn: t.name_cn,
        tier: t.tier,
        location: t.location,
        status: t.status,
        leagueid: t.league_id
      })),
      seriesByTournament
    };
  } catch (e) {
    console.error('[Tournaments API] Neon query failed:', e.message);
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
    // Try Neon first
    const db = getDb();
    const localData = getLocalTournaments();
    const localTournamentIds = new Set(localData.tournaments.map(t => t.id));

    if (db) {
      const neonData = await getTournamentsFromNeon(db);
      if (neonData && neonData.tournaments.length > 0) {
        console.log('[Tournaments API] Found data in Neon');

        // Merge with local data to ensure all tournaments are present
        const neonTournamentIds = new Set(neonData.tournaments.map(t => t.id));

        // Add missing tournaments from local
        for (const localT of localData.tournaments) {
          if (!neonTournamentIds.has(localT.id)) {
            neonData.tournaments.push(localT);
            neonData.seriesByTournament[localT.id] = localData.seriesByTournament[localT.id] || [];
          }
        }

        // Add missing series from local
        for (const [tournamentId, series] of Object.entries(localData.seriesByTournament)) {
          if (!neonData.seriesByTournament[tournamentId]) {
            neonData.seriesByTournament[tournamentId] = series;
          }
        }

        const processed = processTournaments(neonData);
        return res.status(200).json(processed);
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
