/**
 * OpenDota 数据同步 API
 * 从 OpenDota API 拉取比赛数据并存入 Redis
 */

import { Redis } from '@upstash/redis';

const REDIS_URL = process.env.REDIS_URL;

// 解析 Redis URL
function parseRedisUrl(url) {
  if (!url) return null;
  const match = url.match(/redis:\/\/default:([^@]+)@(.+):(\d+)/);
  if (!match) return null;
  return { token: match[1], host: match[2] };
}

const cfg = parseRedisUrl(REDIS_URL);
const redis = cfg ? new Redis({ url: `https://${cfg.host}`, token: cfg.token }) : null;

const OPENDOTA_API_KEY = process.env.OPENDOTA_API_KEY || '';
const OPENDOTA_BASE_URL = 'https://api.opendota.com/api';

const TARGET_TEAMS = {
  'xtreme-gaming': { name: 'Xtreme Gaming', name_cn: 'XG', id: 8261502 },
  'yakult-brothers': { name: 'Yakult Brothers', name_cn: 'YB', id: 8255888 },
  'vici-gaming': { name: 'Vici Gaming', name_cn: 'VG', id: 7391077 },
};

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const headers = {};
      if (OPENDOTA_API_KEY) headers['Authorization'] = `Bearer ${OPENDOTA_API_KEY}`;
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

function identifyTeam(name) {
  if (!name) return { id: 'unknown', name_cn: name, is_cn: false };
  const u = name.toUpperCase(), l = name.toLowerCase();
  if (u === 'XG' || l.includes('xtreme')) return { id: 'xtreme-gaming', name_cn: 'XG', is_cn: true };
  if (u === 'YB' || l.includes('yakult') || u === 'AR' || l.includes('azure')) 
    return { id: 'yakult-brothers', name_cn: 'YB', is_cn: true };
  if (u === 'VG' || l.includes('vici')) return { id: 'vici-gaming', name_cn: 'VG', is_cn: true };
  return { id: 'unknown', name_cn: name, is_cn: false };
}

function convertMatch(m, teamData = null) {
  const rt = identifyTeam(m.radiant_name), dt = identifyTeam(m.dire_name);
  if (!rt.is_cn && !dt.is_cn && !teamData) return null;
  
  const now = Date.now() / 1000;
  let status = m.start_time < now - 3600 ? 'finished' : m.start_time < now ? 'live' : 'scheduled';
  const rw = m.radiant_win;
  
  if (teamData) {
    const isR = m.radiant;
    return {
      match_id: String(m.match_id), radiant_team_id: isR ? teamData.id : 'unknown',
      dire_team_id: isR ? 'unknown' : teamData.id, radiant_team_name: isR ? teamData.name : m.opposing_team_name,
      radiant_team_name_cn: isR ? teamData.name_cn : identifyTeam(m.opposing_team_name).name_cn,
      dire_team_name: isR ? m.opposing_team_name : teamData.name,
      dire_team_name_cn: isR ? identifyTeam(m.opposing_team_name).name_cn : teamData.name_cn,
      radiant_score: m.radiant_score || 0, dire_score: m.dire_score || 0,
      radiant_game_wins: rw ? 1 : 0, dire_game_wins: rw ? 0 : 1,
      start_time: m.start_time, duration: m.duration || 0, leagueid: m.leagueid,
      series_type: 'BO3', status, lobby_type: 7, radiant_win: rw ? 1 : 0,
    };
  }
  
  return {
    match_id: String(m.match_id), radiant_team_id: rt.id, dire_team_id: dt.id,
    radiant_team_name: m.radiant_name || null, radiant_team_name_cn: rt.name_cn,
    dire_team_name: m.dire_name || null, dire_team_name_cn: dt.name_cn,
    radiant_score: m.radiant_score || 0, dire_score: m.dire_score || 0,
    radiant_game_wins: status === 'finished' ? (rw ? 1 : 0) : 0,
    dire_game_wins: status === 'finished' ? (rw ? 0 : 1) : 0,
    start_time: m.start_time, duration: m.duration || 0, leagueid: m.leagueid || null,
    series_type: 'BO3', status, lobby_type: m.lobby_type || 0, radiant_win: rw ? 1 : 0,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    console.log('=== DOTA2 Hub Sync ===');
    
    if (!redis) throw new Error('Redis not configured - REDIS_URL missing');
    if (!cfg) throw new Error('Invalid REDIS_URL format');
    
    // Test Redis
    await redis.ping();
    console.log('Redis connected!');

    // Get existing
    let existing = {};
    try {
      const data = await redis.get('matches');
      if (data) existing = typeof data === 'string' ? JSON.parse(data) : data;
    } catch (e) { console.log('No existing matches'); }
    console.log(`Existing: ${Object.keys(existing).length}`);

    let cnMatches = [];

    // Pro Matches
    console.log('Fetching pro matches...');
    const pro = await fetchWithRetry(`${OPENDOTA_BASE_URL}/proMatches?limit=50`);
    for (const m of pro) { const c = convertMatch(m); if (c) cnMatches.push(c); }

    // Team Matches
    for (const [, td] of Object.entries(TARGET_TEAMS)) {
      const tm = await fetchWithRetry(`${OPENDOTA_BASE_URL}/teams/${td.id}/matches`);
      for (const m of tm) { const c = convertMatch(m, td); if (c) cnMatches.push(c); }
      await new Promise(r => setTimeout(r, 500));
    }

    // Save
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
    console.error('Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
