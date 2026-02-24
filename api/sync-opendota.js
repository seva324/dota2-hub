/**
 * OpenDota 数据同步 API
 */

import { createClient } from 'redis';

const REDIS_URL = process.env.REDIS_URL;

let redis;
async function getRedis() {
  if (!redis && REDIS_URL) {
    redis = createClient({ url: REDIS_URL });
    await redis.connect();
  }
  return redis;
}

const OPENDOTA = 'https://api.opendota.com/api';

const TEAMS = {
  'xtreme-gaming': { name: 'Xtreme Gaming', name_cn: 'XG', id: 8261502 },
  'yakult-brothers': { name: 'Yakult Brothers', name_cn: 'YB', id: 8255888 },
  'vici-gaming': { name: 'Vici Gaming', name_cn: 'VG', id: 7391077 },
};

// League IDs to fetch complete historical matches from
const LEAGUE_IDS = [19269, 18988, 19099, 19130];

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function identify(name) {
  if (!name) return { id: 'unknown', name_cn: name, is_cn: false };
  const u = name.toUpperCase(), l = name.toLowerCase();
  if (u === 'XG' || l.includes('xtreme')) return { id: 'xtreme-gaming', name_cn: 'XG', is_cn: true };
  if (u === 'YB' || l.includes('yakult') || u === 'AR' || l.includes('azure')) 
    return { id: 'yakult-brothers', name_cn: 'YB', is_cn: true };
  if (u === 'VG' || l.includes('vici')) return { id: 'vici-gaming', name_cn: 'VG', is_cn: true };
  return { id: 'unknown', name_cn: name, is_cn: false };
}

function convert(m, td = null) {
  const rt = identify(m.radiant_name), dt = identify(m.dire_name);
  // Remove Chinese team filter - get ALL matches from tournaments
  // if (!rt.is_cn && !dt.is_cn && !td) return null;
  const now = Date.now() / 1000;
  const status = m.start_time < now - 3600 ? 'finished' : m.start_time < now ? 'live' : 'scheduled';
  const rw = m.radiant_win;
  
  if (td) {
    const isR = m.radiant;
    return {
      match_id: String(m.match_id), radiant_team_id: isR ? td.id : 'unknown',
      dire_team_id: isR ? 'unknown' : td.id,
      radiant_team_name: isR ? td.name : m.opposing_team_name,
      radiant_team_name_cn: isR ? td.name_cn : identify(m.opposing_team_name).name_cn,
      dire_team_name: isR ? m.opposing_team_name : td.name,
      dire_team_name_cn: isR ? identify(m.opposing_team_name).name_cn : td.name_cn,
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
    if (!REDIS_URL) {
      return res.status(500).json({ error: 'REDIS_URL not configured' });
    }

    const r = await getRedis();
    await r.ping();
    console.log('Redis connected!');

    // 获取现有数据
    let existing = {};
    try {
      const data = await r.get('matches');
      if (data) existing = JSON.parse(data);
    } catch (e) { console.log('No existing'); }

    // 获取新数据
    let cn = [];
    const pro = await fetchJSON(`${OPENDOTA}/proMatches?limit=30`);
    for (const m of pro) { const c = convert(m); if (c) cn.push(c); }

    for (const [, td] of Object.entries(TEAMS)) {
      const tm = await fetchJSON(`${OPENDOTA}/teams/${td.id}/matches`);
      for (const m of tm) { const c = convert(m, td); if (c) cn.push(c); }
    }

    // Fetch ALL historical matches from specified leagues (complete history, not filtered)
    for (const leagueId of LEAGUE_IDS) {
      try {
        console.log(`Fetching all matches for league ${leagueId}...`);
        const leagueMatches = await fetchJSON(`${OPENDOTA}/leagues/${leagueId}/matches`);
        console.log(`League ${leagueId}: found ${leagueMatches.length} matches`);
        for (const m of leagueMatches) { 
          const c = convert(m); 
          if (c) cn.push(c); 
        }
      } catch (e) {
        console.error(`Failed to fetch league ${leagueId}:`, e.message);
      }
    }

    // 保存
    let saved = 0;
    for (const m of cn) {
      if (!existing[m.match_id]) { existing[m.match_id] = m; saved++; }
    }
    await r.set('matches', JSON.stringify(existing));
    
    const list = Object.values(existing).sort((a,b) => b.start_time - a.start_time).slice(0, 500);
    await r.set('matches:list', JSON.stringify(list));

    return res.status(200).json({ success: true, saved, total: Object.keys(existing).length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
