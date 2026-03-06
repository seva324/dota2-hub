import { useEffect, useMemo, useState } from 'react';
import { Calendar, Flag, Shield, Target, Trophy, UserRound } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { MatchDetailModal } from '@/components/custom/MatchDetailModal';
import { isChineseTeam } from '@/lib/teams';
import { toFlagImageUrl } from '@/lib/playerProfile';

type TeamLike = {
  team_id?: string | null;
  id?: string | null;
  name?: string | null;
  name_cn?: string | null;
  tag?: string | null;
  logo_url?: string | null;
  region?: string | null;
  is_cn_team?: number | boolean;
};

type MatchLike = {
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
};

type HeroMeta = {
  name?: string;
  name_cn?: string;
  img?: string;
};

type ProPlayerMeta = {
  name?: string | null;
  name_cn?: string | null;
  team_id?: string | null;
  team_name?: string | null;
  country_code?: string | null;
  avatar_url?: string | null;
  realname?: string | null;
  birth_date?: string | null;
  birth_year?: number | null;
  birth_month?: number | null;
};

type SquadPlayerCard = {
  accountId: number | null;
  name: string;
  realname: string | null;
  countryCode: string | null;
  avatarUrl: string | null;
};

type RecentRow = {
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

function formatTs(ts: number): string {
  if (!ts) return 'TBD';
  return new Date(ts * 1000).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getTournamentLabel(match: MatchLike): string {
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

function getHeroImg(heroId: number, heroMap: Record<number, HeroMeta>): string {
  const hero = heroMap[heroId];
  if (hero?.img) {
    return `https://steamcdn-a.akamaihd.net/apps/dota2/images/heroes/${hero.img}_lg.png`;
  }
  return '';
}

export interface TeamFlyoutProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedTeam: {
    team_id?: string | null;
    name: string;
    logo_url?: string | null;
  } | null;
  teams?: TeamLike[];
  matches?: MatchLike[];
  upcoming?: MatchLike[];
  onTeamSelect?: (team: { team_id?: string | null; name?: string | null; logo_url?: string | null }) => void;
  onPlayerClick?: (accountId: number) => void;
}

export function TeamFlyout({
  open,
  onOpenChange,
  selectedTeam,
  teams = [],
  matches = [],
  upcoming = [],
  onTeamSelect,
  onPlayerClick
}: TeamFlyoutProps) {
  const [heroMap, setHeroMap] = useState<Record<number, HeroMeta>>({});
  const [teamHeroesByMatch, setTeamHeroesByMatch] = useState<Record<string, number[]>>({});
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);
  const [teamMatches, setTeamMatches] = useState<MatchLike[]>([]);
  const [activeSquad, setActiveSquad] = useState<SquadPlayerCard[]>([]);

  useEffect(() => {
    fetch('/api/heroes')
      .then((res) => res.json())
      .then((data) => {
        setHeroMap(data || {});
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!open || !selectedTeam?.name) return;

    let cancelled = false;
    setTeamMatches([]);
    setTeamHeroesByMatch({});
    setActiveSquad([]);
    const params = new URLSearchParams();
    if (selectedTeam.team_id) params.set('team_id', String(selectedTeam.team_id));
    else params.set('team_name', selectedTeam.name);
    params.set('limit', '120');

    fetch(`/api/matches?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          setTeamMatches(Array.isArray(data) ? data : []);
        }
      })
      .catch(() => {
        if (!cancelled) setTeamMatches([]);
      });

    return () => {
      cancelled = true;
    };
  }, [open, selectedTeam?.name, selectedTeam?.team_id]);

  const model = useMemo(() => {
    if (!selectedTeam?.name) return null;

    const selectedName = normalize(selectedTeam.name);
    const selectedTeamId = selectedTeam.team_id ? String(selectedTeam.team_id) : null;
    const now = Math.floor(Date.now() / 1000);
    const sourceMatches = teamMatches;

    const resolveMeta = () => teams.find((team) => {
      const teamId = team.team_id ? String(team.team_id) : null;
      if (selectedTeamId && teamId && selectedTeamId === teamId) return true;
      return (
        normalize(team.name) === selectedName ||
        normalize(team.tag) === selectedName ||
        normalize(team.name_cn) === selectedName
      );
    });
    const selectedMeta = resolveMeta();
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

    const isTeamMatch = (m: MatchLike) => {
      return resolveTeamSide(m) !== null;
    };

    const threeMonthsAgo = now - 90 * 24 * 60 * 60;
    const recentRows: RecentRow[] = sourceMatches
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
          isSelectedRadiant: onRadiant
        };
      });

    const latestPlayedMatch = sourceMatches
      .filter(isTeamMatch)
      .filter((m) => Number(m.start_time) <= now)
      .sort((a, b) => Number(b.start_time || 0) - Number(a.start_time || 0))
      [0] || null;

    const nextMatch = upcoming
      .filter(isTeamMatch)
      .filter((m) => Number(m.start_time) > now)
      .sort((a, b) => Number(a.start_time || 0) - Number(b.start_time || 0))[0];

    const wins = recentRows.filter((r) => r.won === true).length;
    const losses = recentRows.filter((r) => r.won === false).length;
    const decided = wins + losses;
    const winRate = decided > 0 ? Math.round((wins / decided) * 100) : 0;

    return {
      selectedTeamId,
      selectedName,
      meta: selectedMeta,
      recentRows,
      latestPlayedMatch,
      resolveTeamSide,
      nextMatch,
      wins,
      losses,
      winRate
    };
  }, [selectedTeam, teams, teamMatches, upcoming]);

  useEffect(() => {
    if (!open || !model?.latestPlayedMatch) {
      setActiveSquad([]);
      return;
    }

    const latestMatchId = toMatchId(model.latestPlayedMatch);
    const latestSide = model.resolveTeamSide(model.latestPlayedMatch);
    if (!latestMatchId || !latestSide) {
      setActiveSquad([]);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const detailRes = await fetch(`/api/match-details?match_id=${latestMatchId}`);
        const detail = await detailRes.json();
        const players = Array.isArray(detail?.players) ? detail.players : [];
        const sidePlayers = players
          .filter((p: any) => latestSide === 'radiant' ? Number(p.player_slot) < 128 : Number(p.player_slot) >= 128)
          .sort((a: any, b: any) => Number(a.player_slot || 0) - Number(b.player_slot || 0))
          .slice(0, 5);

        const squad = await Promise.all(sidePlayers.map(async (player: any) => {
          const accountId = Number(player.account_id);
          let profile: any = null;
          if (Number.isFinite(accountId) && accountId > 0) {
            try {
              const profileRes = await fetch(`/api/pro-players?account_id=${accountId}`);
              if (profileRes.ok) {
                profile = await profileRes.json();
              }
            } catch {
              profile = null;
            }
          }

          return {
            accountId: Number.isFinite(accountId) && accountId > 0 ? accountId : null,
            name: String(profile?.name || player.personaname || player.name || `Player ${player.player_slot}`),
            realname: profile?.realname || null,
            avatarUrl: profile?.avatar_url || null,
            countryCode: profile?.country_code ? String(profile.country_code).toUpperCase() : null
          } satisfies SquadPlayerCard;
        }));

        if (!cancelled) {
          setActiveSquad(squad);
        }
      } catch {
        if (!cancelled) setActiveSquad([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, model?.latestPlayedMatch, model?.resolveTeamSide]);

  useEffect(() => {
    if (!open || !model?.recentRows?.length) return;

    const targetRows = model.recentRows.filter((row) => row.matchId !== null);
    const missing = targetRows.filter((row) => !teamHeroesByMatch[row.key]);
    if (!missing.length) return;

    let cancelled = false;
    (async () => {
      const updates: Record<string, number[]> = {};
      await Promise.all(
        missing.map(async (row) => {
          try {
            const res = await fetch(`/api/match-details?match_id=${row.matchId}`);
            const data = await res.json();
            const players = Array.isArray(data?.players) ? data.players : [];
            const heroIds = players
              .filter((p: any) => (row.isSelectedRadiant ? p.player_slot < 128 : p.player_slot >= 128))
              .map((p: any) => Number(p.hero_id))
              .filter((id: number) => Number.isFinite(id));
            updates[row.key] = heroIds.slice(0, 5);
          } catch {
            updates[row.key] = [];
          }
        })
      );
      if (!cancelled) {
        setTeamHeroesByMatch((prev) => ({ ...prev, ...updates }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, model, teamHeroesByMatch]);

  const topFiveHeroes = useMemo(() => {
    const counts = new Map<number, number>();
    for (const row of model?.recentRows || []) {
      const picks = teamHeroesByMatch[row.key] || [];
      for (const heroId of picks) {
        counts.set(heroId, (counts.get(heroId) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [model, teamHeroesByMatch]);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-2xl bg-slate-900 border-slate-700 text-slate-100 p-0 overscroll-contain">
          <div className="h-full overflow-y-auto">
            <SheetHeader className="border-b border-slate-700 bg-gradient-to-br from-slate-900 via-slate-900 to-red-950/30 p-6 pr-12">
              <div className="flex flex-col items-center justify-center gap-4 text-center">
                <div className="w-20 h-20 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden">
                  {selectedTeam?.logo_url ? (
                    <img src={selectedTeam.logo_url} alt={selectedTeam.name} width={72} height={72} className="w-18 h-18 object-contain" />
                  ) : (
                    <Shield className="w-9 h-9 text-slate-400" />
                  )}
                </div>
                <div className="min-w-0">
                  <SheetTitle className="text-2xl text-white truncate">{selectedTeam?.name || 'Team'}</SheetTitle>
                  <SheetDescription className="sr-only">
                    Team details
                  </SheetDescription>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {model?.meta?.tag && <Badge variant="outline" className="border-slate-600 text-slate-200">{model.meta.tag}</Badge>}
                {(model?.meta?.region && String(model.meta.region).toLowerCase() !== 'unknown') || isChineseTeam({ teamId: selectedTeam?.team_id, name: selectedTeam?.name }, teams) ? (
                  <Badge variant="outline" className="border-red-500/40 text-red-300">
                    <Flag className="w-3 h-3 mr-1" />
                    {(model?.meta?.region && String(model.meta.region).toLowerCase() !== 'unknown')
                      ? model.meta.region
                      : 'China'}
                  </Badge>
                ) : null}
                <Badge variant="outline" className="border-slate-600 text-slate-300">
                  <Target className="w-3 h-3 mr-1" />
                  近3个月 {model?.wins ?? 0}-{model?.losses ?? 0}
                </Badge>
                <Badge variant="outline" className="border-slate-600 text-slate-300">
                  胜率 {model?.winRate ?? 0}%
                </Badge>
              </div>
            </SheetHeader>

            <div className="p-6 space-y-6">
              <section>
                <div className="flex items-center gap-2 mb-3 text-white">
                  <Trophy className="w-4 h-4 text-amber-400" />
                  <h4 className="font-semibold">当前阵容</h4>
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                  {activeSquad.map((player) => {
                    const flagUrl = toFlagImageUrl(player.countryCode, 40);
                    const body = (
                      <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-3 text-center">
                        <div className="mx-auto flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/60">
                          {player.avatarUrl ? (
                            <img src={player.avatarUrl} alt={player.name} className="h-full w-full object-cover" />
                          ) : (
                            <UserRound className="h-10 w-10 text-slate-500" />
                          )}
                        </div>
                        <div className="mt-3 flex items-center justify-center gap-1.5 text-sm font-semibold text-slate-100">
                          {flagUrl ? (
                            <img src={flagUrl} alt={player.countryCode || ''} className="h-3.5 w-5 rounded-[2px] object-cover" />
                          ) : (
                            <span className="inline-block h-3.5 w-5 rounded-[2px] bg-slate-700" />
                          )}
                          <span className="truncate">{player.name}</span>
                        </div>
                        <div className="mt-1 text-xs text-slate-400 truncate">{player.realname || '—'}</div>
                      </div>
                    );

                    return player.accountId ? (
                      <button
                        key={`squad-${player.accountId}`}
                        type="button"
                        className="text-left"
                        onClick={() => onPlayerClick?.(player.accountId!)}
                      >
                        {body}
                      </button>
                    ) : (
                      <div key={`squad-${player.name}`}>{body}</div>
                    );
                  })}
                  {!activeSquad.length && (
                    <div className="col-span-full rounded-xl border border-slate-700 bg-slate-800/40 p-4 text-sm text-slate-400">
                      暂无最近一场比赛阵容
                    </div>
                  )}
                </div>
              </section>

              <section>
                <div className="flex items-center gap-2 mb-3 text-white">
                  <Calendar className="w-4 h-4 text-blue-400" />
                  <h4 className="font-semibold">下一场比赛</h4>
                </div>
                {model?.nextMatch ? (
                  <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
                    <div className="text-sm text-slate-300">
                      {model.nextMatch.radiant_team_name} vs {model.nextMatch.dire_team_name}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      {getTournamentLabel(model.nextMatch)} · {model.nextMatch.series_type || 'BO3'}
                    </div>
                    <div className="text-xs text-blue-300 mt-2">{formatTs(model.nextMatch.start_time)}</div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4 text-sm text-slate-400">
                    暂无未来赛程
                  </div>
                )}
              </section>

              <section>
                <div className="flex items-center gap-2 mb-3 text-white">
                  <Trophy className="w-4 h-4 text-amber-400" />
                  <h4 className="font-semibold">最近最常选 5 英雄</h4>
                </div>
                <div className="flex flex-wrap gap-2">
                  {topFiveHeroes.map(([heroId, cnt]) => (
                    <div key={heroId} className="flex items-center gap-2 rounded-lg bg-slate-800/50 border border-slate-700 px-2 py-1.5">
                      {getHeroImg(heroId, heroMap) ? (
                        <img src={getHeroImg(heroId, heroMap)} alt={String(heroMap[heroId]?.name_cn || heroMap[heroId]?.name || heroId)} width={28} height={28} className="w-7 h-7 rounded object-cover" />
                      ) : (
                        <div className="w-7 h-7 rounded bg-slate-700" />
                      )}
                      <span className="text-xs text-slate-200">
                        {heroMap[heroId]?.name_cn || heroMap[heroId]?.name || `Hero ${heroId}`} × {cnt}
                      </span>
                    </div>
                  ))}
                  {!topFiveHeroes.length && (
                    <div className="text-xs text-slate-400">暂无英雄统计（点击比分后会逐步补全）</div>
                  )}
                </div>
              </section>

              <section>
                <div className="flex items-center gap-2 mb-3 text-white">
                  <Trophy className="w-4 h-4 text-amber-400" />
                  <h4 className="font-semibold">过去 3 个月比赛</h4>
                </div>
                <div className="space-y-2">
                  {(model?.recentRows || []).map((row) => {
                    const resultCls = row.won === true
                      ? 'border-emerald-500/60 text-emerald-300'
                      : row.won === false
                        ? 'border-red-500/60 text-red-300'
                        : 'border-slate-600 text-slate-200';
                    return (
                      <div key={row.key} className="rounded-lg border border-slate-700 bg-slate-800/40 p-3">
                        <div className="grid grid-cols-[minmax(0,1fr)_4.75rem_minmax(0,1fr)] items-center gap-1.5 sm:grid-cols-[minmax(0,1fr)_6rem_minmax(0,1fr)] md:grid-cols-[minmax(0,1fr)_7.5rem_minmax(0,1fr)] sm:gap-2 md:gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <button
                            type="button"
                            aria-label={`查看战队 ${row.selectedName}`}
                            className="h-7 w-7 sm:h-8 sm:w-8 rounded bg-slate-700/60 flex items-center justify-center overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                            onClick={() => onTeamSelect?.({ team_id: row.selectedTeamId || null, name: row.selectedName, logo_url: row.selectedLogo || null })}
                          >
                            {row.selectedLogo ? <img src={row.selectedLogo} alt={row.selectedName} width={28} height={28} className="w-6 h-6 sm:w-7 sm:h-7 object-contain" /> : <span className="text-[10px]">TEAM</span>}
                          </button>
                          <button
                            type="button"
                            className="text-xs sm:text-sm text-slate-100 truncate hover:text-white underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 rounded"
                            onClick={() => onTeamSelect?.({ team_id: row.selectedTeamId || null, name: row.selectedName, logo_url: row.selectedLogo || null })}
                          >
                            {row.selectedName}
                          </button>
                        </div>

                          <button
                            type="button"
                            disabled={row.matchId === null}
                            onClick={() => {
                              if (row.matchId !== null) setSelectedMatchId(row.matchId);
                            }}
                            className={`justify-self-center w-[4.75rem] sm:w-[6rem] md:w-[7.5rem] text-center rounded-full border px-2 sm:px-3 py-1 text-xs sm:text-sm font-semibold leading-5 ${resultCls} ${row.matchId === null ? 'opacity-60 cursor-not-allowed' : 'hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400'}`}
                            title={row.matchId !== null ? '点击查看KDA和详细数据' : '暂无可用 match_id'}
                          >
                            {row.selectedScore ?? '-'}:{row.opponentScore ?? '-'}
                          </button>

                          <div className="flex items-center justify-end gap-2 min-w-0">
                            <button
                              type="button"
                              className="text-xs sm:text-sm text-slate-100 truncate hover:text-white underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 rounded"
                              onClick={() => onTeamSelect?.({ team_id: row.opponentTeamId || null, name: row.opponentName, logo_url: row.opponentLogo || null })}
                            >
                              {row.opponentName}
                            </button>
                            <button
                              type="button"
                              aria-label={`查看战队 ${row.opponentName}`}
                              className="h-7 w-7 sm:h-8 sm:w-8 rounded bg-slate-700/60 flex items-center justify-center overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                              onClick={() => onTeamSelect?.({ team_id: row.opponentTeamId || null, name: row.opponentName, logo_url: row.opponentLogo || null })}
                            >
                              {row.opponentLogo ? <img src={row.opponentLogo} alt={row.opponentName} width={28} height={28} className="w-6 h-6 sm:w-7 sm:h-7 object-contain" /> : <span className="text-[10px]">OPP</span>}
                            </button>
                          </div>
                        </div>

                        <div className="mt-2 text-xs text-slate-400">
                          {row.tournament} · {row.seriesType} · {formatTs(row.startTime)}
                        </div>

                        <div className="mt-2 flex flex-wrap gap-1">
                          {(teamHeroesByMatch[row.key] || []).map((heroId, idx) => {
                            const img = getHeroImg(heroId, heroMap);
                            const heroName = heroMap[heroId]?.name_cn || heroMap[heroId]?.name || `Hero ${heroId}`;
                            return img ? (
                              <img
                                key={`${row.key}-${heroId}-${idx}`}
                                src={img}
                                alt={heroName}
                                title={heroName}
                                width={28}
                                height={28}
                                className="w-7 h-7 rounded object-cover border border-slate-700"
                              />
                            ) : (
                              <div key={`${row.key}-${heroId}-${idx}`} className="w-7 h-7 rounded bg-slate-700 border border-slate-600" />
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  {!model?.recentRows?.length && (
                    <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4 text-sm text-slate-400">
                      暂无历史比赛
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <MatchDetailModal
        matchId={selectedMatchId}
        open={selectedMatchId !== null}
        onOpenChange={(next) => {
          if (!next) setSelectedMatchId(null);
        }}
        onTeamClick={(team) => {
          if (team?.name) {
            onTeamSelect?.(team);
          }
        }}
        onPlayerClick={onPlayerClick}
      />
    </>
  );
}
