import { useEffect, useMemo, useRef, useState } from 'react';
import { Flame, Radio } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { SafeImg } from '@/components/custom/SafeImg';
import { isTeamInRegion, resolveTeamLogo } from '@/lib/teams';
import type { TeamLike } from '@/lib/teams';
import { aggregateMatchesBySeries } from '@/lib/seriesAggregation';

interface Match {
  id: number | string;
  match_id: number | string;
  series_id?: string | number | null;
  seriesId?: string | number | null;
  map_number?: string | number | null;
  mapNumber?: string | number | null;
  game_number?: string | number | null;
  gameNumber?: string | number | null;
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

export interface LiveHeroPayload {
  source: string;
  sourceUrl?: string | null;
  leagueName: string;
  stage?: string | null;
  bestOf?: string | number | null;
  seriesScore: string;
  seriesScoreBreakdown?: {
    team1?: number | null;
    team2?: number | null;
  } | null;
  live: boolean;
  startedAt?: string | number | null;
  teams: Array<{
    side: 'team1' | 'team2';
    name: string;
    logo?: string | null;
  }>;
  maps: Array<{
    matchId?: string | number | null;
    label: string;
    score?: string | null;
    status: 'completed' | 'live';
    result?: 'team1' | 'team2' | null;
    team1Score?: number | null;
    team2Score?: number | null;
    team1NetWorthLead?: number | null;
    team2NetWorthLead?: number | null;
    team1TotalGold?: number | null;
    team2TotalGold?: number | null;
    gameTime?: number | null;
  }>;
  liveMap?: {
    matchId?: string | number | null;
    label: string;
    score: string;
    status: 'live';
    gameTime?: number | null;
    team1Score?: number | null;
    team2Score?: number | null;
    team1NetWorthLead?: number | null;
    team2NetWorthLead?: number | null;
    team1TotalGold?: number | null;
    team2TotalGold?: number | null;
  } | null;
}

const EMPTY_HERO_UPCOMING: Match[] = [];
const EMPTY_HERO_TEAMS: TeamLike[] = [];

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

function parseSeriesScore(payload: LiveHeroPayload) {
  if (payload.seriesScoreBreakdown) {
    return {
      team1: payload.seriesScoreBreakdown.team1 ?? 0,
      team2: payload.seriesScoreBreakdown.team2 ?? 0,
    };
  }

  const match = String(payload.seriesScore || '').match(/(\d+)\s*[:-]\s*(\d+)/);
  if (!match) {
    return { team1: 0, team2: 0 };
  }

  return {
    team1: Number(match[1]) || 0,
    team2: Number(match[2]) || 0,
  };
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

function compareLiveHeroesForDisplay(a: LiveHeroPayload, b: LiveHeroPayload) {
  const aStart = toSortTimestamp(a.startedAt);
  const bStart = toSortTimestamp(b.startedAt);
  if (aStart !== bStart) return aStart - bStart;
  const aLeague = String(a.leagueName || '');
  const bLeague = String(b.leagueName || '');
  if (aLeague !== bLeague) return aLeague.localeCompare(bLeague);
  const aTeams = (a.teams || []).map((team) => team.name).join(' vs ');
  const bTeams = (b.teams || []).map((team) => team.name).join(' vs ');
  return aTeams.localeCompare(bTeams);
}

function sortLiveHeroesForDisplay(items: LiveHeroPayload[]) {
  return [...items].sort(compareLiveHeroesForDisplay);
}

function getLiveHeroCardKey(liveHero: LiveHeroPayload) {
  const teams = liveHero.teams || [];
  return `${liveHero.sourceUrl || liveHero.leagueName}-${teams[0]?.name || ''}-${teams[1]?.name || ''}`;
}

function mergeLiveHeroesForDisplay(current: LiveHeroPayload[], next: LiveHeroPayload[]) {
  if (current.length === 0) {
    return sortLiveHeroesForDisplay(next);
  }

  const previousOrder = new Map(
    current.map((item, index) => [getLiveHeroCardKey(item), index])
  );

  return [...next].sort((a, b) => {
    const aPreviousIndex = previousOrder.get(getLiveHeroCardKey(a));
    const bPreviousIndex = previousOrder.get(getLiveHeroCardKey(b));
    const aHasPreviousIndex = aPreviousIndex !== undefined;
    const bHasPreviousIndex = bPreviousIndex !== undefined;

    if (aHasPreviousIndex && bHasPreviousIndex && aPreviousIndex !== bPreviousIndex) {
      return aPreviousIndex - bPreviousIndex;
    }
    if (aHasPreviousIndex !== bHasPreviousIndex) {
      return aHasPreviousIndex ? -1 : 1;
    }

    return compareLiveHeroesForDisplay(a, b);
  });
}

const HERO_DEFAULT_DAYS = 1;
const HERO_LIVE_POLL_INTERVAL_MS = 3000;
const HERO_LIVE_EMPTY_GRACE_POLLS = 2;
const HERO_LIVE_PARTIAL_MISSING_GRACE_POLLS = 2;

function mergeLiveHeroesWithTransientGrace(
  current: LiveHeroPayload[],
  next: LiveHeroPayload[],
  missingPollsByKey: Record<string, number>,
) {
  if (current.length === 0) {
    for (const key of Object.keys(missingPollsByKey)) delete missingPollsByKey[key];
    return sortLiveHeroesForDisplay(next);
  }

  const nextByKey = new Map(next.map((item) => [getLiveHeroCardKey(item), item]));
  const currentByKey = new Map(current.map((item) => [getLiveHeroCardKey(item), item]));

  for (const key of nextByKey.keys()) {
    delete missingPollsByKey[key];
  }

  const merged = [...next];
  for (const [key, item] of currentByKey.entries()) {
    if (nextByKey.has(key)) continue;
    const missCount = (missingPollsByKey[key] || 0) + 1;
    if (missCount <= HERO_LIVE_PARTIAL_MISSING_GRACE_POLLS) {
      missingPollsByKey[key] = missCount;
      merged.push(item);
    } else {
      delete missingPollsByKey[key];
    }
  }

  for (const key of Object.keys(missingPollsByKey)) {
    if (!nextByKey.has(key) && !currentByKey.has(key)) {
      delete missingPollsByKey[key];
    }
  }

  return mergeLiveHeroesForDisplay(current, merged);
}

function buildHeroUpcomingApiUrl(days: number = HERO_DEFAULT_DAYS): string {
  const params = new URLSearchParams({ days: String(days) });
  return `/api/upcoming?${params.toString()}`;
}

function buildHeroLiveApiUrl(): string {
  return '/api/live-hero';
}

export function HeroSection({
  upcoming = EMPTY_HERO_UPCOMING,
  teams = EMPTY_HERO_TEAMS,
  onOpenMatch,
  onOpenTeam,
  initialLiveHeroes,
  prototypeMode = false,
}: {
  upcoming?: Match[];
  teams?: TeamLike[];
  onOpenMatch?: (matchId: number | string, seriesMaps?: Array<{
    label: string;
    matchId: string;
    radiantScore?: number;
    direScore?: number;
    duration?: number;
  }>) => void;
  onOpenTeam?: (teamName: string) => void;
  initialLiveHeroes?: LiveHeroPayload[];
  prototypeMode?: boolean;
}) {
  const [showCountdown, setShowCountdown] = useState(true);
  const [lazyUpcoming, setLazyUpcoming] = useState<Match[]>([]);
  const [lazyTeams, setLazyTeams] = useState<TeamLike[]>([]);
  const [liveHeroes, setLiveHeroes] = useState<LiveHeroPayload[]>(
    initialLiveHeroes ? sortLiveHeroesForDisplay(initialLiveHeroes) : []
  );
  const [selectedMapKeys, setSelectedMapKeys] = useState<Record<string, string>>({});
  const transientEmptyLivePollsRef = useRef(0);
  const transientMissingLiveCardsRef = useRef<Record<string, number>>({});
  const hasReceivedRealLiveDataRef = useRef(false);

  useEffect(() => {
    if (prototypeMode) return;

    let cancelled = false;

    const keepCurrentLiveHeroesOnTransientFailure = (current: LiveHeroPayload[]) => {
      if (current.length === 0) return [];

      transientEmptyLivePollsRef.current += 1;
      if (transientEmptyLivePollsRef.current <= HERO_LIVE_EMPTY_GRACE_POLLS) {
        return current;
      }

      transientEmptyLivePollsRef.current = 0;
      return [];
    };

    const loadLiveHeroData = async ({ preserveOnTransientFailure = false } = {}) => {
      try {
        const liveResponse = await fetch(buildHeroLiveApiUrl(), { cache: 'no-store' });
        const livePayload = liveResponse.ok ? await liveResponse.json() : { live: null };
        if (cancelled) return;

        const nextLiveHeroes = Array.isArray(livePayload?.liveMatches)
          ? livePayload.liveMatches
          : livePayload?.live
            ? [livePayload.live]
            : [];

        if (nextLiveHeroes.length > 0) {
          hasReceivedRealLiveDataRef.current = true;
          transientEmptyLivePollsRef.current = 0;
          setLiveHeroes((current) => mergeLiveHeroesWithTransientGrace(
            current,
            nextLiveHeroes,
            transientMissingLiveCardsRef.current,
          ));
          return;
        }

        setLiveHeroes((current) => {
          // Keep initial data if API hasn't returned real live data yet
          if (!preserveOnTransientFailure && !hasReceivedRealLiveDataRef.current && current.length > 0) {
            return current;
          }
          if (!preserveOnTransientFailure) return [];
          return keepCurrentLiveHeroesOnTransientFailure(current);
        });
      } catch (error) {
        if (cancelled) return;
        console.error('[HeroSection] Failed to load live hero data:', error);
        setLiveHeroes((current) => {
          // Keep initial data if API hasn't returned real live data yet
          if (!preserveOnTransientFailure && !hasReceivedRealLiveDataRef.current && current.length > 0) {
            return current;
          }
          if (!preserveOnTransientFailure) return [];
          return keepCurrentLiveHeroesOnTransientFailure(current);
        });
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

    const livePollTimer = window.setInterval(() => {
      if (document.hidden) return;
      void loadLiveHeroData({ preserveOnTransientFailure: true });
    }, HERO_LIVE_POLL_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.hidden) return;
      void loadLiveHeroData({ preserveOnTransientFailure: true });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(livePollTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [teams, upcoming, prototypeMode]);

  const effectiveTeams = lazyTeams.length > 0 ? lazyTeams : teams;
  const effectiveUpcoming = lazyUpcoming.length > 0 ? lazyUpcoming : upcoming;
  const sortedLiveHeroes = liveHeroes;
  const displayedLiveHeroes = sortedLiveHeroes.slice(0, 3);
  const primaryLiveHero = sortedLiveHeroes[0] || null;
  const getTeamLogo = (teamName?: string | null, explicitLogo?: string | null) =>
    resolveTeamLogo({ name: teamName }, effectiveTeams, explicitLogo);
  const isChineseTeam = (team?: { teamId?: string | null; name?: string | null } | string | null) =>
    isTeamInRegion(team || null, effectiveTeams, ['China']);

  const now = Math.floor(Date.now() / 1000);
  const tomorrow = now + 24 * 3600;

  const cnSeries = useMemo(
    () => aggregateMatchesBySeries(effectiveUpcoming
      .filter((m) => m.start_time >= now && m.start_time <= tomorrow && (
        isChineseTeam({ teamId: m.radiant_team_id, name: m.radiant_team_name }) ||
        isChineseTeam({ teamId: m.dire_team_id, name: m.dire_team_name })
      ))
      .sort((a, b) => a.start_time - b.start_time))
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
    <section className="relative overflow-hidden">
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 w-full">

        {(primaryLiveHero || cnSeries.length > 0) && (
          <div className="max-w-6xl mx-auto">
            {primaryLiveHero && (
              <div className="space-y-3 mb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {/* Mobile: "LIVE · X场进行中" (< 1024px) */}
                    <span className="inline-flex items-center gap-2 lg:hidden">
                      <span className="text-base font-bold text-red-400">LIVE</span>
                      <span className="text-slate-500">·</span>
                      <span className="text-sm text-slate-300">{sortedLiveHeroes.length}场进行中</span>
                    </span>
                    {/* Desktop: "● 正在进行 · X场比赛进行中" (>= 1024px) */}
                    <span className="hidden lg:inline-flex items-center gap-1.5 text-sm font-bold text-white">
                      <span className="inline-block size-2 rounded-full bg-red-500 animate-pulse" />
                      正在进行
                    </span>
                    <span className="hidden lg:inline text-slate-500">·</span>
                    <span className="hidden lg:inline text-sm text-slate-400">{sortedLiveHeroes.length}场比赛进行中</span>
                  </div>
                  <button type="button" className="text-xs text-slate-400 hover:text-red-300 transition-colors">
                    <span className="lg:hidden">全部直播 &gt;</span>
                    <span className="hidden lg:inline">查看全部直播 →</span>
                  </button>
                </div>

                <div className="grid auto-cols-[86%] grid-flow-col gap-3 overflow-x-auto pb-1 md:auto-cols-auto md:grid-flow-row md:grid-cols-2 md:overflow-visible lg:grid-cols-3" data-testid="hero-live-grid">
                  {displayedLiveHeroes.map((liveHero, heroIdx) => {
                    const isOddLast = displayedLiveHeroes.length % 2 !== 0 && heroIdx === displayedLiveHeroes.length - 1;
                    const teams = liveHero.teams || [];
                    const cardKey = getLiveHeroCardKey(liveHero);
                    const selectedMapLabel = selectedMapKeys[cardKey];
                    const selectedMap = liveHero.maps.find((map) => map.label === selectedMapLabel)
                      || liveHero.liveMap
                      || liveHero.maps[0]
                      || null;
                    const selectedMapScore = parseMapScore(selectedMap);
                    const scoreTone = selectedMap?.status === 'live' ? 'text-emerald-300' : 'text-white';
                    const selectedDuration = formatGameTime(selectedMap?.gameTime ?? null);
                    const { team1: scoreLeft, team2: scoreRight } = parseSeriesScore(liveHero);
                    const liveSeriesMaps = liveHero.maps
                      .filter((map) => map.matchId !== null && map.matchId !== undefined)
                      .map((map) => ({
                        label: map.label,
                        matchId: String(map.matchId),
                        radiantScore: map.team1Score ?? undefined,
                        direScore: map.team2Score ?? undefined,
                        duration: map.gameTime ?? undefined,
                      }));
                    return (
                      <Card
                        key={cardKey}
                        data-testid="hero-live-card"
                        className={`overflow-hidden rounded-xl border border-white/10 bg-slate-900/90 text-left${isOddLast ? ' md:col-span-2 lg:col-span-1' : ''}`}
                      >
                        <CardContent className="p-0">
                          {/* Header: LIVE + league + stage */}
                          <div className="flex items-center gap-2 border-b border-white/8 px-3 py-2">
                            <Badge className="gap-1 bg-red-600 px-1.5 py-0.5 text-[10px] text-white">
                              <Radio className="h-2.5 w-2.5 animate-pulse" />
                              LIVE
                            </Badge>
                            <span className="flex-1 truncate text-xs font-medium text-slate-300">{liveHero.leagueName}</span>
                            <span className="shrink-0 text-[10px] text-slate-500">{liveHero.stage || '小组赛'}</span>
                          </div>

                          {/* Team logo row */}
                          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 pt-4 pb-1">
                            <div className="flex justify-center">
                              <SafeImg
                                src={getTeamLogo(teams[0]?.name, teams[0]?.logo)}
                                className="size-11 object-contain"
                                fallback={<div className="size-11 rounded-full bg-slate-800" />}
                              />
                            </div>
                            <div className="flex min-w-[4.5rem] items-center justify-center gap-1">
                              <span className={`text-2xl font-black ${scoreLeft > scoreRight ? 'text-green-400' : scoreLeft < scoreRight ? 'text-slate-400' : 'text-green-400'}`}>{scoreLeft}</span>
                              <span className="text-lg font-light text-slate-500">:</span>
                              <span className={`text-2xl font-black ${scoreRight > scoreLeft ? 'text-green-400' : scoreRight < scoreLeft ? 'text-slate-400' : 'text-green-400'}`}>{scoreRight}</span>
                            </div>
                            <div className="flex justify-center">
                              <SafeImg
                                src={getTeamLogo(teams[1]?.name, teams[1]?.logo)}
                                className="size-11 object-contain"
                                fallback={<div className="size-11 rounded-full bg-slate-800" />}
                              />
                            </div>
                          </div>

                          {/* Name row: team1 abbr | BO badge | team2 abbr */}
                          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 pb-3">
                            <button
                              type="button"
                              className="text-center text-xs font-bold text-white hover:text-red-300 transition-colors"
                              onClick={() => onOpenTeam?.(teams[0]?.name)}
                            >
                              {getAbbr(teams[0]?.name) || teams[0]?.name}
                            </button>
                            <Badge variant="outline" className="border-white/20 px-1.5 text-[10px] text-slate-400">
                              {formatBestOf(liveHero.bestOf)}
                            </Badge>
                            <button
                              type="button"
                              className="text-center text-xs font-bold text-white hover:text-red-300 transition-colors"
                              onClick={() => onOpenTeam?.(teams[1]?.name)}
                            >
                              {getAbbr(teams[1]?.name) || teams[1]?.name}
                            </button>
                          </div>

                          {/* Kills + game time row */}
                          <div className="flex items-center justify-between px-4 pb-2 text-sm" data-testid="hero-live-maps">
                            <span className={`w-8 text-center font-bold ${scoreTone}`}>
                              {selectedMapScore.team1 ?? '—'}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              {selectedMap?.label
                                ? selectedMap.label.replace(/Map\s*(\d+)/i, '地图 $1')
                                : '地图'}{selectedDuration ? ` · ${selectedDuration}` : (selectedMap?.status === 'live' ? ' · 进行中' : '')}
                            </span>
                            <span className={`w-8 text-center font-bold ${scoreTone}`}>
                              {selectedMapScore.team2 ?? '—'}
                            </span>
                          </div>

                          {/* Gold totals + net worth lead row */}
                          {(() => {
                            const lead = selectedMap?.team1NetWorthLead ?? null;
                            const t1g = selectedMap?.team1TotalGold ?? null;
                            const t2g = selectedMap?.team2TotalGold ?? null;
                            if (!lead && !t1g && !t2g) return null;
                            const absK = lead ? (Math.abs(lead) / 1000).toFixed(1) : null;
                            const sign = lead && lead > 0 ? '▲' : '▼';
                            const leadCls = lead && lead > 0 ? 'text-emerald-400' : 'text-red-400';
                            return (
                              <div className="flex items-center justify-between px-4 pb-3 text-[11px]">
                                <span className="text-slate-400">
                                  <span className="text-amber-500">●</span> {t1g ? `${(t1g / 1000).toFixed(1)}k` : '—'}
                                </span>
                                {absK ? (
                                  <span className={`font-semibold ${leadCls}`}>{sign} {absK}k</span>
                                ) : <span />}
                                <span className="text-slate-400">
                                  <span className="text-amber-500">●</span> {t2g ? `${(t2g / 1000).toFixed(1)}k` : '—'}
                                </span>
                              </div>
                            );
                          })()}

                          {/* Map tabs row */}
                          {(() => {
                            const selIdx = liveHero.maps.findIndex(m => m.label === (selectedMapLabel || liveHero.liveMap?.label));
                            const resolvedIdx = selIdx >= 0 ? selIdx : 0;
                            const boNum = typeof liveHero.bestOf === 'number' ? liveHero.bestOf : parseInt(String(liveHero.bestOf || '').replace(/bo/i, ''), 10);
                            const boTotal = Number.isFinite(boNum) && boNum > 0 ? boNum : liveHero.maps.length;
                            return (
                              <>
                                {/* Mobile: "Map X / Y ● ─ ─" progress (< 1024px) */}
                                <div className="flex items-center gap-2 border-t border-white/8 px-3 py-2.5 lg:hidden">
                                  <span className="text-[11px] font-medium text-slate-300">Map {resolvedIdx + 1} / {boTotal}</span>
                                  <div className="flex items-center gap-1">
                                    {Array.from({ length: boTotal }).map((_, idx) => (
                                      <span key={idx} className={idx === resolvedIdx ? 'inline-block size-1.5 rounded-full bg-red-500' : 'inline-block h-px w-3 rounded-full bg-slate-600'} />
                                    ))}
                                  </div>
                                </div>
                                {/* Desktop: text tabs (>= 1024px) */}
                                <div className="hidden lg:flex items-stretch border-t border-white/8">
                                  {Array.from({ length: boTotal }).map((_, mapIdx) => {
                                    const map = liveHero.maps[mapIdx];
                                    const isSelected = map ? map.label === (selectedMapLabel || liveHero.liveMap?.label) : false;
                                    const isLive = map?.status === 'live';
                                    return (
                                      <button
                                        key={`${cardKey}-map-${mapIdx}`}
                                        type="button"
                                        className={`flex flex-1 items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                                          isSelected
                                            ? isLive ? 'bg-red-600/20 text-red-400 border-t-2 border-red-500' : 'bg-slate-800/60 text-white border-t-2 border-slate-500'
                                            : map ? 'text-slate-500 hover:text-slate-300' : 'text-slate-700 cursor-default'
                                        }`}
                                        onClick={() => {
                                          if (map) {
                                            selectMap(cardKey, map.label);
                                            if (map.matchId) onOpenMatch?.(map.matchId as string | number, liveSeriesMaps);
                                          }
                                        }}
                                      >
                                        Map {mapIdx + 1}
                                      </button>
                                    );
                                  })}
                                </div>
                              </>
                            );
                          })()}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {cnSeries.length > 0 && (
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
                    {cnSeries.map((series) => {
                      const match = series.primaryMatch;
                      const layout = getMatchLayout(match);
                      return (
                        <Card key={series.key} data-testid="hero-upcoming-series-card" className="bg-gradient-to-br from-slate-900/80 to-slate-900/60 backdrop-blur-xl border border-white/10 hover:border-red-500/40 hover:shadow-[0_0_30px_rgba(239,68,68,0.2)] hover:-translate-y-1 transition-all duration-300 overflow-hidden">
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
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500 truncate">{match.tournament_name_cn || match.tournament_name}</div>
                                <Badge variant="outline" className="shrink-0 border-white/10 bg-white/[0.04] text-[10px] text-slate-300">{formatBestOf(match.series_type)}</Badge>
                              </div>
                              <div className={`flex items-center gap-2 py-1.5 border-b border-white/5 ${layout.topIsCN ? 'text-red-400' : ''}`}>
                                <SafeImg src={getTeamLogo(layout.top, layout.topLogo)} className="w-5 h-5 object-contain" fallback={<div className="w-5 h-5 bg-slate-700 rounded" />} />
                                <button type="button" className="text-sm font-bold truncate hover:text-red-300 transition-colors text-left" onClick={() => onOpenTeam?.(layout.top)}>{renderTeamName(layout.top)}</button>
                              </div>
                              <div className="flex items-center gap-2 py-1.5">
                                <SafeImg src={getTeamLogo(layout.bottom, layout.bottomLogo)} className="w-5 h-5 object-contain" fallback={<div className="w-5 h-5 bg-slate-700 rounded" />} />
                                <button type="button" className="text-sm font-bold text-white truncate hover:text-red-300 transition-colors text-left" onClick={() => onOpenTeam?.(layout.bottom)}>{renderTeamName(layout.bottom)}</button>
                              </div>
                              <div className="mt-3 grid grid-cols-3 gap-1.5">
                                {series.maps.map((map) => (
                                  <button
                                    key={`${series.key}-${map.matchId || map.mapNumber}`}
                                    type="button"
                                    className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-center text-[11px] font-semibold text-slate-200 w-full hover:border-red-400/40 hover:bg-red-500/10 transition-colors"
                                    onClick={() => map.matchId && onOpenMatch?.(map.matchId, series.maps
                                      .filter((seriesMap) => seriesMap.matchId)
                                      .map((seriesMap) => ({
                                        label: seriesMap.label,
                                        matchId: String(seriesMap.matchId),
                                      })))}
                                  >
                                    {map.label}
                                  </button>
                                ))}
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

      </div>
    </section>
  );
}
