#!/usr/bin/env node
/**
 * OpenDota API 数据采集脚本 - 完整版
 * 获取真实的比赛数据，包括中国战队比赛
 */

const Database = require('better-sqlite3');
const path = require('path');

const OPENDOTA_API_KEY = process.env.OPENDOTA_API_KEY || 'ab01b0b0-c459-4524-92eb-0b6af0cdc415';
const OPENDOTA_BASE_URL = 'https://api.opendota.com/api';

const dbPath = path.join(__dirname, '..', 'data', 'dota2.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// 中国战队账号ID映射（用于精确匹配）
const CN_TEAM_IDS = {
  8261502: 'xtreme-gaming',    // XG
  8255888: 'azure-ray',        // AR
  7391077: 'vici-gaming',      // VG
  8261502: 'lgd-gaming',       // LGD (需要确认)
  39: 'invictus-gaming',       // iG
  // 添加更多...
};

// 中国战队名称映射
const CN_TEAM_NAMES = {
  'Xtreme Gaming': { id: 'xtreme-gaming', name_cn: 'XG', tag: 'XG' },
  'XG': { id: 'xtreme-gaming', name_cn: 'XG', tag: 'XG' },
  'Azure Ray': { id: 'azure-ray', name_cn: 'AR', tag: 'AR' },
  'AR': { id: 'azure-ray', name_cn: 'AR', tag: 'AR' },
  'Vici Gaming': { id: 'vici-gaming', name_cn: 'VG', tag: 'VG' },
  'VG': { id: 'vici-gaming', name_cn: 'VG', tag: 'VG' },
  'LGD Gaming': { id: 'lgd-gaming', name_cn: 'LGD', tag: 'LGD' },
  'PSG.LGD': { id: 'lgd-gaming', name_cn: 'LGD', tag: 'LGD' },
  'Invictus Gaming': { id: 'invictus-gaming', name_cn: 'iG', tag: 'iG' },
  'iG': { id: 'invictus-gaming', name_cn: 'iG', tag: 'iG' },
  'G2 x iG': { id: 'g2-ig', name_cn: 'G2.iG', tag: 'G2.iG' },
  'G2.iG': { id: 'g2-ig', name_cn: 'G2.iG', tag: 'G2.iG' },
  'Team Zero': { id: 'team-zero', name_cn: 'TZ', tag: 'TZ' },
  'TZ': { id: 'team-zero', name_cn: 'TZ', tag: 'TZ' },
  'Team Aster': { id: 'team-aster', name_cn: 'Aster', tag: 'Aster' },
  'Aster': { id: 'team-aster', name_cn: 'Aster', tag: 'Aster' },
  'Bright': { id: 'bright', name_cn: 'Bright', tag: 'Bright' },
};

// 知名战队（用于对比）
const FAMOUS_TEAMS = {
  'Team Liquid': { id: 'team-liquid', region: 'Europe' },
  'Team Spirit': { id: 'team-spirit', region: 'Eastern Europe' },
  'Gaimin Gladiators': { id: 'gaimin-gladiators', region: 'Europe' },
  'BetBoom Team': { id: 'betboom', region: 'Eastern Europe' },
  'Team Falcons': { id: 'team-falcons', region: 'MENA' },
  'Nouns': { id: 'nouns', region: 'NA' },
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

// 获取职业比赛
async function fetchProMatches() {
  console.log('Fetching pro matches from OpenDota...');
  const data = await fetchWithRetry(`${OPENDOTA_BASE_URL}/proMatches`);
  return data || [];
}

// 获取公开比赛（更大量）
async function fetchPublicMatches() {
  console.log('Fetching public matches...');
  const data = await fetchWithRetry(`${OPENDOTA_BASE_URL}/publicMatches?mmr_descending=1`);
  return data || [];
}

// 获取特定比赛的详细信息（包括小分）
async function fetchMatchDetails(matchId) {
  try {
    const data = await fetchWithRetry(`${OPENDOTA_BASE_URL}/matches/${matchId}`);
    return data;
  } catch (error) {
    console.error(`Failed to fetch match ${matchId}:`, error.message);
    return null;
  }
}

// 识别战队
function identifyTeam(name) {
  if (!name) return { id: 'unknown', name_cn: name, is_cn: false };
  
  // 直接匹配中国战队
  if (CN_TEAM_NAMES[name]) {
    return { ...CN_TEAM_NAMES[name], is_cn: true };
  }
  
  // 匹配知名战队
  if (FAMOUS_TEAMS[name]) {
    return { id: FAMOUS_TEAMS[name].id, name_cn: name, is_cn: false };
  }
  
  // 生成通用ID
  const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
  return { id, name_cn: name, is_cn: false };
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
    teamInfo.tag || null,
    teamInfo.is_cn ? 'China' : (teamInfo.region || 'Unknown'),
    teamInfo.is_cn ? 1 : 0
  );
  
  console.log(`Updated team: ${teamInfo.name || teamInfo.id} (${teamInfo.is_cn ? 'CN' : 'Other'})`);
}

// 计算系列赛比分（BO3/BO5）
function calculateSeriesScore(matchDetails) {
  if (!matchDetails || !matchDetails.picks_bans) {
    return { radiant_wins: 0, dire_wins: 0 };
  }
  
  // 这里简化处理，实际应该从系列赛数据中获取
  // OpenDota 的 proMatches 返回的是单场比赛，series 数据需要另外获取
  const radiantWin = matchDetails.radiant_win;
  return {
    radiant_wins: radiantWin ? 1 : 0,
    dire_wins: radiantWin ? 0 : 1
  };
}

// 保存比赛
async function saveMatch(match) {
  const radiantTeam = identifyTeam(match.radiant_name);
  const direTeam = identifyTeam(match.dire_name);
  
  // 只保存中国战队的比赛或知名比赛
  const isCnMatch = radiantTeam.is_cn || direTeam.is_cn;
  const isFamousTeam = FAMOUS_TEAMS[match.radiant_name] || FAMOUS_TEAMS[match.dire_name];
  
  if (!isCnMatch && !isFamousTeam) {
    return null;
  }
  
  // 更新战队信息
  updateTeam({ ...radiantTeam, name: match.radiant_name });
  updateTeam({ ...direTeam, name: match.dire_name });
  
  // 确定比赛状态
  const now = Date.now() / 1000;
  let status = 'scheduled';
  if (match.start_time < now - 3600) { // 已开始1小时以上
    status = 'finished';
  } else if (match.start_time < now) {
    status = 'live';
  }
  
  // 尝试获取详细信息（包括小分）
  let radiantGameWins = 0;
  let direGameWins = 0;
  
  if (status === 'finished') {
    // 简化处理：单场比赛 radiant_win 决定胜负
    // 实际 BO3 数据需要 series 信息，这里先标记为 1:0 或 0:1
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
    'BO3', // 默认BO3
    status,
    match.lobby_type || 0
  );
  
  console.log(`Saved: ${radiantTeam.name_cn || match.radiant_name} vs ${direTeam.name_cn || match.dire_name} (${status})`);
  return match;
}

// 获取并保存联赛信息
async function fetchAndSaveLeagues() {
  console.log('Fetching leagues...');
  try {
    const leagues = await fetchWithRetry(`${OPENDOTA_BASE_URL}/leagues`);
    
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO tournaments (id, name, tier, status, updated_at)
      VALUES (?, ?, ?, 'upcoming', unixepoch())
    `);
    
    // 筛选知名联赛
    const tier1Leagues = leagues.filter(l => 
      l.name.toLowerCase().includes('international') ||
      l.name.toLowerCase().includes('esl one') ||
      l.name.toLowerCase().includes('dreamleague') ||
      l.name.toLowerCase().includes('pgl') ||
      l.name.toLowerCase().includes('betboom') ||
      l.name.toLowerCase().includes('blast')
    );
    
    for (const league of tier1Leagues.slice(0, 20)) {
      stmt.run(league.leagueid, league.name, 'T1');
    }
    
    console.log(`Saved ${tier1Leagues.length} tournaments`);
  } catch (error) {
    console.error('Error fetching leagues:', error.message);
  }
}

// 主函数
async function main() {
  console.log('========================================');
  console.log('DOTA2 Hub - Data Fetcher');
  console.log('Time:', new Date().toISOString());
  console.log('========================================\n');
  
  try {
    // 获取联赛信息
    await fetchAndSaveLeagues();
    
    // 获取职业比赛
    console.log('\n--- Fetching Pro Matches ---');
    const proMatches = await fetchProMatches();
    console.log(`Total pro matches: ${proMatches.length}`);
    
    let savedCount = 0;
    let cnMatchCount = 0;
    
    for (const match of proMatches.slice(0, 150)) {
      try {
        const result = await saveMatch(match);
        if (result) {
          savedCount++;
          const radiantTeam = identifyTeam(match.radiant_name);
          const direTeam = identifyTeam(match.dire_name);
          if (radiantTeam.is_cn || direTeam.is_cn) {
            cnMatchCount++;
          }
        }
        
        // 间隔请求
        await new Promise(r => setTimeout(r, 50));
      } catch (error) {
        console.error(`Error processing match ${match.match_id}:`, error.message);
      }
    }
    
    console.log(`\n--- Summary ---`);
    console.log(`Total matches saved: ${savedCount}`);
    console.log(`China team matches: ${cnMatchCount}`);
    
  } catch (error) {
    console.error('Fatal error:', error);
  }
  
  db.close();
  console.log('\nDone!');
}

main();
