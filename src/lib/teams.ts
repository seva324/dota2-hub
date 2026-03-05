export interface TeamLike {
  team_id?: string | number | null;
  id?: string | number | null;
  name?: string | null;
  name_cn?: string | null;
  tag?: string | null;
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

function isChinaRegion(region?: string | null): boolean {
  const normalized = normalize(region).replace(/[\s_-]+/g, '');
  return normalized === 'cn' || normalized === 'china' || normalized === 'prchina' || normalized === '中国';
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
