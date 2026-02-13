#!/usr/bin/env node
/**
 * Liquipedia 比赛数据抓取脚本 - 修复版
 * 从 Liquipedia:Matches 获取比赛
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
      'Accept': 'text/html,application/json',
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
 * HTML 结构: <div class="match-info">...</div>
 */
function parseMatchesFromHtml(html) {
  const matches = [];
  
  // 按 <div class="match-info"> 分割
  const matchBlocks = html.split('<div class="match-info">');
  
  for (let i = 1; i < matchBlocks.length; i++) {
    const block = matchBlocks[i];
    
    // 找到这个块的结束位置（下一个 </div></div>）
    const endIdx = block.indexOf('<div class="match-info-tournament">');
    if (endIdx === -1) continue;
    
    const matchHtml = block.substring(0, endIdx + 2000); // 多取一些内容
    
    // 提取队伍名称 - 使用 title 属性
    // 左侧队伍 (opponent-left)
    const leftMatch = matchHtml.match(/match-info-header-opponent-left[^"]*"[^>]*>[\s\S]*?title="([^"]+)"/);
    const team1 = leftMatch ? leftMatch[1].trim() : null;
    
    // 右侧队伍
    const rightMatch = matchHtml.match(/match-info-header-opponent match-info-header-opponent[^"]*"[^>]*>[\s\S]*?title="([^"]+)"/);
    const team2 = rightMatch ? rightMatch[1].trim() : null;
    
    if (!team1 || !team2) continue;
    
    // 提取比分 - 从 scoreholder-score 类
    const scoreRegex = /match-info-header-scoreholder-score[^>]*>([^<]+)</g;
    const scores = [];
    let scoreMatch;
    while ((scoreMatch = scoreRegex.exec(matchHtml)) !== null) {
      const s = scoreMatch[1].trim();
      if (s !== 'FF' && s !== 'W') {
        scores.push(parseInt(s) || 0);
      } else {
        scores.push(s);
      }
    }
    
    const score1 = scores.length >= 1 ? scores[0] : 0;
    const score2 = scores.length >= 2 ? scores[1] : 0;
    
    // 提取 timestamp
    let timestamp = null;
    const timeMatch = matchHtml.match(/data-timestamp="(\d+)"/);
    if (timeMatch) {
      timestamp = parseInt(timeMatch[1]);
    }
    
    // 提取赛制 (Bo3, Bo5)
    let format = 'BO3';
    const formatMatch = matchHtml.match(/\(Bo(\d+)\)/i);
    if (formatMatch) {
      format = `BO${formatMatch[1]}`;
    }
    
    // 判断状态
    let status = 'scheduled';
    if (matchHtml.includes('match-info-header-winner') || matchHtml.includes('match-info-header-loser')) {
      status = 'finished';
    }
    
    // 提取 tournament name
    let tournament = '';
    const tourneyMatch = block.match(/match-info-tournament-name[^>]*><a[^>]*><span>([^<]+)</);
    if (tourneyMatch) {
      tournament = tourneyMatch[1].trim();
    }
    
    // 提取 match_id - 从 match 页面链接或 opendota/stratz 链接
    let matchId = null;
    
    // 方法1: 从 match page 链接提取
    const matchPageMatch = block.match(/Match:ID_([^"]+)/);
    if (matchPageMatch) {
      matchId = `lp_${matchPageMatch[1]}`;
    }
    
    // 方法2: 从 opendota 链接提取
    if (!matchId) {
      const opendotaLink = block.match(/opendota\.com\/matches\/(\d+)/);
      if (opendotaLink) {
        matchId = opendotaLink[1];
      }
    }
    
    // 方法3: 从 stratz 链接提取
    if (!matchId) {
      const stratzLink = block.match(/stratz\.com\/matches\/(\d+)/);
      if (stratzLink) {
        matchId = stratzLink[1];
      }
    }
    
    // 生成唯一 ID
    if (!matchId) {
      matchId = `lp_${Date.now()}_${i}`;
    }
    
    matches.push({
      team1,
      team2,
      score1: typeof score1 === 'number' ? score1 : 0,
      score2: typeof score2 === 'number' ? score2 : 0,
      matchId,
      tournament,
      timestamp,
      format,
      status
    });
  }
  
  return matches;
}

/**
 * 从 OpenDota 获取比赛的 BP 数据
 */
async function fetchMatchBP(matchId) {
  // 如果是 liquipedia 内部 ID，跳过
  if (matchId.startsWith('lp_')) return null;
  
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
  
  insertMatch.run(
    match.matchId,
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
    try {
      const insertBP = db.prepare(`
        INSERT OR REPLACE INTO bp_data (match_id, picks_bans, radiant_win)
        VALUES (?, ?, ?)
      `);
      
      insertBP.run(match.matchId, JSON.stringify(bpData.picks_bans), bpData.radiant_win ? 1 : 0);
    } catch (error) {
      // bp_data 表可能不存在，忽略错误
    }
  }
}

async function fetchLiquipediaMatches() {
  console.log('Fetching matches from Liquipedia...');
  
  const LIQUIPEDIA_API = 'https://liquipedia.net/dota2/api.php';
  
  const pages = ['Liquipedia:Matches'];
  
  let allMatches = [];
  
  for (const page of pages) {
    const params = new URLSearchParams({
      action: 'parse',
      page: page,
      format: 'json',
      prop: 'text'
    });
    
    try {
      console.log(`  Fetching: ${page}`);
      const url = `${LIQUIPEDIA_API}?${params}`;
      const responseText = await fetchWithGzip(url);
      const data = JSON.parse(responseText);
      
      if (data.error) {
        console.log(`    Error: ${data.error.info}`);
        continue;
      }
      
      const html = data.parse?.text?.['*'] || '';
      console.log(`    HTML length: ${html.length}`);
      
      if (html.length < 1000) {
        console.log(`    Skipped (empty or redirect)`);
        continue;
      }
      
      const matches = parseMatchesFromHtml(html);
      console.log(`    Parsed ${matches.length} matches`);
      allMatches = allMatches.concat(matches);
      
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
  
  // 获取比赛数据
  const matches = await fetchLiquipediaMatches();
  console.log(`\nTotal matches found: ${matches.length}`);
  
  // 筛选中国战队比赛
  const cnMatches = matches.filter(m => {
    const team1Info = identifyTeam(m.team1);
    const team2Info = identifyTeam(m.team2);
    return team1Info.is_cn || team2Info.is_cn;
  });
  
  console.log(`CN team matches: ${cnMatches.length}\n`);
  
  let savedCount = 0;
  let bpCount = 0;
  
  for (const m of cnMatches) {
    const team1Info = identifyTeam(m.team1);
    const team2Info = identifyTeam(m.team2);
    const cnTeam = team1Info.is_cn ? team1Info.name_cn : team2Info.name_cn;
    
    console.log(`  ${cnTeam}: ${m.team1} ${m.score1}:${m.score2} ${m.team2} (${m.format}) [${m.status}]`);
    if (m.tournament) console.log(`    Tournament: ${m.tournament}`);
    
    // 获取 BP 数据（只对已结束且有真实 match_id 的比赛）
    let bpData = null;
    if (m.matchId && !m.matchId.startsWith('lp_') && m.status === 'finished') {
      console.log(`    Fetching BP data for ${m.matchId}...`);
      bpData = await fetchMatchBP(m.matchId);
      
      if (bpData) {
        bpCount++;
        console.log(`    ✓ BP: ${bpData.picks_bans.length} picks/bans`);
      }
      
      // OpenDota 限流
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
