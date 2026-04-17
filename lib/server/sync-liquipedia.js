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
  fetchDltvEventsCatalog,
  fetchDltvEventMetadata,
  parseDltvEventUrl,
  scoreTournamentNameMatch,
} from './dltv-events.js';
import { backfillDltvTeamLogos, resolveDltvLogoForTeam } from './dltv-team-logo-backfill.js';
import { fetchDltvRankingLogoIndex } from './dltv-team-assets.js';
import { ensureTournamentColumns } from './tournament-columns.js';
import { deriveTournamentStatus } from './tournament-status.js';
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
const DLTV_CATALOG_DEMO_GROUPS = new Set(['blast-slam-7', 'dreamleague-season-29', 'pgl-wallachia-season-8']);
const DREAMLEAGUE_29_QUALIFIER_RE = /^dreamleague(?: season)? 29: .*qualifier/i;
const KNOWN_TOURNAMENT_REPAIRS = [
  {
    leagueId: 19435,
    canonicalName: 'PGL Wallachia Season 7',
    sourceUrl: 'https://dltv.org/events/pgl-wallachia-season-7',
    conflictingEventSlug: 'pgl-wallachia-season-8',
    conflictingNamePattern: /\bpgl wallachia season 8\b/i,
  },
];
const DEMO_TOURNAMENT_MAPPINGS = [
  {
    key: 'blast-slam-7-main',
    eventSlug: 'blast-slam-7',
    leagueId: 19101,
    canonicalName: 'BLAST SLAM VII',
  },
  {
    key: 'blast-slam-7-china',
    eventSlug: 'blast-slam-vii-china-closed-qualifier',
    canonicalName: 'BLAST Slam VII China Qualifier',
  },
  {
    key: 'blast-slam-7-sea',
    eventSlug: 'blast-slam-vii-southeast-asia-closed-qualifier',
    leagueId: 19538,
    canonicalName: 'RES Unchained - A Blast Dota Slam VII Qualifier SEA',
  },
  {
    key: 'blast-slam-7-europe',
    eventSlug: 'blast-slam-vii-europe-closed-qualifier',
    leagueId: 19539,
    canonicalName: 'RES Unchained - A Blast Dota Slam VII Qualifier EU',
  },
  {
    key: 'dreamleague-29-qualifiers',
    titlePattern: DREAMLEAGUE_29_QUALIFIER_RE,
    leagueId: 19448,
    canonicalName: 'DreamLeague Season 29 Qualifiers',
    aggregateChildren: true,
    aggregateEventSlug: 'dreamleague-season-29-qualifiers',
    aggregateSourceUrl: 'https://dltv.org/events/dreamleague-season-29#qualifiers',
    aggregateEventGroupSlug: 'dreamleague-season-29',
  },
];

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
        league_id = EXCLUDED.league_id,
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

function isDemoCatalogSeed(event) {
  if (!event) return false;
  const groupSlug = event.eventGroupSlug || event.parentSlug || event.eventSlug;
  return DLTV_CATALOG_DEMO_GROUPS.has(groupSlug)
    && Boolean(event.eventSlug)
    && event.eventSlug === (event.parentSlug || event.eventSlug);
}

function findTournamentCandidateByLeagueId(candidates, leagueId) {
  const normalizedLeagueId = Number(leagueId);
  if (!Number.isFinite(normalizedLeagueId)) return null;
  return candidates.find((candidate) => Number(candidate?.league_id) === normalizedLeagueId) || null;
}

function pickStableTournamentCandidate(candidates) {
  return [...(candidates || [])].sort((left, right) => (
    Number(left?.league_id || Number.MAX_SAFE_INTEGER) - Number(right?.league_id || Number.MAX_SAFE_INTEGER)
    || Number(left?.start_time || 0) - Number(right?.start_time || 0)
  ))[0] || null;
}

function getExplicitTournamentMapping(eventMeta) {
  if (!eventMeta) return null;
  const title = String(eventMeta.title || '').trim();
  const eventSlug = String(eventMeta.eventSlug || '').trim();
  return DEMO_TOURNAMENT_MAPPINGS.find((rule) => (
    (rule.eventSlug && rule.eventSlug === eventSlug)
    || (rule.aggregateEventSlug && rule.aggregateEventSlug === eventSlug)
    || (rule.titlePattern && rule.titlePattern.test(title))
  )) || null;
}

function isExplicitCandidateCompatible(mapping, eventMeta, candidate) {
  if (!mapping?.leagueId || !candidate) return false;
  const candidateSourceUrl = String(candidate.source_url || '').trim();
  const candidateEventSlug = String(candidate.dltv_event_slug || '').trim();
  if (eventMeta?.sourceUrl && candidateSourceUrl && candidateSourceUrl === eventMeta.sourceUrl) return true;
  if (eventMeta?.eventSlug && candidateEventSlug && candidateEventSlug === eventMeta.eventSlug) return true;

  const expectedNames = [mapping.canonicalName, eventMeta?.title].filter(Boolean);
  return expectedNames.some((expectedName) => {
    const match = scoreTournamentNameMatch(expectedName, candidate.name || '');
    return match.score >= 12 || (match.detailOverlap >= 4 && match.groupOverlap >= 2);
  });
}

function getTierRank(tier) {
  const normalized = String(tier || '').toUpperCase();
  if (normalized === 'S') return 0;
  if (normalized === 'A') return 1;
  if (normalized === 'A-QUAL') return 2;
  if (normalized === 'B') return 3;
  if (normalized === 'B-QUAL') return 4;
  if (normalized === 'C') return 5;
  if (normalized === 'C-QUAL') return 6;
  return 99;
}

function buildAggregateTournamentMetadata(rule, events, metadataByUrl) {
  if (!rule?.aggregateChildren || !events?.length) return null;
  const rootSourceUrl = `https://dltv.org/events/${rule.aggregateEventGroupSlug}`;
  const rootMetadata = metadataByUrl.get(rootSourceUrl) || null;
  const startTimes = events.map((event) => Number(event?.startTime)).filter(Number.isFinite);
  const endTimes = events.map((event) => Number(event?.endTime)).filter(Number.isFinite);
  const tier = [...events]
    .sort((left, right) => getTierRank(left?.tier) - getTierRank(right?.tier))[0]?.tier
    || null;
  const uniqueLocations = Array.from(new Set(events.map((event) => String(event?.location || '').trim()).filter(Boolean)));

  return {
    sourceUrl: rule.aggregateSourceUrl,
    title: rule.canonicalName,
    status: deriveTournamentStatus(
      startTimes.length > 0 ? Math.min(...startTimes) : null,
      endTimes.length > 0 ? Math.max(...endTimes) : null,
    ),
    tier,
    location: uniqueLocations.length === 1 ? uniqueLocations[0] : uniqueLocations.length > 1 ? 'Multiple regions' : null,
    locationFlagUrl: null,
    startTime: startTimes.length > 0 ? Math.min(...startTimes) : null,
    endTime: endTimes.length > 0 ? Math.max(...endTimes) : null,
    prizePool: null,
    prizePoolUsd: null,
    image: rootMetadata?.image || null,
    eventSlug: rule.aggregateEventSlug,
    parentSlug: rule.aggregateEventGroupSlug,
    eventGroupSlug: rule.aggregateEventGroupSlug,
    relatedEventLinks: events.map((event) => event.sourceUrl).filter(Boolean),
  };
}

function buildCatalogTournamentMetadataQueue(metadataByUrl) {
  const events = Array.from(metadataByUrl.values()).filter(Boolean);
  const queue = [];
  const consumedSourceUrls = new Set();

  for (const rule of DEMO_TOURNAMENT_MAPPINGS.filter((item) => item.aggregateChildren)) {
    const matched = events.filter((event) => getExplicitTournamentMapping(event)?.key === rule.key);
    if (matched.length === 0) continue;
    const aggregate = buildAggregateTournamentMetadata(rule, matched, metadataByUrl);
    if (aggregate) queue.push(aggregate);
    for (const event of matched) {
      if (event?.sourceUrl) consumedSourceUrls.add(event.sourceUrl);
    }
  }

  for (const event of events) {
    if (!event?.sourceUrl) continue;
    if (consumedSourceUrls.has(event.sourceUrl)) continue;
    const groupSlug = event.eventGroupSlug || event.parentSlug || event.eventSlug;
    if (!DLTV_CATALOG_DEMO_GROUPS.has(groupSlug)) continue;
    queue.push(event);
  }

  return queue;
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
    const sourceMatch = pickStableTournamentCandidate(
      candidates.filter((candidate) => String(candidate.source_url || '').trim() === sourceUrl)
    );
    if (sourceMatch) return sourceMatch;
  }

  if (eventSlug) {
    const slugMatch = pickStableTournamentCandidate(
      candidates.filter((candidate) => String(candidate.dltv_event_slug || '').trim() === eventSlug)
    );
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
    .filter((row) => row.eventHasQualifier === row.candidateHasQualifier)
    .filter((row) => !row.hasEditionMismatch)
    .filter((row) => !row.hasRegionMismatch)
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
    deriveTournamentStatus(eventMeta?.startTime || null, eventMeta?.endTime || null),
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
    status: deriveTournamentStatus(eventMeta?.startTime || null, eventMeta?.endTime || null),
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

async function mergeDuplicateTournamentEntries(db, cache, keepLeagueId, eventMeta) {
  const sourceUrl = String(eventMeta?.sourceUrl || '').trim();
  const eventSlug = String(eventMeta?.eventSlug || '').trim();
  if (!sourceUrl && !eventSlug) return;

  const duplicateRows = cache.filter((candidate) => {
    const candidateLeagueId = Number(candidate?.league_id);
    if (!Number.isFinite(candidateLeagueId) || candidateLeagueId === Number(keepLeagueId)) return false;
    const candidateSourceUrl = String(candidate?.source_url || '').trim();
    const candidateEventSlug = String(candidate?.dltv_event_slug || '').trim();
    return (sourceUrl && candidateSourceUrl === sourceUrl) || (eventSlug && candidateEventSlug === eventSlug);
  });

  for (const duplicate of duplicateRows) {
    await db.query(
      `
        UPDATE upcoming_series
        SET
          league_id = $1,
          tournament_name = COALESCE(NULLIF($2, ''), tournament_name),
          tournament_source_url = COALESCE($3, tournament_source_url),
          tournament_event_slug = COALESCE($4, tournament_event_slug),
          tournament_parent_slug = COALESCE($5, tournament_parent_slug),
          tournament_group_slug = COALESCE($6, tournament_group_slug),
          updated_at = NOW()
        WHERE league_id = $7
      `,
      [
        Number(keepLeagueId),
        eventMeta?.title || null,
        eventMeta?.sourceUrl || null,
        eventMeta?.eventSlug || null,
        eventMeta?.parentSlug || null,
        eventMeta?.eventGroupSlug || null,
        Number(duplicate.league_id),
      ]
    );
    await db.query(`DELETE FROM tournaments WHERE league_id = $1`, [Number(duplicate.league_id)]);
    const duplicateIndex = cache.findIndex((candidate) => Number(candidate?.league_id) === Number(duplicate.league_id));
    if (duplicateIndex >= 0) cache.splice(duplicateIndex, 1);
  }
}

async function repairKnownTournamentRows(db, cache) {
  for (const repair of KNOWN_TOURNAMENT_REPAIRS) {
    const candidate = findTournamentCandidateByLeagueId(cache, repair.leagueId);
    if (!candidate) continue;

    const currentEventSlug = String(candidate.dltv_event_slug || '').trim();
    const currentName = String(candidate.name || '').trim();
    const needsRepair = currentEventSlug === repair.conflictingEventSlug || repair.conflictingNamePattern.test(currentName);
    if (!needsRepair) continue;

    const metadata = await fetchDltvEventMetadata(repair.sourceUrl).catch((error) => {
      console.log(`[Sync Liquipedia] Failed to repair tournament ${repair.leagueId}: ${error.message}`);
      return null;
    });
    if (!metadata) continue;

    await upsertTournamentMetadata(db, cache, repair.leagueId, repair.canonicalName, metadata);
  }
}

async function resolveTournamentRecord(db, cache, tournamentName, eventMeta) {
  const mapping = getExplicitTournamentMapping(eventMeta);
  const mappedCandidate = mapping?.leagueId ? findTournamentCandidateByLeagueId(cache, mapping.leagueId) : null;
  const explicitCandidate = isExplicitCandidateCompatible(mapping, eventMeta, mappedCandidate) ? mappedCandidate : null;
  const explicitLeagueConflict = Boolean(mapping?.leagueId && mappedCandidate && !explicitCandidate);
  const shouldUseAggregateMapping = Boolean(
    mapping?.aggregateChildren
    && explicitCandidate
    && eventMeta?.eventSlug !== mapping.aggregateEventSlug
  );
  const matched = explicitCandidate
    || (mapping?.aggregateChildren ? null : pickTournamentCandidate(cache, tournamentName, eventMeta));
  const stableKey = eventMeta?.eventSlug || eventMeta?.sourceUrl || tournamentName;
  const leagueId = explicitCandidate?.league_id
    ? Number(explicitCandidate.league_id)
    : matched?.league_id
      ? Number(matched.league_id)
      : explicitLeagueConflict
        ? await buildSyntheticLeagueId(db, cache, stableKey)
        : Number.isFinite(Number(mapping?.leagueId))
      ? Number(mapping.leagueId)
        : await buildSyntheticLeagueId(db, cache, stableKey);
  const resolvedTournamentName = explicitCandidate
    ? (mapping?.canonicalName || matched?.name || tournamentName)
    : (eventMeta?.title || mapping?.canonicalName || matched?.name || tournamentName);

  if (!shouldUseAggregateMapping) {
    await upsertTournamentMetadata(db, cache, leagueId, resolvedTournamentName, eventMeta);
    await mergeDuplicateTournamentEntries(db, cache, leagueId, eventMeta);
  }

  return {
    leagueId,
    name: mapping?.canonicalName || eventMeta?.title || matched?.name || tournamentName,
    tier: matched?.tier || eventMeta?.tier || null,
    sourceUrl: matched?.source_url || eventMeta?.sourceUrl || null,
    eventSlug: matched?.dltv_event_slug || eventMeta?.eventSlug || null,
    parentSlug: matched?.dltv_parent_slug || eventMeta?.parentSlug || null,
    eventGroupSlug: matched?.event_group_slug || eventMeta?.eventGroupSlug || null,
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
  const attempts = [
    { type: 'direct', url: DLTV_MATCHES_URL, timeoutMs: 15000 },
    { type: 'jina', url: `https://r.jina.ai/http://${DLTV_MATCHES_URL.replace(/^https?:\/\//i, '')}`, timeoutMs: 20000 },
  ];
  const now = Math.floor(Date.now() / 1000);
  const weekLater = now + 7 * 24 * 60 * 60;
  const debug = [];
  let lastError = null;
  const mergedUpcoming = new Map();

  const buildUpcomingKey = (match) => ([
    String(match?.seriesId || '').trim().toLowerCase(),
    Number(match?.timestamp || 0),
    normalizeName(match?.radiantName),
    normalizeName(match?.direName),
  ].join('|'));

  for (const attempt of attempts) {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new Error(`DLTV matches ${attempt.type} fetch timed out`)),
      attempt.timeoutMs
    );
    try {
      const res = await fetch(attempt.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Dota2Hub/1.0)',
          Accept: 'text/html,application/xhtml+xml,text/plain',
        },
        signal: controller.signal,
      });

      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status}`);
        debug.push({ type: attempt.type, status: res.status, responseLength: 0, parsed: 0 });
        continue;
      }

      const raw = await res.text();
      if (!raw.trim()) {
        debug.push({ type: attempt.type, status: res.status, responseLength: 0, parsed: 0 });
        continue;
      }

      const upcoming = parseDltvUpcomingMatchesPage(raw, { now, maxStartTime: weekLater });
      debug.push({ type: attempt.type, status: res.status, responseLength: raw.length, parsed: upcoming.length });
      if (upcoming.length > 0) {
        console.log(`[Sync Liquipedia] Parsed ${upcoming.length} upcoming DLTV match candidates via ${attempt.type}`);
        for (const row of upcoming) {
          const key = buildUpcomingKey(row);
          if (!key) continue;
          const existing = mergedUpcoming.get(key);
          if (!existing) {
            mergedUpcoming.set(key, row);
            continue;
          }

          mergedUpcoming.set(key, {
            ...row,
            tournament: row.tournament || existing.tournament,
            eventUrl: row.eventUrl || existing.eventUrl,
            stage: row.stage || existing.stage,
            bestOf: row.bestOf || existing.bestOf,
            radiantName: row.radiantName || existing.radiantName,
            direName: row.direName || existing.direName,
          });
        }
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      debug.push({
        type: attempt.type,
        status: 'error',
        responseLength: 0,
        parsed: 0,
        error: lastError.message,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  if (mergedUpcoming.size > 0) {
    const upcoming = [...mergedUpcoming.values()].sort((left, right) => left.timestamp - right.timestamp);
    return { upcoming, debug };
  }

  if (lastError) throw lastError;
  console.log('[Sync Liquipedia] No upcoming matches parsed from DLTV sources');
  return { upcoming: [], debug };
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
    await repairKnownTournamentRows(db, tournamentCandidates);
    let dltvCatalogSeeds = [];
    try {
      const catalog = await withTimeout(() => fetchDltvEventsCatalog(), 15000, 'DLTV events catalog');
      dltvCatalogSeeds = catalog.filter(isDemoCatalogSeed);
      console.log(`[Sync Liquipedia] Parsed ${catalog.length} events from DLTV catalog, using ${dltvCatalogSeeds.length} demo seeds`);
    } catch (e) {
      console.log(`[Sync Liquipedia] DLTV events catalog skipped: ${e.message}`);
    }
    const eventMetadataByUrl = await collectRelatedEventMetadata(
      [
        ...dltvCatalogSeeds.map((row) => row.sourceUrl),
        ...liquipediaUpcoming.map((row) => row.eventUrl),
      ].filter(Boolean)
    );

    for (const metadata of buildCatalogTournamentMetadataQueue(eventMetadataByUrl)) {
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
