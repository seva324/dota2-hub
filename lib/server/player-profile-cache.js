import {
  calculateDynamicAge,
  normalizeLogo,
  summarizePlayerMatches,
} from '../player-profile.js';

const DEFAULT_CACHE_MAX_AGE_HOURS = 24;
const refreshInFlight = new Map();

export async function ensurePlayerProfileCacheTable(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS player_profile_cache (
      account_id BIGINT PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
}

function parseAccountId(rawAccountId) {
  const parsed = Number(rawAccountId);
  if (!Number.isFinite(parsed)) return null;
  const normalized = Math.trunc(parsed);
  return normalized > 0 ? normalized : null;
}

async function fetchNextMatch(db, teamId) {
  if (!teamId) return null;
  const nowTs = Math.floor(Date.now() / 1000);
  const rows = await db`
    SELECT us.id, us.league_id, us.start_time, us.series_type, us.radiant_team_id, us.dire_team_id,
           rt.name AS radiant_name, rt.logo_url AS radiant_logo,
           dt.name AS dire_name, dt.logo_url AS dire_logo,
           t.name AS tournament_name
    FROM upcoming_series us
    LEFT JOIN teams rt ON rt.team_id = us.radiant_team_id
    LEFT JOIN teams dt ON dt.team_id = us.dire_team_id
    LEFT JOIN tournaments t ON t.league_id = us.league_id
    WHERE us.start_time >= ${nowTs}
      AND (us.radiant_team_id = ${String(teamId)} OR us.dire_team_id = ${String(teamId)})
    ORDER BY us.start_time ASC
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  const onRadiant = String(row.radiant_team_id || '') === String(teamId);
  return {
    id: row.id ? String(row.id) : null,
    start_time: Number(row.start_time || 0),
    series_type: row.series_type || 'BO3',
    tournament_name: row.tournament_name || null,
    selected_team: {
      team_id: onRadiant ? (row.radiant_team_id ? String(row.radiant_team_id) : null) : (row.dire_team_id ? String(row.dire_team_id) : null),
      name: onRadiant ? row.radiant_name || null : row.dire_name || null,
      logo_url: normalizeLogo(onRadiant ? row.radiant_logo : row.dire_logo),
    },
    opponent: {
      team_id: onRadiant ? (row.dire_team_id ? String(row.dire_team_id) : null) : (row.radiant_team_id ? String(row.radiant_team_id) : null),
      name: onRadiant ? row.dire_name || null : row.radiant_name || null,
      logo_url: normalizeLogo(onRadiant ? row.dire_logo : row.radiant_logo),
    },
  };
}

async function fetchPlayerProfileMatchRows(db, accountId, options = {}) {
  const matchLimit = Math.max(30, Math.min(240, Math.trunc(Number(options.matchLimit || 240))));
  const fastMode = options.fastMode === true;

  if (!fastMode) {
    return db.query(
      `
        SELECT
          m.match_id,
          m.start_time,
          COALESCE(NULLIF(to_jsonb(m)->>'series_type', ''), 'BO3') AS series_type,
          m.radiant_team_id,
          m.dire_team_id,
          rt.name AS radiant_team_name,
          dt.name AS dire_team_name,
          rt.logo_url AS radiant_team_logo,
          dt.logo_url AS dire_team_logo,
          m.radiant_score,
          m.dire_score,
          m.radiant_win,
          CASE
            WHEN NULLIF(to_jsonb(m)->>'league_id', '') ~ '^[0-9]+$' THEN (to_jsonb(m)->>'league_id')::BIGINT
            ELSE NULL
          END AS league_id,
          t.name AS tournament_name,
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
            END,
            'radiant_team',
            CASE
              WHEN jsonb_typeof(md.payload->'radiant_team') = 'object' THEN md.payload->'radiant_team'
              ELSE '{}'::jsonb
            END,
            'dire_team',
            CASE
              WHEN jsonb_typeof(md.payload->'dire_team') = 'object' THEN md.payload->'dire_team'
              ELSE '{}'::jsonb
            END
          ) AS payload
        FROM matches m
        JOIN match_details md ON md.match_id = m.match_id
        LEFT JOIN teams rt ON rt.team_id = m.radiant_team_id
        LEFT JOIN teams dt ON dt.team_id = m.dire_team_id
        LEFT JOIN tournaments t ON t.league_id::TEXT = NULLIF(to_jsonb(m)->>'league_id', '')
        WHERE EXISTS (
            SELECT 1
            FROM jsonb_array_elements(
              CASE
                WHEN jsonb_typeof(md.payload->'players') = 'array' THEN md.payload->'players'
                ELSE '[]'::jsonb
              END
            ) p
            CROSS JOIN LATERAL (
              SELECT NULLIF(BTRIM(COALESCE(p->>'account_id', p->>'accountId', p->>'accountid')), '') AS account_id_text
            ) account_ref
            WHERE account_ref.account_id_text ~ '^[0-9]+$'
              AND account_ref.account_id_text::BIGINT = $1
          )
        ORDER BY m.start_time DESC NULLS LAST
        LIMIT $2
      `,
      [accountId, matchLimit]
    );
  }

  const lookbackDays = Math.max(90, Math.min(730, Math.trunc(Number(options.lookbackDays || 540))));
  const sinceTs = Math.floor(Date.now() / 1000) - lookbackDays * 24 * 60 * 60;
  const candidateLimit = Math.max(matchLimit * 20, Math.min(25000, Math.trunc(Number(options.candidateLimit || 8000))));

  return db.query(
    `
      WITH candidate_matches AS (
        SELECT
          m.match_id,
          m.start_time,
          COALESCE(NULLIF(to_jsonb(m)->>'series_type', ''), 'BO3') AS series_type,
          m.radiant_team_id,
          m.dire_team_id,
          rt.name AS radiant_team_name,
          dt.name AS dire_team_name,
          rt.logo_url AS radiant_team_logo,
          dt.logo_url AS dire_team_logo,
          m.radiant_score,
          m.dire_score,
          m.radiant_win,
          CASE
            WHEN NULLIF(to_jsonb(m)->>'league_id', '') ~ '^[0-9]+$' THEN (to_jsonb(m)->>'league_id')::BIGINT
            ELSE NULL
          END AS league_id,
          t.name AS tournament_name,
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
            END,
            'radiant_team',
            CASE
              WHEN jsonb_typeof(md.payload->'radiant_team') = 'object' THEN md.payload->'radiant_team'
              ELSE '{}'::jsonb
            END,
            'dire_team',
            CASE
              WHEN jsonb_typeof(md.payload->'dire_team') = 'object' THEN md.payload->'dire_team'
              ELSE '{}'::jsonb
            END
          ) AS payload
        FROM matches m
        JOIN match_details md ON md.match_id = m.match_id
        LEFT JOIN teams rt ON rt.team_id = m.radiant_team_id
        LEFT JOIN teams dt ON dt.team_id = m.dire_team_id
        LEFT JOIN tournaments t ON t.league_id::TEXT = NULLIF(to_jsonb(m)->>'league_id', '')
        WHERE m.start_time >= $3
        ORDER BY m.start_time DESC NULLS LAST
        LIMIT $4
      )
      SELECT *
      FROM candidate_matches c
      WHERE EXISTS (
        SELECT 1
        FROM jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(c.payload->'players') = 'array' THEN c.payload->'players'
            ELSE '[]'::jsonb
          END
        ) p
        CROSS JOIN LATERAL (
          SELECT NULLIF(BTRIM(COALESCE(p->>'account_id', p->>'accountId', p->>'accountid')), '') AS account_id_text
        ) account_ref
        WHERE account_ref.account_id_text ~ '^[0-9]+$'
          AND account_ref.account_id_text::BIGINT = $1
      )
      ORDER BY c.start_time DESC NULLS LAST
      LIMIT $2
    `,
    [accountId, matchLimit, sinceTs, candidateLimit]
  );
}

export async function buildPlayerProfilePayload(db, rawAccountId, options = {}) {
  const accountId = parseAccountId(rawAccountId);
  if (!accountId) return null;

  const [playerRows, matchRows] = await Promise.all([
    db`
      SELECT account_id, name, name_cn, team_id, team_name, country_code, avatar_url, realname, birth_date, birth_year, birth_month
      FROM pro_players
      WHERE account_id = ${accountId}
      LIMIT 1
    `,
    fetchPlayerProfileMatchRows(db, accountId, options),
  ]);

  const player = playerRows[0] || null;
  const summary = summarizePlayerMatches(matchRows, accountId, {
    windowDays: 90,
    recentLimit: 15,
  });

  const detectedTeamId = player?.team_id
    ? String(player.team_id)
    : summary.recentMatches[0]?.selected_team?.team_id || null;
  const nextMatch = await fetchNextMatch(db, detectedTeamId).catch((err) => {
    console.warn('[PlayerProfileCache] Failed to load next match:', err?.message || err);
    return null;
  });

  const age = calculateDynamicAge({
    birthDate: player?.birth_date || null,
    birthYear: player?.birth_year ?? null,
    birthMonth: player?.birth_month ?? null,
  });

  return {
    account_id: String(accountId),
    player: {
      name: player?.name || null,
      name_cn: player?.name_cn || null,
      realname: player?.realname || null,
      team_id: player?.team_id !== null && player?.team_id !== undefined ? String(player.team_id) : detectedTeamId,
      team_name: player?.team_name || summary.recentMatches[0]?.selected_team?.name || null,
      country_code: player?.country_code || null,
      avatar_url: normalizeLogo(player?.avatar_url || null),
      birth_date: player?.birth_date || null,
      birth_year: player?.birth_year ?? null,
      birth_month: player?.birth_month ?? null,
      age,
    },
    stats: {
      wins: summary.wins,
      losses: summary.losses,
      decided_matches: summary.decidedMatches,
      win_rate: summary.winRate,
    },
    signature_hero: summary.signatureHero || null,
    signature_heroes: summary.signatureHeroes || [],
    most_played_heroes: summary.mostPlayedHeroes,
    recent_matches: summary.recentMatches.map((match) => ({
      ...match,
      team_hero_ids: match.team_hero_ids || [],
    })),
    next_match: nextMatch,
  };
}

async function buildPlayerProfileSeedPayload(db, rawAccountId) {
  const accountId = parseAccountId(rawAccountId);
  if (!accountId) return null;
  const rows = await db`
    SELECT account_id, name, name_cn, team_id, team_name, country_code, avatar_url, realname, birth_date, birth_year, birth_month
    FROM pro_players
    WHERE account_id = ${accountId}
    LIMIT 1
  `;
  const player = rows[0] || null;
  const teamId = player?.team_id !== null && player?.team_id !== undefined ? String(player.team_id) : null;
  const nextMatch = await fetchNextMatch(db, teamId).catch(() => null);
  const age = calculateDynamicAge({
    birthDate: player?.birth_date || null,
    birthYear: player?.birth_year ?? null,
    birthMonth: player?.birth_month ?? null,
  });

  return {
    account_id: String(accountId),
    meta: {
      partial: true,
      strategy: 'seed',
    },
    player: {
      name: player?.name || String(accountId),
      name_cn: player?.name_cn || null,
      realname: player?.realname || null,
      team_id: teamId,
      team_name: player?.team_name || null,
      country_code: player?.country_code || null,
      avatar_url: normalizeLogo(player?.avatar_url || null),
      birth_date: player?.birth_date || null,
      birth_year: player?.birth_year ?? null,
      birth_month: player?.birth_month ?? null,
      age,
    },
    stats: {
      wins: 0,
      losses: 0,
      decided_matches: 0,
      win_rate: 0,
    },
    signature_hero: null,
    signature_heroes: [],
    most_played_heroes: [],
    recent_matches: [],
    next_match: nextMatch,
  };
}

function isPartialPayload(payload) {
  return payload?.meta?.partial === true;
}

function schedulePlayerProfileRefresh(db, accountId, options = {}) {
  const parsed = parseAccountId(accountId);
  if (!parsed) return null;
  if (refreshInFlight.has(parsed)) {
    return refreshInFlight.get(parsed);
  }
  const task = (async () => {
    const payload = await buildPlayerProfilePayload(db, parsed, {
      ...options,
      fastMode: options.fastMode === true,
    });
    if (!payload) return null;
    await writePlayerProfileCache(db, parsed, payload);
    return payload;
  })()
    .catch((error) => {
      console.warn('[PlayerProfileCache] Background refresh failed:', parsed, error?.message || error);
      return null;
    })
    .finally(() => {
      refreshInFlight.delete(parsed);
    });

  refreshInFlight.set(parsed, task);
  return task;
}

export async function readPlayerProfileCache(db, rawAccountId) {
  const accountId = parseAccountId(rawAccountId);
  if (!accountId) return null;
  const rows = await db`
    SELECT account_id, payload, updated_at
    FROM player_profile_cache
    WHERE account_id = ${accountId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    accountId,
    payload: row.payload || null,
    updatedAt: row.updated_at ? new Date(row.updated_at) : null,
  };
}

export async function writePlayerProfileCache(db, rawAccountId, payload) {
  const accountId = parseAccountId(rawAccountId);
  if (!accountId || !payload) return;
  await db.query(
    `
      INSERT INTO player_profile_cache (account_id, payload, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (account_id) DO UPDATE SET
        payload = EXCLUDED.payload,
        updated_at = NOW()
    `,
    [accountId, JSON.stringify(payload)]
  );
}

export function isPlayerProfileCacheFresh(cacheRow, maxAgeHours = DEFAULT_CACHE_MAX_AGE_HOURS) {
  if (!cacheRow?.updatedAt) return false;
  const maxAgeMs = Math.max(1, Number(maxAgeHours || DEFAULT_CACHE_MAX_AGE_HOURS)) * 60 * 60 * 1000;
  return Date.now() - cacheRow.updatedAt.getTime() <= maxAgeMs;
}

export async function getPlayerProfilePayload(db, rawAccountId, options = {}) {
  const accountId = parseAccountId(rawAccountId);
  if (!accountId) return null;

  await ensurePlayerProfileCacheTable(db);

  const forceRefresh = options.forceRefresh === true;
  const preferFast = options.preferFast === true;
  const maxAgeHours = Number(options.maxAgeHours || DEFAULT_CACHE_MAX_AGE_HOURS);
  const cached = forceRefresh ? null : await readPlayerProfileCache(db, accountId).catch(() => null);
  const cachedPayload = cached?.payload || null;
  const hasCachedPayload = Boolean(cachedPayload);
  const fresh = hasCachedPayload && isPlayerProfileCacheFresh(cached, maxAgeHours);
  const partial = hasCachedPayload && isPartialPayload(cachedPayload);

  if (hasCachedPayload && fresh && !partial) {
    return { payload: cachedPayload, source: 'cache', updatedAt: cached.updatedAt };
  }

  if (!forceRefresh && preferFast && hasCachedPayload) {
    void schedulePlayerProfileRefresh(db, accountId, { matchLimit: 120, fastMode: true });
    return {
      payload: cachedPayload,
      source: partial ? 'cache-partial' : 'stale',
      updatedAt: cached.updatedAt || new Date(),
    };
  }

  if (!forceRefresh && preferFast && !hasCachedPayload) {
    const seed = await buildPlayerProfileSeedPayload(db, accountId);
    if (seed) {
      await writePlayerProfileCache(db, accountId, seed).catch((err) => {
        console.warn('[PlayerProfileCache] Failed to write seed cache:', err?.message || err);
      });
      void schedulePlayerProfileRefresh(db, accountId, { matchLimit: 120, fastMode: true });
      return {
        payload: seed,
        source: 'seed',
        updatedAt: new Date(),
      };
    }
  }

  const payload = await buildPlayerProfilePayload(db, accountId);
  if (!payload) return null;
  await writePlayerProfileCache(db, accountId, payload).catch((err) => {
    console.warn('[PlayerProfileCache] Failed to write cache:', err?.message || err);
  });

  return {
    payload,
    source: cached?.payload ? 'refresh' : 'live',
    updatedAt: new Date(),
  };
}

export async function warmPlayerProfileCache(db, options = {}) {
  await ensurePlayerProfileCacheTable(db);
  const limit = options.limit ? Math.max(1, Math.trunc(Number(options.limit))) : null;
  const rows = await db.query(`
    SELECT account_id
    FROM pro_players
    WHERE account_id IS NOT NULL
    ORDER BY
      CASE WHEN team_id IS NULL THEN 1 ELSE 0 END ASC,
      updated_at DESC NULLS LAST,
      account_id ASC
    ${limit ? `LIMIT ${limit}` : ''}
  `);

  let refreshed = 0;
  let failed = 0;
  const failedAccounts = [];

  for (const row of rows) {
    try {
      const payload = await buildPlayerProfilePayload(db, row.account_id, {
        matchLimit: options.matchLimit || 180,
      });
      if (payload) {
        await writePlayerProfileCache(db, row.account_id, payload);
        refreshed += 1;
      }
    } catch (error) {
      failed += 1;
      failedAccounts.push(String(row.account_id));
      console.warn('[PlayerProfileCache] Warm failed for account:', row.account_id, error?.message || error);
    }
  }

  return {
    selected: rows.length,
    refreshed,
    failed,
    failedAccounts,
    limit,
  };
}
