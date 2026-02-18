#!/usr/bin/env node
/**
 * OpenDota 增量更新脚本 - 按实际战队统计胜场（不按 radiant/dire）
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OPENDOTA_API_KEY = process.env.OPENDOTA_API_KEY || 'ab01b0b0-c459-4524-92eb-0b6af0cdc415';
const OPENDOTA_BASE_URL = 'https://api.opendota.com/api';

const publicDataDir = path.join(__dirname, '..', 'public', 'data');

const homeDataPath = path.join(publicDataDir, 'home.json');
let homeData = JSON.parse(fs.readFileSync(homeDataPath, 'utf-8'));

console.log('Loaded existing data:');
console.log('  Tournaments:', homeData.tournaments?.length || 0);
console.log('  Series:', Object.entries(homeData.seriesByTournament || {}).map(([k,v]) => `${k}: ${v.length}`).join(', '));

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const headers = {};
      if (OPENDOTA_API_KEY) headers['Authorization'] = `Bearer ${OPENDOTA_API_KEY}`;
      
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
      console.log(`Retry ${i + 1}/${retries}`);
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

const tournamentInfo = {
  19269: { id: 'dreamleague-s28', name: 'DreamLeague Season 28', type: 'BO3' },
  18988: { id: 'dreamleague-s27', name: 'DreamLeague Season 27', type: 'BO3' },
  19130: { id: 'esl-challenger-china', name: 'ESL Challenger China', type: 'BO3' },
  19099: { id: 'blast-slam-vi', name: 'BLAST Slam VI', type: 'BO3' }
};

const existingMatchIds = new Set();
const allSeries = Object.values(homeData.seriesByTournament || {});
for (const seriesList of allSeries) {
  for (const s of seriesList) {
    for (const game of s.games || []) {
      existingMatchIds.add(String(game.match_id));
    }
  }
}
console.log('Existing matches:', existingMatchIds.size);

const teamLogoCache = {};

async function getTeamLogo(teamName) {
  if (!teamName || teamName === 'null') return null;
  if (teamLogoCache[teamName]) return teamLogoCache[teamName];
  
  try {
    const teams = await fetchWithRetry(`${OPENDOTA_BASE_URL}/teams?search=${encodeURIComponent(teamName)}`);
    if (teams && teams.length > 0) {
      const exactMatch = teams.find(t => t.name === teamName || t.name.toLowerCase() === teamName.toLowerCase());
      if (exactMatch && exactMatch.logo_url) {
        teamLogoCache[teamName] = exactMatch.logo_url;
        return exactMatch.logo_url;
      }
    }
  } catch (e) {}
  teamLogoCache[teamName] = null;
  return null;
}

const allTeamNames = new Set();
for (const seriesList of Object.values(homeData.seriesByTournament || {})) {
  for (const s of seriesList) {
    if (s.radiant_team_name) allTeamNames.add(s.radiant_team_name);
    if (s.dire_team_name) allTeamNames.add(s.dire_team_name);
  }
}

function normalizeTeamName(name) {
  if (!name) return '';
  return name.toLowerCase().trim();
}

function findExistingSeries(tid, team1Name, team2Name) {
  if (!homeData.seriesByTournament || !homeData.seriesByTournament[tid]) return null;
  
  const t1 = normalizeTeamName(team1Name);
  const t2 = normalizeTeamName(team2Name);
  
  for (const s of homeData.seriesByTournament[tid]) {
    const sRadiant = normalizeTeamName(s.radiant_team_name);
    const sDire = normalizeTeamName(s.dire_team_name);
    
    if ((sRadiant === t1 && sDire === t2) || (sRadiant === t2 && sDire === t1)) {
      return s;
    }
  }
  return null;
}

// ============================================
// 核心修复：按实际战队名统计胜场（不按 radiant/dire 位置）
// ============================================
function calculateSeriesScore(games, teamA_Name, teamB_Name) {
  const tA = normalizeTeamName(teamA_Name);
  const tB = normalizeTeamName(teamB_Name);
  
  let teamA_Wins = 0;
  let teamB_Wins = 0;
  
  for (const game of games) {
    const radiantName = normalizeTeamName(game.radiant_team_name);
    const direName = normalizeTeamName(game.dire_team_name);
    
    // radiant_win = true → radiant 战队赢
    // radiant_win = false (0) → dire 战队赢
    const winner = game.radiant_win ? radiantName : direName;
    
    if (winner === tA) {
      teamA_Wins++;
    } else if (winner === tB) {
      teamB_Wins++;
    }
  }
  
  return { teamA_Wins, teamB_Wins };
}

async function main() {
  console.log('========================================');
  console.log('DOTA2 Hub - OpenDota Incremental Sync v6');
  console.log('Time:', new Date().toISOString());
  console.log('========================================\n');
  
  console.log('--- Fetching team logos ---');
  for (const teamName of allTeamNames) {
    await getTeamLogo(teamName);
  }
  console.log(`  Cached ${Object.keys(teamLogoCache).length} logos`);
  
  for (const seriesList of Object.values(homeData.seriesByTournament || {})) {
    for (const s of seriesList) {
      if (!s.radiant_team_logo && teamLogoCache[s.radiant_team_name]) {
        s.radiant_team_logo = teamLogoCache[s.radiant_team_name];
      }
      if (!s.dire_team_logo && teamLogoCache[s.dire_team_name]) {
        s.dire_team_logo = teamLogoCache[s.dire_team_name];
      }
    }
  }
  
  console.log('\n--- Fetching proMatches ---');
  let newMatches = [];
  
  try {
    const proMatches = await fetchWithRetry(`${OPENDOTA_BASE_URL}/proMatches`);
    console.log(`  Got ${proMatches.length} pro matches`);
    
    for (const match of proMatches.slice(0, 200)) {
      const matchId = String(match.match_id);
      
      if (existingMatchIds.has(matchId)) continue;
      
      const tournament = tournamentInfo[match.leagueid];
      if (!tournament) continue;
      
      const newMatch = {
        match_id: matchId,
        radiant_team_id: match.radiant_team_id,
        dire_team_id: match.dire_team_id,
        radiant_team_name: match.radiant_name,
        dire_team_name: match.dire_name,
        radiant_score: match.radiant_score,
        dire_score: match.dire_score,
        start_time: match.start_time,
        duration: match.duration,
        league_id: match.leagueid,
        radiant_win: match.radiant_win,
        tournament: tournament.id
      };
      
      newMatches.push(newMatch);
      existingMatchIds.add(matchId);
      
      console.log(`  ✓ ${tournament.id}: ${match.radiant_name} ${match.radiant_score}:${match.dire_score} ${match.dire_name}`);
    }
  } catch (error) {
    console.error('  Error:', error.message);
  }
  
  console.log(`\n========================================`);
  console.log(`New matches: ${newMatches.length}`);
  console.log('========================================\n');
  
  if (newMatches.length === 0) {
    homeData.lastUpdated = new Date().toISOString();
    fs.writeFileSync(homeDataPath, JSON.stringify(homeData, null, 2));
    console.log('No new matches - saved');
    return;
  }
  
  for (const m of newMatches) {
    await getTeamLogo(m.radiant_team_name);
    await getTeamLogo(m.dire_team_name);
  }
  
  const matchesBySeries = {};
  
  for (const m of newMatches) {
    const teams = [m.radiant_team_name, m.dire_team_name].sort();
    const seriesKey = `${m.tournament}|${teams[0]}|${teams[1]}`;
    
    if (!matchesBySeries[seriesKey]) {
      matchesBySeries[seriesKey] = {
        tournament: m.tournament,
        radiant_team_name: m.radiant_team_name,
        dire_team_name: m.dire_team_name,
        games: []
      };
    }
    
    matchesBySeries[seriesKey].games.push({
      match_id: m.match_id,
      radiant_team_name: m.radiant_team_name,
      dire_team_name: m.dire_team_name,
      radiant_score: m.radiant_score,
      dire_score: m.dire_score,
      radiant_win: m.radiant_win ? 1 : 0,
      start_time: m.start_time,
      duration: m.duration
    });
  }
  
  console.log(`  Grouped into ${Object.keys(matchesBySeries).length} series`);
  
  for (const [seriesKey, seriesData] of Object.entries(matchesBySeries)) {
    const tid = seriesData.tournament;
    
    if (!homeData.seriesByTournament) homeData.seriesByTournament = {};
    if (!homeData.seriesByTournament[tid]) homeData.seriesByTournament[tid] = [];
    
    const sortedGames = seriesData.games.sort((a, b) => a.start_time - b.start_time);
    const seriesTypeMap = { 0: 'BO1', 1: 'BO3', 2: 'BO5', 3: 'BO2' };
    const st = sortedGames[0]?.series_type;
    const seriesType = typeof st === 'number' ? (seriesTypeMap[st] || 'BO3') : (sortedGames.length >= 5 ? 'BO5' : sortedGames.length === 2 ? 'BO2' : 'BO3');
    
    const existingSeries = findExistingSeries(tid, seriesData.radiant_team_name, seriesData.dire_team_name);
    
    if (existingSeries) {
      console.log(`  Merging: ${seriesData.radiant_team_name} vs ${seriesData.dire_team_name}`);
      
      for (const newGame of sortedGames) {
        const gameExists = existingSeries.games.some(g => String(g.match_id) === String(newGame.match_id));
        if (!gameExists) {
          existingSeries.games.push(newGame);
        }
      }
      
      // 按实际战队名重新计算比分
      const { teamA_Wins, teamB_Wins } = calculateSeriesScore(
        existingSeries.games,
        existingSeries.radiant_team_name,
        existingSeries.dire_team_name
      );
      
      existingSeries.radiant_score = teamA_Wins;
      existingSeries.dire_score = teamB_Wins;
      existingSeries.radiant_wins = teamA_Wins;
      existingSeries.dire_wins = teamB_Wins;
      existingSeries.games = existingSeries.games.sort((a, b) => a.start_time - b.start_time);
      
      console.log(`    Score: ${existingSeries.radiant_team_name} ${teamA_Wins} - ${teamB_Wins} ${existingSeries.dire_team_name}`);
    } else {
      const { teamA_Wins, teamB_Wins } = calculateSeriesScore(
        sortedGames,
        seriesData.radiant_team_name,
        seriesData.dire_team_name
      );
      
      const seriesEntry = {
        series_id: `opendota_${sortedGames[0].match_id}`,
        series_type: seriesType,
        radiant_team_name: seriesData.radiant_team_name,
        dire_team_name: seriesData.dire_team_name,
        radiant_team_logo: teamLogoCache[seriesData.radiant_team_name] || null,
        dire_team_logo: teamLogoCache[seriesData.dire_team_name] || null,
        games: sortedGames,
        radiant_wins: teamA_Wins,
        dire_wins: teamB_Wins,
        radiant_score: teamA_Wins,
        dire_score: teamB_Wins
      };
      
      homeData.seriesByTournament[tid].unshift(seriesEntry);
      console.log(`  Added: ${seriesData.radiant_team_name} ${teamA_Wins} - ${teamB_Wins} ${seriesData.dire_team_name}`);
    }
  }
  
  homeData.lastUpdated = new Date().toISOString();
  fs.writeFileSync(homeDataPath, JSON.stringify(homeData, null, 2));
  console.log('\nUpdated home.json');
  console.log('\nDone!');
}

main();
