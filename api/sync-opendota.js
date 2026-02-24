/**
 * OpenDota 数据同步 API
 * 从 OpenDota API 拉取比赛数据并存入 Redis
 */

import { Redis } from '@upstash/redis';

const REDIS_URL = process.env.REDIS_URL;

// 解析 REDIS_URL
const parseRedisUrl = (url) => {
  if (!url) return null;
  try {
    const match = url.match(/redis:\/\/default:([^@]+)@(.+):(\d+)/);
    if (match) {
      return { token: match[1], host: match[2], port: match[3] };
    }
  } catch (e) {}
  return null;
};

const parsed = parseRedisUrl(REDIS_URL);

const redis = parsed 
  ? new Redis({ url: `https://${parsed.host}`, token: parsed.token })
  : null;

const OPENDOTA_API_KEY = process.env.OPENDOTA_API_KEY || '';
const OPENDOTA_BASE_URL = 'https://api.opendota.com/api';

const TARGET_TEAM_IDS = {
  'xtreme-gaming': { name: 'Xtreme Gaming', name_cn: 'XG', team_id: 8261502 },
  'yakult-brothers': { name: 'Yakult Brothers', name_cn: 'YB', team_id: 8255888 },
  'vici-gaming': { name: 'Vici Gaming', name_cn: 'VG', team_id: 7391077 },
};

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const headers = {};
      if (OPENDOTA_API_KEY) headers['Authorization'] = `Bearer ${OPENDOTA_API_KEY}`;
      const response = await fetch(url, { headers });
      if (!response.ok) {
        if (response.status === 429) {
          await new Promise(r => setTimeout(r, 10000));
          continue;
        }
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

function identifyTeam(name) {
  if (!name) return { id: 'unknown', name_cn: name, is_cn: false };
  const upper = name.toUpperCase(), lower = name.toLowerCase();
  if (upper === 'XG' || lower.includes('xtreme')) return { id: 'xtreme-gaming', name_cn: 'XG', is_cn: true };
  if (upper === 'YB' || lower.includes('yakult') || upper === 'AR' || lower.includes('azure') || lower.includes('ray')) 
    return { id: 'yakult-brothers', name_cn: 'YB', is_cn: true };
  if (upper === 'VG' || lower.includes('vici')) return { id: 'vici-gaming', name_cn: 'VG', is_cn: true };
  return { id: 'unknown', name_cn: name, is_cn: false };
}

async function fetchProMatches() {
  let all = [];
  for (let page = 0; page < 2; page++) {
    const url = page === 0 ? `${OPENDOTA_BASE_URL}/proMatches` 
      : `${OPENDOTA_BASE_URL}/proMatches?less_than_match_id=${all[all.length-1]?.match_id || 0}`;
    const data = await fetchWithRetry(url);
    if (!data?.length) break;
    all = all.concat(data);
    const daysAgo = (Date.now()/1000 - data[data.length-1].start_time) / 86400;
    if (daysAgo > 7) break;
    await new Promise(r => setTimeout(r, 1000));
  }
  return all;
}

async function fetchTeamMatches(teamId, teamName) {
  return await fetchWithRetry(`${OPENDOTA_BASE_URL}/teams/${teamId}/matches`) || [];
}

function convertMatch(match, teamData = null) {
  const rt = identifyTeam(match.radiant_name), dt = identifyTeam(match.dire_name);
  if (!rt.is_cn && !dt.is_cn && !teamData) return null;
  
  const now = Date.now() / 1000;
  let status = 'scheduled';
  if (match.start_time < now - 3600) status = 'finished';
  else if (match.start_time < now) status = 'live';
  
  const rw = match.radiant_win;
  const rgw = status === 'finished' ? (rw ? 1 : 0) : 0;
  const dgw = status === 'finished' ? (rw ? 0 : 1) : 0;
  
  if (teamData) {
    const isR = match.radiant;
    return {
      match_id: String(match.match_id), radiant_team_id: isR ? teamData.id : 'unknown',
      dire_team_id: isR ? 'unknown' : teamData.id, radiant_team_name: isR ? teamData.name : match.opposing_team_name,
      radiant_team_name_cn: isR ? teamData.name_cn : identifyTeam(match.opposing_team_name).name_cn,
      dire_team_name: isR ? match.opposing_team_name : teamData.name,
      dire_team_name_cn: isR ? identifyTeam(match.opposing_team_name).name_cn : teamData.name_cn,
      radiant_score: match.radiant_score || 0, dire_score: match.dire_score || 0,
      radiant_game_wins: rw ? 1 : 0, dire_game_wins: rw ? 0 : 1,
      start_time: match.start_time, duration: match.duration || 0, leagueid: match.leagueid,
      series_type: 'BO3', status, lobby_type: 7, radiant_win: rw ? 1 : 0,
    };
  }
  
  return {
    match_id: String(match.match_id), radiant_team_id: rt.id, dire_team_id: dt.id,
    radiant_team_name: match.radiant_name || null, radiant_team_name_cn: rt.name_cn,
    dire_team_name: match.dire_name || null, dire_team_name_cn: dt.name_cn,
    radiant_score: match.radiant_score || 0, dire_score: match.dire_score || 0,
    radiant_game_wins: rgw, dire_game_wins: dgw,
    start_time: match.start_time, duration: match.duration || 0, leagueid: match.leagueid || null,
    series_type: 'BO3', status, lobby_type: match.lobby_type || 0, radiant_win: rw ? 1 : 0,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    console.log('=== DOTA2 Hub Sync ===');
    
    if (!redis) return res.status(500).json({ error: 'Redis not configured' });
    
    // 测试 Redis
    await redis.ping();
    console.log('Redis connected!');

    let existing = {};
    try {
      const data = await redis.get('matches');
      if (data) existing = typeof data === 'string' ? JSON.parse(data) : data;
    } catch (e) { console.log('No existing matches'); }
    console.log(`Existing: ${Object.keys(existing).length}`);

    let cnMatches = [];

    // Pro Matches
    console.log('Fetching pro matches...');
    const pro = await fetchProMatches();
    for (const m of pro) { const c = convertMatch(m); if (c) cnMatches.push(c); }

    // Team Matches
    for (const [, td] of Object.entries(TARGET_TEAM_IDS)) {
      const tm = await fetchTeamMatches(td.team_id, td.name_cn);
      for (const m of tm) { const c = convertMatch(m, td); if (c) cnMatches.push(c); }
      await new Promise(r => setTimeout(r, 1000));
    }

    // 保存
    let saved = 0;
    for (const m of cnMatches) {
      if (!existing[m.match_id]) { existing[m.match_id] = m; saved++; }
    }
    await redis.set('matches', JSON.stringify(existing));
    
    const list = Object.values(existing).sort((a,b) => b.start_time - a.start_time).slice(0, 500);
    await redis.set('matches:list', JSON.stringify(list));

    console.log(`Saved: ${saved}, Total: ${Object.keys(existing).length}`);
    return res.status(200).json({ success: true, saved, total: Object.keys(existing).length });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
