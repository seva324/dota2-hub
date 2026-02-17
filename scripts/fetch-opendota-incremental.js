#!/usr/bin/env node
/**
 * OpenDota 增量更新脚本 - 保留原数据，智能合并系列赛
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OPENDOTA_API_KEY = process.env.OPENDOTA_API_KEY || 'ab01b0b0-c459-4524-92eb-0b6af0cdc415';
const OPENDOTA_BASE_URL = 'https://api.opendota.com/api';

const publicDataDir = path.join(__dirname, '..', 'public', 'data');

// 读取现有的 home.json（保留原数据）
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

// 赛事 ID 映射
const tournamentInfo = {
  19269: { id: 'dreamleague-s28', name: 'DreamLeague Season 28', type: 'BO3' },
  18988: { id: 'dreamleague-s27', name: 'DreamLeague Season 27', type: 'BO3' },
  19130: { id: 'esl-challenger-china', name: 'ESL Challenger China', type: 'BO3' },
  19099: { id: 'blast-slam-vi', name: 'BLAST Slam VI', type: 'BO3' }
};

// 收集所有已有比赛ID
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

// 标准化战队名（用于比较）
function normalizeTeamName(name) {
  if (!name) return '';
  return name.toLowerCase().trim();
}

// 查找已存在的系列赛
function findExistingSeries(tid, radiantName, direName) {
  if (!homeData.seriesByTournament || !homeData.seriesByTournament[tid]) {
    return null;
  }
  
  const normalizedRadiant = normalizeTeamName(radiantName);
  const normalizedDire = normalizeTeamName(direName);
  
  for (const s of homeData.seriesByTournament[tid]) {
    const sRadiant = normalizeTeamName(s.radiant_team_name);
    const sDire = normalizeTeamName(s.dire_team_name);
    
    // 检查是否相同战队（忽略大小写）
    if ((sRadiant === normalizedRadiant && sDire === normalizedDire) ||
        (sRadiant === normalizedDire && sDire === normalizedRadiant)) {
      return s;
    }
  }
  return null;
}

async function main() {
  console.log('========================================');
  console.log('DOTA2 Hub - OpenDota Incremental Sync v4');
  console.log('Time:', new Date().toISOString());
  console.log('========================================\n');
  
  // 获取 proMatches（所有职业比赛）
  console.log('--- Fetching proMatches ---');
  let newMatches = [];
  
  try {
    const proMatches = await fetchWithRetry(`${OPENDOTA_BASE_URL}/proMatches`);
    console.log(`  Got ${proMatches.length} pro matches`);
    
    for (const match of proMatches.slice(0, 200)) {
      const matchId = String(match.match_id);
      
      // 检查是否已存在
      if (existingMatchIds.has(matchId)) {
        continue; // 跳过已存在的比赛
      }
      
      // 检查是否是已知赛事
      const tournament = tournamentInfo[match.leagueid];
      if (!tournament) {
        continue; // 跳过未知赛事
      }
      
      // 新比赛 - 添加到列表
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
  console.log(`New matches found for known tournaments: ${newMatches.length}`);
  console.log('========================================\n');
  
  if (newMatches.length === 0) {
    console.log('No new matches to sync');
    return;
  }
  
  // 按系列赛分组新比赛
  const matchesBySeries = {};
  
  for (const m of newMatches) {
    // 使用排序后的战队名作为 key
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
  
  // 更新 home.json
  for (const [seriesKey, seriesData] of Object.entries(matchesBySeries)) {
    const tid = seriesData.tournament;
    
    if (!homeData.seriesByTournament) {
      homeData.seriesByTournament = {};
    }
    if (!homeData.seriesByTournament[tid]) {
      homeData.seriesByTournament[tid] = [];
    }
    
    // 计算系列赛结果
    let radiantWins = 0, direWins = 0;
    for (const game of seriesData.games) {
      if (game.radiant_win) radiantWins++;
      else direWins++;
    }
    
    // 按时间排序
    const sortedGames = seriesData.games.sort((a, b) => a.start_time - b.start_time);
    
    // 确定系列赛类型
    const seriesType = sortedGames.length >= 5 ? 'BO5' : 'BO3';
    
    // 查找已存在的系列赛（智能匹配，忽略顺序）
    const existingSeries = findExistingSeries(tid, seriesData.radiant_team_name, seriesData.dire_team_name);
    
    if (existingSeries) {
      // 合并到现有系列赛
      console.log(`  Merging: ${seriesData.radiant_team_name} vs ${seriesData.dire_team_name} (existing: ${existingSeries.games.length} + new: ${sortedGames.length})`);
      
      // 添加新游戏到现有系列赛
      for (const newGame of sortedGames) {
        const gameExists = existingSeries.games.some(g => String(g.match_id) === String(newGame.match_id));
        if (!gameExists) {
          existingSeries.games.push(newGame);
        }
      }
      
      // 重新计算比分
      let radiantWins = 0, direWins = 0;
      for (const game of existingSeries.games) {
        if (game.radiant_win) radiantWins++;
        else direWins++;
      }
      existingSeries.radiant_wins = radiantWins;
      existingSeries.dire_wins = direWins;
      existingSeries.radiant_score = radiantWins;
      existingSeries.dire_score = direWins;
      existingSeries.games = existingSeries.games.sort((a, b) => a.start_time - b.start_time);
    } else {
      // 添加新系列赛
      const seriesEntry = {
        series_id: `opendota_${sortedGames[0].match_id}`,
        series_type: seriesType,
        radiant_team_name: seriesData.radiant_team_name,
        dire_team_name: seriesData.dire_team_name,
        games: sortedGames,
        radiant_wins: radiantWins,
        dire_wins: direWins,
        radiant_score: radiantWins,
        dire_score: direWins
      };
      
      homeData.seriesByTournament[tid].unshift(seriesEntry);
      console.log(`  Added: ${seriesData.radiant_team_name} vs ${seriesData.dire_team_name} (${radiantWins}:${direWins}, ${sortedGames.length} games)`);
    }
  }
  
  // 保存更新后的 home.json
  homeData.lastUpdated = new Date().toISOString();
  fs.writeFileSync(homeDataPath, JSON.stringify(homeData, null, 2));
  console.log('\nUpdated home.json');
  
  console.log('\nDone!');
}

main();
