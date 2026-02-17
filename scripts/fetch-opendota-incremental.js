#!/usr/bin/env node
/**
 * OpenDota 增量更新脚本 - 保留原数据，只添加新比赛，同时更新Logo
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OPENDOTA_API_KEY = process.env.OPENDOTA_API_KEY || 'ab01b0b0-c459-4524-92eb-0b6af0cdc415';
const OPENDOTA_BASE_URL = 'https://api.opendota.com/api';

const publicDataDir = path.join(__dirname, '..', 'public', 'data');

// 读取现有的 home.json
const homeDataPath = path.join(publicDataDir, 'home.json');
let homeData = JSON.parse(fs.readFileSync(homeDataPath, 'utf-8'));

console.log('Loaded existing data:');
console.log('  Tournaments:', homeData.tournaments?.length || 0);
console.log('  Series:', Object.entries(homeData.seriesByTournament || {}).map(([k,v]) => `${k}: ${v.length}`).join(', '));

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

// 获取战队 Logo URL
let teamLogos = {};
async function fetchTeamLogos() {
  console.log('\n--- Fetching team logos ---');
  try {
    const teams = await fetchWithRetry(`${OPENDOTA_BASE_URL}/teams`);
    for (const team of teams.slice(0, 100)) {
      if (team.name && team.logo_url) {
        teamLogos[team.name.toLowerCase()] = team.logo_url;
      }
    }
    console.log('Fetched logos for', Object.keys(teamLogos).length, 'teams');
  } catch (error) {
    console.error('Error fetching team logos:', error.message);
  }
}

function getTeamLogo(teamName) {
  if (!teamName) return null;
  return teamLogos[teamName.toLowerCase()] || null;
}

// 更新所有 series 的 logo
function updateLogos() {
  let updated = 0;
  for (const tid of Object.keys(homeData.seriesByTournament || {})) {
    const seriesList = homeData.seriesByTournament[tid];
    for (const s of seriesList) {
      // 更新 series 级别的 logo
      if (!s.radiant_team_logo) {
        s.radiant_team_logo = getTeamLogo(s.radiant_team_name);
        updated++;
      }
      if (!s.dire_team_logo) {
        s.dire_team_logo = getTeamLogo(s.dire_team_name);
        updated++;
      }
    }
  }
  console.log('Updated', updated, 'team logos');
  return updated > 0;
}

// 收集所有已有比赛ID
const existingMatchIds = new Set();
const allSeries = Object.values(homeData.seriesByTournament || {});
for (const series of allSeries) {
  for (const s of series) {
    for (const game of s.games || []) {
      existingMatchIds.add(String(game.match_id));
    }
  }
}
console.log('Existing matches:', existingMatchIds.size);

// 读取现有比赛数据
const matchesPath = path.join(publicDataDir, 'matches.json');
let existingMatches = [];
try {
  existingMatches = JSON.parse(fs.readFileSync(matchesPath, 'utf-8'));
} catch (e) {
  console.log('No existing matches file');
}
console.log('Existing matches in file:', existingMatches.length);

// 收集现有比赛的 ID
const existingMatchIdSet = new Set(existingMatches.map(m => String(m.match_id)));

let newMatches = [];

async function main() {
  // 先获取战队 Logo
  await fetchTeamLogos();
  
  // 更新现有 logo
  const hasNewLogos = updateLogos();
  
  console.log('\n--- Fetching proMatches ---');
  try {
    const proMatches = await fetchWithRetry(`${OPENDOTA_BASE_URL}/proMatches`);
    console.log('Got', proMatches.length, 'pro matches');
    
    for (const match of proMatches.slice(0, 200)) {
      const matchId = String(match.match_id);
      
      // 检查是否已存在
      if (existingMatchIdSet.has(matchId)) {
        continue; // 跳过已存在的比赛
      }
      
      // 新比赛 - 添加到列表
      const newMatch = {
        match_id: match.match_id,
        radiant_team_id: match.radiant_team_id,
        dire_team_id: match.dire_team_id,
        radiant_team_name: match.radiant_name,
        dire_team_name: match.dire_name,
        radiant_team_logo: getTeamLogo(match.radiant_name),
        dire_team_logo: getTeamLogo(match.dire_name),
        radiant_score: match.radiant_score,
        dire_score: match.dire_score,
        start_time: match.start_time,
        duration: match.duration,
        league_id: match.leagueid,
        radiant_win: match.radiant_win
      };
      
      newMatches.push(newMatch);
      existingMatchIdSet.add(matchId);
      
      console.log(`  ✓ ${match.radiant_name} ${match.radiant_score}:${match.dire_score} ${match.dire_name}`);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
  
  console.log(`\nNew matches found: ${newMatches.length}`);
  
  let dataChanged = hasNewLogos || newMatches.length > 0;
  
  if (newMatches.length > 0) {
    // 合并到现有比赛列表
    const allMatches = [...existingMatches, ...newMatches];
    fs.writeFileSync(matchesPath, JSON.stringify(allMatches, null, 2));
    console.log('Updated matches.json');
    
    // 更新 home.json 中的 series 数据
    const tournamentInfo = {
      19269: 'dreamleague-s28',
      18988: 'dreamleague-s27', 
      19130: 'esl-challenger-china',
      19099: 'blast-slam-vi'
    };
    
    // 按 league_id 分组新比赛
    const matchesByLeague = {};
    for (const m of newMatches) {
      if (m.league_id && tournamentInfo[m.league_id]) {
        const tid = tournamentInfo[m.league_id];
        if (!matchesByLeague[tid]) matchesByLeague[tid] = [];
        matchesByLeague[tid].push(m);
      }
    }
    
    // 对每个赛事，添加新比赛到现有系列赛中
    for (const [tid, newTournamentMatches] of Object.entries(matchesByLeague)) {
      if (!homeData.seriesByTournament) {
        homeData.seriesByTournament = {};
      }
      if (!homeData.seriesByTournament[tid]) {
        homeData.seriesByTournament[tid] = [];
      }
      
      // 为每场新比赛创建一个简单的系列赛条目（带 Logo）
      for (const m of newTournamentMatches) {
        const radiantWin = m.radiant_win ? 1 : 0;
        const seriesEntry = {
          series_id: `opendota_${m.match_id}`,
          series_type: 'BO3',
          radiant_team_name: m.radiant_team_name,
          dire_team_name: m.dire_team_name,
          radiant_team_logo: m.radiant_team_logo,
          dire_team_logo: m.dire_team_logo,
          games: [{
            match_id: String(m.match_id),
            radiant_team_name: m.radiant_team_name,
            dire_team_name: m.dire_team_name,
            radiant_score: m.radiant_score,
            dire_score: m.dire_score,
            radiant_win: radiantWin,
            start_time: m.start_time,
            duration: m.duration
          }],
          radiant_wins: radiantWin,
          dire_wins: 1 - radiantWin,
          radiant_score: radiantWin,
          dire_score: 1 - radiantWin
        };
        
        // 添加到系列赛列表开头
        homeData.seriesByTournament[tid].unshift(seriesEntry);
      }
      
      console.log(`  Added ${newTournamentMatches.length} matches to ${tid}`);
    }
  }
  
  if (dataChanged) {
    // 保存更新后的 home.json
    homeData.lastUpdated = new Date().toISOString();
    fs.writeFileSync(homeDataPath, JSON.stringify(homeData, null, 2));
    console.log('Updated home.json');
  } else {
    console.log('No changes to sync');
  }
  
  console.log('\nDone!');
}

main();
