import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, Calendar, Clock3, Flame, Radio, Trophy, TrendingUp, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { isTeamInRegion, resolveTeamLogo } from '@/lib/teams';
import type { TeamLike } from '@/lib/teams';

interface Match {
  id: number;
  match_id: number;
  radiant_team_id?: string | null;
  dire_team_id?: string | null;
  radiant_team_name: string;
  radiant_team_name_cn?: string;
  radiant_team_logo?: string;
  dire_team_name: string;
  dire_team_name_cn?: string;
  dire_team_logo?: string;
  start_time: number;
  series_type: string;
  tournament_name: string;
  tournament_name_cn?: string;
}

interface LiveHeroPayload {
  source: string;
  sourceUrl?: string | null;
  leagueName: string;
  bestOf?: string | number | null;
  seriesScore: string;
  live: boolean;
  startedAt?: string | number | null;
  teams: Array<{
    side: 'team1' | 'team2';
    name: string;
    logo?: string | null;
  }>;
  maps: Array<{
    label: string;
    score?: string | null;
    status: 'completed' | 'live';
    result?: 'team1' | 'team2' | null;
    team1Score?: number | null;
    team2Score?: number | null;
    team1NetWorthLead?: number | null;
    team2NetWorthLead?: number | null;
    gameTime?: number | null;
  }>;
  liveMap?: {
    label: string;
    score: string;
    status: 'live';
    gameTime?: number | null;
    team1Score?: number | null;
    team2Score?: number | null;
    team1NetWorthLead?: number | null;
    team2NetWorthLead?: number | null;
  } | null;
}

const teamAbbr: Record<string, string> = {
  'Xtreme Gaming': 'XG',
  'Yakult Brothers': 'YB',
  'Team Spirit': 'Spirit',
  'Natus Vincere': 'NAVI',
  'Tundra Esports': 'Tundra',
  'Team Liquid': 'Liquid',
  'Team Falcons': 'Falcons',
  OG: 'OG',
  GamerLegion: 'GL',
  PARIVISION: 'PARI',
  'BetBoom Team': 'BB',
  'paiN Gaming': 'paiN',
  'Aurora Gaming': 'Aurora',
  Aurora: 'Aurora',
  Heroic: 'Heroic',
  Execration: 'XctN',
  MOUZ: 'MOUZ',
  'Vici Gaming': 'VG',
  'PSG.LGD': 'LGD',
  'Team Yandex': 'Yandex',
  'Team Nemesis': 'Nemesis',
};

function getAbbr(teamName: string | null | undefined): string {
  if (!teamName) return '';
  return teamAbbr[teamName] || teamName;
}

function renderTeamName(teamName: string | null | undefined): React.JSX.Element {
  const abbrev = getAbbr(teamName);
  return (
    <>
      <span className="sm:hidden">{abbrev}</span>
      <span className="hidden sm:inline">{teamName}</span>
    </>
  );
}

function formatCSTTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

function formatCountdown(targetTime: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = targetTime - now;
  if (diff <= 0) return 'Live';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  return `${h}h ${m}m`;
}

function getMatchSection(match: Match): string {
  const date = new Date(match.start_time * 1000);
  return `${date.toLocaleString('en-US', { month: 'short' })} ${date.getUTCDate()}`;
}

function formatGameTime(seconds?: number | null) {
  if (!seconds || seconds <= 0) return null;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatNetWorthLead(value?: number | null) {
  if (!value || value <= 0) return null;
  if (value >= 100000) return `+${Math.round(value / 1000)}k`;
  return `+${(value / 1000).toFixed(1)}k`;
}

function formatBestOf(value?: string | number | null) {
  if (value === null || value === undefined || value === '') return 'BO3';
  if (typeof value === 'number' && Number.isFinite(value)) return `BO${value}`;
  const normalized = String(value).trim().toUpperCase();
  if (!normalized) return 'BO3';
  if (normalized.startsWith('BO')) return normalized;
  const parsed = Number(normalized);
  if (Number.isFinite(parsed)) return `BO${parsed}`;
  return normalized;
}

function getCompletedMapWinner(map?: LiveHeroPayload['maps'][number] | null) {
  if (!map || map.status !== 'completed') return null;
  if (map.result === 'team1' || map.result === 'team2') return map.result;
  if (typeof map.team1Score === 'number' && typeof map.team2Score === 'number') {
    if (map.team1Score > map.team2Score) return 'team1';
    if (map.team2Score > map.team1Score) return 'team2';
  }
  return null;
}

function toSortTimestamp(value: string | number | null | undefined): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return Math.trunc(parsed / 1000);
  }
  return 0;
}

function sortLiveHeroesForDisplay(items: LiveHeroPayload[]) {
  return [...items].sort((a, b) => {
    const aStart = toSortTimestamp(a.startedAt);
    const bStart = toSortTimestamp(b.startedAt);
    if (aStart !== bStart) return aStart - bStart;
    const aLeague = String(a.leagueName || '');
    const bLeague = String(b.leagueName || '');
    if (aLeague !== bLeague) return aLeague.localeCompare(bLeague);
    const aTeams = (a.teams || []).map((team) => team.name).join(' vs ');
    const bTeams = (b.teams || []).map((team) => team.name).join(' vs ');
    return aTeams.localeCompare(bTeams);
  });
}

const HERO_DEFAULT_DAYS = 1;

function buildHeroUpcomingApiUrl(days: number = HERO_DEFAULT_DAYS): string {
  const params = new URLSearchParams({ days: String(days) });
  return `/api/upcoming?${params.toString()}`;
}

function buildHeroLiveApiUrl(): string {
  return '/api/live-hero';
}

export function HeroSection({ upcoming = [], teams = [] }: { upcoming?: Match[]; teams?: TeamLike[] }) {
  const [showCountdown, setShowCountdown] = useState(true);
  const [lazyUpcoming, setLazyUpcoming] = useState<Match[]>([]);
  const [lazyTeams, setLazyTeams] = useState<TeamLike[]>([]);
  const [liveHeroes, setLiveHeroes] = useState<LiveHeroPayload[]>([]);
  const [selectedMapKeys, setSelectedMapKeys] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    const loadLiveHeroData = async () => {
      try {
        const liveResponse = await fetch(buildHeroLiveApiUrl());
        const livePayload = liveResponse.ok ? await liveResponse.json() : { live: null };
        if (cancelled) return;

        const nextLiveHeroes = Array.isArray(livePayload?.liveMatches)
          ? livePayload.liveMatches
          : livePayload?.live
            ? [livePayload.live]
            : [];
        setLiveHeroes(nextLiveHeroes);
      } catch (error) {
        if (cancelled) return;
        console.error('[HeroSection] Failed to load live hero data:', error);
        setLiveHeroes([]);
      }
    };

    const loadUpcomingData = async () => {
      try {
        const upcomingResponse = await fetch(buildHeroUpcomingApiUrl());
        if (!upcomingResponse.ok) {
          throw new Error(`Upcoming HTTP ${upcomingResponse.status}`);
        }

        const upcomingPayload = await upcomingResponse.json();
        if (cancelled) return;

        setLazyUpcoming(Array.isArray(upcomingPayload?.upcoming) ? upcomingPayload.upcoming : []);
        setLazyTeams(Array.isArray(upcomingPayload?.teams) ? upcomingPayload.teams : []);
      } catch (error) {
        if (cancelled) return;
        console.error('[HeroSection] Failed to load upcoming hero data:', error);
        setLazyUpcoming(upcoming);
        setLazyTeams(teams);
      }
    };

    void loadLiveHeroData();
    void loadUpcomingData();

    return () => {
      cancelled = true;
    };
  }, [teams, upcoming]);

  const effectiveTeams = lazyTeams.length > 0 ? lazyTeams : teams;
  const effectiveUpcoming = lazyUpcoming.length > 0 ? lazyUpcoming : upcoming;
  const sortedLiveHeroes = useMemo(() => sortLiveHeroesForDisplay(liveHeroes), [liveHeroes]);
  const primaryLiveHero = sortedLiveHeroes[0] || null;
  const getTeamLogo = (teamName?: string | null, explicitLogo?: string | null) =>
    resolveTeamLogo({ name: teamName }, effectiveTeams, explicitLogo);
  const isChineseTeam = (team?: { teamId?: string | null; name?: string | null } | string | null) =>
    isTeamInRegion(team || null, effectiveTeams, ['China']);

  const scrollToTournaments = () => {
    document.querySelector('#tournaments')?.scrollIntoView({ behavior: 'smooth' });
  };

  const now = Math.floor(Date.now() / 1000);
  const tomorrow = now + 24 * 3600;

  const cnMatches = useMemo(
    () => effectiveUpcoming
      .filter((m) => m.start_time >= now && m.start_time <= tomorrow && (
        isChineseTeam({ teamId: m.radiant_team_id, name: m.radiant_team_name }) ||
        isChineseTeam({ teamId: m.dire_team_id, name: m.dire_team_name })
      ))
      .sort((a, b) => a.start_time - b.start_time)
      .slice(0, 4),
    [effectiveUpcoming, now]
  );

  const getMatchLayout = (match: Match) => {
    const radiantIsCN = isChineseTeam({ teamId: match.radiant_team_id, name: match.radiant_team_name });
    const direIsCN = isChineseTeam({ teamId: match.dire_team_id, name: match.dire_team_name });
    if (radiantIsCN && !direIsCN) {
      return {
        top: match.radiant_team_name,
        bottom: match.dire_team_name,
        topLogo: match.radiant_team_logo,
        bottomLogo: match.dire_team_logo,
        topIsCN: true,
      };
    }
    if (direIsCN && !radiantIsCN) {
      return {
        top: match.dire_team_name,
        bottom: match.radiant_team_name,
        topLogo: match.dire_team_logo,
        bottomLogo: match.radiant_team_logo,
        topIsCN: true,
      };
    }
    return {
      top: match.radiant_team_name,
      bottom: match.dire_team_name,
      topLogo: match.radiant_team_logo,
      bottomLogo: match.dire_team_logo,
      topIsCN: radiantIsCN,
    };
  };

  const selectMap = (cardKey: string, mapLabel: string) => {
    setSelectedMapKeys((current) => ({
      ...current,
      [cardKey]: mapLabel,
    }));
  };

  const parseMapScore = (map?: LiveHeroPayload['maps'][number] | LiveHeroPayload['liveMap'] | null) => {
    if (map?.team1Score != null || map?.team2Score != null) {
      return {
        team1: map?.team1Score ?? null,
        team2: map?.team2Score ?? null,
      };
    }
    const score = map?.score;
    if (!score) return { team1: null, team2: null };
    const match = score.match(/(\d+)\s*-\s*(\d+)/);
    if (!match) return { team1: null, team2: null };
    return {
      team1: Number(match[1]),
      team2: Number(match[2]),
    };
  };

  return (
    <section className="relative min-h-[88vh] sm:min-h-screen flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-slate-950">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-red-900/30 via-slate-950 to-slate-950" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-600/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-orange-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 text-center w-full">
        <div className="flex flex-wrap justify-center gap-2 mb-4">
          <Badge className="px-3 py-1.5 bg-gradient-to-r from-red-600/20 to-orange-500/20 text-red-400 border border-red-500/30 text-xs font-bold shadow-[0_0_20px_rgba(239,68,68,0.3)]">
            <TrendingUp className="w-3 h-3 mr-1" />2026赛季
          </Badge>
          <Badge className="px-3 py-1.5 bg-gradient-to-r from-yellow-600/20 to-amber-500/20 text-yellow-400 border border-yellow-500/30 text-xs font-bold">
            <Star className="w-3 h-3 mr-1" />TI15
          </Badge>
        </div>

        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-3 sm:mb-4">
          <span className="text-white">DOTA2 </span>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-orange-500 to-amber-500 drop-shadow-[0_0_30px_rgba(239,68,68,0.5)]">Pro Hub</span>
        </h1>

        <p className="text-xs sm:text-sm text-slate-300 mb-6 sm:mb-8 px-2 sm:px-4 max-w-xl mx-auto">专业的DOTA2战报与赛事预测平台</p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-10">
          <Button size="sm" className="bg-gradient-to-r from-red-600 to-orange-600 text-white shadow-[0_0_20px_rgba(239,68,68,0.3)] hover:shadow-[0_0_30px_rgba(239,68,68,0.5)] transition-all" onClick={scrollToTournaments}>
            <Trophy className="w-4 h-4 mr-2" />赛事战报
          </Button>
          <Button size="sm" variant="outline" className="border-white/20 text-slate-300 hover:bg-white/10" onClick={() => document.querySelector('#upcoming')?.scrollIntoView({ behavior: 'smooth' })}>
            <Calendar className="w-4 h-4 mr-2" />赛事预告
          </Button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 max-w-lg mx-auto mb-6 sm:mb-8">
          {[
            { value: '3', label: '中国战队', color: 'from-red-500 to-orange-500' },
            { value: sortedLiveHeroes.length > 0 ? String(sortedLiveHeroes.length) : '13+', label: sortedLiveHeroes.length > 0 ? 'LIVE 对局' : 'T1赛事', color: 'from-purple-500 to-pink-500' },
            { value: '$13M', label: '奖金池', color: 'from-yellow-500 to-amber-500' },
            { value: '实时', label: '更新', color: 'from-green-500 to-emerald-500' },
          ].map((stat, i) => (
            <div key={i} className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-2.5 sm:p-3 hover:border-white/20 hover:shadow-[0_0_20px_rgba(255,255,255,0.1)] transition-all">
              <div className={`text-lg sm:text-xl font-bold bg-gradient-to-r ${stat.color} bg-clip-text text-transparent`}>{stat.value}</div>
              <div className="text-[10px] sm:text-[11px] text-slate-400">{stat.label}</div>
            </div>
          ))}
        </div>

        {(primaryLiveHero || cnMatches.length > 0) && (
          <div className="max-w-6xl mx-auto">
            {primaryLiveHero && (
              <div className="space-y-3 mb-4">
                <div className="flex items-center justify-between text-left">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-red-300/80">Hero 实时比分</p>
                    <h2 className="text-lg sm:text-xl font-bold text-white mt-1">直播对局</h2>
                  </div>
                  <Badge className="bg-red-500/15 text-red-200 border border-red-400/30">{sortedLiveHeroes.length} 场</Badge>
                </div>

                <div className="grid gap-3 md:grid-cols-2" data-testid="hero-live-grid">
                  {sortedLiveHeroes.map((liveHero) => {
                    const teams = liveHero.teams || [];
                    const cardKey = `${liveHero.sourceUrl || liveHero.leagueName}-${teams[0]?.name || ''}-${teams[1]?.name || ''}`;
                    const selectedMapLabel = selectedMapKeys[cardKey];
                    const selectedMap = liveHero.maps.find((map) => map.label === selectedMapLabel)
                      || liveHero.liveMap
                      || liveHero.maps[0]
                      || null;
                    const selectedMapScore = parseMapScore(selectedMap);
                    const selectedWinner = getCompletedMapWinner(selectedMap && selectedMap.status === 'completed' ? selectedMap : null);
                    const scoreTone = selectedMap?.status === 'live' ? 'text-emerald-300' : 'text-white';
                    const selectedDuration = formatGameTime(selectedMap?.gameTime ?? null);
                    return (
                      <Card
                        key={cardKey}
                        data-testid="hero-live-card"
                        className="h-full text-left bg-gradient-to-br from-red-950/35 via-slate-900/90 to-slate-950/95 backdrop-blur-2xl border border-red-500/20 shadow-[0_0_35px_rgba(239,68,68,0.12)] overflow-hidden"
                      >
                        <CardContent className="h-full p-3 grid grid-rows-[auto_auto_1fr_auto] gap-3">
                          <div className="flex min-h-[4.25rem] items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-1.5">
                                <Badge className="bg-red-500/20 text-red-300 border border-red-400/40">
                                  <Radio className="w-3 h-3 mr-1 animate-pulse" />LIVE
                                </Badge>
                                <Badge variant="outline" className="border-white/15 text-slate-300 bg-white/5">{formatBestOf(liveHero.bestOf)}</Badge>
                              </div>
                              <h3 className="line-clamp-2 text-sm font-bold text-white leading-tight">{liveHero.leagueName}</h3>
                            </div>
                            <div className="w-20 shrink-0 text-right">
                              <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Series</p>
                              <div className="text-lg font-black text-white">{liveHero.seriesScore}</div>
                            </div>
                          </div>

                          <div className="space-y-2">
                            {teams.map((team, index) => {
                              const teamKey = `team${index + 1}` as 'team1' | 'team2';
                              const liveLead = teamKey === 'team1'
                                ? formatNetWorthLead(selectedMap?.team1NetWorthLead ?? liveHero.liveMap?.team1NetWorthLead)
                                : formatNetWorthLead(selectedMap?.team2NetWorthLead ?? liveHero.liveMap?.team2NetWorthLead);
                              const completedLead = teamKey === 'team1'
                                ? formatNetWorthLead(selectedMap?.team1NetWorthLead)
                                : formatNetWorthLead(selectedMap?.team2NetWorthLead);
                              const teamMeta = selectedMap?.status === 'live'
                                ? (liveLead ? <span className="text-emerald-300">{liveLead}</span> : null)
                                : selectedWinner
                                  ? (
                                    <span className={selectedWinner === teamKey ? 'text-amber-300' : 'text-slate-500'}>
                                      {selectedWinner === teamKey
                                        ? `胜利方${completedLead ? ` · 终盘${completedLead}` : ''}`
                                        : '失利方'}
                                    </span>
                                  )
                                  : <span className="text-slate-500">已结束</span>;
                              return (
                                <div key={`${team.side}-${team.name}`} className="grid min-h-[3.75rem] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
                                  <div className="flex min-w-0 items-center gap-2">
                                    {getTeamLogo(team.name, team.logo) ? (
                                      <img src={getTeamLogo(team.name, team.logo)} alt="" decoding="async" fetchPriority="high" className="w-8 h-8 object-contain rounded-full bg-white/5 p-1" />
                                    ) : (
                                      <div className="w-8 h-8 rounded-full bg-slate-800" />
                                    )}
                                    <div className="min-w-0">
                                      <div className="text-sm font-semibold text-white truncate">{team.name}</div>
                                      <div className="min-h-[1rem] text-[11px] font-semibold">{teamMeta}</div>
                                    </div>
                                  </div>
                                  <div className="w-12 text-right">
                                    {selectedMap && (
                                      <span className={`text-sm font-bold ${scoreTone}`}>
                                        {index === 0 ? selectedMapScore.team1 : selectedMapScore.team2}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                            {selectedMap?.label && (
                              <Badge variant="outline" className={`border-white/10 bg-white/[0.04] ${selectedMap.status === 'live' ? 'text-emerald-200 border-emerald-400/30 bg-emerald-500/10' : 'text-slate-200'}`}>
                                {selectedMap.label}
                              </Badge>
                            )}
                            {selectedDuration && (
                              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-slate-300">
                                <Clock3 className="h-3 w-3" />
                                时长 {selectedDuration}
                              </span>
                            )}
                          </div>

                          <div className="grid auto-rows-fr grid-cols-3 gap-2" data-testid="hero-live-maps">
                            {liveHero.maps.map((map) => {
                              const isSelected = selectedMap?.label === map.label;
                              return (
                                <button
                                  key={`${cardKey}-${map.label}`}
                                  type="button"
                                  aria-pressed={isSelected}
                                  className={`h-full rounded-2xl border px-2.5 py-2 text-left transition-colors ${
                                    isSelected
                                      ? 'border-red-400/50 bg-red-500/10 shadow-[0_0_20px_rgba(239,68,68,0.12)]'
                                      : map.status === 'live'
                                        ? 'border-emerald-500/40 bg-emerald-500/10'
                                        : 'border-white/10 bg-white/5'
                                  }`}
                                  onClick={() => selectMap(cardKey, map.label)}
                                >
                                  <div className="flex flex-col gap-1">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-100">{map.label}</span>
                                      {map.status === 'live' && <span className="text-[10px] font-bold text-emerald-300">LIVE</span>}
                                    </div>
                                    <span className="text-[10px] text-slate-500">
                                      {map.status === 'completed' ? '点击查看比分' : '进行中'}
                                    </span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>

                          {liveHero.sourceUrl && (
                            <div className="text-[11px] text-slate-500">
                              <a className="text-red-300 hover:text-red-200" href={liveHero.sourceUrl} target="_blank" rel="noreferrer">打开比分页</a>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {cnMatches.length > 0 && (
              <div className="max-w-5xl mx-auto w-full">
                  <div className="flex items-center justify-center gap-3 mb-4">
                    <Flame className="w-5 h-5 text-red-400 animate-pulse" />
                    <span className="text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-orange-400">中国战队预告</span>
                    <div className="flex items-center gap-2 ml-2">
                      <span className="text-xs text-slate-500">{showCountdown ? '倒计时' : '时间'}</span>
                      <Switch checked={showCountdown} onCheckedChange={setShowCountdown} className="data-[state=checked]:bg-red-600 h-4 w-7" />
                    </div>
                  </div>

                  <div className={`grid grid-cols-1 ${primaryLiveHero ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-4'} gap-3`}>
                    {cnMatches.map((match) => {
                      const layout = getMatchLayout(match);
                      return (
                        <Card key={match.id} className="bg-gradient-to-br from-slate-900/80 to-slate-900/60 backdrop-blur-xl border border-white/10 hover:border-red-500/40 hover:shadow-[0_0_30px_rgba(239,68,68,0.2)] hover:-translate-y-1 transition-all duration-300 overflow-hidden">
                          <CardContent className="p-0">
                            <div className="relative">
                              <div className="absolute inset-0 bg-gradient-to-r from-red-600/10 to-orange-600/5" />
                              <div className="relative flex items-center justify-between px-3 py-2">
                                <span className="text-[10px] text-slate-400 font-medium">{getMatchSection(match)}</span>
                                <span className={`text-xs font-bold ${showCountdown ? 'text-amber-400' : 'text-blue-400'}`}>
                                  {showCountdown ? formatCountdown(match.start_time) : formatCSTTime(match.start_time)}
                                </span>
                              </div>
                            </div>

                            <div className="px-3 py-2">
                              <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500 truncate mb-2">{match.tournament_name_cn || match.tournament_name}</div>
                              <div className={`flex items-center gap-2 py-1.5 border-b border-white/5 ${layout.topIsCN ? 'text-red-400' : ''}`}>
                                {getTeamLogo(layout.top, layout.topLogo) ? <img src={getTeamLogo(layout.top, layout.topLogo)} alt="" className="w-5 h-5 object-contain" /> : <div className="w-5 h-5 bg-slate-700 rounded" />}
                                <span className="text-sm font-bold truncate">{renderTeamName(layout.top)}</span>
                              </div>
                              <div className="flex items-center gap-2 py-1.5">
                                {getTeamLogo(layout.bottom, layout.bottomLogo) ? <img src={getTeamLogo(layout.bottom, layout.bottomLogo)} alt="" className="w-5 h-5 object-contain" /> : <div className="w-5 h-5 bg-slate-700 rounded" />}
                                <span className="text-sm font-bold text-white truncate">{renderTeamName(layout.bottom)}</span>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              )}
          </div>
        )}

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 animate-bounce">
          <ArrowDown className="w-5 h-5 text-slate-500" />
        </div>
      </div>
    </section>
  );
}
