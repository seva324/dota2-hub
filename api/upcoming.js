/**
 * Upcoming Series API
 * Data: Neon PostgreSQL
 */

import { getDb } from '../lib/db.js';
import { getMirroredAssetUrl } from '../lib/asset-mirror.js';
import { ensureUpcomingSeriesColumns } from '../lib/server/upcoming-series-columns.js';
import { getCuratedTeamLogoGithubUrl } from '../lib/team-logo-overrides.js';

// Normalize logo URL
function normalizeLogo(url, req) {
  return getMirroredAssetUrl(url, req);
}

function resolvePreferredTeamLogo(teamRow, fallbackTeam, req) {
  const curatedLogo = getCuratedTeamLogoGithubUrl({
    teamId: teamRow?.team_id ?? fallbackTeam?.teamId,
    name: teamRow?.name ?? fallbackTeam?.name,
  });
  return normalizeLogo(curatedLogo || teamRow?.logo_url || null, req);
}

// Convert OpenDota series_type to human-readable format
// OpenDota: 0=BO1, 1=BO3, 2=BO5, 3=BO2
function convertSeriesType(seriesType) {
  if (seriesType === null || seriesType === undefined || seriesType === '') return 'BO3';
  const map = {
    0: 'BO1',
    1: 'BO3',
    2: 'BO5',
    3: 'BO2'
  };
  // If already a string (e.g., 'BO3'), return as-is
  if (typeof seriesType === 'string') {
    const normalized = seriesType.toUpperCase();
    if (normalized.startsWith('BO')) return normalized;
    const parsed = Number(seriesType);
    return Number.isInteger(parsed) && map[parsed] ? map[parsed] : 'BO3';
  }
  return map[seriesType] || 'BO3';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const db = getDb();
  if (!db) {
    return res.status(500).json({ error: 'Database not available' });
  }

  try {
    await ensureUpcomingSeriesColumns(db);

    // Get upcoming series (status = 'upcoming' and start_time > now)
    const now = Math.floor(Date.now() / 1000);
    const parsedDays = Number.parseInt(String(req.query?.days ?? ''), 10);
    const days = Number.isFinite(parsedDays) && parsedDays > 0 ? Math.min(parsedDays, 14) : 2;
    const maxStartTime = now + days * 86400;

    const upcoming = await db`
      SELECT s.*,
             rt.name AS radiant_team_name, rt.name_cn AS radiant_team_name_cn,
             rt.logo_url AS radiant_team_logo, rt.region AS radiant_region,
             dt.name AS dire_team_name, dt.name_cn AS dire_team_name_cn,
             dt.logo_url AS dire_team_logo, dt.region AS dire_region
      FROM upcoming_series s
      LEFT JOIN teams rt ON rt.team_id = s.radiant_team_id
      LEFT JOIN teams dt ON dt.team_id = s.dire_team_id
      WHERE s.start_time > ${now}
        AND s.start_time <= ${maxStartTime}
      ORDER BY s.start_time ASC
      LIMIT 50
    `;

    // Only fetch full teams list when the response actually includes it (keeps backward compat)
    const teamIds = new Set();
    for (const s of upcoming) {
      if (s.radiant_team_id) teamIds.add(s.radiant_team_id);
      if (s.dire_team_id) teamIds.add(s.dire_team_id);
    }
    const teams = teamIds.size > 0
      ? await db`SELECT * FROM teams WHERE team_id = ANY(${Array.from(teamIds)})`
      : [];

    const result = upcoming.map(s => {
      const radiantTeamName = s.radiant_team_name || null;
      const direTeamName = s.dire_team_name || null;

      return {
        id: s.id,
        series_id: s.series_id ? String(s.series_id) : null,
        radiant_team_id: s.radiant_team_id,
        dire_team_id: s.dire_team_id,
        radiant_team_name: radiantTeamName,
        dire_team_name: direTeamName,
        radiant_team_name_cn: s.radiant_team_name_cn || null,
        dire_team_name_cn: s.dire_team_name_cn || null,
        radiant_team_logo: resolvePreferredTeamLogo({ name: radiantTeamName, logo_url: s.radiant_team_logo }, {
          teamId: s.radiant_team_id,
          name: radiantTeamName,
        }, req),
        dire_team_logo: resolvePreferredTeamLogo({ name: direTeamName, logo_url: s.dire_team_logo }, {
          teamId: s.dire_team_id,
          name: direTeamName,
        }, req),
        start_time: s.start_time,
        series_type: convertSeriesType(s.series_type),
        tournament_name: s.tournament_name || null,
        tournament_name_cn: s.tournament_name_cn || null,
        tier: s.tournament_tier || 'S',
        status: s.status
      };
    });

    return res.status(200).json({
      days,
      upcoming: result,
      teams: teams.map(t => ({
        team_id: t.team_id,
        name: t.name,
        name_cn: t.name_cn,
        tag: t.tag,
        logo_url: resolvePreferredTeamLogo(t, { teamId: t.team_id, name: t.name }, req),
        region: t.region,
        is_cn_team: t.is_cn_team
      }))
    });
  } catch (e) {
    console.error('[Upcoming API] Error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
