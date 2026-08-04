export type TeamLike = {
  team_id?: string | null;
  id?: string | null;
  name?: string | null;
  name_cn?: string | null;
  tag?: string | null;
  logo_url?: string | null;
  region?: string | null;
  is_cn_team?: number | boolean;
};

export type MatchLike = {
  match_id?: string | number;
  id?: string | number;
  start_time: number;
  series_type?: string | null;
  status?: string | null;
  league_id?: number | null;
  radiant_team_id?: string | null;
  dire_team_id?: string | null;
  radiant_team_name?: string | null;
  dire_team_name?: string | null;
  radiant_team_logo?: string | null;
  dire_team_logo?: string | null;
  radiant_score?: number | null;
  dire_score?: number | null;
  radiant_win?: number | boolean | null;
  tournament_name?: string | null;
  team_hero_ids?: number[];
};

export type RecentRow = {
  matchId: number | null;
  key: string;
  startTime: number;
  seriesType: string;
  tournament: string;
  selectedName: string;
  opponentName: string;
  selectedTeamId?: string | null;
  opponentTeamId?: string | null;
  selectedLogo?: string | null;
  opponentLogo?: string | null;
  selectedScore: number | null;
  opponentScore: number | null;
  won: boolean | null;
  isSelectedRadiant: boolean;
  teamHeroIds: number[];
};

export type TeamFlyoutModel = {
  selectedTeamId: string | null;
  selectedName: string;
  meta: TeamLike | null;
  recentRows: RecentRow[];
  nextMatch: MatchLike | null;
  wins: number;
  losses: number;
  winRate: number;
};

export type TeamFlyoutSources = {
  teams: TeamLike[];
  matches: MatchLike[];
  upcoming: MatchLike[];
  hasServerPayload: boolean;
};

const LEAGUE_NAME_MAP: Record<string, string> = {
  '19269': 'DreamLeague Season 28',
  '18988': 'DreamLeague Season 27',
  '19099': 'BLAST Slam VI',
  '19130': 'ESL Challenger China'
};

function normalize(value?: string | null): string {
  return String(value || '').trim().toLowerCase();
}

export function getTournamentLabel(match: MatchLike): string {
  if (match.tournament_name) return match.tournament_name;
  if (match.league_id !== null && match.league_id !== undefined) {
    return LEAGUE_NAME_MAP[String(match.league_id)] || `League ${match.league_id}`;
  }
  return 'Unknown Tournament';
}

function toMatchId(match: MatchLike): number | null {
  const raw = match.match_id ?? match.id;
  if (raw === null || raw === undefined) return null;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

function inferWin(match: MatchLike, isRadiant: boolean): boolean | null {
  if (match.radiant_win === null || match.radiant_win === undefined) return null;
  const radiantWin = match.radiant_win === true || match.radiant_win === 1;
  return isRadiant ? radiantWin : !radiantWin;
}

export function resolveTeamFlyoutSources(
  payload: {
    team?: TeamLike | null;
    recentMatches?: MatchLike[] | null;
    nextMatch?: MatchLike | null;
  },
  preloaded: { teams?: TeamLike[]; matches?: MatchLike[]; upcoming?: MatchLike[] },
): TeamFlyoutSources {
  const hasServerPayload = Boolean(payload?.team);
  return {
    teams: hasServerPayload && payload?.team ? [payload.team] : (preloaded.teams || []),
    matches: hasServerPayload
      ? (Array.isArray(payload?.recentMatches) ? payload.recentMatches : [])
      : (preloaded.matches || []),
    upcoming: hasServerPayload
      ? (payload?.nextMatch ? [payload.nextMatch] : [])
      : (preloaded.upcoming || []),
    hasServerPayload,
  };
}

export function deriveTeamFlyoutModel(
  selectedTeam: { team_id?: string | null; name: string },
  sources: TeamFlyoutSources,
  now = Math.floor(Date.now() / 1000),
): TeamFlyoutModel | null {
  if (!selectedTeam?.name) return null;

  const selectedName = normalize(selectedTeam.name);
  const selectedTeamId = selectedTeam.team_id ? String(selectedTeam.team_id) : null;

  const resolveMeta = () => sources.teams.find((team) => {
    const teamId = team.team_id ? String(team.team_id) : null;
    if (selectedTeamId && teamId && selectedTeamId === teamId) return true;
    return (
      normalize(team.name) === selectedName ||
      normalize(team.tag) === selectedName ||
      normalize(team.name_cn) === selectedName
    );
  });
  const selectedMeta = resolveMeta() || null;
  const selectedAliases = new Set<string>([
    selectedName,
    normalize(selectedTeam.name),
    normalize(selectedMeta?.name),
    normalize(selectedMeta?.tag),
    normalize(selectedMeta?.name_cn)
  ]);
  const hasAlias = (value?: string | null) => selectedAliases.has(normalize(value));
  const resolveTeamSide = (m: MatchLike): 'radiant' | 'dire' | null => {
    const radId = m.radiant_team_id ? String(m.radiant_team_id) : null;
    const direId = m.dire_team_id ? String(m.dire_team_id) : null;
    if (selectedTeamId && radId === selectedTeamId) return 'radiant';
    if (selectedTeamId && direId === selectedTeamId) return 'dire';
    if (hasAlias(m.radiant_team_name) && !hasAlias(m.dire_team_name)) return 'radiant';
    if (hasAlias(m.dire_team_name) && !hasAlias(m.radiant_team_name)) return 'dire';
    if (hasAlias(m.radiant_team_name)) return 'radiant';
    if (hasAlias(m.dire_team_name)) return 'dire';
    return null;
  };

  const isTeamMatch = (m: MatchLike) => resolveTeamSide(m) !== null;

  const threeMonthsAgo = now - 90 * 24 * 60 * 60;
  const recentRows: RecentRow[] = sources.matches
    .filter(isTeamMatch)
    .filter((m) => Number(m.start_time) <= now)
    .filter((m) => Number(m.start_time) >= threeMonthsAgo)
    .sort((a, b) => Number(b.start_time || 0) - Number(a.start_time || 0))
    .map((m) => {
      const side = resolveTeamSide(m) || 'radiant';
      const onRadiant = side === 'radiant';
      const won = inferWin(m, onRadiant);
      const selectedScore = onRadiant ? (m.radiant_score ?? null) : (m.dire_score ?? null);
      const opponentScore = onRadiant ? (m.dire_score ?? null) : (m.radiant_score ?? null);
      const selectedNameDisplay = onRadiant ? (m.radiant_team_name || selectedTeam.name) : (m.dire_team_name || selectedTeam.name);
      const opponentNameDisplay = onRadiant ? (m.dire_team_name || 'TBD') : (m.radiant_team_name || 'TBD');
      const selectedLogo = onRadiant ? m.radiant_team_logo : m.dire_team_logo;
      const opponentLogo = onRadiant ? m.dire_team_logo : m.radiant_team_logo;
      const selectedId = onRadiant ? (m.radiant_team_id ? String(m.radiant_team_id) : null) : (m.dire_team_id ? String(m.dire_team_id) : null);
      const opponentId = onRadiant ? (m.dire_team_id ? String(m.dire_team_id) : null) : (m.radiant_team_id ? String(m.radiant_team_id) : null);
      const matchId = toMatchId(m);

      return {
        key: String(m.match_id ?? m.id ?? `${m.start_time}-${selectedNameDisplay}-${opponentNameDisplay}`),
        matchId,
        startTime: Number(m.start_time || 0),
        seriesType: String(m.series_type || 'BO3'),
        tournament: getTournamentLabel(m),
        selectedName: selectedNameDisplay || selectedTeam.name,
        opponentName: opponentNameDisplay,
        selectedTeamId: selectedId,
        opponentTeamId: opponentId,
        selectedLogo,
        opponentLogo,
        selectedScore,
        opponentScore,
        won,
        isSelectedRadiant: onRadiant,
        teamHeroIds: Array.isArray((m as MatchLike & { team_hero_ids?: number[] }).team_hero_ids)
          ? (((m as MatchLike & { team_hero_ids?: number[] }).team_hero_ids) || []).map((heroId) => Number(heroId)).filter((heroId) => Number.isFinite(heroId))
          : [],
      };
    });

  const nextMatch = sources.upcoming
    .filter(isTeamMatch)
    .filter((m) => Number(m.start_time) > now)
    .sort((a, b) => Number(a.start_time || 0) - Number(b.start_time || 0))[0] || null;

  const wins = recentRows.filter((r) => r.won === true).length;
  const losses = recentRows.filter((r) => r.won === false).length;
  const decided = wins + losses;
  const winRate = decided > 0 ? Math.round((wins / decided) * 100) : 0;

  return {
    selectedTeamId,
    selectedName,
    meta: selectedMeta,
    recentRows,
    nextMatch,
    wins,
    losses,
    winRate
  };
}
