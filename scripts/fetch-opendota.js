#!/usr/bin/env node
/**
 * OpenDota API 数据采集脚本 - XG/YB/VG 专用版
 * 只抓取这3个中国战队的比赛
 */

const Database = require('better-sqlite3');
const path = require('path');

const OPENDOTA_API_KEY = process.env.OPENDOTA_API_KEY || 'ab01b0b0-c459-4524-92eb-0b6af0cdc415';
const OPENDOTA_BASE_URL = 'https://api.opendota.com/api';

const dbPath = path.join(__dirname, '..', 'data', 'dota2.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// 只关注这3个中国战队
const TARGET_TEAMS = {
  // XG - Xtreme Gaming
  'Xtreme Gaming': { id: 'xtreme-gaming', name_cn: 'XG', is_cn: true },
  'XG': { id: 'xtreme-gaming', name_cn: 'XG', is_cn: true },
  'xtreme': { id: 'xtreme-gaming', name_cn: 'XG', is_cn: true },
  
  // YB - Yakult Brother (Azure Ray)
  'Yakult Brother': { id: 'yakult-brother', name_cn: 'YB', is_cn: true },
  'YB': { id: 'yakult-brother', name_cn: 'YB', is_cn: true },
  'yakult': { id: 'yakult-brother', name_cn: 'YB', is_cn: true },
  'Azure Ray': { id: 'yakult-brother', name_cn: 'YB', is_cn: true },
  'AR': { id: 'yakult-brother', name_cn: 'YB', is_cn: true },
  'azure': { id: 'yakult-brother', name_cn: 'YB', is_cn: true },
  
  // VG - Vici Gaming
  'Vici Gaming': { id: 'vici-gaming', name_cn: 'VG', is_cn: true },
  'VG': { id: 'vici-gaming', name_cn: 'VG', is_cn: true },
  'vici': { id: 'vici-gaming', name_cn: 'VG', is_cn: true },
};

// 知名对手战队
const OPPONENT_TEAMS = {
  'Team Liquid': { id: 'team-liquid', region: 'Europe' },
  'Team Spirit': { id: 'team-spirit', region: 'Eastern Europe' },
  'Gaimin Gladiators': { id: 'gaimin-gladiators', region: 'Europe' },
  'BetBoom Team': { id: 'betboom', region: 'Eastern Europe' },
  'Team Falcons': { id: 'team-falcons', region: 'MENA' },
  'Nouns': { id: 'nouns', region: 'NA' },
  'Tundra': { id: 'tundra', region: 'Europe' },
  'PARIVISION': { id: 'parivision', region: 'Eastern Europe' },
  'AVULUS': { id: 'avulus', region: 'Europe' },
  'BOOM Esports': { id: 'boom-esports', region: 'SEA' },
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

// 识别战队
function identifyTeam(name) {
  if (!name) return { id: 'unknown', name_cn: name, is_cn: false };
  
  // 直接匹配目标战队
  if (TARGET_TEAMS[name]) {
    return { ...TARGET_TEAMS[name], name };
  }
  
  // 部分匹配
  const lowerName = name.toLowerCase();
  for (const [key, team] of Object.entries(TARGET_TEAMS)) {
    if (lowerName.includes(key.toLowerCase())) {
      return { ...team, name };
    }
  }
  
  // 匹配知名对手
  if (OPPONENT_TEAMS[name]) {
    return { id: OPPONENT_TEAMS[name].id, name_cn: name, is_cn: false, region: OPPONENT_TEAMS[name].region };
  }
  
  // 生成通用ID
  const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
  return { id, name_cn: name, is_cn: false };
}

// 检查是否是目标比赛（包含XG/YB/VG）
function isTargetMatch(radiantName, direName) {
  const radiant = identifyTeam(radiantName);
  const dire = identifyTeam(direName);
  return radiant.is_cn || dire.is_cn;
}

// 更新战队信息
function updateTeam(teamInfo) {
  if (!teamInfo || !teamInfo.id) return;
  
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO teams (id, name, name_cn, tag, region, is_cn_team, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, unixepoch())
  `);
  
  stmt.run(
    teamInfo.id,
    teamInfo.name || teamInfo.id,
    teamInfo.name_cn || null,
    teamInfo.name_cn || null, // tag
    teamInfo.is_cn ? 'China' : (teamInfo.region || 'Unknown'),
    teamInfo.is_cn ? 1 : 0
  );
  
  if (teamInfo.is_cn) {
    console.log(`✓ CN Team: ${teamInfo.name_cn} (${teamInfo.name})`);
  }
}

// 保存比赛
async function saveMatch(match) {
  const radiantTeam = identifyTeam(match.radiant_name);
  const direTeam = identifyTeam(match.dire_name);
  
  // 只保存包含 XG/YB/VG 的比赛
  if (!radiantTeam.is_cn && !direTeam.is_cn) {
    return null;
  }
  
  // 更新战队信息
  updateTeam({ ...radiantTeam, name: match.radiant_name });
  updateTeam({ ...direTeam, name: match.dire_name });
  
  // 确定比赛状态
  const now = Date.now() / 1000;
  let status = 'scheduled';
  if (match.start_time < now - 3600) {
    status = 'finished';
  } else if (match.start_time < now) {
    status = 'live';
  }
  
  // 比赛结果
  let radiantGameWins = 0;
  let direGameWins = 0;
  
  if (status === 'finished') {
    if (match.radiant_win) {
      radiantGameWins = 2; // 简化处理，显示 2:0 或 2:1 风格
      direGameWins = match.dire_score > match.radiant_score ? 1 : 0;
    } else {
      radiantGameWins = match.radiant_score > match.dire_score ? 1 : 0;
      direGameWins = 2;
    }
  }
  
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO matches (
      match_id, league_id, radiant_team_id, dire_team_id,
      radiant_score, dire_score, radiant_game_wins, dire_game_wins,
      start_time, duration, series_type, status, lobby_type
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    match.match_id,
    match.leagueid || null,
    radiantTeam.id,
    direTeam.id,
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
  
  console.log(`  Match: ${radiantTeam.name_cn} ${radiantGameWins}:${direGameWins} ${direTeam.name_cn} (${status})`);
  return match;
}

// 获取职业比赛
async function fetchProMatches() {
  console.log('Fetching pro matches from OpenDota...');
  const data = await fetchWithRetry(`${OPENDOTA_BASE_URL}/proMatches`);
  return data || [];
}

// 主函数
async function main() {
  console.log('========================================');
  console.log('DOTA2 Hub - XG/YB/VG Match Fetcher');
  console.log('Time:', new Date().toISOString());
  console.log('========================================\n');
  
  let savedCount = 0;
  
  try {
    // 获取职业比赛
    const proMatches = await fetchProMatches();
    console.log(`Fetched ${proMatches.length} total matches, filtering for XG/YB/VG...\n`);
    
    for (const match of proMatches) {
      try {
        const result = await saveMatch(match);
        if (result) {
          savedCount++;
        }
        
        await new Promise(r => setTimeout(r, 30));
      } catch (error) {
        console.error(`Error:`, error.message);
      }
    }
    
  } catch (error) {
    console.error('Fatal error:', error);
  }
  
  console.log(`\n========================================`);
  console.log(`Total XG/YB/VG matches saved: ${savedCount}`);
  console.log('========================================');
  
  db.close();
}

main();
