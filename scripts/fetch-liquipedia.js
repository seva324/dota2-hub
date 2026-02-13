#!/usr/bin/env node
/**
 * Liquipedia 比赛数据抓取脚本 - 精准版
 * 从 Liquipedia:Matches 获取中国战队比赛
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

// 中国战队关键词 (AR/LGD 已解散)
const CN_KEYWORDS = ['xtreme gaming', 'xg', 'yakult', 'yb', 'vici', 'vg'];

function identifyTeam(name) {
  if (!name) return { id: 'unknown', name_cn: null, is_cn: false };
  
  const lower = name.toLowerCase();
  
  if (lower.includes('xtreme') || lower === 'xg') {
    return { id: 'xtreme-gaming', name_cn: 'XG', is_cn: true };
  }
  if (lower.includes('yakult') || lower === 'yb') {
    return { id: 'yakult-brothers', name_cn: 'YB', is_cn: true };
  }
  if (lower.includes('vici') || lower === 'vg') {
    return { id: 'vici-gaming', name_cn: 'VG', is_cn: true };
  }
  
  return { id: 'unknown', name_cn: null, is_cn: false };
}

function fetchWithGzip(url) {
  return new Promise((resolve, reject) => {
    const options = new URL(url);
    options.headers = {
      'User-Agent': 'DOTA2-Hub-Bot/1.0 (https://github.com/seva324/dota2-hub)',
      'Accept-Encoding': 'gzip',
      'Accept': 'text/html'
    };
    
    const req = https.get(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        if (res.headers['content-encoding'] === 'gzip') {
          zlib.gunzip(buffer, (err, decompressed) => {
            if (err) reject(err);
            else resolve(decompressed.toString('utf-8'));
          });
        } else {
          resolve(buffer.toString('utf-8'));
        }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

/**
 * 解析 Liquipedia HTML，提取中国战队比赛
 */
function parseMatches(html) {
  const matches = [];
  
  // 分割比赛块
  const blocks = html.split('<div class="match-info">');
  
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    
    // 提取时间戳
    const tsMatch = block.match(/data-timestamp="(\d+)"/);
    if (!tsMatch) continue;
    const timestamp = parseInt(tsMatch[1]);
    
    // 提取队伍名称 - 从 block-team 里的 title
    const teamMatches = block.match(/block-team[^>]*>[\s\S]*?title="([^"]+)"/g);
    if (!teamMatches || teamMatches.length < 2) continue;
    
    const team1Match = teamMatches[0].match(/title="([^"]+)"/);
    const team2Match = teamMatches[1].match(/title="([^"]+)"/);
    const team1 = team1Match ? team1Match[1] : null;
    const team2 = team2Match ? team2Match[1] : null;
    
    if (!team1 || !team2) continue;
    
    // 检查是否中国战队
    const isCN = CN_KEYWORDS.some(kw => 
      team1.toLowerCase().includes(kw) || team2.toLowerCase().includes(kw)
    );
    if (!isCN) continue;
    
    // 提取比分
    const scores = block.match(/match-info-header-scoreholder-score[^>]*>([^<]+)</g);
    let score1 = '0', score2 = '0';
    if (scores && scores.length >= 2) {
      score1 = scores[0].replace(/<[^>]+>/g, '').trim();
      score2 = scores[1].replace(/<[^>]+>/g, '').trim();
    }
    
    // 判断状态
    let status = 'scheduled';
    if (score1 !== '0' || score2 !== '0' || score1 === 'FF' || score1 === 'W') {
      status = 'finished';
    }
    
    // 提取赛制
    const formatMatch = block.match(/\(Bo(\d+)\)/i);
    const format = formatMatch ? `BO${formatMatch[1]}` : 'BO3';
    
    // 生成 match_id
    const matchId = `lp_${timestamp}_${i}`;
    
    matches.push({
      matchId,
      team1,
      team2,
      score1: parseInt(score1) || 0,
      score2: parseInt(score2) || 0,
      timestamp,
      format,
      status
    });
  }
  
  return matches;
}

/**
 * 保存比赛到数据库
 */
function saveMatch(match) {
  const team1Info = identifyTeam(match.team1);
  const team2Info = identifyTeam(match.team2);
  
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO matches (
      match_id, radiant_team_id, dire_team_id,
      radiant_team_name, radiant_team_name_cn,
      dire_team_name, dire_team_name_cn,
      radiant_score, dire_score,
      radiant_game_wins, dire_game_wins,
      start_time, duration, series_type, status, lobby_type
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    match.matchId,
    team1Info.id,
    team2Info.id,
    match.team1,
    team1Info.name_cn,
    match.team2,
    team2Info.name_cn,
    match.score1,
    match.score2,
    match.score1,
    match.score2,
    match.timestamp,
    0,
    match.format,
    match.status,
    7
  );
}

async function main() {
  console.log('========================================');
  console.log('DOTA2 Hub - Liquipedia Match Fetcher');
  console.log('Time:', new Date().toISOString());
  console.log('========================================\n');
  
  // 清理目标战队的所有旧数据（Liquipedia + OpenDota）
  // 避免 export 时新旧数据混杂
  console.log('Cleaning old match data for XG/YB/VG...');
  const deleteResult = db.prepare(`
    DELETE FROM matches 
    WHERE radiant_team_id IN ('xtreme-gaming', 'yakult-brother', 'vici-gaming')
       OR dire_team_id IN ('xtreme-gaming', 'yakult-brother', 'vici-gaming')
  `).run();
  console.log(`Deleted ${deleteResult.changes} old matches.\n`);
  
  console.log('Fetching from Liquipedia:Matches...');
  
  const url = 'https://liquipedia.net/dota2/Liquipedia:Matches';
  const html = await fetchWithGzip(url);
  console.log(`HTML length: ${html.length}`);
  
  const matches = parseMatches(html);
  console.log(`\nFound ${matches.length} CN team matches:\n`);
  
  let saved = 0;
  for (const m of matches) {
    const t1Info = identifyTeam(m.team1);
    const t2Info = identifyTeam(m.team2);
    const cnTeam = t1Info.is_cn ? t1Info : t2Info;
    
    const date = new Date(m.timestamp * 1000).toLocaleString('zh-CN', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    });
    
    const t1Str = t1Info.is_cn ? `🔴${m.team1}` : m.team1;
    const t2Str = t2Info.is_cn ? `🔴${m.team2}` : m.team2;
    
    console.log(`${date} | ${t1Str} vs ${t2Str} | ${m.score1}:${m.score2} | ${m.status}`);
    
    try {
      saveMatch(m);
      saved++;
    } catch (e) {
      console.error(`  Error: ${e.message}`);
    }
  }
  
  console.log(`\n========================================`);
  console.log(`Saved ${saved} CN team matches from Liquipedia`);
  console.log('========================================');
  
  db.close();
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
