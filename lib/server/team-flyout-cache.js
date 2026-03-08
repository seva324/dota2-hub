import { normalizeLogo } from '../player-profile.js';

const TEAM_HISTORY_WINDOW_SECONDS = 90 * 24 * 60 * 60;
const DEFAULT_CACHE_MAX_AGE_HOURS = 24;
const DEFAULT_INCREMENTAL_RECENT_DAYS = 7;
const DEFAULT_INCREMENTAL_UPCOMING_DAYS = 3;

function toFiniteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function toInt(value) {
  const num = toFiniteNumber(value);
  if (num === null) return null;
  return Math.trunc(num);
}

function parsePlayerSlot(player) {
  const slot = toInt(player?.player_slot);
  return slot === null ? null : slot;
}

function isRadiantSlot(slot) {
  return slot !== null && slot < 128;
}

function parseHeroId(player) {
  const heroId = toInt(player?.hero_id);
  return heroId && heroId > 0 ? heroId : null;
}

function normalizePickTeam(value) {
  if (value === 0 || value === '0') return 'radiant';
  if (value === 1 || value === '1') return 'dire';
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'radiant' || normalized === 'dire') return normalized;
  }
  return null;
}

function deriveTeamHeroIds(payload, onRadiant, fallbackPlayers) {
  const picksBans = Array.isArray(payload?.picks_bans) ? payload.picks_bans : [];
  const fromDraft = picksBans
    .filter((entry) => {
      const team = normalizePickTeam(entry?.team);
      return (entry?.is_pick === true || entry?.is_pick === 1 || entry?.is_pick === '1') && team === (onRadiant ? 'radiant' : 'dire');
    })
    .sort((a, b) => (toInt(a?.order) || 0) - (toInt(b?.order) || 0))
    .map((entry) => parseHeroId(entry))
    .filter((heroId) => heroId !== null)
    .slice(0, 5);

  if (fromDraft.length > 0) return fromDraft;

  return fallbackPlayers
    .map((p) => parseHeroId(p))
    .filter((heroId) => heroId !== null)
    .slice(0, 5);
}

function parseAccountId(player) {
  const raw = player?.account_id ?? player?.accountId ?? player?.accountid;
  const num = toInt(raw);
  return num && num > 0 ? num : null;
}

function buildActiveSquad(matchRow, proPlayersByAccountId) {
  if (!matchRow?.payload || !matchRow?.selected_team_id) return [];
  const selectedTeamId = String(matchRow.selected_team_id);
  const players = Array.isArray(matchRow.payload?.players) ? matchRow.payload.players : [];
  const onRadiant = String(matchRow.radiant_team_id || '') === selectedTeamId;
  const teamPlayers = players
    .filter((player) => {
      const slot = parsePlayerSlot(player);
      return slot !== null && (onRadiant ? isRadiantSlot(slot) : !isRadiantSlot(slot));
    })
    .sort((a, b) => (toInt(a?.player_slot) || 0) - (toInt(b?.player_slot) || 0))
    .slice(0, 5);

  return teamPlayers.map((player) => {
    const accountId = parseAccountId(player);
    const meta = accountId ? proPlayersByAccountId.get(String(accountId)) : null;
    return {
      account_id: accountId ? String(accountId) : null,
      name: meta?.name || player?.name || player?.personaname || (accountId ? String(accountId) : 'Unknown'),
      realname: meta?.realname || null,
      country_code: meta?.country_code ? String(meta.country_code).toUpperCase() : null,
      avatar_url: normalizeLogo(meta?.avatar_url || null),
    };
  });
}

function buildTopHeroes(recentRows) {
  const counts = new Map();
  for (const row of recentRows) {
    const heroIds = Array.isArray(row?.team_hero_ids) ? row.team_hero_ids : [];
    for (const heroId of heroIds) {
      counts.set(heroId, (counts.get(heroId) || 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([hero_id, matches]) => ({ hero_id, matches }))
    .sort((a, b) => {
      if (b.matches !== a.matches) return b.matches - a.matches;
      return a.hero_id - b.hero_id;
    })
    .slice(0, 5);
}

function attachTeamHeroIds(recentRows, payloadByMatchId, selectedTeamId) {
  return recentRows.map((row) => {
    const payload = payloadByMatchId.get(String(row.match_id));
    const players = Array.isArray(payload?.players) ? payload.players : [];
    const onRadiant = String(row.radiant_team_id || '') === String(selectedTeamId);
    const teamPlayers = players.filter((player) => {
      const slot = parsePlayerSlot(player);
      return slot !== null && (onRadiant ? isRadiantSlot(slot) : !isRadiantSlot(slot));
    });

    return {
      ...row,
      team_hero_ids: deriveTeamHeroIds(payload, onRadiant, teamPlayers),
    };
  });
}

async function fetchRecentMatchRows(db, teamId) {
  const now = Math.floor(Date.now() / 1000);
  const minStartTime = now - TEAM_HISTORY_WINDOW_SECONDS;

  return db`
    SELECT m.match_id, m.start_time, m.radiant_team_id, m.dire_team_id
    FROM matches m
    WHERE (m.radiant_team_id = ${String(teamId)} OR m.dire_team_id = ${String(teamId)})
      AND m.start_time <= ${now}
      AND m.start_time >= ${minStartTime}
    ORDER BY m.start_time DESC
  `;
}

async function fetchPayloadMap(db, matchIds) {
  if (!matchIds.length) return new Map();
  const rows = await db`
    SELECT
      md.match_id,
      jsonb_build_object(
        'players',
        CASE
          WHEN jsonb_typeof(md.payload->'players') = 'array' THEN md.payload->'players'
          ELSE '[]'::jsonb
        END,
        'picks_bans',
        CASE
          WHEN jsonb_typeof(md.payload->'picks_bans') = 'array' THEN md.payload->'picks_bans'
          ELSE '[]'::jsonb
        END
      ) AS payload
    FROM match_details md
    WHERE md.match_id = ANY(${matchIds})
  `;

  return new Map(rows.map((row) => [String(row.match_id), row.payload]));
}

export async function enrichRecentMatchesWithTeamHeroes(db, recentRows, selectedTeamId) {
  const matchIds = recentRows
    .map((row) => String(row.match_id || ''))
    .filter(Boolean);
  const payloadByMatchId = await fetchPayloadMap(db, matchIds);
  return attachTeamHeroIds(recentRows, payloadByMatchId, selectedTeamId);
}

export async function ensureTeamFlyoutCacheTable(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS team_flyout_cache (
      team_id BIGINT PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
}

export async function readTeamFlyoutCache(db, teamId) {
  await ensureTeamFlyoutCacheTable(db);
  const rows = await db`
    SELECT team_id, payload, updated_at
    FROM team_flyout_cache
    WHERE team_id = ${String(teamId)}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    teamId: String(row.team_id),
    payload: row.payload || null,
    updatedAt: row.updated_at ? new Date(row.updated_at) : null,
  };
}

export function isTeamFlyoutCacheFresh(cacheRow, maxAgeHours = DEFAULT_CACHE_MAX_AGE_HOURS) {
  if (!cacheRow?.updatedAt) return false;
  const maxAgeMs = Math.max(1, Number(maxAgeHours || DEFAULT_CACHE_MAX_AGE_HOURS)) * 60 * 60 * 1000;
  return Date.now() - cacheRow.updatedAt.getTime() <= maxAgeMs;
}

export async function writeTeamFlyoutCache(db, teamId, payload) {
  await ensureTeamFlyoutCacheTable(db);
  await db.query(
    `
      INSERT INTO team_flyout_cache (team_id, payload, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (team_id) DO UPDATE SET
        payload = EXCLUDED.payload,
        updated_at = NOW()
    `,
    [String(teamId), JSON.stringify(payload)]
  );
}

export async function buildTeamFlyoutCachePayload(db, rawTeamId) {
  const teamId = String(rawTeamId || '').trim();
  if (!teamId) return null;

  const recentRows = await fetchRecentMatchRows(db, teamId);
  const matchIds = recentRows.map((row) => String(row.match_id));
  const payloadByMatchId = await fetchPayloadMap(db, matchIds);
  const recentWithHeroes = attachTeamHeroIds(recentRows, payloadByMatchId, teamId);

  const latestMatchRow = recentWithHeroes[0] || null;
  const latestPayload = latestMatchRow ? payloadByMatchId.get(String(latestMatchRow.match_id)) : null;

  const accountIds = latestPayload
    ? (Array.isArray(latestPayload.players) ? latestPayload.players : [])
        .map((player) => parseAccountId(player))
        .filter((accountId) => accountId !== null)
    : [];

  const proPlayersRows = accountIds.length
    ? await db`
        SELECT account_id, name, realname, country_code, avatar_url
        FROM pro_players
        WHERE account_id = ANY(${accountIds})
      `
    : [];

  const proPlayersByAccountId = new Map(
    proPlayersRows.map((row) => [String(row.account_id), row])
  );

  return {
    active_squad: latestMatchRow
      ? buildActiveSquad(
          {
            ...latestMatchRow,
            payload: latestPayload,
            selected_team_id: teamId,
          },
          proPlayersByAccountId
        )
      : [],
    top_heroes_90d: buildTopHeroes(recentWithHeroes),
    latest_match_id: latestMatchRow?.match_id ? String(latestMatchRow.match_id) : null,
  };
}

export async function getTeamFlyoutCachePayload(db, teamId, options = {}) {
  const cached = await readTeamFlyoutCache(db, teamId).catch(() => null);
  if (cached?.payload && isTeamFlyoutCacheFresh(cached, options.maxAgeHours)) {
    return cached.payload;
  }
  const payload = await buildTeamFlyoutCachePayload(db, teamId);
  if (payload) {
    await writeTeamFlyoutCache(db, teamId, payload).catch(() => {});
  }
  return payload;
}

export async function warmTeamFlyoutCache(db, options = {}) {
  await ensureTeamFlyoutCacheTable(db);
  const limit = options.limit ? Math.max(1, Math.trunc(Number(options.limit))) : null;
  const incremental = options.incremental === true || options.mode === 'incremental';
  const recentDays = Math.max(1, Math.trunc(Number(options.recentDays || DEFAULT_INCREMENTAL_RECENT_DAYS)));
  const upcomingDays = Math.max(1, Math.trunc(Number(options.upcomingDays || DEFAULT_INCREMENTAL_UPCOMING_DAYS)));
  const recentWindowSeconds = recentDays * 24 * 60 * 60;
  const upcomingWindowSeconds = upcomingDays * 24 * 60 * 60;

  const teams = incremental
    ? await db.query(`
        WITH candidate_team_ids AS (
          SELECT radiant_team_id::BIGINT AS team_id
          FROM matches
          WHERE radiant_team_id IS NOT NULL
            AND start_time >= EXTRACT(EPOCH FROM NOW()) - ${recentWindowSeconds}
          UNION
          SELECT dire_team_id::BIGINT AS team_id
          FROM matches
          WHERE dire_team_id IS NOT NULL
            AND start_time >= EXTRACT(EPOCH FROM NOW()) - ${recentWindowSeconds}
          UNION
          SELECT radiant_team_id::BIGINT AS team_id
          FROM upcoming_series
          WHERE radiant_team_id IS NOT NULL
            AND start_time >= EXTRACT(EPOCH FROM NOW())
            AND start_time <= EXTRACT(EPOCH FROM NOW()) + ${upcomingWindowSeconds}
          UNION
          SELECT dire_team_id::BIGINT AS team_id
          FROM upcoming_series
          WHERE dire_team_id IS NOT NULL
            AND start_time >= EXTRACT(EPOCH FROM NOW())
            AND start_time <= EXTRACT(EPOCH FROM NOW()) + ${upcomingWindowSeconds}
        )
        SELECT team_id
        FROM candidate_team_ids
        WHERE team_id IS NOT NULL
        ORDER BY team_id ASC
        ${limit ? `LIMIT ${limit}` : ''}
      `)
    : await db.query(`
        WITH active_team_ids AS (
          SELECT radiant_team_id::BIGINT AS team_id
          FROM matches
          WHERE radiant_team_id IS NOT NULL
          UNION
          SELECT dire_team_id::BIGINT AS team_id
          FROM matches
          WHERE dire_team_id IS NOT NULL
          UNION
          SELECT radiant_team_id::BIGINT AS team_id
          FROM upcoming_series
          WHERE radiant_team_id IS NOT NULL
          UNION
          SELECT dire_team_id::BIGINT AS team_id
          FROM upcoming_series
          WHERE dire_team_id IS NOT NULL
        )
        SELECT team_id
        FROM active_team_ids
        WHERE team_id IS NOT NULL
        ORDER BY team_id ASC
        ${limit ? `LIMIT ${limit}` : ''}
      `);

  let refreshed = 0;
  let failed = 0;
  const failedTeamIds = [];

  for (const row of teams) {
    try {
      const payload = await buildTeamFlyoutCachePayload(db, row.team_id);
      if (payload) {
        await writeTeamFlyoutCache(db, row.team_id, payload);
        refreshed += 1;
      }
    } catch (error) {
      failed += 1;
      failedTeamIds.push(String(row.team_id));
      console.warn('[TeamFlyoutCache] Warm failed for team:', row.team_id, error?.message || error);
    }
  }

  return {
    selected: teams.length,
    refreshed,
    failed,
    failedTeamIds,
    limit,
    mode: incremental ? 'incremental' : 'full',
    recentDays: incremental ? recentDays : null,
    upcomingDays: incremental ? upcomingDays : null,
  };
}
