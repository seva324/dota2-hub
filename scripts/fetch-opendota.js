#!/usr/bin/env node
/**
 * OpenDota API 数据采集脚本 - 完整版
 * Fetches ALL matches for target tournaments, not just Chinese teams
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OPENDOTA_API_KEY = process.env.OPENDOTA_API_KEY || 'ab01b0b0-c459-4524-92eb-0b6af0cdc415';
const OPENDOTA_BASE_URL = 'https://api.opendota.com/api';

const dbPath = path.join(__dirname, '..', 'data', 'dota2.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Target league IDs for tournament matches
const TARGET_LEAGUE_IDS = [19269, 18988, 19099, 19130];

// League ID to tournament ID mapping
const LEAGUE_TO_TOURNAMENT = {
  19269: 'dreamleague-s28',
  18988: 'dreamleague-s27',
  19099: 'blast-slam-vi',
  19130: 'esl-challenger-china'
};

// 目标战队 - 扩展为包含所有 target tournaments 的战队
const TARGET_TEAM_IDS = {
  // Chinese teams
  'xtreme-gaming': { name: 'Xtreme Gaming', name_cn: 'XG', team_id: 8261502, is_cn: true },
  'yakult-brothers': { name: 'Yakult Brothers', name_cn: 'YB', team_id: 8255888, is_cn: true },
  'vici-gaming': { name: 'Vici Gaming', name_cn: 'VG', team_id: 7391077, is_cn: true },
  // DreamLeague S28 teams
  'mouz': { name: 'MOUZ', name_cn: 'MOUZ', team_id: 7391981, is_cn: false },
  'tundra-esports': { name: 'Tundra Esports', name_cn: 'Tundra', team_id: 7055376, is_cn: false },
  'betboom-team': { name: 'BetBoom Team', name_cn: 'BB', team_id: 8597616, is_cn: false },
  'aurora-gaming': { name: 'Aurora Gaming', name_cn: 'Aurora', team_id: 8943835, is_cn: false },
  'team-spirit': { name: 'Team Spirit', name_cn: 'Spirit', team_id: 7119388, is_cn: false },
  'pain-gaming': { name: 'paiN Gaming', name_cn: 'paiN', team_id: 8521839, is_cn: false },
  'parivision': { name: 'PARIVISION', name_cn: 'PARI', team_id: 1082686, is_cn: false },
  // BLAST Slam VI teams
  'team-liquid': { name: 'Team Liquid', name_cn: 'Liquid', team_id: 2163, is_cn: false },
  'natus-vincere': { name: 'Natus Vincere', name_cn: 'NAVI', team_id: 460, is_cn: false },
  // ESL Challenger China teams
  'azure-ray': { name: 'Azure Ray', name_cn: 'AR', team_id: 8249895, is_cn: true },
};

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const headers = {};
      if (OPENDOTA_API_KEY) {
        headers['Authorization'] = `Bearer ${OPENDOTA_API_KEY}`;
      }
      
      const response = await fetch(url, { headers });
      
      if (!response.ok) {
        if (response.status === 429) {
          console.log('Rate limited, waiting 10s...');
          await new Promise(r => setTimeout(r, 10000));
          continue;
        }
        throw new Error(`HTTP ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      if (i === retries - 1) throw error;
      console.log(`Retry ${i + 1}/${retries} for ${url}`);
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

function identifyTeam(name) {
  if (!name) return { id: 'unknown', name_cn: name, is_cn: false };
  
  const upperName = name.toUpperCase();
  const lowerName = name.toLowerCase();
  
  // Check against all known teams
  for (const [key, teamData] of Object.entries(TARGET_TEAM_IDS)) {
    if (upperName === teamData.name.toUpperCase() || 
        upperName === teamData.name_cn.toUpperCase() ||
        lowerName.includes(teamData.name.toLowerCase()) ||
        lowerName.includes(teamData.name_cn.toLowerCase())) {
      return { id: key, name_cn: teamData.name_cn, is_cn: teamData.is_cn, name: teamData.name };
    }
  }
  
  // Check for Chinese teams by name patterns
  if (lowerName.includes('xtreme') || upperName === 'XG') {
    return { id: 'xtreme-gaming', name_cn: 'XG', is_cn: true, name: 'Xtreme Gaming' };
  }
  if (lowerName.includes('yakult') || lowerName.includes('azure') || lowerName.includes('ray') || upperName === 'YB' || upperName === 'AR') {
    return { id: 'yakult-brothers', name_cn: 'YB', is_cn: true, name: 'Yakult Brothers' };
  }
  if (lowerName.includes('vici') || upperName === 'VG') {
    return { id: 'vici-gaming', name_cn: 'VG', is_cn: true, name: 'Vici Gaming' };
  }
  
  return { id: 'unknown', name_cn: name, is_cn: false, name: name };
}

function updateTeam(teamInfo) {
  if (!teamInfo || !teamInfo.id) return;
  
  const teamData = TARGET_TEAM_IDS[teamInfo.id];
  if (!teamData) return;
  
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO teams (id, name, name_cn, tag, region, is_cn_team, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, unixepoch())
  `);
  
  stmt.run(teamInfo.id, teamData.name, teamData.name_cn, teamData.name_cn, 'China', 1);
}

async function saveMatch(match, saveAllForTargetLeagues = false) {
  const radiantTeam = identifyTeam(match.radiant_name);
  const direTeam = identifyTeam(match.dire_name);
  
  // Check if this match is from a target league
  const leagueId = match.leagueid;
  const isTargetLeague = leagueId && TARGET_LEAGUE_IDS.includes(parseInt(leagueId));
  
  // For target leagues, save ALL matches; for other leagues, only save if has Chinese team
  if (!isTargetLeague && !radiantTeam.is_cn && !direTeam.is_cn) {
    return null;
  }
  
  // Update team in database
  if (radiantTeam.id !== 'unknown') {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO teams (id, name, name_cn, tag, region, is_cn_team, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, unixepoch())
    `);
    stmt.run(radiantTeam.id, radiantTeam.name || radiantTeam.name_cn, radiantTeam.name_cn, radiantTeam.name_cn, radiantTeam.is_cn ? 'China' : 'International', radiantTeam.is_cn ? 1 : 0);
  }
  
  if (direTeam.id !== 'unknown') {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO teams (id, name, name_cn, tag, region, is_cn_team, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, unixepoch())
    `);
    stmt.run(direTeam.id, direTeam.name || direTeam.name_cn, direTeam.name_cn, direTeam.name_cn, direTeam.is_cn ? 'China' : 'International', direTeam.is_cn ? 1 : 0);
  }
  
  const now = Date.now() / 1000;
  let status = 'scheduled';
  if (match.start_time < now - 3600) {
    status = 'finished';
  } else if (match.start_time < now) {
    status = 'live';
  }
  
  let radiantGameWins = 0;
  let direGameWins = 0;
  
  if (status === 'finished') {
    if (match.radiant_win) {
      radiantGameWins = 1;
      direGameWins = 0;
    } else {
      radiantGameWins = 0;
      direGameWins = 1;
    }
  }
  
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO matches (
      match_id, league_id, radiant_team_id, dire_team_id,
      radiant_team_name, radiant_team_name_cn,
      dire_team_name, dire_team_name_cn,
      radiant_score, dire_score, radiant_game_wins, dire_game_wins,
      start_time, duration, series_type, status, lobby_type
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    match.match_id,
    match.leagueid || null,
    radiantTeam.id,
    direTeam.id,
    radiantTeam.name || radiantTeam.name_cn || match.radiant_name,
    radiantTeam.name_cn,
    direTeam.name || direTeam.name_cn || match.dire_name,
    direTeam.name_cn,
    match.radiant_score || 0,
    match.dire_score || 0,
    radiantGameWins,
    direGameWins,
    match.start_time,
    match.duration || 0,
    'BO3',
    status,
    match.lobby_type || 0
  );
  
  // Only log Chinese team matches to reduce noise
  if (radiantTeam.is_cn || direTeam.is_cn) {
    const cnTeam = radiantTeam.is_cn ? radiantTeam : direTeam;
    console.log(`  ✓ ${cnTeam.name_cn}: ${radiantTeam.name_cn || match.radiant_name} ${radiantGameWins}:${direGameWins} ${direTeam.name_cn || match.dire_name} (${status})`);
  }
  return match;
}

async function fetchProMatches() {
  console.log('Fetching pro matches from OpenDota...');
  let allMatches = [];
  
  for (let page = 0; page < 10; page++) {  // Increased pages
    try {
      const url = page === 0 
        ? `${OPENDOTA_BASE_URL}/proMatches`
        : `${OPENDOTA_BASE_URL}/proMatches?less_than_match_id=${allMatches[allMatches.length - 1]?.match_id || 0}`;
      
      const data = await fetchWithRetry(url);
      if (!data || data.length === 0) break;
      
      allMatches = allMatches.concat(data);
      console.log(`  Page ${page + 1}: ${data.length} matches (total: ${allMatches.length})`);
      
      const oldestMatch = data[data.length - 1];
      const daysAgo = (Date.now() / 1000 - oldestMatch.start_time) / 86400;
      // Fetch more historical data (up to 90 days)
      if (daysAgo > 90) break;
      
      await new Promise(r => setTimeout(r, 1000));
    } catch (error) {
      console.error(`  Error fetching page ${page + 1}:`, error.message);
      break;
    }
  }
  
  return allMatches;
}

async function fetchTeamMatches(teamId, teamName) {
  console.log(`Fetching matches for ${teamName} (team_id: ${teamId})...`);
  try {
    const data = await fetchWithRetry(`${OPENDOTA_BASE_URL}/teams/${teamId}/matches`);
    return data || [];
  } catch (error) {
    console.error(`  Error fetching ${teamName}:`, error.message);
    return [];
  }
}

async function main() {
  console.log('========================================');
  console.log('DOTA2 Hub - Complete Match Fetcher');
  console.log('Target Leagues:', TARGET_LEAGUE_IDS);
  console.log('Time:', new Date().toISOString());
  console.log('========================================\n');
  
  // 清理旧的 OpenDota 数据（不是 lp_ 开头的）
  console.log('Cleaning old OpenDota data...');
  db.prepare(`DELETE FROM matches WHERE match_id NOT LIKE 'lp_%'`).run();
  console.log('Done.\n');
  
  let savedCount = 0;
  let targetLeagueCount = 0;
  let allMatchIds = new Set();
  
  console.log('--- Method 1: Pro Matches ---');
  try {
    const proMatches = await fetchProMatches();
    console.log(`Total pro matches fetched: ${proMatches.length}\n`);
    
    for (const match of proMatches) {
      if (allMatchIds.has(match.match_id)) continue;
      
      try {
        const result = await saveMatch(match, true);  // true = save all for target leagues
        if (result) {
          savedCount++;
          allMatchIds.add(match.match_id);
          if (match.leagueid && TARGET_LEAGUE_IDS.includes(match.leagueid)) {
            targetLeagueCount++;
          }
        }
      } catch (error) {
        console.error(`Error processing match ${match.match_id}:`, error.message);
      }
    }
  } catch (error) {
    console.error('Error in pro matches:', error.message);
  }
  
  console.log('\n--- Method 2: Team-specific Matches ---');
  for (const [teamKey, teamData] of Object.entries(TARGET_TEAM_IDS)) {
    try {
      const teamMatches = await fetchTeamMatches(teamData.team_id, teamData.name_cn);
      console.log(`Fetched ${teamMatches.length} matches for ${teamData.name_cn}`);
      
      for (const match of teamMatches) {
        if (allMatchIds.has(match.match_id)) continue;
        
        const convertedMatch = {
          match_id: match.match_id,
          radiant_name: match.radiant ? teamData.name : match.opposing_team_name,
          dire_name: match.radiant ? match.opposing_team_name : teamData.name,
          radiant_score: match.radiant_score || 0,
          dire_score: match.dire_score || 0,
          radiant_win: match.radiant_win,
          start_time: match.start_time,
          duration: match.duration || 0,
          leagueid: match.leagueid,
          lobby_type: 7,
        };
        
        try {
          const result = await saveMatch(convertedMatch, true);
          if (result) {
            savedCount++;
            allMatchIds.add(match.match_id);
            if (match.leagueid && TARGET_LEAGUE_IDS.includes(match.leagueid)) {
              targetLeagueCount++;
            }
          }
          await new Promise(r => setTimeout(r, 20));
        } catch (error) {
          console.error(`Error:`, error.message);
        }
      }
    } catch (error) {
      console.error(`Error fetching ${teamData.name_cn}:`, error.message);
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  
  console.log(`\n========================================`);
  console.log(`Total matches saved: ${savedCount}`);
  console.log(`Target league matches: ${targetLeagueCount}`);
  console.log('========================================`);
  
  // Export to JSON files
  console.log('\n--- Exporting Data ---');
  exportToJson(db);
  
  db.close();
}

function exportToJson(db) {
  // Get all matches
  const matches = db.prepare('SELECT * FROM matches ORDER BY start_time DESC').all();
  console.log(`Exported ${matches.length} matches`);
  
  // Write matches.json
  const matchesPath = path.join(__dirname, '..', 'public', 'data', 'matches.json');
  fs.writeFileSync(matchesPath, JSON.stringify(matches, null, 2));
  console.log(`Written to ${matchesPath}`);
  
  // Get tournaments from database
  const tournaments = db.prepare('SELECT * FROM tournaments').all();
  
  // Group matches by league_id and create series
  const seriesByTournament = {};
  
  for (const leagueId of TARGET_LEAGUE_IDS) {
    const tournamentId = LEAGUE_TO_TOURNAMENT[leagueId];
    const leagueMatches = matches.filter(m => m.league_id == leagueId);
    
    if (leagueMatches.length === 0) continue;
    
    // Group by team pair
    const teamPairs = {};
    leagueMatches.forEach(m => {
      const teams = [m.radiant_team_name, m.dire_team_name].sort();
      const key = teams.join('_vs_');
      if (!teamPairs[key]) {
        teamPairs[key] = [];
      }
      teamPairs[key].push(m);
    });
    
    // Create series
    const series = Object.values(teamPairs).map(groupMatches => {
      groupMatches.sort((a, b) => a.start_time - b.start_time);
      
      let radiantWins = 0;
      let direWins = 0;
      groupMatches.forEach(m => {
        if (m.radiant_win) radiantWins++;
        else direWins++;
      });
      
      return {
        series_id: `series_${tournamentId}_${groupMatches[0].radiant_team_name}_vs_${groupMatches[0].dire_team_name}`.replace(/\s+/g, '_'),
        series_type: 'BO3',
        radiant_team_name: groupMatches[0].radiant_team_name,
        dire_team_name: groupMatches[0].dire_team_name,
        radiant_team_logo: null,
        dire_team_logo: null,
        games: groupMatches.map(m => ({
          match_id: m.match_id,
          radiant_team_name: m.radiant_team_name,
          dire_team_name: m.dire_team_name,
          radiant_score: m.radiant_score,
          dire_score: m.dire_score,
          radiant_win: m.radiant_win,
          start_time: m.start_time,
          duration: m.duration
        })),
        radiant_wins: radiantWins,
        dire_wins: direWins,
        tournament_id: leagueId,
        tournament_name: null,
        stage: '',
        radiant_score: radiantWins,
        dire_score: direWins
      };
    });
    
    seriesByTournament[tournamentId] = series;
    console.log(`League ${leagueId} (${tournamentId}): ${series.length} series`);
  }
  
  // Read existing tournaments.json to preserve tournament info
  const tournamentsPath = path.join(__dirname, '..', 'public', 'data', 'tournaments.json');
  let tournamentsData = { tournaments: [], seriesByTournament: {} };
  try {
    const existingData = JSON.parse(fs.readFileSync(tournamentsPath, 'utf-8'));
    tournamentsData.tournaments = existingData.tournaments || [];
  } catch (e) {
    console.log('No existing tournaments.json found');
  }
  
  // Merge series data
  tournamentsData.seriesByTournament = seriesByTournament;
  
  // Write tournaments.json
  fs.writeFileSync(tournamentsPath, JSON.stringify(tournamentsData, null, 2));
  console.log(`Written to ${tournamentsPath}`);
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
