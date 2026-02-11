#!/usr/bin/env node
/**
 * Liquipedia 实时比赛数据抓取脚本
 * 抓取 upcoming 和 ongoing 的比赛
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', 'data', 'dota2.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// 目标中国队
const CN_TEAMS = {
  'XG': { id: 'xtreme-gaming', name: 'Xtreme Gaming', name_cn: 'XG' },
  'YB': { id: 'yakult-brother', name: 'Yakult Brother', name_cn: 'YB' },
  'VG': { id: 'vici-gaming', name: 'Vici Gaming', name_cn: 'VG' },
  'AR': { id: 'yakult-brother', name: 'Azure Ray', name_cn: 'AR' },
  'Azure Ray': { id: 'yakult-brother', name: 'Azure Ray', name_cn: 'AR' },
};

function identifyTeam(name) {
  if (!name) return { id: 'unknown', name_cn: name, is_cn: false };
  
  const upperName = name.toUpperCase();
  
  if (upperName === 'XG' || name.toLowerCase().includes('xtreme')) {
    return { id: 'xtreme-gaming', name_cn: 'XG', is_cn: true };
  }
  
  if (upperName === 'YB' || name.toLowerCase().includes('yakult') || 
      upperName === 'AR' || name.toLowerCase().includes('azure')) {
    return { id: 'yakult-brother', name_cn: 'YB', is_cn: true };
  }
  
  if (upperName === 'VG' || name.toLowerCase().includes('vici')) {
    return { id: 'vici-gaming', name_cn: 'VG', is_cn: true };
  }
  
  return { id: 'unknown', name_cn: name, is_cn: false };
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
    const response = await fetch(`${LIQUIPEDIA_API}?${params}`, {
      headers: {
        'User-Agent': 'DOTA2-Hub-Bot/1.0 (seva324@gmail.com)'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    const html = data.parse.text['*'];
    
    // 使用正则解析 HTML（不需要 bs4）
    const matches = [];
    
    // 匹配比赛 div 块
    const matchRegex = /<div class="match-info"[^>]*>([\s\S]*?)<\/div>\s*<div class="match-info-tournament">/g;
    let match;
    
    while ((match = matchRegex.exec(html)) !== null) {
      const matchHtml = match[1];
      
      // 提取队伍1
      const team1Match = matchHtml.match(/match-info-header-opponent-left[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/);
      const team1 = team1Match ? team1Match[1].trim() : 'TBD';
      
      // 提取队伍2
      const team2Match = matchHtml.match(/match-info-header-opponent[^>]*?(?!-left)[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/);
      const team2 = team2Match ? team2Match[1].trim() : 'TBD';
      
      // 提取比分
      const scoreMatch = matchHtml.match(/match-info-header-scoreholder[^>]*>([^<]+)</);
      const score = scoreMatch ? scoreMatch[1].trim() : 'vs';
      
      // 解析比分
      let radiantScore = 0, direScore = 0;
      const scoreRegex = /(\d+):(\d+)/;
      const scoreResult = score.match(scoreRegex);
      if (scoreResult) {
        radiantScore = parseInt(scoreResult[1]);
        direScore = parseInt(scoreResult[2]);
      }
      
      // 提取赛事
      const tourneyMatch = html.substring(match.index + match[0].length).match(/<a[^>]*>([^<]+)<\/a>/);
      const tournament = tourneyMatch ? tourneyMatch[1].trim() : '';
      
      matches.push({
        team1,
        team2,
        radiantScore,
        direScore,
        tournament,
        score
      });
    }
    
    return matches;
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
  
  // 筛选中国队比赛
  const cnMatches = [];
  for (const m of matches) {
    const team1Info = identifyTeam(m.team1);
    const team2Info = identifyTeam(m.team2);
    
    if (team1Info.is_cn || team2Info.is_cn) {
      cnMatches.push({
        ...m,
        team1Info,
        team2Info
      });
    }
  }
  
  console.log(`Found ${cnMatches.length} CN team matches\n`);
  
  // 保存到数据库
  let savedCount = 0;
  const insertMatch = db.prepare(`
    INSERT OR REPLACE INTO matches 
    (match_id, radiant_team_id, dire_team_id, radiant_team_name, dire_team_name,
     radiant_score, dire_score, radiant_game_wins, dire_game_wins, series_type, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  for (const m of cnMatches) {
    const matchId = `lp_${m.team1}_${m.team2}_${Date.now()}`.replace(/\s+/g, '_').substring(0, 50);
    const isFinished = m.score.includes(':');
    
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
        'BO3',
        isFinished ? 'finished' : 'scheduled'
      );
      savedCount++;
      console.log(`  ✓ ${m.team1Info.is_cn ? m.team1Info.name_cn : m.team2Info.name_cn}: ${m.team1} ${m.radiantScore}:${m.direScore} ${m.team2}`);
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
