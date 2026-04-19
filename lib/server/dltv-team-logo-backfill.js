import {
  fetchDltvRankingLogoIndex,
  fetchDltvTeamPageEntry,
  findDltvRankingLogo,
} from './dltv-team-assets.js';
import { getCuratedTeamLogoGithubUrl } from '../team-logo-overrides.js';

function normalizeLogoUrl(value) {
  return String(value || '').trim();
}

function shouldUpdateLogo(currentLogo, dltvLogo) {
  const current = normalizeLogoUrl(currentLogo);
  const next = normalizeLogoUrl(dltvLogo);
  return Boolean(next) && current !== next;
}

function isUsableDltvTeamLogo(value) {
  const logo = normalizeLogoUrl(value).toLowerCase();
  if (!logo) return false;
  if (logo.includes('/images/desktop/empty/team.svg')) return false;
  return /(?:^https?:\/\/)?(?:s3\.)?dltv\.org\/(?:uploads\/teams|images\/teams)\//i.test(logo);
}

function buildTeamCandidates(team = {}) {
  return [
    team.name,
    team.tag,
    team.team_id,
  ].filter(Boolean);
}

export function resolveDltvLogoForTeam(index, team) {
  const logoUrl = findDltvRankingLogo(index, buildTeamCandidates(team))?.logoUrl || null;
  return isUsableDltvTeamLogo(logoUrl) ? logoUrl : null;
}

async function resolveDltvLogoForTeamWithFallback(index, team, options = {}) {
  const indexedLogo = resolveDltvLogoForTeam(index, team);
  if (indexedLogo) return indexedLogo;

  const fallbackEntry = await fetchDltvTeamPageEntry(buildTeamCandidates(team), {
    index,
    fetchImpl: options.fetchImpl,
    signal: options.signal,
    headers: options.headers,
    cache: options.cache,
  });
  return isUsableDltvTeamLogo(fallbackEntry?.logoUrl) ? fallbackEntry.logoUrl : null;
}

export async function backfillDltvTeamLogos(db, options = {}) {
  if (!db) throw new Error('Database not available');

  const index = options.index || await fetchDltvRankingLogoIndex({
    fetchImpl: options.fetchImpl,
    signal: options.signal,
  });
  const teamPageCache = options.teamPageCache instanceof Map ? options.teamPageCache : new Map();
  const rows = await db`
    SELECT team_id, name, tag, logo_url
    FROM teams
    WHERE NULLIF(BTRIM(COALESCE(name, '')), '') IS NOT NULL
    ORDER BY team_id ASC
  `;

  const limit = options.limit !== null && options.limit !== undefined && Number.isFinite(Number(options.limit))
    ? Math.max(0, Math.trunc(Number(options.limit)))
    : null;
  const candidates = limit === null ? rows : rows.slice(0, limit);
  const updates = [];
  let matched = 0;
  let alreadyDltv = 0;

  for (const row of candidates) {
    const preferredLogo = getCuratedTeamLogoGithubUrl(row) || await resolveDltvLogoForTeamWithFallback(index, row, {
      fetchImpl: options.fetchImpl,
      signal: options.signal,
      headers: options.headers,
      cache: teamPageCache,
    });
    if (!preferredLogo) continue;
    matched += 1;

    if (!shouldUpdateLogo(row.logo_url, preferredLogo)) {
      alreadyDltv += 1;
      continue;
    }

    updates.push({
      team_id: String(row.team_id),
      name: row.name,
      previousLogo: row.logo_url || null,
      logoUrl: preferredLogo,
    });

    if (!options.dryRun) {
      await db`
        UPDATE teams
        SET logo_url = ${preferredLogo}, updated_at = NOW()
        WHERE team_id = ${String(row.team_id)}
      `;
    }
  }

  return {
    scanned: candidates.length,
    dltvEntries: index.entries?.length || 0,
    matched,
    alreadyDltv,
    updated: options.dryRun ? 0 : updates.length,
    dryRun: Boolean(options.dryRun),
    updates,
  };
}
