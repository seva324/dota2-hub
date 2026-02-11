#!/usr/bin/env node
/**
 * 获取过去10天XG比赛结果
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', 'data', 'dota2.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

const OPENDOTA_API_KEY = process.env.OPENDOTA_API_KEY || 'ab01b0b0-c459-4524-92eb-0b6af0cdc415';
const OPENDOTA_BASE_URL = 'https://api.opendota.com/api';

// XG战队信息
const XG_TEAM = {
  id: 'xtreme-gaming',
  name: 'Xtreme Gaming',
  name_cn: 'XG',
  team_id: 8261500
};

// 延迟函数
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 带重试的请求
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
          await sleep(10000);
          continue;
        }
        throw new Error(`HTTP ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      if (i === retries - 1) throw error;
      console.log(`Retry ${i + 1}/${retries} for ${url}`);
      await sleep(2000 * (i + 1));
    }
  }
}

// 识别队伍
function identifyTeam(name) {
  if (!name) return { id: 'unknown', name_cn: name, is_cn: false };
  
  const upperName = name.toUpperCase();
  const lowerName = name.toLowerCase();
  
  if (upperName === 'XG' || lowerName.includes('xtreme')) {
    return { id: 'xtreme-gaming', name_cn: 'XG', is_cn: true };
  }
  
  if (upperName === 'YB' || lowerName.includes('yakult') || 
      upperName === 'AR' || lowerName.includes('azure')) {
    return { id: 'yakult-brother', name_cn: 'YB', is_cn: true };
  }
  
  if (upperName === 'VG' || lowerName.includes('vici')) {
    return { id: 'vici-gaming', name_cn: 'VG', is_cn: true };
  }
  
  return { id: 'unknown', name_cn: name, is_cn: false };
}

// 保存比赛到数据库
async function saveMatch(match, opposingTeamName) {
  const isRadiant = match.radiant;
  
  const radiantTeam = isRadiant ? { id: 'xtreme-gaming', name_cn: 'XG', is_cn: true } : identifyTeam(opposingTeamName);
  const direTeam = isRadiant ? identifyTeam(opposingTeamName) : { id: 'xtreme-gaming', name_cn: 'XG', is_cn: true };
  
  const radiantScore = match.radiant_score || 0;
  const direScore = match.dire_score || 0;
  
  // 计算胜场
  let radiantGameWins = 0;
  let direGameWins = 0;
  
  if (match.radiant_win !== undefined) {
    if (match.radiant_win) {
      radiantGameWins = 1;
    } else {
      direGameWins = 1;
    }
  }
  
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO matches (
      match_id, league_id, radiant_team_id, dire_team_id,
      radiant_score, dire_score, radiant_game_wins, dire_game_wins,
      start_time, duration, series_type, status, lobby_type
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const startTime = match.start_time;
  const now = Date.now() / 1000;
  const status = startTime < now - 3600 ? 'finished' : 'live';
  
  stmt.run(
    match.match_id,
    match.leagueid || null,
    radiantTeam.id,
    direTeam.id,
    radiantScore,
    direScore,
    radiantGameWins,
    direGameWins,
    startTime,
    match.duration || 0,
    'BO3',
    status,
    match.lobby_type || 7
  );
  
  const xgScore = isRadiant ? radiantGameWins : direGameWins;
  const oppScore = isRadiant ? direGameWins : radiantGameWins;
  const result = xgScore > oppScore ? '✓ 胜' : '✗ 负';
  
  console.log(`  ${result} XG ${xgScore}:${oppScore} ${opposingTeamName} (${new Date(startTime * 1000).toLocaleDateString()})`);
  
  return match;
}

async function main() {
  console.log('========================================');
  console.log('XG 过去10天比赛结果更新');
  console.log('Time:', new Date().toISOString());
  console.log('========================================\n');
  
  // 计算10天前的时间戳
  const now = Date.now() / 1000;
  const tenDaysAgo = now - (10 * 24 * 60 * 60);
  
  console.log(`获取 XG (team_id: ${XG_TEAM.team_id}) 的比赛...`);
  console.log(`时间范围: ${new Date(tenDaysAgo * 1000).toLocaleDateString()} - 现在\n`);
  
  // 获取XG的比赛
  const matches = await fetchWithRetry(`${OPENDOTA_BASE_URL}/teams/${XG_TEAM.team_id}/matches`);
  
  if (!matches || matches.length === 0) {
    console.log('没有找到比赛');
    db.close();
    return;
  }
  
  console.log(`从API获取到 ${matches.length} 场比赛\n`);
  
  // 筛选过去10天的比赛
  const recentMatches = matches.filter(m => m.start_time >= tenDaysAgo);
  console.log(`过去10天的比赛: ${recentMatches.length} 场\n`);
  
  // 保存比赛（带2秒间隔）
  let savedCount = 0;
  const allMatchIds = new Set();
  
  for (const match of recentMatches) {
    if (allMatchIds.has(match.match_id)) {
      continue;
    }
    
    const opposingTeamName = match.opposing_team_name || 'Unknown';
    
    try {
      await saveMatch(match, opposingTeamName);
      savedCount++;
      allMatchIds.add(match.match_id);
    } catch (error) {
      console.error(`Error saving match ${match.match_id}:`, error.message);
    }
    
    // 等待2秒
    if (recentMatches.indexOf(match) < recentMatches.length - 1) {
      await sleep(2000);
    }
  }
  
  console.log(`\n========================================`);
  console.log(`成功保存 ${savedCount} 场 XG 比赛`);
  console.log('========================================');
  
  db.close();
}

main().catch(err => {
  console.error('Error:', err);
  db.close();
  process.exit(1);
});
