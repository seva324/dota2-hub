#!/usr/bin/env node
/**
 * OpenDota 增量更新脚本 - 只获取新比赛，不重建数据库
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OPENDOTA_API_KEY = process.env.OPENDOTA_API_KEY || 'ab01b0b0-c459-4524-92eb-0b6af0cdc415';
const OPENDOTA_BASE_URL = 'https://api.opendota.com/api';

const dbPath = path.join(__dirname, '..', 'data', 'dota2.db');

// 如果数据库不存在，初始化它
import fs from 'fs';
if (!fs.existsSync(dbPath)) {
  console.log('Database not found, initializing...');
  const initDb = (await import('./init-db.js')).default;
  initDb();
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// 确保 matches 表存在
try {
  db.prepare('SELECT 1 FROM matches LIMIT 1').get();
} catch (e) {
  console.log('Creating matches table...');
  db.exec(`
    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id TEXT UNIQUE,
      radiant_team_id TEXT,
      dire_team_id TEXT,
      radiant_team_name TEXT,
      radiant_team_name_cn TEXT,
      dire_team_name TEXT,
      dire_team_name_cn TEXT,
      radiant_team_logo TEXT,
      dire_team_logo TEXT,
      radiant_score INTEGER DEFAULT 0,
      dire_score INTEGER DEFAULT 0,
      radiant_game_wins INTEGER DEFAULT 0,
      dire_game_wins INTEGER DEFAULT 0,
      start_time INTEGER,
      duration INTEGER DEFAULT 0,
      series_type TEXT,
      league_id INTEGER,
      tournament_id TEXT,
      tournament_name TEXT,
      tournament_name_cn TEXT,
      status TEXT,
      lobby_type INTEGER,
      game_mode INTEGER,
      created_at INTEGER,
      radiant_win INTEGER
    )
  `);
}

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

function saveMatch(match) {
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
    } else {
      direGameWins = 1;
    }
  }
  
  // 检查是否已存在
  const existing = db.prepare('SELECT radiant_score, dire_score, status FROM matches WHERE match_id = ?').get(match.match_id);
  
  if (existing) {
    // 如果是 live 或 finished 状态，更新比分
    if (status !== 'scheduled' && (existing.radiant_score !== match.radiant_score || existing.dire_score !== match.dire_score)) {
      db.prepare(`
        UPDATE matches SET
          radiant_score = ?, dire_score = ?,
          radiant_game_wins = ?, dire_game_wins = ?,
          status = ?, radiant_win = ?
        WHERE match_id = ?
      `).run(
        match.radiant_score || 0,
        match.dire_score || 0,
        radiantGameWins,
        direGameWins,
        status,
        match.radiant_win ? 1 : 0,
        match.match_id
      );
      console.log(`  🔄 ${match.radiant_name} ${match.radiant_score}:${match.dire_score} ${match.dire_name} (${status})`);
      return 'updated';
    }
    return 'existing';
  }
  
  // 新比赛
  db.prepare(`
    INSERT OR REPLACE INTO matches (
      match_id, league_id, radiant_team_id, dire_team_id,
      radiant_team_name, radiant_team_name_cn,
      dire_team_name, dire_team_name_cn,
      radiant_team_logo, dire_team_logo,
      radiant_score, dire_score, radiant_game_wins, dire_game_wins,
      start_time, duration, series_type, status, lobby_type,
      radiant_win
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    match.match_id,
    match.leagueid || null,
    match.radiant_team_id || null,
    match.dire_team_id || null,
    match.radiant_name || null,
    null,
    match.dire_name || null,
    null,
    null,
    null,
    match.radiant_score || 0,
    match.dire_score || 0,
    radiantGameWins,
    direGameWins,
    match.start_time,
    match.duration || 0,
    'BO3',
    status,
    match.lobby_type || 0,
    match.radiant_win ? 1 : 0
  );
  
  console.log(`  ✓ ${match.radiant_name} ${match.radiant_score}:${match.dire_score} ${match.dire_name} (${status})`);
  return 'new';
}

async function main() {
  console.log('========================================');
  console.log('DOTA2 Hub - OpenDota Incremental Sync');
  console.log('Time:', new Date().toISOString());
  console.log('========================================\n');
  
  let newCount = 0;
  let updatedCount = 0;
  let existingCount = 0;
  
  // 获取 proMatches（所有职业比赛）
  console.log('--- Fetching proMatches ---');
  try {
    const proMatches = await fetchWithRetry(`${OPENDOTA_BASE_URL}/proMatches`);
    console.log(`  Got ${proMatches.length} pro matches`);
    
    for (const match of proMatches.slice(0, 200)) {
      const result = saveMatch(match);
      if (result === 'new') {
        newCount++;
      } else if (result === 'updated') {
        updatedCount++;
      } else {
        existingCount++;
      }
    }
  } catch (error) {
    console.error('  Error:', error.message);
  }
  
  console.log(`\n========================================`);
  console.log(`New matches: ${newCount}`);
  console.log(`Updated matches: ${updatedCount}`);
  console.log(`Existing matches: ${existingCount}`);
  console.log('========================================');
  
  db.close();
}

main();
