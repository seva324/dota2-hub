#!/usr/bin/env node
/**
 * OpenDota 选手映射同步脚本
 * 1. 从 proPlayers API 获取职业选手并存储到 SQLite
 * 2. 从比赛数据中提取未知选手名字并缓存
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OPENDOTA_API_KEY = process.env.OPENDOTA_API_KEY || 'ab01b0b0-c459-4524-92eb-0b6af0cdc415';
const OPENDOTA_BASE_URL = 'https://api.opendota.com/api';

const publicDataDir = path.join(__dirname, '..', 'public', 'data');
const dbPath = path.join(__dirname, '..', 'data', 'players.db');

// 确保 data 目录存在
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 初始化数据库
const db = new Database(dbPath);

// 创建表
db.exec(`
  CREATE TABLE IF NOT EXISTS pro_players (
    account_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    team_name TEXT,
    realname TEXT,
    last_updated INTEGER
  );
  
  CREATE TABLE IF NOT EXISTS player_cache (
    account_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    last_updated INTEGER
  );
  
  CREATE INDEX IF NOT EXISTS idx_team_name ON pro_players(team_name);
  CREATE INDEX IF NOT EXISTS idx_player_cache_updated ON player_cache(last_updated);
`);

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

// 从 proPlayers API 同步职业选手
async function syncProPlayers() {
  console.log('=== Syncing proPlayers from OpenDota ===');
  
  try {
    const proPlayers = await fetchWithRetry(`${OPENDOTA_BASE_URL}/proPlayers`);
    console.log(`  Got ${proPlayers.length} pro players`);
    
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO pro_players (account_id, name, team_name, realname, last_updated)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    const insertMany = db.transaction((players) => {
      for (const p of players) {
        if (p.account_id) {
          stmt.run(
            p.account_id,
            p.name || '',
            p.team_name || null,
            p.realname || '',
            Date.now()
          );
        }
      }
    });
    
    insertMany(proPlayers);
    console.log(`  Synced ${proPlayers.length} pro players to database`);
    
  } catch (error) {
    console.error('  Error syncing proPlayers:', error.message);
  }
}

// 从比赛数据中提取未知选手并缓存
async function syncUnknownPlayersFromMatches() {
  console.log('\n=== Syncing unknown players from matches ===');
  
  // 读取 home.json 中的所有比赛
  const homeDataPath = path.join(publicDataDir, 'home.json');
  
  if (!fs.existsSync(homeDataPath)) {
    console.log('  No home.json found, skipping');
    return;
  }
  
  const homeData = JSON.parse(fs.readFileSync(homeDataPath, 'utf-8'));
  
  // 收集所有比赛 ID
  const matchIds = new Set();
  for (const seriesList of Object.values(homeData.seriesByTournament || {})) {
    for (const s of seriesList) {
      for (const game of s.games || []) {
        matchIds.add(String(game.match_id));
      }
    }
  }
  
  console.log(`  Found ${matchIds.size} matches to process`);
  
  // 获取已缓存的选手
  const cachedPlayers = new Map();
  const cachedStmt = db.prepare('SELECT account_id, name, last_updated FROM player_cache');
  for (const row of cachedStmt.all()) {
    cachedPlayers.set(row.account_id, row);
  }
  
  // 获取已知的职业选手
  const knownPlayers = new Set();
  const knownStmt = db.prepare('SELECT account_id FROM pro_players');
  for (const row of knownStmt.all()) {
    knownPlayers.add(row.account_id);
  }
  
  // 需要获取的比赛（限制每次处理数量）
  const matchesToFetch = Array.from(matchIds).slice(0, 50);
  const newPlayerIds = new Set();
  
  for (const matchId of matchesToFetch) {
    try {
      const match = await fetchWithRetry(`${OPENDOTA_BASE_URL}/matches/${matchId}`);
      
      for (const player of match.players || []) {
        const accountId = player.account_id;
        
        // 跳过职业选手（已有映射）
        if (knownPlayers.has(accountId)) continue;
        
        // 跳过已有缓存的选手（7天内不更新）
        if (cachedPlayers.has(accountId)) {
          const cached = cachedPlayers.get(accountId);
          const daysSinceUpdate = (Date.now() - cached.last_updated) / (1000 * 60 * 60 * 24);
          if (daysSinceUpdate < 7) continue;
        }
        
        // 使用 persona_name 或 anonymous_account_id
        const playerName = player.personaname || (player.anonymous_account_id ? `Anonymous_${player.anonymous_account_id}` : null);
        
        if (playerName && !newPlayerIds.has(accountId)) {
          newPlayerIds.add({
            account_id: accountId,
            name: playerName
          });
        }
      }
    } catch (error) {
      console.log(`  Error fetching match ${matchId}:`, error.message);
    }
  }
  
  console.log(`  Found ${newPlayerIds.size} new/updated player names`);
  
  // 批量更新缓存
  if (newPlayerIds.size > 0) {
    const cacheStmt = db.prepare(`
      INSERT OR REPLACE INTO player_cache (account_id, name, last_updated)
      VALUES (?, ?, ?)
    `);
    
    const cacheMany = db.transaction((players) => {
      for (const p of players) {
        cacheStmt.run(p.account_id, p.name, Date.now());
      }
    });
    
    cacheMany(Array.from(newPlayerIds));
    console.log(`  Cached ${newPlayerIds.size} player names`);
  }
}

// 导出合并后的映射表到 JSON
function exportPlayerMapping() {
  console.log('\n=== Exporting player mapping to JSON ===');
  
  const playerMapping = {};
  
  // 先获取职业选手
  const proStmt = db.prepare('SELECT account_id, name, team_name, realname FROM pro_players');
  for (const row of proStmt.all()) {
    playerMapping[row.account_id] = {
      name: row.name,
      team_name: row.team_name,
      realname: row.realname
    };
  }
  
  // 再获取缓存的非职业选手（覆盖）
  const cacheStmt = db.prepare('SELECT account_id, name FROM player_cache');
  for (const row of cacheStmt.all()) {
    // 不覆盖职业选手
    if (!playerMapping[row.account_id]) {
      playerMapping[row.account_id] = {
        name: row.name,
        team_name: null,
        realname: ''
      };
    }
  }
  
  // 保存到 public/data/pro_players.json
  const outputPath = path.join(publicDataDir, 'pro_players.json');
  fs.writeFileSync(outputPath, JSON.stringify(playerMapping, null, 2));
  
  console.log(`  Exported ${Object.keys(playerMapping).length} player mappings to ${outputPath}`);
}

async function main() {
  console.log('========================================');
  console.log('OpenDota Player Mapping Sync');
  console.log('Time:', new Date().toISOString());
  console.log('========================================\n');
  
  // 1. 同步职业选手
  await syncProPlayers();
  
  // 2. 从比赛数据中补充未知选手
  await syncUnknownPlayersFromMatches();
  
  // 3. 导出到 JSON
  exportPlayerMapping();
  
  console.log('\nDone!');
  
  db.close();
}

main();
