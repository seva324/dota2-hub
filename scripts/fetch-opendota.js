#!/usr/bin/env node
/**
 * OpenDota API 数据采集脚本
 * 获取比赛数据并存储到 SQLite 数据库
 * API Key: ab01b0b0-c459-4524-92eb-0b6af0cdc415
 */

const Database = require('better-sqlite3');
const path = require('path');

const OPENDOTA_API_KEY = 'ab01b0b0-c459-4524-92eb-0b6af0cdc415';
const OPENDOTA_BASE_URL = 'https://api.opendota.com/api';

const dbPath = path.join(__dirname, '..', 'data', 'dota2.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// 重点关注的联赛ID（T1级别赛事）
const T1_LEAGUE_IDS = [
  // The International
  16473, // TI 2024
  15438, // TI 2023
  // ESL Pro Tour
  16935, // ESL One Bangkok 2024
  16859, // DreamLeague S24
  // PGL
  16991, // PGL Wallachia S3
  // BetBoom
  16936, // BetBoom Dacha S2
  // BLAST
  16951, // BLAST Slam S2
  // FISSURE
  16915, // FISSURE Playground
];

// 中国战队关键词映射
const CN_TEAMS = {
  'xtreme': 'xtreme-gaming',
  'xg': 'xtreme-gaming',
  'azure': 'azure-ray',
  'ar': 'azure-ray',
  'vici': 'vici-gaming',
  'vg': 'vici-gaming',
  'lgd': 'lgd-gaming',
  'psg': 'lgd-gaming',
  'invictus': 'invictus-gaming',
  'ig': 'invictus-gaming',
  'g2': 'g2-ig',
  'zero': 'team-zero',
  'tz': 'team-zero',
  'aster': 'team-aster',
};

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${OPENDOTA_API_KEY}`,
        },
      });
      
      if (!response.ok) {
        if (response.status === 429) {
          console.log('Rate limited, waiting 5s...');
          await new Promise(r => setTimeout(r, 5000));
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

// 获取职业比赛列表
async function fetchProMatches() {
  console.log('Fetching pro matches...');
  const data = await fetchWithRetry(`${OPENDOTA_BASE_URL}/proMatches`);
  return data || [];
}

// 获取联赛信息
async function fetchLeagues() {
  console.log('Fetching leagues...');
  const data = await fetchWithRetry(`${OPENDOTA_BASE_URL}/leagues`);
  return data || [];
}

// 获取比赛详情
async function fetchMatchDetails(matchId) {
  console.log(`Fetching match ${matchId}...`);
  const data = await fetchWithRetry(`${OPENDOTA_BASE_URL}/matches/${matchId}`);
  return data;
}

// 识别战队
function identifyTeam(name) {
  if (!name) return null;
  const lowerName = name.toLowerCase();
  
  for (const [keyword, teamId] of Object.entries(CN_TEAMS)) {
    if (lowerName.includes(keyword)) {
      return teamId;
    }
  }
  
  // 生成通用ID
  return name.toLowerCase().replace(/[^a-z0-9]/g, '-');
}

// 保存比赛到数据库
function saveMatch(match) {
  const radiantTeamId = identifyTeam(match.radiant_name);
  const direTeamId = identifyTeam(match.dire_name);
  
  // 检查是否为T1赛事或中国战队比赛
  const isT1 = T1_LEAGUE_IDS.includes(match.leagueid);
  const isCnMatch = [radiantTeamId, direTeamId].some(id => 
    id && Object.values(CN_TEAMS).includes(id)
  );
  
  if (!isT1 && !isCnMatch) {
    return; // 跳过非T1且无关的比赛
  }
  
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO matches (
      match_id, league_id, radiant_team_id, dire_team_id,
      radiant_score, dire_score, start_time, duration,
      series_type, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    match.match_id,
    match.leagueid,
    radiantTeamId,
    direTeamId,
    match.radiant_score || 0,
    match.dire_score || 0,
    match.start_time,
    match.duration || 0,
    'BO3', // 默认BO3
    match.start_time * 1000 < Date.now() ? 'finished' : 'scheduled'
  );
  
  console.log(`Saved match: ${match.match_id}`);
}

// 更新战队信息
function updateTeam(teamName, isRadiant) {
  if (!teamName) return;
  
  const teamId = identifyTeam(teamName);
  const isCnTeam = Object.values(CN_TEAMS).includes(teamId);
  
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO teams (id, name, region, is_cn_team)
    VALUES (?, ?, ?, ?)
  `);
  
  stmt.run(teamId, teamName, isCnTeam ? 'China' : 'Unknown', isCnTeam ? 1 : 0);
}

// 主函数
async function main() {
  console.log('=== OpenDota Data Fetcher ===');
  console.log('Start time:', new Date().toISOString());
  
  try {
    // 获取职业比赛
    const proMatches = await fetchProMatches();
    console.log(`Fetched ${proMatches.length} pro matches`);
    
    let savedCount = 0;
    for (const match of proMatches.slice(0, 100)) {
      try {
        // 更新战队信息
        updateTeam(match.radiant_name, true);
        updateTeam(match.dire_name, false);
        
        // 保存比赛
        saveMatch(match);
        savedCount++;
        
        // 间隔请求以避免限流
        await new Promise(r => setTimeout(r, 100));
      } catch (error) {
        console.error(`Error processing match ${match.match_id}:`, error.message);
      }
    }
    
    console.log(`\nSaved ${savedCount} matches`);
    console.log('End time:', new Date().toISOString());
    
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
  
  db.close();
}

main();
