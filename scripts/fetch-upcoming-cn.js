#!/usr/bin/env node
/**
 * 获取未来10天XG/YB比赛预告
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

function identifyTeam(name) {
  if (!name) return { id: 'unknown', name_cn: name, is_cn: false };
  
  const upperName = name.toUpperCase().trim();
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

function fetchWithGzip(url) {
  return new Promise((resolve, reject) => {
    const options = new URL(url);
    options.headers = {
      'User-Agent': 'DOTA2-Hub-Bot/1.0',
      'Accept-Encoding': 'gzip',
      'Accept': 'application/json'
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

function parseUpcomingMatches(html) {
  const matches = [];
  const now = Math.floor(Date.now() / 1000);
  const tenDaysLater = now + (10 * 24 * 60 * 60);
  
  // Split by match-info div
  const parts = html.split('<div class="match-info">');
  
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    
    const endIdx = part.indexOf('<div class="match-info-tournament">');
    if (endIdx === -1) continue;
    
    const matchHtml = part.substring(0, endIdx);
    
    // Extract timestamp
    const tsMatch = matchHtml.match(/data-timestamp="(\d+)"/);
    if (!tsMatch) continue;
    const matchTime = parseInt(tsMatch[1]);
    
    // Only future matches within 10 days
    if (matchTime < now || matchTime > tenDaysLater) continue;
    
    // Extract teams
    const opponentRegex = /<div class="match-info-header-opponent[^"]*">/g;
    const opponentDivs = matchHtml.split(opponentRegex);
    
    let team1 = 'TBD';
    let team2 = 'TBD';
    
    if (opponentDivs.length >= 2) {
      const t1Match = opponentDivs[1].match(/title="([^"]+)"/);
      if (t1Match) team1 = t1Match[1].trim();
    }
    
    if (opponentDivs.length >= 3) {
      const t2Match = opponentDivs[2].match(/title="([^"]+)"/);
      if (t2Match) team2 = t2Match[1].trim();
    }
    
    // Check if XG or YB
    const team1Info = identifyTeam(team1);
    const team2Info = identifyTeam(team2);
    
    if (team1Info.is_cn || team2Info.is_cn) {
      // Extract tournament
      let tournament = '';
      const tourneyMatch = part.substring(endIdx).match(/<div class="match-info-tournament"[^>]*>[^<]*<a[^>]*>([^<]+)/);
      if (tourneyMatch) tournament = tourneyMatch[1].trim();
      
      matches.push({
        team1,
        team2,
        matchTime,
        tournament,
        team1Info,
        team2Info
      });
    }
  }
  
  return matches;
}

async function main() {
  console.log('========================================');
  console.log('未来10天 XG/YB 比赛预告');
  console.log('Time:', new Date().toISOString());
  console.log('========================================\n');
  
  const LIQUIPEDIA_API = 'https://liquipedia.net/dota2/api.php';
  const params = new URLSearchParams({
    action: 'parse',
    page: 'Liquipedia:Matches',
    format: 'json',
    prop: 'text'
  });
  
  try {
    const url = `${LIQUIPEDIA_API}?${params}`;
    const responseText = await fetchWithGzip(url);
    const data = JSON.parse(responseText);
    const html = data.parse.text['*'];
    
    const matches = parseUpcomingMatches(html);
    
    console.log(`找到 ${matches.length} 场 XG/YB 比赛:\n`);
    
    // Display matches
    for (const m of matches) {
      const cnTeam = m.team1Info.is_cn ? m.team1Info.name_cn : m.team2Info.name_cn;
      const matchDate = new Date(m.matchTime * 1000).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
      console.log(`📅 ${matchDate} (${cnTeam})`);
      console.log(`   ${m.team1} vs ${m.team2}`);
      if (m.tournament) console.log(`   🏆 ${m.tournament}`);
      console.log();
    }
    
    // Save to matches table
    let savedCount = 0;
    const insertMatch = db.prepare(`
      INSERT OR REPLACE INTO matches 
      (match_id, radiant_team_id, dire_team_id, radiant_team_name, dire_team_name,
       start_time, series_type, status, radiant_score, dire_score, radiant_game_wins, dire_game_wins)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0)
    `);
    
    for (const m of matches) {
      const id = `upcoming_${Date.now()}_${savedCount}`;
      
      try {
        insertMatch.run(
          id,
          m.team1Info.id,
          m.team2Info.id,
          m.team1,
          m.team2,
          m.matchTime,
          'BO3',
          'scheduled'
        );
        savedCount++;
      } catch (error) {
        console.error(`Error saving:`, error.message);
      }
    }
    
    console.log('========================================');
    console.log(`已保存 ${savedCount} 场比赛到数据库`);
    console.log('========================================');
    
  } catch (error) {
    console.error('Error:', error.message);
  }
  
  db.close();
}

main();
