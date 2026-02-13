#!/usr/bin/env node
/**
 * OpenDota API 数据采集脚本 - XG/YB/VG 专用版
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OPENDOTA_API_KEY = process.env.OPENDOTA_API_KEY || 'ab01b0b0-c459-4524-92eb-0b6af0cdc415';
const OPENDOTA_BASE_URL = 'https://api.opendota.com/api';

const dbPath = path.join(__dirname, '..', 'data', 'dota2.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// 目标战队
const TARGET_TEAM_IDS = {
  'xtreme-gaming': { name: 'Xtreme Gaming', name_cn: 'XG', team_id: 8261502 },
  'yakult-brothers': { name: 'Yakult Brothers', name_cn: 'YB', team_id: 8255888 },
  'vici-gaming': { name: 'Vici Gaming', name_cn: 'VG', team_id: 7391077 },
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

function identifyTeam(name) {
  if (!name) return { id: 'unknown', name_cn: name, is_cn: false };
  
  const upperName = name.toUpperCase();
  const lowerName = name.toLowerCase();
  
  if (upperName === 'XG' || lowerName.includes('xtreme')) {
    return { id: 'xtreme-gaming', name_cn: 'XG', is_cn: true };
  }
  
  if (upperName === 'YB' || lowerName.includes('yakult') || 
      upperName === 'AR' || lowerName.includes('azure') || lowerName.includes('ray')) {
    return { id: 'yakult-brothers', name_cn: 'YB', is_cn: true };
  }
  
  if (upperName === 'VG' || lowerName.includes('vici')) {
    return { id: 'vici-gaming', name_cn: 'VG', is_cn: true };
  }
  
  return { id: 'unknown', name_cn: name, is_cn: false };
}

function updateTeam(teamInfo) {
  if (!teamInfo || !teamInfo.id) return;
  
  const teamData = TARGET_TEAM_IDS[teamInfo.id];
  if (!teamData) return;
  
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO teams (id, name, name_cn, tag, region, is_cn_team, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, unixepoch())
  `);
  
  stmt.run(teamInfo.id, teamData.name, teamData.name_cn, teamData.name_cn, 'China', 1);
}

async function saveMatch(match) {
  const radiantTeam = identifyTeam(match.radiant_name);
  const direTeam = identifyTeam(match.dire_name);
  
  if (!radiantTeam.is_cn && !direTeam.is_cn) {
    return null;
  }
  
  updateTeam(radiantTeam);
  updateTeam(direTeam);
  
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
      direGameWins = 0;
    } else {
      radiantGameWins = 0;
      direGameWins = 1;
    }
  }
  
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO matches (
      match_id, league_id, radiant_team_id, dire_team_id,
      radiant_team_name, radiant_team_name_cn,
      dire_team_name, dire_team_name_cn,
      radiant_score, dire_score, radiant_game_wins, dire_game_wins,
      start_time, duration, series_type, status, lobby_type
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    match.match_id,
    match.leagueid || null,
    radiantTeam.id,
    direTeam.id,
    match.radiant_name || null,
    radiantTeam.name_cn || null,
    match.dire_name || null,
    direTeam.name_cn || null,
    match.radiant_score || 0,
    match.dire_score || 0,
    radiantGameWins,
    direGameWins,
    match.start_time,
    match.duration || 0,
    'BO3',
    status,
    match.lobby_type || 0
  );
  
  const cnTeam = radiantTeam.is_cn ? radiantTeam : direTeam;
  console.log(`  ✓ ${cnTeam.name_cn}: ${radiantTeam.name_cn || match.radiant_name} ${radiantGameWins}:${direGameWins} ${direTeam.name_cn || match.dire_name} (${status})`);
  return match;
}

async function fetchProMatches() {
  console.log('Fetching pro matches from OpenDota...');
  let allMatches = [];
  
  for (let page = 0; page < 3; page++) {
    try {
      const url = page === 0 
        ? `${OPENDOTA_BASE_URL}/proMatches`
        : `${OPENDOTA_BASE_URL}/proMatches?less_than_match_id=${allMatches[allMatches.length - 1]?.match_id || 0}`;
      
      const data = await fetchWithRetry(url);
      if (!data || data.length === 0) break;
      
      allMatches = allMatches.concat(data);
      console.log(`  Page ${page + 1}: ${data.length} matches (total: ${allMatches.length})`);
      
      const oldestMatch = data[data.length - 1];
      const daysAgo = (Date.now() / 1000 - oldestMatch.start_time) / 86400;
      if (daysAgo > 30) break;
      
      await new Promise(r => setTimeout(r, 1000));
    } catch (error) {
      console.error(`  Error fetching page ${page + 1}:`, error.message);
      break;
    }
  }
  
  return allMatches;
}

async function fetchTeamMatches(teamId, teamName) {
  console.log(`Fetching matches for ${teamName} (team_id: ${teamId})...`);
  try {
    const data = await fetchWithRetry(`${OPENDOTA_BASE_URL}/teams/${teamId}/matches`);
    return data || [];
  } catch (error) {
    console.error(`  Error fetching ${teamName}:`, error.message);
    return [];
  }
}

async function main() {
  console.log('========================================');
  console.log('DOTA2 Hub - XG/YB/VG Match Fetcher');
  console.log('Time:', new Date().toISOString());
  console.log('========================================\n');
  
  // 清理旧的 OpenDota 数据（不是 lp_ 开头的）
  console.log('Cleaning old OpenDota data...');
  db.prepare(`DELETE FROM matches WHERE match_id NOT LIKE 'lp_%'`).run();
  console.log('Done.\n');
  
  let savedCount = 0;
  let allMatchIds = new Set();
  
  console.log('--- Method 1: Pro Matches ---');
  try {
    const proMatches = await fetchProMatches();
    console.log(`Total pro matches fetched: ${proMatches.length}\n`);
    
    for (const match of proMatches) {
      if (allMatchIds.has(match.match_id)) continue;
      
      try {
        const result = await saveMatch(match);
        if (result) {
          savedCount++;
          allMatchIds.add(match.match_id);
        }
      } catch (error) {
        console.error(`Error processing match ${match.match_id}:`, error.message);
      }
    }
  } catch (error) {
    console.error('Error in pro matches:', error.message);
  }
  
  console.log('\n--- Method 2: Team-specific Matches ---');
  for (const [teamKey, teamData] of Object.entries(TARGET_TEAM_IDS)) {
    try {
      const teamMatches = await fetchTeamMatches(teamData.team_id, teamData.name_cn);
      console.log(`Fetched ${teamMatches.length} matches for ${teamData.name_cn}`);
      
      for (const match of teamMatches) {
        if (allMatchIds.has(match.match_id)) continue;
        
        const convertedMatch = {
          match_id: match.match_id,
          radiant_name: match.radiant ? teamData.name : match.opposing_team_name,
          dire_name: match.radiant ? match.opposing_team_name : teamData.name,
          radiant_score: match.radiant_score || 0,
          dire_score: match.dire_score || 0,
          radiant_win: match.radiant_win,
          start_time: match.start_time,
          duration: match.duration || 0,
          leagueid: match.leagueid,
          lobby_type: 7,
        };
        
        try {
          const result = await saveMatch(convertedMatch);
          if (result) {
            savedCount++;
            allMatchIds.add(match.match_id);
          }
          await new Promise(r => setTimeout(r, 20));
        } catch (error) {
          console.error(`Error:`, error.message);
        }
      }
    } catch (error) {
      console.error(`Error fetching ${teamData.name_cn}:`, error.message);
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  
  console.log(`\n========================================`);
  console.log(`Total XG/YB/VG matches saved: ${savedCount}`);
  console.log('========================================');
  
  db.close();
}

main();
