import { getCuratedTeamLogoMirrorPath } from '../../../../lib/team-logo-overrides.js';

export interface TeamLike {
  team_id?: string | number | null;
  id?: string | number | null;
  name?: string | null;
  name_cn?: string | null;
  tag?: string | null;
  logo_url?: string | null;
  region?: string | null;
  is_cn_team?: number | boolean | null;
}

type TeamIdentity =
  | string
  | {
      name?: string | null;
      teamId?: string | number | null;
    };

function normalize(value?: string | number | null): string {
  return String(value || '').trim().toLowerCase();
}

function normalizeCompact(value?: string | number | null): string {
  return normalize(value).replace(/[^a-z0-9\u4e00-\u9fff]/g, '');
}

const TEAM_LOGO_OVERRIDES_BY_ID: Record<string, string> = {
  '2163': '/images/mirror/teams/team-liquid-white.svg',
  '7119388': '/images/mirror/teams/team-spirit-white.svg',
  '8291895': '/images/mirror/teams/tundra-esports-white.svg',
  '9964962': '/images/mirror/teams/gamerlegion-white.svg',
};

const TEAM_LOGO_OVERRIDES_BY_NAME: Record<string, string> = {
  gamerlegion: '/images/mirror/teams/gamerlegion-white.svg',
  gl: '/images/mirror/teams/gamerlegion-white.svg',
  liquid: '/images/mirror/teams/team-liquid-white.svg',
  teamliquid: '/images/mirror/teams/team-liquid-white.svg',
  tl: '/images/mirror/teams/team-liquid-white.svg',
  spirit: '/images/mirror/teams/team-spirit-white.svg',
  teamspirit: '/images/mirror/teams/team-spirit-white.svg',
  ts: '/images/mirror/teams/team-spirit-white.svg',
  tspirit: '/images/mirror/teams/team-spirit-white.svg',
  tundra: '/images/mirror/teams/tundra-esports-white.svg',
  tundraesports: '/images/mirror/teams/tundra-esports-white.svg',
};

const TEAM_LOGO_FALLBACKS: Record<string, string> = {
  xg: '/images/mirror/teams/8261500.png',
  xtremegaming: '/images/mirror/teams/8261500.png',
  yb: '/images/mirror/teams/9351740.png',
  yakultbrothers: '/images/mirror/teams/9351740.png',
  vg: '/images/mirror/teams/726228.png',
  vicigaming: '/images/mirror/teams/726228.png',
  lgd: '/images/mirror/teams/5014799.png',
  psglgd: '/images/mirror/teams/5014799.png',
  aurora: '/images/mirror/teams/9467224.png',
  auroragaming: '/images/mirror/teams/9467224.png',
  natusvincere: '/images/mirror/teams/36.png',
  teamliquid: '/images/mirror/teams/2163.png',
  teamfalcons: '/images/mirror/teams/9247354.png',
  og: '/images/mirror/teams/2586976.png',
  tundraesports: '/images/mirror/teams/8291895.png',
  gamerlegion: '/images/mirror/teams/9964962.png',
  parivision: '/images/mirror/teams/9572001.png',
  betboomteam: '/images/mirror/teams/8255888.png',
  paingaming: '/images/mirror/teams/67.png',
  teamyandex: '/images/mirror/teams/9823272.png',
  execration: '/images/mirror/teams/8254145.png',
  mouz: '/images/mirror/teams/9338413.png',
  heroic: '/images/mirror/teams/9303484.png',
  teamspirit: '/images/mirror/teams/7119388.png',
};

function isChinaRegion(region?: string | null): boolean {
  const normalized = normalize(region).replace(/[\s_-]+/g, '');
  return normalized === 'cn' || normalized === 'china' || normalized === 'prchina' || normalized === '中国';
}

function resolveLogoOverride(teamId?: string | number | null, teamName?: string | null): string {
  const idNorm = normalize(teamId);
  if (idNorm && TEAM_LOGO_OVERRIDES_BY_ID[idNorm]) {
    return TEAM_LOGO_OVERRIDES_BY_ID[idNorm];
  }

  const compact = normalizeCompact(teamName);
  if (!compact) return '';
  return TEAM_LOGO_OVERRIDES_BY_NAME[compact] || '';
}

function truthy(value?: number | boolean | null): boolean {
  return value === true || value === 1;
}

function getTeamRow(
  teams: TeamLike[],
  teamId?: string | number | null,
  teamName?: string | null
): TeamLike | undefined {
  const idNorm = normalize(teamId);
  const nameNorm = normalize(teamName);
  const nameCompact = normalizeCompact(teamName);

  if (idNorm) {
    const byId = teams.find((t) => {
      const a = normalize(t.team_id);
      const b = normalize(t.id);
      return idNorm === a || idNorm === b;
    });
    if (byId) return byId;
  }

  if (!nameNorm) return undefined;

  return teams.find((t) => {
    const values = [t.name, t.name_cn, t.tag];
    return values.some((v) => {
      const raw = normalize(v);
      const compact = normalizeCompact(v);
      return raw === nameNorm || compact === nameCompact;
    });
  });
}

export function findTeamRow(
  teams: TeamLike[] = [],
  teamId?: string | number | null,
  teamName?: string | null
): TeamLike | undefined {
  return getTeamRow(teams, teamId, teamName);
}

export function isChineseTeam(team: TeamIdentity | undefined | null, teams: TeamLike[] = []): boolean {
  const teamId = typeof team === 'string' ? undefined : team?.teamId;
  const teamName = typeof team === 'string' ? team : team?.name;
  const row = getTeamRow(teams, teamId, teamName);
  if (!row) return false;
  return isChinaRegion(row.region) || truthy(row.is_cn_team);
}

export function isTeamInRegion(
  team: TeamIdentity | undefined | null,
  teams: TeamLike[] = [],
  regions: string[] = []
): boolean {
  if (!team || teams.length === 0 || regions.length === 0) return false;

  const teamId = typeof team === 'string' ? undefined : team?.teamId;
  const teamName = typeof team === 'string' ? team : team?.name;
  const row = getTeamRow(teams, teamId, teamName);
  if (!row) return false;

  const regionSet = new Set(regions.map((x) => normalize(x)));
  return regionSet.has(normalize(row.region));
}

export function resolveTeamLogo(
  team: TeamIdentity | undefined | null,
  teams: TeamLike[] = [],
  explicitLogo?: string | null
): string {
  const teamId = typeof team === 'string' ? undefined : team?.teamId;
  const teamName = typeof team === 'string' ? team : team?.name;
  const directOverride = resolveLogoOverride(teamId, teamName);
  if (directOverride) return directOverride;

  const curatedMirror = getCuratedTeamLogoMirrorPath({
    teamId,
    name: teamName,
  });
  if (curatedMirror) return curatedMirror;

  const row = getTeamRow(teams, teamId, teamName);
  const rowOverride = resolveLogoOverride(row?.team_id ?? row?.id, row?.name ?? row?.name_cn ?? row?.tag);
  if (rowOverride) return rowOverride;

  const rowCuratedMirror = getCuratedTeamLogoMirrorPath({
    teamId: row?.team_id ?? row?.id,
    name: row?.name ?? row?.name_cn ?? row?.tag,
    tag: row?.tag,
  });
  if (rowCuratedMirror) return rowCuratedMirror;

  if (row?.logo_url) return String(row.logo_url);
  if (explicitLogo) return String(explicitLogo);

  const compact = normalizeCompact(teamName);
  if (!compact) return '';
  return TEAM_LOGO_FALLBACKS[compact] || '';
}
