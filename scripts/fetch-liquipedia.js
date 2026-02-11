#!/usr/bin/env node
/**
 * Liquipedia 实时比赛数据抓取脚本
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

function parseMatches(html) {
  const matches = [];
  
  // Split by match-info div
  const parts = html.split('<div class="match-info">');
  
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    
    const endIdx = part.indexOf('<div class="match-info-tournament">');
    if (endIdx === -1) continue;
    
    const matchHtml = part.substring(0, endIdx);
    
    // Split by opponent divs to get content of each
    const opponentRegex = /<div class="match-info-header-opponent[^"]*">/g;
    const opponentDivs = matchHtml.split(opponentRegex);
    
    let team1 = 'TBD';
    let team2 = 'TBD';
    
    // First opponent is team1 (left)
    if (opponentDivs.length >= 2) {
      const t1Match = opponentDivs[1].match(/title="([^"]+)"/);
      if (t1Match) team1 = t1Match[1].trim();
    }
    
    // Second opponent is team2 (right)
    if (opponentDivs.length >= 3) {
      const t2Match = opponentDivs[2].match(/title="([^"]+)"/);
      if (t2Match) team2 = t2Match[1].trim();
    }
    
    // Extract scores
    const scoreRegex = /scoreholder-score[^>]*>(\d+)</g;
    const scores = [];
    let scoreMatch;
    while ((scoreMatch = scoreRegex.exec(matchHtml)) !== null) {
      scores.push(parseInt(scoreMatch[1]));
    }
    
    const radiantScore = scores.length >= 1 ? scores[0] : 0;
    const direScore = scores.length >= 2 ? scores[1] : 0;
    
    // Extract format (Bo3, Bo5, etc)
    let format = 'BO3';
    const formatMatch = matchHtml.match(/\(Bo(\d+)\)/i);
    if (formatMatch) format = `BO${formatMatch[1]}`;
    
    // Extract status
    let status = 'scheduled';
    if (matchHtml.includes('match-info-header-winner') || matchHtml.includes('match-info-header-loser')) {
      status = 'finished';
    }
    if (radiantScore > 0 || direScore > 0) {
      status = 'finished';
    }
    
    // Extract tournament
    let tournament = '';
    const tourneyMatch = part.substring(endIdx).match(/<div class="match-info-tournament"[^>]*>[^\u003c]*<a[^\u003e]*>([^\u003c]+)/);
    if (tourneyMatch) tournament = tourneyMatch[1].trim();
    
    if (team1 !== 'TBD' || team2 !== 'TBD') {
      matches.push({ team1, team2, radiantScore, direScore, format, status, tournament });
    }
  }
  
  return matches;
}

async function fetchLiquipediaMatches() {
  console.log('Fetching matches from Liquipedia...');
  
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
    
    return parseMatches(html);
  } catch (error) {
    console.error('Error fetching Liquipedia:', error.message);
    return [];
  }
}

async function main() {
  console.log('========================================');
  console.log('DOTA2 Hub - Liquipedia Match Fetcher');
  console.log('Time:', new Date().toISOString());
  console.log('========================================\n');
  
  const matches = await fetchLiquipediaMatches();
  console.log(`Found ${matches.length} total matches\n`);
  
  // Filter CN team matches
  const cnMatches = [];
  for (const m of matches) {
    const team1Info = identifyTeam(m.team1);
    const team2Info = identifyTeam(m.team2);
    
    if (team1Info.is_cn || team2Info.is_cn) {
      cnMatches.push({ ...m, team1Info, team2Info });
    }
  }
  
  console.log(`Found ${cnMatches.length} CN team matches:\n`);
  
  // Display CN matches
  for (const m of cnMatches) {
    const cnTeam = m.team1Info.is_cn ? m.team1Info.name_cn : m.team2Info.name_cn;
    console.log(`  ${cnTeam}: ${m.team1} ${m.radiantScore}:${m.direScore} ${m.team2} (${m.format}) [${m.status}]`);
    if (m.tournament) console.log(`    Tournament: ${m.tournament}`);
  }
  
  // Save to database
  let savedCount = 0;
  const insertMatch = db.prepare(`
    INSERT OR REPLACE INTO matches 
    (match_id, radiant_team_id, dire_team_id, radiant_team_name, dire_team_name,
     radiant_score, dire_score, radiant_game_wins, dire_game_wins, series_type, status, start_time)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  for (const m of cnMatches) {
    const matchId = `lp_${Date.now()}_${savedCount}`;
    
    try {
      insertMatch.run(
        matchId,
        m.team1Info.id,
        m.team2Info.id,
        m.team1,
        m.team2,
        m.radiantScore,
        m.direScore,
        m.radiantScore,
        m.direScore,
        m.format,
        m.status,
        Math.floor(Date.now() / 1000)
      );
      savedCount++;
    } catch (error) {
      console.error(`  Error saving match:`, error.message);
    }
  }
  
  console.log(`\n========================================`);
  console.log(`Saved ${savedCount} CN team matches from Liquipedia`);
  console.log('========================================');
  
  db.close();
}

main();
