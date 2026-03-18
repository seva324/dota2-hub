import {
  calculateDynamicAge,
  normalizeLogo,
  summarizePlayerMatches,
} from '../player-profile.js';
import {
  ensureDerivedRefreshIndexes,
  mapWithConcurrency,
  parsePositiveInt,
} from './derived-refresh-utils.js';

const DEFAULT_CACHE_MAX_AGE_HOURS = 24;
const DEFAULT_INCREMENTAL_RECENT_DAYS = 7;
const DEFAULT_INCREMENTAL_UPCOMING_DAYS = 3;
const DEFAULT_WARM_CONCURRENCY = 6;
const refreshInFlight = new Map();

export async function ensurePlayerProfileCacheTable(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS player_profile_cache (
      account_id BIGINT PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_player_profile_cache_updated_at
    ON player_profile_cache(updated_at DESC)
  `);
}

export async function ensurePlayerProfileDerivedIndexes(db) {
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_player_stats_account_match_nonnull
    ON player_stats(account_id, match_id)
    WHERE account_id IS NOT NULL
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_player_stats_match_slot_profile_cover
    ON player_stats(match_id, player_slot)
    INCLUDE (account_id, personaname, hero_id)
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

async function fetchNextMatchesForTeams(db, teamIds) {
  const normalizedTeamIds = Array.from(
    new Set(
      (Array.isArray(teamIds) ? teamIds : [])
        .map((teamId) => String(teamId || '').trim())
        .filter(Boolean)
    )
  );
  if (!normalizedTeamIds.length) return new Map();

  const rows = await db.query(
    `
      WITH candidate_matches AS (
        SELECT
          us.radiant_team_id::TEXT AS matched_team_id,
          us.id,
          us.league_id,
          us.start_time,
          us.series_type,
          us.radiant_team_id,
          us.dire_team_id,
          rt.name AS radiant_name,
          rt.logo_url AS radiant_logo,
          dt.name AS dire_name,
          dt.logo_url AS dire_logo,
          t.name AS tournament_name
        FROM upcoming_series us
        LEFT JOIN teams rt ON rt.team_id = us.radiant_team_id
        LEFT JOIN teams dt ON dt.team_id = us.dire_team_id
        LEFT JOIN tournaments t ON t.league_id = us.league_id
        WHERE us.start_time >= $1
          AND us.radiant_team_id = ANY($2)

        UNION ALL

        SELECT
          us.dire_team_id::TEXT AS matched_team_id,
          us.id,
          us.league_id,
          us.start_time,
          us.series_type,
          us.radiant_team_id,
          us.dire_team_id,
          rt.name AS radiant_name,
          rt.logo_url AS radiant_logo,
          dt.name AS dire_name,
          dt.logo_url AS dire_logo,
          t.name AS tournament_name
        FROM upcoming_series us
        LEFT JOIN teams rt ON rt.team_id = us.radiant_team_id
        LEFT JOIN teams dt ON dt.team_id = us.dire_team_id
        LEFT JOIN tournaments t ON t.league_id = us.league_id
        WHERE us.start_time >= $1
          AND us.dire_team_id = ANY($2)
      ),
      ranked_matches AS (
        SELECT *,
               ROW_NUMBER() OVER (PARTITION BY matched_team_id ORDER BY start_time ASC, id ASC) AS rn
        FROM candidate_matches
      )
      SELECT *
      FROM ranked_matches
      WHERE rn = 1
    `,
    [Math.floor(Date.now() / 1000), normalizedTeamIds]
  );

  return new Map(
    rows.map((row) => {
      const teamId = String(row.matched_team_id || '').trim();
      const onRadiant = String(row.radiant_team_id || '') === teamId;
      return [teamId, {
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
      }];
    })
  );
}

async function fetchPlayerProfileMatchRowsFromDerived(db, accountId, options = {}) {
  const matchLimit = Math.max(30, Math.min(240, Math.trunc(Number(options.matchLimit || 180))));
  return db.query(
    `
      WITH target_matches AS (
        SELECT
          ms.match_id,
          EXTRACT(EPOCH FROM ms.start_time)::BIGINT AS start_time,
          COALESCE(NULLIF(to_jsonb(m)->>'series_type', ''), 'BO3') AS series_type,
          ms.radiant_team_id,
          ms.dire_team_id,
          ms.radiant_team_name,
          ms.dire_team_name,
          rt.logo_url AS radiant_team_logo,
          dt.logo_url AS dire_team_logo,
          ms.radiant_score,
          ms.dire_score,
          ms.radiant_win,
          ms.league_id,
          ms.league_name AS tournament_name
        FROM player_stats ps
        JOIN match_summary ms ON ms.match_id = ps.match_id
        LEFT JOIN matches m ON m.match_id = ms.match_id
        LEFT JOIN teams rt ON rt.team_id::TEXT = ms.radiant_team_id::TEXT
        LEFT JOIN teams dt ON dt.team_id::TEXT = ms.dire_team_id::TEXT
        WHERE ps.account_id = $1
        ORDER BY ms.start_time DESC NULLS LAST
        LIMIT $2
      ),
      match_players AS (
        SELECT
          tm.match_id,
          jsonb_agg(
            jsonb_build_object(
              'player_slot', p.player_slot,
              'account_id', p.account_id,
              'personaname', p.personaname,
              'hero_id', p.hero_id
            )
            ORDER BY p.player_slot
          ) AS players
        FROM target_matches tm
        JOIN player_stats p ON p.match_id = tm.match_id
        GROUP BY tm.match_id
      )
      SELECT
        tm.*,
        jsonb_build_object('players', COALESCE(mp.players, '[]'::jsonb)) AS payload
      FROM target_matches tm
      LEFT JOIN match_players mp ON mp.match_id = tm.match_id
      ORDER BY tm.start_time DESC NULLS LAST
    `,
    [accountId, matchLimit]
  );
}

async function fetchPlayerProfileMatchRowsLegacy(db, accountId, options = {}) {
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

async function fetchPlayerProfileMatchRows(db, accountId, options = {}) {
  try {
    const derivedRows = await fetchPlayerProfileMatchRowsFromDerived(db, accountId, options);
    if (Array.isArray(derivedRows) && derivedRows.length > 0) {
      return derivedRows;
    }
  } catch (error) {
    console.warn('[PlayerProfileCache] Derived match rows failed, falling back to legacy query:', error?.message || error);
  }

  return fetchPlayerProfileMatchRowsLegacy(db, accountId, options);
}

async function fetchPlayerProfileTeamSupplementRows(db, accountId, teamId, options = {}) {
  const normalizedTeamId = String(teamId || '').trim();
  if (!normalizedTeamId) return [];

  const nowTs = Math.floor(Date.now() / 1000);
  const windowDays = Math.max(7, Math.min(180, Math.trunc(Number(options.windowDays || 90))));
  const minStartTime = nowTs - windowDays * 24 * 60 * 60;
  const matchLimit = Math.max(10, Math.min(40, Math.trunc(Number(options.matchLimit || 20))));

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
          WHEN NULLIF(to_jsonb(s)->>'league_id', '') ~ '^[0-9]+$' THEN (to_jsonb(s)->>'league_id')::BIGINT
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
          END
        ) AS payload
      FROM matches m
      JOIN match_details md ON md.match_id = m.match_id
      LEFT JOIN series s ON s.series_id = m.series_id
      LEFT JOIN tournaments t ON t.league_id = s.league_id
      LEFT JOIN teams rt ON rt.team_id::TEXT = m.radiant_team_id::TEXT
      LEFT JOIN teams dt ON dt.team_id::TEXT = m.dire_team_id::TEXT
      WHERE (m.radiant_team_id::TEXT = $1 OR m.dire_team_id::TEXT = $1)
        AND m.start_time <= $2
        AND m.start_time >= $3
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            CASE
              WHEN jsonb_typeof(md.payload->'players') = 'array' THEN md.payload->'players'
              ELSE '[]'::jsonb
            END
          ) player
          WHERE COALESCE(player->>'account_id', player->>'accountId', player->>'accountid') = $4
        )
      ORDER BY m.start_time DESC
      LIMIT $5
    `,
    [normalizedTeamId, nowTs, minStartTime, String(accountId), matchLimit]
  );
}

function mergePlayerProfileMatchRows(primaryRows, supplementRows) {
  const deduped = new Map();
  for (const row of [...(Array.isArray(primaryRows) ? primaryRows : []), ...(Array.isArray(supplementRows) ? supplementRows : [])]) {
    const matchId = String(row?.match_id || '').trim();
    if (!matchId) continue;
    if (!deduped.has(matchId)) {
      deduped.set(matchId, row);
      continue;
    }

    const existing = deduped.get(matchId);
    const existingLeagueId = Number(existing?.league_id || 0);
    const nextLeagueId = Number(row?.league_id || 0);
    const existingHasTeams = Boolean(existing?.radiant_team_id && existing?.dire_team_id);
    const nextHasTeams = Boolean(row?.radiant_team_id && row?.dire_team_id);

    if ((nextLeagueId > existingLeagueId) || (nextHasTeams && !existingHasTeams)) {
      deduped.set(matchId, row);
    }
  }

  return Array.from(deduped.values())
    .sort((a, b) => Number(b?.start_time || 0) - Number(a?.start_time || 0));
}

async function buildPlayerProfilePayloadWithTimeout(db, accountId, options = {}) {
  const timeoutMs = Math.max(250, Number(options.timeoutMs || 0));
  if (!timeoutMs) {
    return buildPlayerProfilePayload(db, accountId, options);
  }

  return Promise.race([
    buildPlayerProfilePayload(db, accountId, options),
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`player_profile_timeout_${timeoutMs}ms`));
      }, timeoutMs);
    }),
  ]);
}

export async function buildPlayerProfilePayload(db, rawAccountId, options = {}) {
  const accountId = parseAccountId(rawAccountId);
  if (!accountId) return null;

  const playerRow = options.playerRow || null;
  const [playerRows, matchRows] = await Promise.all([
    playerRow
      ? Promise.resolve([playerRow])
      : db`
          SELECT account_id, name, name_cn, team_id, team_name, country_code, avatar_url, realname, birth_date, birth_year, birth_month
          FROM pro_players
          WHERE account_id = ${accountId}
          LIMIT 1
        `,
    fetchPlayerProfileMatchRows(db, accountId, options),
  ]);

  const player = playerRows[0] || null;
  const supplementedRows = player?.team_id
    ? await fetchPlayerProfileTeamSupplementRows(db, accountId, player.team_id, {
        windowDays: 90,
        matchLimit: 20,
      }).catch((error) => {
        console.warn('[PlayerProfileCache] Failed to load team supplement rows:', error?.message || error);
        return [];
      })
    : [];
  const mergedMatchRows = mergePlayerProfileMatchRows(matchRows, supplementedRows);
  const summary = summarizePlayerMatches(mergedMatchRows, accountId, {
    windowDays: 90,
    recentLimit: 15,
  });

  const detectedTeamId = player?.team_id
    ? String(player.team_id)
    : summary.recentMatches[0]?.selected_team?.team_id || null;
  const nextMatch = options.nextMatchByTeamId instanceof Map && detectedTeamId
    ? options.nextMatchByTeamId.get(String(detectedTeamId)) || null
    : await fetchNextMatch(db, detectedTeamId).catch((err) => {
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
  const cached = await readPlayerProfileCache(db, accountId).catch(() => null);
  const cachedPayload = cached?.payload || null;
  const hasCachedPayload = Boolean(cachedPayload);
  const fresh = hasCachedPayload && isPlayerProfileCacheFresh(cached, maxAgeHours);
  const partial = hasCachedPayload && isPartialPayload(cachedPayload);

  if (!preferFast && !forceRefresh && hasCachedPayload && fresh && !partial) {
    return { payload: cachedPayload, source: 'cache', updatedAt: cached.updatedAt };
  }

  try {
    const payload = await buildPlayerProfilePayloadWithTimeout(db, accountId, {
      ...options,
      matchLimit: options.matchLimit || (preferFast ? 180 : 240),
      fastMode: preferFast,
      timeoutMs: preferFast ? Number(options.timeoutMs || 2500) : Number(options.timeoutMs || 5000),
    });
    if (payload) {
      await writePlayerProfileCache(db, accountId, payload).catch((err) => {
        console.warn('[PlayerProfileCache] Failed to write cache:', err?.message || err);
      });
      return {
        payload,
        source: cached?.payload ? 'refresh' : 'live',
        updatedAt: new Date(),
      };
    }
  } catch (error) {
    console.warn('[PlayerProfileCache] Live build failed, falling back to cache:', accountId, error?.message || error);
  }

  if (hasCachedPayload) {
    if (!forceRefresh && preferFast && !partial) {
      return {
        payload: cachedPayload,
        source: fresh ? 'cache-fallback' : 'stale',
        updatedAt: cached.updatedAt || new Date(),
      };
    }
    if (!forceRefresh) {
      return {
        payload: cachedPayload,
        source: partial ? 'cache-partial' : 'stale',
        updatedAt: cached.updatedAt || new Date(),
      };
    }
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

  return null;
}

export async function warmPlayerProfileCache(db, options = {}) {
  await ensureDerivedRefreshIndexes(db);
  await ensurePlayerProfileCacheTable(db);
  const limit = options.limit ? Math.max(1, Math.trunc(Number(options.limit))) : null;
  const incremental = options.incremental === true || options.mode === 'incremental';
  const teamOnly = options.teamOnly !== false;
  const recentDays = Math.max(1, Math.trunc(Number(options.recentDays || DEFAULT_INCREMENTAL_RECENT_DAYS)));
  const upcomingDays = Math.max(1, Math.trunc(Number(options.upcomingDays || DEFAULT_INCREMENTAL_UPCOMING_DAYS)));
  const concurrency = parsePositiveInt(options.concurrency, DEFAULT_WARM_CONCURRENCY, { min: 1, max: 24 });
  const recentWindowSeconds = recentDays * 24 * 60 * 60;
  const upcomingWindowSeconds = upcomingDays * 24 * 60 * 60;
  const rows = incremental
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
        ),
        candidate_players AS (
          SELECT DISTINCT NULLIF(BTRIM(COALESCE(p->>'account_id', p->>'accountId', p->>'accountid')), '')::BIGINT AS account_id
          FROM matches m
          JOIN match_details md ON md.match_id = m.match_id
          CROSS JOIN LATERAL jsonb_array_elements(
            CASE
              WHEN jsonb_typeof(md.payload->'players') = 'array' THEN md.payload->'players'
              ELSE '[]'::jsonb
            END
          ) p
          WHERE m.start_time >= EXTRACT(EPOCH FROM NOW()) - ${recentWindowSeconds}
            AND NULLIF(BTRIM(COALESCE(p->>'account_id', p->>'accountId', p->>'accountid')), '') ~ '^[0-9]+$'

          UNION

          SELECT DISTINCT pp.account_id::BIGINT AS account_id
          FROM pro_players pp
          JOIN candidate_team_ids ct ON ct.team_id = pp.team_id::BIGINT
          WHERE pp.account_id IS NOT NULL
        )
        SELECT
          pp.account_id,
          pp.name,
          pp.name_cn,
          pp.team_id,
          pp.team_name,
          pp.country_code,
          pp.avatar_url,
          pp.realname,
          pp.birth_date,
          pp.birth_year,
          pp.birth_month
        FROM candidate_players cp
        JOIN pro_players pp ON pp.account_id::BIGINT = cp.account_id
        WHERE pp.account_id IS NOT NULL
          ${teamOnly ? 'AND pp.team_id IS NOT NULL' : ''}
        ORDER BY pp.account_id ASC
        ${limit ? `LIMIT ${limit}` : ''}
      `)
    : await db.query(`
        SELECT account_id, name, name_cn, team_id, team_name, country_code, avatar_url, realname, birth_date, birth_year, birth_month
        FROM pro_players
        WHERE account_id IS NOT NULL
          ${teamOnly ? 'AND team_id IS NOT NULL' : ''}
        ORDER BY
          CASE WHEN team_id IS NULL THEN 1 ELSE 0 END ASC,
          updated_at DESC NULLS LAST,
          account_id ASC
        ${limit ? `LIMIT ${limit}` : ''}
      `);

  const nextMatchByTeamId = await fetchNextMatchesForTeams(
    db,
    rows.map((row) => row.team_id)
  ).catch((error) => {
    console.warn('[PlayerProfileCache] Failed to prefetch next matches:', error?.message || error);
    return new Map();
  });

  let refreshed = 0;
  let failed = 0;
  const failedAccounts = [];

  await mapWithConcurrency(rows, concurrency, async (row) => {
    try {
      const payload = await buildPlayerProfilePayload(db, row.account_id, {
        matchLimit: options.matchLimit || 180,
        playerRow: row,
        nextMatchByTeamId,
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
  });

  return {
    selected: rows.length,
    refreshed,
    failed,
    failedAccounts,
    limit,
    teamOnly,
    concurrency,
    mode: incremental ? 'incremental' : 'full',
    recentDays: incremental ? recentDays : null,
    upcomingDays: incremental ? upcomingDays : null,
  };
}
