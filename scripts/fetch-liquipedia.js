#!/usr/bin/env node
/**
 * Liquipedia 比赛数据抓取脚本 - 增强版
 * 从 Liquipedia:Upcoming_and_ongoing_matches 获取比赛
 * 提取 OpenDota/Stratz match_id
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import zlib from 'zlib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', 'data', 'dota2.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

const OPENDOTA_API_KEY = process.env.OPENDOTA_API_KEY || 'ab01b0b0-c459-4524-92eb-0b6af0cdc415';
const OPENDOTA_BASE_URL = 'https://api.opendota.com/api';

// 中国战队识别
const CN_TEAMS = {
  'xtreme gaming': { id: 'xtreme-gaming', name_cn: 'XG', team_id: 8261502 },
  'xg': { id: 'xtreme-gaming', name_cn: 'XG', team_id: 8261502 },
  'yakult brothers': { id: 'yakult-brothers', name_cn: 'YB', team_id: 8255888 },
  'yakult brother': { id: 'yakult-brothers', name_cn: 'YB', team_id: 8255888 },
  'yb': { id: 'yakult-brothers', name_cn: 'YB', team_id: 8255888 },
  'vici gaming': { id: 'vici-gaming', name_cn: 'VG', team_id: 7391077 },
  'vg': { id: 'vici-gaming', name_cn: 'VG', team_id: 7391077 },
  'azure ray': { id: 'azure-ray', name_cn: 'AR', team_id: null },
  'ar': { id: 'azure-ray', name_cn: 'AR', team_id: null },
  'psg.lgd': { id: 'psg-lgd', name_cn: 'LGD', team_id: null },
  'lgd': { id: 'psg-lgd', name_cn: 'LGD', team_id: null },
};

function identifyTeam(name) {
  if (!name) return { id: 'unknown', name_cn: name, is_cn: false };
  
  const lowerName = name.toLowerCase().trim();
  
  for (const [key, info] of Object.entries(CN_TEAMS)) {
    if (lowerName.includes(key) || key.includes(lowerName)) {
      return { ...info, is_cn: true };
    }
  }
  
  return { id: 'unknown', name_cn: name, is_cn: false };
}

function fetchWithGzip(url, customHeaders = {}) {
  return new Promise((resolve, reject) => {
    const options = new URL(url);
    options.headers = {
      'User-Agent': 'DOTA2-Hub-Bot/1.0 (https://github.com/seva324/dota2-hub)',
      'Accept-Encoding': 'gzip',
      'Accept': 'application/json, text/html',
      ...customHeaders
    };
    
    const req = https.get(options, (res) => {
      const chunks = [];
      
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        
        try {
          if (res.headers['content-encoding'] === 'gzip') {
            zlib.gunzip(buffer, (err, decompressed) => {
              if (err) reject(err);
              else resolve(decompressed.toString('utf-8'));
            });
          } else {
            resolve(buffer.toString('utf-8'));
          }
        } catch (err) {
          reject(err);
        }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

/**
 * 从 Liquipedia HTML 中解析比赛数据
 */
function parseMatchesFromHtml(html) {
  const matches = [];
  
  // 按比赛卡片分割
  const matchBlocks = html.split('class="infobox_matches_content"');
  
  for (let i = 1; i < matchBlocks.length; i++) {
    const block = matchBlocks[i];
    
    // 跳过非 Dota2 比赛
    const gameCheck = block.match(/data-game="([^"]+)"/);
    if (gameCheck && gameCheck[1] !== 'Dota 2') continue;
    
    // 提取队伍1
    const team1Match = block.match(/class="team-left[^"]*"[^>]*>[\s\S]*?title="([^"]+)"/);
    const team1 = team1Match ? team1Match[1].trim() : null;
    
    // 提取队伍2
    const team2Match = block.match(/class="team-right[^"]*"[^>]*>[\s\S]*?title="([^"]+)"/);
    const team2 = team2Match ? team2Match[1].trim() : null;
    
    // 提取比分
    let score1 = 0, score2 = 0;
    const versusMatch = block.match(/class="versus"[\s\S]*?<\/div>/);
    if (versusMatch) {
      const scores = versusMatch[0].match(/<span[^>]*style[^>]*>(\d+)<\/span>/g);
      if (scores && scores.length >= 2) {
        score1 = parseInt(scores[0].replace(/<[^>]+>/g, ''));
        score2 = parseInt(scores[1].replace(/<[^>]+>/g, ''));
      }
    }
    
    // 🔑 核心：提取 OpenDota match_id
    let matchId = null;
    const opendotaLink = block.match(/opendota\.com\/matches\/(\d+)/);
    if (opendotaLink) {
      matchId = opendotaLink[1];
    }
    
    // 备选：Stratz match_id
    if (!matchId) {
      const stratzLink = block.match(/stratz\.com\/matches\/(\d+)/);
      if (stratzLink) {
        matchId = stratzLink[1];
      }
    }
    
    // 提取赛事名称
    let tournament = '';
    const tournamentMatch = block.match(/class="tournament-text"[^>]*><a[^>]*>([^<]+)</);
    if (tournamentMatch) {
      tournament = tournamentMatch[1].trim();
    }
    
    // 提取时间
    let timestamp = null;
    const timeMatch = block.match(/data-timestamp="(\d+)"/);
    if (timeMatch) {
      timestamp = parseInt(timeMatch[1]);
    }
    
    // 提取赛制 (Bo3, Bo5)
    let format = 'BO3';
    const formatMatch = block.match(/\(Bo(\d+)\)/i);
    if (formatMatch) {
      format = `BO${formatMatch[1]}`;
    }
    
    // 判断状态
    let status = 'scheduled';
    if (score1 > 0 || score2 > 0) {
      status = 'finished';
    }
    if (block.includes('Live') || block.includes('live')) {
      status = 'live';
    }
    
    // 只保留有效比赛
    if (team1 && team2 && team1 !== 'TBD' && team2 !== 'TBD') {
      matches.push({
        team1,
        team2,
        score1,
        score2,
        matchId,
        tournament,
        timestamp,
        format,
        status
      });
    }
  }
  
  return matches;
}

/**
 * 从 OpenDota 获取比赛的 BP 数据
 */
async function fetchMatchBP(matchId) {
  try {
    const headers = {};
    if (OPENDOTA_API_KEY) {
      headers['Authorization'] = `Bearer ${OPENDOTA_API_KEY}`;
    }
    
    const url = `${OPENDOTA_BASE_URL}/matches/${matchId}`;
    const responseText = await fetchWithGzip(url, headers);
    const data = JSON.parse(responseText);
    
    if (!data.picks_bans || data.picks_bans.length === 0) {
      return null;
    }
    
    // 按顺序排序
    const picksBans = data.picks_bans.sort((a, b) => a.order - b.order);
    
    return {
      match_id: matchId,
      radiant_win: data.radiant_win,
      duration: data.duration,
      radiant_score: data.radiant_score,
      dire_score: data.dire_score,
      picks_bans: picksBans.map(pb => ({
        is_pick: pb.is_pick,
        hero_id: pb.hero_id,
        order: pb.order,
        team: pb.team // 0 = radiant, 1 = dire
      }))
    };
  } catch (error) {
    console.error(`  Error fetching BP for match ${matchId}:`, error.message);
    return null;
  }
}

/**
 * 保存比赛到数据库
 */
async function saveMatch(match, bpData = null) {
  const team1Info = identifyTeam(match.team1);
  const team2Info = identifyTeam(match.team2);
  
  const insertMatch = db.prepare(`
    INSERT OR REPLACE INTO matches (
      match_id, radiant_team_id, dire_team_id, 
      radiant_team_name, radiant_team_name_cn,
      dire_team_name, dire_team_name_cn,
      radiant_score, dire_score,
      radiant_game_wins, dire_game_wins,
      start_time, duration, series_type, status, 
      lobby_type, tournament_name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const matchId = match.matchId || `lp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  insertMatch.run(
    matchId,
    team1Info.id,
    team2Info.id,
    match.team1,
    team1Info.name_cn || null,
    match.team2,
    team2Info.name_cn || null,
    match.score1,
    match.score2,
    match.score1,
    match.score2,
    match.timestamp || Math.floor(Date.now() / 1000),
    bpData?.duration || 0,
    match.format,
    match.status,
    7, // lobby_type = tournament
    match.tournament || null
  );
  
  // 如果有 BP 数据，保存到 bp_data 表
  if (bpData && bpData.picks_bans) {
    const insertBP = db.prepare(`
      INSERT OR REPLACE INTO bp_data (match_id, picks_bans, radiant_win)
      VALUES (?, ?, ?)
    `);
    
    insertBP.run(matchId, JSON.stringify(bpData.picks_bans), bpData.radiant_win ? 1 : 0);
  }
  
  return matchId;
}

/**
 * 创建 bp_data 表（如果不存在）
 */
function ensureBPTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bp_data (
      match_id TEXT PRIMARY KEY,
      picks_bans TEXT NOT NULL,
      radiant_win INTEGER DEFAULT 0,
      updated_at INTEGER DEFAULT (unixepoch())
    )
  `);
}

async function fetchLiquipediaMatches() {
  console.log('Fetching matches from Liquipedia...');
  
  const LIQUIPEDIA_API = 'https://liquipedia.net/dota2/api.php';
  
  // 尝试多个页面
  const pages = [
    'Liquipedia:Matches',
    'Liquipedia:Upcoming_and_ongoing_matches'
  ];
  
  let allMatches = [];
  
  for (const page of pages) {
    const params = new URLSearchParams({
      action: 'parse',
      page: page,
      format: 'json',
      prop: 'text'
    });
    
    try {
      console.log(`  Trying page: ${page}`);
      const url = `${LIQUIPEDIA_API}?${params}`;
      const responseText = await fetchWithGzip(url);
      const data = JSON.parse(responseText);
      
      if (data.error) {
        console.log(`    Error: ${data.error.info}`);
        continue;
      }
      
      const html = data.parse?.text?.['*'] || '';
      
      // 跳过重定向页面
      if (html.includes('redirectMsg') || html.length < 1000) {
        console.log(`    Skipped (redirect or empty)`);
        continue;
      }
      
      const matches = parseMatchesFromHtml(html);
      console.log(`    Found ${matches.length} matches`);
      allMatches = allMatches.concat(matches);
      
      // Liquipedia 要求：parse 请求间隔至少 30 秒
      await new Promise(r => setTimeout(r, 30000));
    } catch (error) {
      console.error(`  Error fetching ${page}:`, error.message);
    }
  }
  
  return allMatches;
}

async function main() {
  console.log('========================================');
  console.log('DOTA2 Hub - Liquipedia Match Fetcher');
  console.log('Time:', new Date().toISOString());
  console.log('========================================\n');
  
  // 确保 BP 表存在
  ensureBPTable();
  
  // 获取比赛数据
  const matches = await fetchLiquipediaMatches();
  console.log(`Found ${matches.length} total matches\n`);
  
  // 筛选中国战队比赛
  const cnMatches = matches.filter(m => {
    const team1Info = identifyTeam(m.team1);
    const team2Info = identifyTeam(m.team2);
    return team1Info.is_cn || team2Info.is_cn;
  });
  
  console.log(`Found ${cnMatches.length} CN team matches:\n`);
  
  let savedCount = 0;
  let bpCount = 0;
  
  for (const m of cnMatches) {
    const team1Info = identifyTeam(m.team1);
    const team2Info = identifyTeam(m.team2);
    const cnTeam = team1Info.is_cn ? team1Info.name_cn : team2Info.name_cn;
    
    console.log(`  ${cnTeam}: ${m.team1} ${m.score1}:${m.score2} ${m.team2} (${m.format}) [${m.status}]`);
    if (m.tournament) console.log(`    Tournament: ${m.tournament}`);
    if (m.matchId) console.log(`    Match ID: ${m.matchId}`);
    
    // 获取 BP 数据（只对已结束且有 match_id 的比赛）
    let bpData = null;
    if (m.matchId && m.status === 'finished') {
      console.log(`    Fetching BP data...`);
      bpData = await fetchMatchBP(m.matchId);
      
      if (bpData) {
        bpCount++;
        console.log(`    ✓ BP data: ${bpData.picks_bans.length} picks/bans`);
      }
      
      // OpenDota 限流：1秒1次
      await new Promise(r => setTimeout(r, 1000));
    }
    
    // 保存比赛
    try {
      await saveMatch(m, bpData);
      savedCount++;
    } catch (error) {
      console.error(`    Error saving:`, error.message);
    }
  }
  
  console.log(`\n========================================`);
  console.log(`Saved ${savedCount} CN team matches`);
  console.log(`Fetched ${bpCount} BP data`);
  console.log('========================================');
  
  db.close();
}

main();
