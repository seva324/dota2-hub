/**
 * Sync Upcoming Series through the legacy sync-liquipedia entrypoint.
 * Fetches upcoming matches from DLTV matches page
 * - Games with starttime > now and starttime < now + 7 days
 *
 * Usage: POST /api/sync-liquipedia
 */

import { neon } from '@neondatabase/serverless';
import { DLTV_MATCHES_URL, parseDltvUpcomingMatchesPage } from './dltv-upcoming.js';
import {
  fetchDltvEventMetadata,
  parseDltvEventUrl,
  scoreTournamentNameMatch,
} from './dltv-events.js';
import { backfillDltvTeamLogos, resolveDltvLogoForTeam } from './dltv-team-logo-backfill.js';
import { fetchDltvRankingLogoIndex } from './dltv-team-assets.js';
import { ensureTournamentColumns } from './tournament-columns.js';
import { ensureUpcomingSeriesColumns } from './upcoming-series-columns.js';

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

function getDb() {
  if (!sql && DATABASE_URL) {
    sql = neon(DATABASE_URL);
  }
  return sql;
}

let sql = null;

const OPENDOTA = 'https://api.opendota.com/api';

async function withTimeout(task, timeoutMs, label) {
  let timer = null;
  try {
    return await Promise.race([
      Promise.resolve().then(task),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Fetch team by name from OpenDota
 */
async function saveTeamFromOpenDota(db, teamName, dltvRankingIndex = null) {
  if (!db || !teamName) return null;

  try {
    const existing = await db`SELECT team_id FROM teams WHERE LOWER(name) = ${teamName.toLowerCase()}`;
    if (existing.length > 0) return existing[0].team_id;

    const teams = await fetchJSON(`${OPENDOTA}/teams?search=${encodeURIComponent(teamName)}`);
    const team = teams.find(t => t.name?.toLowerCase() === teamName.toLowerCase());

    if (team?.team_id) {
      const dltvLogo = resolveDltvLogoForTeam(dltvRankingIndex, {
        team_id: team.team_id,
        name: team.name || teamName,
        tag: team.tag,
      });
      const logoUrl = dltvLogo || team.logo_url || null;
      await db`
        INSERT INTO teams (team_id, name, tag, logo_url, region, created_at, updated_at)
        VALUES (${String(team.team_id)}, ${team.name}, ${team.tag || null}, ${logoUrl}, ${team.region || null}, NOW(), NOW())
        ON CONFLICT (team_id) DO UPDATE SET
          name = COALESCE(NULLIF(teams.name, ''), NULLIF(EXCLUDED.name, '')),
          tag = EXCLUDED.tag,
          logo_url = COALESCE(EXCLUDED.logo_url, teams.logo_url),
          updated_at = NOW()
      `;
      return String(team.team_id);
    }
  } catch (e) {
    console.log(`[Liquipedia] Failed to fetch team ${teamName}: ${e.message}`);
  }
  return null;
}

/**
 * Save upcoming series to database
 */
async function saveUpcomingSeries(db, series) {
  if (!db || !series?.id) return false;

  try {
    await db`
      INSERT INTO upcoming_series (
        id, series_id, league_id,
        radiant_team_id, dire_team_id,
        radiant_team_name, radiant_team_name_cn,
        dire_team_name, dire_team_name_cn,
        tournament_name, tournament_name_cn, tournament_tier,
        tournament_source_url, tournament_event_slug, tournament_parent_slug, tournament_group_slug,
        start_time, series_type, status, created_at, updated_at
      )
      VALUES (
        ${series.id}, ${series.series_id}, ${series.league_id},
        ${series.radiant_team_id}, ${series.dire_team_id},
        ${series.radiant_team_name || null}, ${series.radiant_team_name_cn || null},
        ${series.dire_team_name || null}, ${series.dire_team_name_cn || null},
        ${series.tournament_name || null}, ${series.tournament_name_cn || null}, ${series.tournament_tier || null},
        ${series.tournament_source_url || null}, ${series.tournament_event_slug || null}, ${series.tournament_parent_slug || null}, ${series.tournament_group_slug || null},
        ${series.start_time}, ${series.series_type || 'BO3'}, ${series.status || 'upcoming'}, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        radiant_team_id = EXCLUDED.radiant_team_id,
        dire_team_id = EXCLUDED.dire_team_id,
        radiant_team_name = EXCLUDED.radiant_team_name,
        radiant_team_name_cn = EXCLUDED.radiant_team_name_cn,
        dire_team_name = EXCLUDED.dire_team_name,
        dire_team_name_cn = EXCLUDED.dire_team_name_cn,
        tournament_name = EXCLUDED.tournament_name,
        tournament_name_cn = EXCLUDED.tournament_name_cn,
        tournament_tier = EXCLUDED.tournament_tier,
        tournament_source_url = EXCLUDED.tournament_source_url,
        tournament_event_slug = EXCLUDED.tournament_event_slug,
        tournament_parent_slug = EXCLUDED.tournament_parent_slug,
        tournament_group_slug = EXCLUDED.tournament_group_slug,
        start_time = EXCLUDED.start_time,
        series_type = EXCLUDED.series_type,
        status = EXCLUDED.status,
        updated_at = NOW()
    `;
    return true;
  } catch (e) {
    console.log(`[Liquipedia] Failed to save ${series.id}: ${e.message}`);
    return false;
  }
}

function normalizeName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/[._-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hashValue(value) {
  const input = String(value || '').toLowerCase().trim();
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0; // 32-bit
  }
  return hash || 1;
}

async function loadTournamentCandidates(db) {
  await ensureTournamentColumns(db);
  return db.query(
    `
      SELECT
        league_id,
        name,
        tier,
        location,
        status,
        start_time,
        end_time,
        prize_pool,
        prize_pool_usd,
        image,
        location_flag_url,
        source_url,
        dltv_event_slug,
        dltv_parent_slug,
        event_group_slug
      FROM tournaments
      ORDER BY updated_at DESC NULLS LAST, league_id ASC
      LIMIT 800
    `
  );
}

function replaceTournamentCandidate(cache, candidate) {
  const leagueId = Number(candidate?.league_id);
  if (!Number.isFinite(leagueId)) return;
  const index = cache.findIndex((row) => Number(row?.league_id) === leagueId);
  if (index >= 0) {
    cache[index] = candidate;
  } else {
    cache.push(candidate);
  }
}

function pickTournamentCandidate(candidates, tournamentName, eventMeta) {
  const sourceUrl = eventMeta?.sourceUrl || null;
  const eventSlug = eventMeta?.eventSlug || null;

  if (sourceUrl) {
    const sourceMatch = candidates.find((candidate) => String(candidate.source_url || '').trim() === sourceUrl);
    if (sourceMatch) return sourceMatch;
  }

  if (eventSlug) {
    const slugMatch = candidates.find((candidate) => String(candidate.dltv_event_slug || '').trim() === eventSlug);
    if (slugMatch) return slugMatch;
  }

  const scored = candidates
    .map((candidate) => {
      const match = scoreTournamentNameMatch(eventMeta?.title || tournamentName, candidate.name || '');
      return {
        candidate,
        ...match,
      };
    })
    .filter((row) => row.score >= 8 || (row.detailOverlap >= 3 && row.groupOverlap >= 2))
    .sort((left, right) => (
      right.score - left.score
      || right.detailOverlap - left.detailOverlap
      || right.groupOverlap - left.groupOverlap
      || Number(right.candidate.start_time || 0) - Number(left.candidate.start_time || 0)
    ));

  return scored[0]?.candidate || null;
}

async function buildSyntheticLeagueId(db, candidates, stableKey) {
  let leagueId = 1000000000 + (Math.abs(hashValue(stableKey)) % 1000000000);
  for (let i = 0; i < 20; i += 1) {
    const candidateConflict = candidates.find((candidate) => Number(candidate.league_id) === leagueId);
    if (!candidateConflict) {
      const dbConflict = await db.query(`SELECT league_id FROM tournaments WHERE league_id = $1 LIMIT 1`, [leagueId]);
      if (dbConflict.length === 0) return leagueId;
    }
    leagueId += 1;
  }
  return leagueId;
}

async function upsertTournamentMetadata(db, cache, leagueId, tournamentName, eventMeta) {
  const name = String(eventMeta?.title || tournamentName || '').trim() || `DLTV Event ${leagueId}`;
  const params = [
    leagueId,
    name,
    eventMeta?.tier || null,
    eventMeta?.location || null,
    eventMeta?.status || null,
    eventMeta?.startTime || null,
    eventMeta?.endTime || null,
    eventMeta?.prizePool || null,
    eventMeta?.prizePoolUsd || null,
    eventMeta?.image || null,
    eventMeta?.locationFlagUrl || null,
    eventMeta?.sourceUrl || null,
    eventMeta?.eventSlug || null,
    eventMeta?.parentSlug || null,
    eventMeta?.eventGroupSlug || null,
  ];

  await db.query(
    `
      INSERT INTO tournaments (
        league_id, name, tier, location, status, start_time, end_time,
        prize_pool, prize_pool_usd, image, location_flag_url,
        source_url, dltv_event_slug, dltv_parent_slug, event_group_slug,
        created_at, updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW(),NOW())
      ON CONFLICT (league_id) DO UPDATE SET
        name = COALESCE(NULLIF(EXCLUDED.name, ''), tournaments.name),
        tier = COALESCE(EXCLUDED.tier, tournaments.tier),
        location = COALESCE(EXCLUDED.location, tournaments.location),
        status = COALESCE(EXCLUDED.status, tournaments.status),
        start_time = COALESCE(EXCLUDED.start_time, tournaments.start_time),
        end_time = COALESCE(EXCLUDED.end_time, tournaments.end_time),
        prize_pool = COALESCE(EXCLUDED.prize_pool, tournaments.prize_pool),
        prize_pool_usd = COALESCE(EXCLUDED.prize_pool_usd, tournaments.prize_pool_usd),
        image = COALESCE(EXCLUDED.image, tournaments.image),
        location_flag_url = COALESCE(EXCLUDED.location_flag_url, tournaments.location_flag_url),
        source_url = COALESCE(EXCLUDED.source_url, tournaments.source_url),
        dltv_event_slug = COALESCE(EXCLUDED.dltv_event_slug, tournaments.dltv_event_slug),
        dltv_parent_slug = COALESCE(EXCLUDED.dltv_parent_slug, tournaments.dltv_parent_slug),
        event_group_slug = COALESCE(EXCLUDED.event_group_slug, tournaments.event_group_slug),
        updated_at = NOW()
    `,
    params
  );

  replaceTournamentCandidate(cache, {
    league_id: leagueId,
    name,
    tier: eventMeta?.tier || null,
    location: eventMeta?.location || null,
    status: eventMeta?.status || null,
    start_time: eventMeta?.startTime || null,
    end_time: eventMeta?.endTime || null,
    prize_pool: eventMeta?.prizePool || null,
    prize_pool_usd: eventMeta?.prizePoolUsd || null,
    image: eventMeta?.image || null,
    location_flag_url: eventMeta?.locationFlagUrl || null,
    source_url: eventMeta?.sourceUrl || null,
    dltv_event_slug: eventMeta?.eventSlug || null,
    dltv_parent_slug: eventMeta?.parentSlug || null,
    event_group_slug: eventMeta?.eventGroupSlug || null,
  });
}

async function resolveTournamentRecord(db, cache, tournamentName, eventMeta) {
  const matched = pickTournamentCandidate(cache, tournamentName, eventMeta);
  const stableKey = eventMeta?.eventSlug || eventMeta?.sourceUrl || tournamentName;
  const leagueId = matched?.league_id
    ? Number(matched.league_id)
    : await buildSyntheticLeagueId(db, cache, stableKey);

  await upsertTournamentMetadata(db, cache, leagueId, matched?.name || tournamentName, eventMeta);

  return {
    leagueId,
    name: eventMeta?.title || matched?.name || tournamentName,
    tier: eventMeta?.tier || matched?.tier || null,
    sourceUrl: eventMeta?.sourceUrl || matched?.source_url || null,
    eventSlug: eventMeta?.eventSlug || matched?.dltv_event_slug || null,
    parentSlug: eventMeta?.parentSlug || matched?.dltv_parent_slug || null,
    eventGroupSlug: eventMeta?.eventGroupSlug || matched?.event_group_slug || null,
  };
}

async function collectRelatedEventMetadata(seedUrls, fetchImpl = fetch) {
  const cache = new Map();
  const queue = Array.from(new Set((seedUrls || []).filter(Boolean)));
  const maxEvents = 48;

  while (queue.length > 0 && cache.size < maxEvents) {
    const currentUrl = queue.shift();
    if (!currentUrl || cache.has(currentUrl)) continue;
    const metadata = await fetchDltvEventMetadata(currentUrl, fetchImpl).catch((error) => {
      console.log(`[Sync Liquipedia] Failed to fetch event metadata ${currentUrl}: ${error.message}`);
      return null;
    });
    cache.set(currentUrl, metadata);

    if (!metadata) continue;

    for (const nextUrl of [metadata.parentSourceUrl, ...(metadata.relatedEventLinks || [])]) {
      if (!nextUrl || cache.has(nextUrl) || queue.includes(nextUrl)) continue;
      queue.push(nextUrl);
    }
  }

  return cache;
}

/**
 * Fetch upcoming matches from DLTV matches page.
 */
async function fetchDltvUpcomingMatches() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('DLTV matches fetch timed out')), 15000);
  let res;
  try {
    res = await fetch(DLTV_MATCHES_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Dota2Hub/1.0)'
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const html = await res.text();
  const debug = { responseLength: html.length };

  if (!html.trim()) {
    console.log('[Sync Liquipedia] Empty DLTV matches response');
    return { upcoming: [], debug };
  }

  const now = Math.floor(Date.now() / 1000);
  const weekLater = now + 7 * 24 * 60 * 60;
  const upcoming = parseDltvUpcomingMatchesPage(html, { now, maxStartTime: weekLater });
  debug.matchBlocksFound = upcoming.length;
  console.log(`[Sync Liquipedia] Parsed ${upcoming.length} upcoming DLTV match candidates`);

  return { upcoming, debug };
}

export async function runSyncLiquipedia() {

  const db = getDb();
  if (!db) {
    throw new Error('DATABASE_URL not configured');
  }

  console.log('[Sync Liquipedia] Starting...');

  try {
    const now = Math.floor(Date.now() / 1000);

    await ensureUpcomingSeriesColumns(db);
    await ensureTournamentColumns(db);

    let dltvRankingIndex = null;
    let dltvLogoBackfill = null;
    try {
      dltvRankingIndex = await withTimeout(() => fetchDltvRankingLogoIndex(), 20000, 'DLTV ranking index');
      dltvLogoBackfill = await withTimeout(
        () => backfillDltvTeamLogos(db, { index: dltvRankingIndex }),
        30000,
        'DLTV logo backfill'
      );
      console.log(`[Sync Liquipedia] Backfilled ${dltvLogoBackfill.updated} team logos from DLTV ranking`);
    } catch (e) {
      console.log(`[Sync Liquipedia] DLTV logo backfill skipped: ${e.message}`);
      dltvLogoBackfill = { skipped: true, reason: e.message };
    }

    // Step 1: Clean up past series and invalid data
    console.log('[Sync Liquipedia] Cleaning up past/invalid series...');
    await db`DELETE FROM upcoming_series WHERE start_time < ${now}`;

    // Also clean up matches where radiant == dire (invalid BYE matches)
    await db`DELETE FROM upcoming_series WHERE radiant_team_id = dire_team_id`;

    // Step 2: Remove series that already have matches
    await db`
      DELETE FROM upcoming_series us
      WHERE EXISTS (
        SELECT 1 FROM matches m
        WHERE m.series_id = us.series_id
        AND m.series_id IS NOT NULL
      )
    `;
    console.log('[Sync Liquipedia] Cleaned up series that already have matches');

    // Step 3: Fetch from DLTV matches while keeping the existing sync entrypoint.
    console.log('[Sync Liquipedia] Fetching upcoming matches from DLTV...');
    let liquipediaUpcoming = [];

    try {
      const result = await withTimeout(() => fetchDltvUpcomingMatches(), 20000, 'DLTV upcoming matches');
      liquipediaUpcoming = result.upcoming;
    } catch (e) {
      console.log(`[Sync Liquipedia] DLTV fetch failed: ${e.message}`);
    }

    const tournamentCandidates = await loadTournamentCandidates(db);
    const eventMetadataByUrl = await collectRelatedEventMetadata(
      liquipediaUpcoming
        .map((row) => row.eventUrl)
        .filter(Boolean)
    );

    for (const metadata of eventMetadataByUrl.values()) {
      if (!metadata) continue;
      await resolveTournamentRecord(db, tournamentCandidates, metadata.title || '', metadata);
    }

    // Step 4: Get teams from database
    console.log('[Sync Liquipedia] Loading teams from database...');
    const allTeams = await db`SELECT team_id, name, tag FROM teams`;
    const teamNameToId = new Map();

    for (const t of allTeams) {
      teamNameToId.set(normalizeName(t.name), t.team_id);
      if (t.tag) {
        teamNameToId.set(normalizeName(t.tag), t.team_id);
      }
    }
    console.log(`[Sync Liquipedia] Loaded ${allTeams.length} teams from database`);

    // Step 5: Save new upcoming series
    let saved = 0;

    for (const m of liquipediaUpcoming) {
      const radiantNameNorm = normalizeName(m.radiantName);
      const direNameNorm = normalizeName(m.direName);

      // Only keep matches where at least one team already exists in teams table.
      let radiantTeamId = teamNameToId.get(radiantNameNorm);
      let direTeamId = teamNameToId.get(direNameNorm);
      if (!radiantTeamId && !direTeamId) continue;

      // If not found, fetch from OpenDota
      if (!radiantTeamId) {
        radiantTeamId = await saveTeamFromOpenDota(db, m.radiantName, dltvRankingIndex);
        if (radiantTeamId) teamNameToId.set(radiantNameNorm, radiantTeamId);
      }
      if (!direTeamId) {
        direTeamId = await saveTeamFromOpenDota(db, m.direName, dltvRankingIndex);
        if (direTeamId) teamNameToId.set(direNameNorm, direTeamId);
      }

      if (!radiantTeamId && !direTeamId) {
        console.log(`[Liquipedia] Could not resolve both team IDs: ${m.radiantName} -> ${radiantTeamId}, ${m.direName} -> ${direTeamId}`);
        continue;
      }

      const eventMeta = m.eventUrl
        ? eventMetadataByUrl.get(m.eventUrl) || {
          ...parseDltvEventUrl(m.eventUrl),
          sourceUrl: m.eventUrl,
          title: m.tournament,
          tier: null,
        }
        : null;
      const tournamentRecord = await resolveTournamentRecord(db, tournamentCandidates, m.tournament, eventMeta);
      const leagueId = tournamentRecord.leagueId;

      const fallbackSeriesId = `${leagueId}_${m.radiantName}_vs_${m.direName}`.toLowerCase().replace(/\s+/g, '_');
      const seriesId = m.seriesId ? `dltv_${m.seriesId}` : fallbackSeriesId;
      const id = `${seriesId}_${m.timestamp}`.toLowerCase().replace(/\s+/g, '_');

      const ok = await saveUpcomingSeries(db, {
        id,
        series_id: seriesId,
        league_id: leagueId,
        radiant_team_id: radiantTeamId,
        dire_team_id: direTeamId,
        radiant_team_name: m.radiantName,
        dire_team_name: m.direName,
        tournament_name: tournamentRecord.name || m.tournament,
        tournament_tier: tournamentRecord.tier || null,
        tournament_source_url: tournamentRecord.sourceUrl || m.eventUrl || null,
        tournament_event_slug: tournamentRecord.eventSlug || null,
        tournament_parent_slug: tournamentRecord.parentSlug || null,
        tournament_group_slug: tournamentRecord.eventGroupSlug || null,
        start_time: m.timestamp,
        series_type: m.bestOf,
        status: 'upcoming'
      });
      if (ok) saved++;
    }

    console.log(`[Sync Liquipedia] Saved ${saved} upcoming series`);

    return {
      success: true,
      stats: {
        liquipedia: liquipediaUpcoming.length,
        saved,
        dltvLogoBackfill,
      }
    };
  } catch (e) {
    console.error('[Sync Liquipedia] Error:', e);
    throw e;
  }
}
