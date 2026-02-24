/**
 * OpenDota 数据同步 API
 * 从 OpenDota API 拉取比赛数据并存入 Redis
 */

import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://default:CTq7DQ5ptIyjBe7ntGJtcdDJl1dr4l4A@redis-19738.crce185.ap-seast-1-1.ec2.cloud.redislabs.com:19738';

let redis;
function getRedis() {
  if (!redis) {
    redis = new Redis(REDIS_URL);
  }
  return redis;
}

const OPENDOTA_API_KEY = process.env.OPENDOTA_API_KEY || '';
const OPENDOTA_BASE_URL = 'https://api.opendota.com/api';

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

function convertMatch(match, teamData = null) {
  const radiantTeam = identifyTeam(match.radiant_name);
  const direTeam = identifyTeam(match.dire_name);
  
  if (!radiantTeam.is_cn && !direTeam.is_cn && !teamData) {
    return null;
  }
  
  const now = Date.now() / 1000;
  let status = 'scheduled';
  if (match.start_time < now - 3600) {
    status = 'finished';
  } else if (match.start_time < now) {
    status = 'live';
  }
  
  let radiantGameWins = 0;
  let direGameWins = 0;
  let radiantWin = match.radiant_win;
  
  if (status === 'finished') {
    if (radiantWin) {
      radiantGameWins = 1;
      direGameWins = 0;
    } else {
      radiantGameWins = 0;
      direGameWins = 1;
    }
  }
  
  if (teamData) {
    const isRadiant = match.radiant;
    return {
      match_id: String(match.match_id),
      radiant_team_id: isRadiant ? teamData.id : 'unknown',
      dire_team_id: isRadiant ? 'unknown' : teamData.id,
      radiant_team_name: isRadiant ? teamData.name : match.opposing_team_name,
      radiant_team_name_cn: isRadiant ? teamData.name_cn : identifyTeam(match.opposing_team_name).name_cn,
      dire_team_name: isRadiant ? match.opposing_team_name : teamData.name,
      dire_team_name_cn: isRadiant ? identifyTeam(match.opposing_team_name).name_cn : teamData.name_cn,
      radiant_score: match.radiant_score || 0,
      dire_score: match.dire_score || 0,
      radiant_game_wins: radiantWin ? 1 : 0,
      dire_game_wins: radiantWin ? 0 : 1,
      start_time: match.start_time,
      duration: match.duration || 0,
      leagueid: match.leagueid,
      series_type: 'BO3',
      status,
      lobby_type: 7,
      radiant_win: radiantWin ? 1 : 0,
    };
  }
  
  return {
    match_id: String(match.match_id),
    radiant_team_id: radiantTeam.id,
    dire_team_id: direTeam.id,
    radiant_team_name: match.radiant_name || null,
    radiant_team_name_cn: radiantTeam.name_cn,
    dire_team_name: match.dire_name || null,
    dire_team_name_cn: direTeam.name_cn,
    radiant_score: match.radiant_score || 0,
    dire_score: match.dire_score || 0,
    radiant_game_wins: radiantGameWins,
    dire_game_wins: direGameWins,
    start_time: match.start_time,
    duration: match.duration || 0,
    leagueid: match.leagueid || null,
    series_type: 'BO3',
    status,
    lobby_type: match.lobby_type || 0,
    radiant_win: radiantWin ? 1 : 0,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let r;
  try {
    r = getRedis();
    
    console.log('========================================');
    console.log('DOTA2 Hub - OpenDota Sync to Redis');
    console.log('Time:', new Date().toISOString());
    console.log('========================================\n');

    // 获取现有数据
    const existingMatchesJson = await r.get('matches');
    const existingMatches = existingMatchesJson ? JSON.parse(existingMatchesJson) : {};
    console.log(`Existing matches: ${Object.keys(existingMatches).length}`);

    let savedCount = 0;
    let allMatches = [];

    // Method 1: Pro Matches
    console.log('--- Method 1: Pro Matches ---');
    try {
      const proMatches = await fetchProMatches();
      console.log(`Total pro matches fetched: ${proMatches.length}\n`);
      
      for (const match of proMatches) {
        const converted = convertMatch(match);
        if (converted) {
          allMatches.push(converted);
        }
      }
    } catch (error) {
      console.error('Error in pro matches:', error.message);
    }

    // Method 2: Team-specific Matches
    console.log('\n--- Method 2: Team-specific Matches ---');
    for (const [teamKey, teamData] of Object.entries(TARGET_TEAM_IDS)) {
      try {
        const teamMatches = await fetchTeamMatches(teamData.team_id, teamData.name_cn);
        console.log(`Fetched ${teamMatches.length} matches for ${teamData.name_cn}`);
        
        for (const match of teamMatches) {
          const converted = convertMatch(match, teamData);
          if (converted) {
            allMatches.push(converted);
          }
        }
        await new Promise(r => setTimeout(r, 1000));
      } catch (error) {
        console.error(`Error fetching ${teamData.name_cn}:`, error.message);
      }
    }

    // 保存到 Redis
    console.log('\n--- Saving to Redis ---');
    for (const match of allMatches) {
      if (!existingMatches[match.match_id]) {
        existingMatches[match.match_id] = match;
        savedCount++;
      }
    }

    await r.set('matches', JSON.stringify(existingMatches));
    console.log(`Saved ${savedCount} new matches to Redis`);
    console.log(`Total matches in Redis: ${Object.keys(existingMatches).length}`);

    // 同时更新 matches:list 供前端使用
    const matchesList = Object.values(existingMatches)
      .sort((a, b) => b.start_time - a.start_time)
      .slice(0, 500);
    await r.set('matches:list', JSON.stringify(matchesList));

    console.log(`\n========================================`);
    console.log(`Sync completed! Saved: ${savedCount} new matches`);
    console.log('========================================');

    return res.status(200).json({ 
      success: true, 
      saved: savedCount,
      total: Object.keys(existingMatches).length,
      message: `Synced ${savedCount} new matches`
    });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
