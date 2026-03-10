#!/usr/bin/env node
import { neon } from '@neondatabase/serverless';

const OPENDOTA_BASE = 'https://api.opendota.com/api';
const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const OPENDOTA_API_KEY = process.env.OPENDOTA_API_KEY;

if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL/POSTGRES_URL');
  process.exit(1);
}

function parseLeagueId() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--league-id') {
      const v = Number(args[i + 1]);
      if (Number.isInteger(v) && v > 0) return v;
    }
    if (arg.startsWith('--league-id=')) {
      const v = Number(arg.slice('--league-id='.length));
      if (Number.isInteger(v) && v > 0) return v;
    }
  }
  return null;
}

const leagueId = parseLeagueId();
if (!leagueId) {
  console.error('Usage: node scripts/sync-opendota-league-to-neon.mjs --league-id=19239');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function fetchJson(url, retries = 4) {
  for (let i = 0; i < retries; i++) {
    try {
      const headers = {};
      if (OPENDOTA_API_KEY) headers.Authorization = `Bearer ${OPENDOTA_API_KEY}`;
      const res = await fetch(url, { headers });
      if (!res.ok) {
        if (res.status === 429) {
          await new Promise((r) => setTimeout(r, 5000));
          continue;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

function convertSeriesType(seriesType) {
  const map = { 0: 'BO1', 1: 'BO3', 2: 'BO5', 3: 'BO2' };
  if (seriesType === null || seriesType === undefined || seriesType === '') return 'BO3';
  if (typeof seriesType === 'string') {
    const normalized = seriesType.toUpperCase();
    if (normalized.startsWith('BO')) return normalized;
    const parsed = Number(seriesType);
    return Number.isInteger(parsed) && map[parsed] ? map[parsed] : 'BO3';
  }
  return map[seriesType] || 'BO3';
}

function normalizeTier(raw) {
  const v = String(raw || '').trim().toUpperCase();
  if (!v) return 'S';
  if (v === 'S' || v === 'A' || v === 'B' || v === 'C') return v;
  if (v.startsWith('S')) return 'S';
  if (v.startsWith('A')) return 'A';
  if (v.startsWith('B')) return 'B';
  if (v.startsWith('C')) return 'C';
  return 'S';
}

function buildSeries(matches) {
  const map = new Map();
  for (const m of matches) {
    const sid = m.series_id ? String(m.series_id) : `opendota_${m.match_id}`;
    if (!map.has(sid)) {
      map.set(sid, {
        series_id: sid,
        league_id: Number(m.leagueid) || null,
        radiant_team_id: m.radiant_team_id ? String(m.radiant_team_id) : null,
        dire_team_id: m.dire_team_id ? String(m.dire_team_id) : null,
        radiant_wins: 0,
        dire_wins: 0,
        series_type: convertSeriesType(m.series_type),
        status: 'finished',
        start_time: m.start_time,
        matches: []
      });
    }
    const s = map.get(sid);
    s.matches.push(m);
    if (m.start_time && (!s.start_time || m.start_time < s.start_time)) s.start_time = m.start_time;

    const radiantWin = m.radiant_win === true || m.radiant_win === 1;
    if (radiantWin) {
      if (String(m.radiant_team_id || '') === String(s.radiant_team_id || '')) s.radiant_wins += 1;
      else if (String(m.radiant_team_id || '') === String(s.dire_team_id || '')) s.dire_wins += 1;
    } else {
      if (String(m.dire_team_id || '') === String(s.radiant_team_id || '')) s.radiant_wins += 1;
      else if (String(m.dire_team_id || '') === String(s.dire_team_id || '')) s.dire_wins += 1;
    }
  }
  return Array.from(map.values());
}

async function upsertTournament(id) {
  const league = await fetchJson(`${OPENDOTA_BASE}/leagues/${id}`);
  const tName = league?.name || `League ${id}`;
  const tier = normalizeTier(league?.tier);
  const startTime = Number.isFinite(Number(league?.start_timestamp)) ? Number(league.start_timestamp) : null;
  const endTime = Number.isFinite(Number(league?.end_timestamp)) ? Number(league.end_timestamp) : null;

  await sql`
    INSERT INTO tournaments (league_id, name, name_cn, tier, status, start_time, end_time, updated_at)
    VALUES (${id}, ${tName}, ${tName}, ${tier}, ${'ongoing'}, ${startTime}, ${endTime}, NOW())
    ON CONFLICT (league_id) DO UPDATE SET
      name = EXCLUDED.name,
      name_cn = EXCLUDED.name_cn,
      tier = COALESCE(NULLIF(EXCLUDED.tier, ''), tournaments.tier),
      start_time = COALESCE(EXCLUDED.start_time, tournaments.start_time),
      end_time = COALESCE(EXCLUDED.end_time, tournaments.end_time),
      updated_at = NOW()
  `;
}

async function upsertTeam(teamId) {
  const team = await fetchJson(`${OPENDOTA_BASE}/teams/${teamId}`);
  if (!team?.team_id) return false;
  await sql`
    INSERT INTO teams (team_id, name, tag, logo_url, region, created_at, updated_at)
    VALUES (${String(team.team_id)}, ${team.name || `Team ${team.team_id}`}, ${team.tag || null}, ${team.logo_url || null}, ${team.region || null}, NOW(), NOW())
    ON CONFLICT (team_id) DO UPDATE SET
      name = COALESCE(NULLIF(teams.name, ''), NULLIF(EXCLUDED.name, '')),
      tag = COALESCE(NULLIF(EXCLUDED.tag, ''), teams.tag),
      logo_url = COALESCE(NULLIF(EXCLUDED.logo_url, ''), teams.logo_url),
      region = COALESCE(NULLIF(EXCLUDED.region, ''), teams.region),
      updated_at = NOW()
  `;
  return true;
}

async function upsertSeries(seriesRows) {
  let count = 0;
  for (const s of seriesRows) {
    await sql`
      INSERT INTO series (series_id, league_id, radiant_team_id, dire_team_id, radiant_wins, dire_wins, series_type, status, start_time, created_at, updated_at)
      VALUES (${s.series_id}, ${s.league_id}, ${s.radiant_team_id}, ${s.dire_team_id}, ${s.radiant_wins}, ${s.dire_wins}, ${s.series_type}, ${s.status}, ${s.start_time}, NOW(), NOW())
      ON CONFLICT (series_id) DO UPDATE SET
        league_id = EXCLUDED.league_id,
        radiant_team_id = COALESCE(EXCLUDED.radiant_team_id, series.radiant_team_id),
        dire_team_id = COALESCE(EXCLUDED.dire_team_id, series.dire_team_id),
        radiant_wins = EXCLUDED.radiant_wins,
        dire_wins = EXCLUDED.dire_wins,
        series_type = EXCLUDED.series_type,
        status = EXCLUDED.status,
        start_time = COALESCE(EXCLUDED.start_time, series.start_time),
        updated_at = NOW()
    `;
    count++;
  }
  return count;
}

async function upsertMatches(matches) {
  let count = 0;
  for (const m of matches) {
    const sid = m.series_id ? String(m.series_id) : `opendota_${m.match_id}`;
    await sql`
      INSERT INTO matches (match_id, series_id, radiant_team_id, dire_team_id, radiant_score, dire_score, radiant_win, start_time, duration, created_at, updated_at)
      VALUES (${Number(m.match_id)}, ${sid}, ${m.radiant_team_id ? String(m.radiant_team_id) : null}, ${m.dire_team_id ? String(m.dire_team_id) : null}, ${m.radiant_score || 0}, ${m.dire_score || 0}, ${m.radiant_win ? true : false}, ${m.start_time || null}, ${m.duration || 0}, NOW(), NOW())
      ON CONFLICT (match_id) DO UPDATE SET
        series_id = EXCLUDED.series_id,
        radiant_team_id = COALESCE(EXCLUDED.radiant_team_id, matches.radiant_team_id),
        dire_team_id = COALESCE(EXCLUDED.dire_team_id, matches.dire_team_id),
        radiant_score = EXCLUDED.radiant_score,
        dire_score = EXCLUDED.dire_score,
        radiant_win = EXCLUDED.radiant_win,
        start_time = COALESCE(EXCLUDED.start_time, matches.start_time),
        duration = EXCLUDED.duration,
        updated_at = NOW()
    `;
    count++;
  }
  return count;
}

async function main() {
  console.log(`[Sync] league_id=${leagueId}`);
  const matches = await fetchJson(`${OPENDOTA_BASE}/leagues/${leagueId}/matches`);
  if (!Array.isArray(matches) || matches.length === 0) {
    console.log('[Sync] no matches found');
    return;
  }

  await upsertTournament(leagueId);

  const teamIds = Array.from(
    new Set(
      matches
        .flatMap((m) => [m.radiant_team_id, m.dire_team_id])
        .filter((v) => Number.isInteger(Number(v)) && Number(v) > 0)
        .map((v) => Number(v))
    )
  );

  let teamsSaved = 0;
  for (const tid of teamIds) {
    try {
      const ok = await upsertTeam(tid);
      if (ok) teamsSaved++;
    } catch (e) {
      console.log(`[Teams] skip ${tid}: ${e.message}`);
    }
  }

  const seriesRows = buildSeries(matches);
  const seriesSaved = await upsertSeries(seriesRows);
  const matchesSaved = await upsertMatches(matches);

  const verify = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM matches m JOIN series s ON m.series_id = s.series_id WHERE s.league_id = ${leagueId}) AS match_count,
      (SELECT COUNT(*)::int FROM series WHERE league_id = ${leagueId}) AS series_count,
      (SELECT COUNT(*)::int FROM tournaments WHERE league_id = ${leagueId}) AS tournament_count
  `;

  console.log('[Sync] done', {
    fetched_matches: matches.length,
    saved_teams: teamsSaved,
    saved_series: seriesSaved,
    saved_matches: matchesSaved,
    verify: verify?.[0] || null
  });
}

main().catch((e) => {
  console.error('[Sync] failed:', e.message);
  process.exit(1);
});
