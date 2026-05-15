import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ExternalLink, Flag, Shield, Target, Trophy, UserRound } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { MatchDetailModal } from '@/components/custom/MatchDetailModal';
import { SafeImg } from '@/components/custom/SafeImg';
import { useIsMobile } from '@/hooks/use-mobile';
import { getHeroImageUrl } from '@/lib/assetUrls';
import { isChineseTeam, resolveTeamLogo } from '@/lib/teams';
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
  team_hero_ids?: number[];
};

type HeroMeta = {
  name?: string;
  name_cn?: string;
  img?: string;
};

const RECENT_MATCHES_BATCH_SIZE = 5;
const EMPTY_TEAMS: TeamLike[] = [];
const EMPTY_MATCHES: MatchLike[] = [];

type SquadPlayerCard = {
  accountId: number | null;
  name: string;
  realname: string | null;
  countryCode: string | null;
  avatarUrl: string | null;
  role?: string | null;
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
  teamHeroIds: number[];
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

function stringToHue(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash;
  }
  return Math.abs(hash) % 360;
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

function formatCountdown(ts: number): string {
  if (!ts) return '';
  const now = Math.floor(Date.now() / 1000);
  const diff = ts - now;
  if (diff <= 0) return 'LIVE';
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const mins = Math.floor((diff % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
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
  return getHeroImageUrl(heroId, hero?.img || null);
}

function buildTeamFlyoutApiUrl(selectedTeam: { team_id?: string | null; name: string }): string {
  const params = new URLSearchParams({
    limit: String(RECENT_MATCHES_BATCH_SIZE),
    offset: '0'
  });
  if (selectedTeam.team_id) params.set('teamId', String(selectedTeam.team_id));
  if (selectedTeam.name) params.set('name', selectedTeam.name);
  return `/api/team-flyout?${params.toString()}`;
}

function buildTeamFlyoutLoadMoreUrl(selectedTeam: { team_id?: string | null; name: string }, cursor: number): string {
  const params = new URLSearchParams({
    limit: String(RECENT_MATCHES_BATCH_SIZE),
    offset: String(cursor)
  });
  if (selectedTeam.team_id) params.set('teamId', String(selectedTeam.team_id));
  if (selectedTeam.name) params.set('name', selectedTeam.name);
  return `/api/team-flyout?${params.toString()}`;
}

type TeamFlyoutApiPayload = {
  team?: TeamLike | null;
  nextMatch?: MatchLike | null;
  recentMatches?: MatchLike[];
  activeSquad?: Array<{
    account_id?: string | null;
    name?: string | null;
    realname?: string | null;
    country_code?: string | null;
    avatar_url?: string | null;
  }>;
  topHeroes?: Array<{
    hero_id?: number | null;
    matches?: number | null;
  }>;
  stats?: {
    wins?: number;
    losses?: number;
    winRate?: number;
  };
  pagination?: {
    hasMore?: boolean;
    nextCursor?: number | null;
  };
};

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
  teams = EMPTY_TEAMS,
  matches = EMPTY_MATCHES,
  upcoming = EMPTY_MATCHES,
  onTeamSelect,
  onPlayerClick
}: TeamFlyoutProps) {
  const isMobile = useIsMobile();
  const [heroMap, setHeroMap] = useState<Record<number, HeroMeta>>({});
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);
  const [activeSquad, setActiveSquad] = useState<SquadPlayerCard[]>([]);
  const [serverTopHeroes, setServerTopHeroes] = useState<Array<{ heroId: number; matches: number }>>([]);
  const [flyoutTeams, setFlyoutTeams] = useState<TeamLike[]>([]);
  const [flyoutMatches, setFlyoutMatches] = useState<MatchLike[]>([]);
  const [flyoutUpcoming, setFlyoutUpcoming] = useState<MatchLike[]>([]);
  const [isFlyoutLoading, setIsFlyoutLoading] = useState(false);
  const [hasFetchedFlyoutData, setHasFetchedFlyoutData] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [nextHistoryCursor, setNextHistoryCursor] = useState<number | null>(null);
  const [serverStats, setServerStats] = useState<{ wins: number; losses: number; winRate: number } | null>(null);
  const [flyoutDataState, setFlyoutDataState] = useState<'loading' | 'ready'>('loading');
  const flyoutContentRef = useRef<HTMLDivElement>(null);

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
    setIsFlyoutLoading(true);
    setActiveSquad([]);
    setServerTopHeroes([]);
    setHasMoreHistory(false);
    setNextHistoryCursor(null);
    setServerStats(null);

    (async () => {
      try {
        const response = await fetch(buildTeamFlyoutApiUrl(selectedTeam));
        const payload = (await response.json()) as TeamFlyoutApiPayload;
        if (!response.ok) {
          throw new Error('flyout_request_failed');
        }

        if (cancelled) return;

        const payloadRecentMatches = Array.isArray(payload?.recentMatches) ? payload.recentMatches : [];
        const payloadActiveSquad = Array.isArray(payload?.activeSquad) ? payload.activeSquad : [];
        const payloadTopHeroes = Array.isArray(payload?.topHeroes) ? payload.topHeroes : [];
        const hasServerPayload = Boolean(payload?.team);

        setFlyoutTeams(hasServerPayload && payload?.team ? [payload.team] : []);
        setFlyoutMatches(payloadRecentMatches);
        setFlyoutUpcoming(payload?.nextMatch ? [payload.nextMatch] : []);
        setHasMoreHistory(Boolean(payload?.pagination?.hasMore));
        setNextHistoryCursor(
          typeof payload?.pagination?.nextCursor === 'number' ? payload.pagination.nextCursor : null
        );
        setServerStats(hasServerPayload
          ? {
              wins: Number(payload?.stats?.wins || 0),
              losses: Number(payload?.stats?.losses || 0),
              winRate: Number(payload?.stats?.winRate || 0)
            }
          : null);
        setActiveSquad(
          payloadActiveSquad.length
            ? payloadActiveSquad.map((player) => ({
                accountId: player?.account_id ? Number(player.account_id) : null,
                name: player?.name || 'Unknown',
                realname: player?.realname || null,
                countryCode: player?.country_code ? String(player.country_code).toUpperCase() : null,
                avatarUrl: player?.avatar_url || null,
              }))
            : []
        );
        setServerTopHeroes(
          payloadTopHeroes.length
            ? payloadTopHeroes
                .map((hero) => ({
                  heroId: Number(hero?.hero_id || 0),
                  matches: Number(hero?.matches || 0),
                }))
                .filter((hero) => hero.heroId > 0 && hero.matches > 0)
            : []
        );
        setHasFetchedFlyoutData(hasServerPayload);
      } catch {
        if (cancelled) return;
        setFlyoutTeams(Array.isArray(teams) ? teams : []);
        setFlyoutMatches(Array.isArray(matches) ? matches : []);
        setFlyoutUpcoming(Array.isArray(upcoming) ? upcoming : []);
        setHasMoreHistory(false);
        setNextHistoryCursor(null);
        setServerStats(null);
        setActiveSquad([]);
        setServerTopHeroes([]);
        setHasFetchedFlyoutData(false);
      } finally {
        if (!cancelled) {
          setIsFlyoutLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, selectedTeam?.team_id, selectedTeam?.name]);

  useEffect(() => {
    if (!open) {
      setFlyoutDataState('loading');
      return;
    }
    if (isFlyoutLoading) {
      setFlyoutDataState('loading');
      return;
    }
    const container = flyoutContentRef.current;
    if (!container) return;
    const images = Array.from(container.querySelectorAll('img'));
    let cancelled = false;
    const markReady = () => {
      if (cancelled) return;
      setTimeout(() => {
        if (!cancelled) setFlyoutDataState('ready');
      }, 500);
    };
    if (images.length === 0) {
      markReady();
      return () => { cancelled = true; };
    }
    let loaded = 0;
    const onLoad = () => {
      loaded++;
      if (loaded >= images.length) markReady();
    };
    images.forEach((img) => {
      if (img.complete) {
        loaded++;
      } else {
        img.addEventListener('load', onLoad, { once: true });
      }
    });
    if (loaded >= images.length) markReady();
    return () => {
      cancelled = true;
      images.forEach((img) => img.removeEventListener('load', onLoad));
    };
  }, [open, isFlyoutLoading]);

  const resolvedTeams = hasFetchedFlyoutData ? flyoutTeams : teams;
  const resolvedMatches = hasFetchedFlyoutData ? flyoutMatches : matches;
  const resolvedUpcoming = hasFetchedFlyoutData ? flyoutUpcoming : upcoming;

  const loadMoreHistory = useCallback(async () => {
    if (!selectedTeam?.name || nextHistoryCursor === null || isFlyoutLoading) return;

    setIsFlyoutLoading(true);
    try {
      const response = await fetch(buildTeamFlyoutLoadMoreUrl(selectedTeam, nextHistoryCursor));
      const payload = (await response.json()) as TeamFlyoutApiPayload;
      if (!response.ok) {
        throw new Error('history_request_failed');
      }

      const nextMatches = Array.isArray(payload?.recentMatches) ? payload.recentMatches : [];
      setFlyoutMatches((current) => [...current, ...nextMatches]);
      setHasMoreHistory(Boolean(payload?.pagination?.hasMore));
      setNextHistoryCursor(
        typeof payload?.pagination?.nextCursor === 'number' ? payload.pagination.nextCursor : null
      );
    } catch (error) {
      console.error('[TeamFlyout] Failed to load more history:', error);
    } finally {
      setIsFlyoutLoading(false);
    }
  }, [isFlyoutLoading, nextHistoryCursor, selectedTeam]);

  const model = useMemo(() => {
    if (!selectedTeam?.name) return null;

    const selectedName = normalize(selectedTeam.name);
    const selectedTeamId = selectedTeam.team_id ? String(selectedTeam.team_id) : null;
    const now = Math.floor(Date.now() / 1000);

    const resolveMeta = () => resolvedTeams.find((team) => {
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
    const recentRows: RecentRow[] = resolvedMatches
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

    const nextMatchOverride = resolvedUpcoming
      .filter(isTeamMatch)
      .filter((m) => Number(m.start_time) > now)
      .sort((a, b) => Number(a.start_time || 0) - Number(b.start_time || 0))[0];

    const nextMatch = nextMatchOverride || null;

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
  }, [selectedTeam, resolvedTeams, resolvedMatches, resolvedUpcoming]);

  const selectedTeamLogoUrl = resolveTeamLogo(
    { teamId: selectedTeam?.team_id || undefined, name: selectedTeam?.name || undefined },
    resolvedTeams,
    selectedTeam?.logo_url || model?.meta?.logo_url || null
  ) || null;

  const topFiveHeroes = useMemo(() => {
    if (serverTopHeroes.length) return serverTopHeroes.map((hero) => [hero.heroId, hero.matches] as const);
    const counts = new Map<number, number>();
    for (const row of model?.recentRows || []) {
      const picks = row.teamHeroIds || [];
      for (const heroId of picks) {
        counts.set(heroId, (counts.get(heroId) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [model, serverTopHeroes]);

  const heroWinRates = useMemo(() => {
    const stats = new Map<number, { wins: number; total: number }>();
    for (const row of model?.recentRows || []) {
      const picks = row.teamHeroIds || [];
      if (!picks.length) continue;
      const won = row.won === true;
      for (const heroId of picks) {
        const entry = stats.get(heroId);
        if (entry) {
          entry.total++;
          if (won) entry.wins++;
        } else {
          stats.set(heroId, { wins: won ? 1 : 0, total: 1 });
        }
      }
    }
    return stats;
  }, [model]);

  const wins = serverStats?.wins ?? model?.wins ?? 0;
  const losses = serverStats?.losses ?? model?.losses ?? 0;
  const winRate = serverStats?.winRate ?? model?.winRate ?? 0;
  const teamHue = stringToHue(selectedTeam?.name || '');

  const panelHeader = (
    <div
      className="relative border-b border-border/30 p-5 overflow-hidden"
      style={{
        background: `linear-gradient(160deg, rgb(10 18 28) 0%, rgb(10 18 28) 35%, hsl(${teamHue} 50% 18% / 0.45) 100%)`,
      }}
    >
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none opacity-[0.025]">
        <span className="text-[7rem] font-black tracking-[0.5em] text-white" style={{ fontFamily: 'system-ui' }}>DOTA2</span>
      </div>
      <div className="relative z-10 flex items-center gap-4">
        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-secondary/90 to-secondary/40 border border-border/30 flex items-center justify-center overflow-hidden shrink-0"
          style={{ boxShadow: `0 0 28px hsl(${teamHue} 60% 40% / 0.2), 0 6px 20px -4px rgba(0,0,0,0.45)` }}
        >
          <SafeImg
            src={selectedTeamLogoUrl}
            alt={selectedTeam?.name || 'Team'}
            className="w-10 h-10 object-contain"
            fallback={<Shield className="w-6 h-6 text-slate-400" />}
          />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-extrabold text-white tracking-tight truncate">{selectedTeam?.name || 'Team'}</h2>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {isFlyoutLoading && <Badge variant="outline" className="border-blue-500/30 text-blue-300 text-[10px]">加载中...</Badge>}
            <Badge variant="outline" className="border-amber-500/30 text-amber-300/80 text-[10px] font-semibold tracking-wider uppercase">DOTA 2</Badge>
            {model?.meta?.tag && <Badge variant="outline" className="border-border/40 text-muted-foreground text-[10px]">{model.meta.tag}</Badge>}
            {(model?.meta?.region && String(model.meta.region).toLowerCase() !== 'unknown') || isChineseTeam({ teamId: selectedTeam?.team_id, name: selectedTeam?.name }, resolvedTeams) ? (
              <Badge variant="outline" className="border-red-500/30 text-red-300/80 text-[10px]">
                <Flag className="w-3 h-3 mr-0.5" />
                {(model?.meta?.region && String(model.meta.region).toLowerCase() !== 'unknown') ? model.meta.region : 'China'}
              </Badge>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );

  const panelBody = (
    <div className="h-full overflow-y-auto overscroll-contain">
      {panelHeader}

      <div className="p-5 space-y-3.5">
              {/* Stats Bar */}
              <div className="rounded-xl border border-border/30 bg-gradient-to-b from-secondary/70 to-secondary/40 p-4 shadow-[var(--shadow-card)]">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest text-center mb-2.5">近 10 场战绩</div>
                <div className="flex items-center justify-between">
                  <div className="text-center flex-1">
                    <div className="text-2xl font-extrabold text-emerald-400 tabular-nums">{wins}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wide">胜</div>
                  </div>
                  <div className="w-px h-8 bg-border/40" />
                  <div className="text-center flex-1">
                    <div className="text-2xl font-extrabold text-red-400 tabular-nums">{losses}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wide">负</div>
                  </div>
                  <div className="w-px h-8 bg-border/40" />
                  <div className="text-center flex-1">
                    <div className="text-[1.65rem] font-extrabold text-foreground tabular-nums">{winRate}%</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wide">胜率</div>
                  </div>
                </div>
                <div className="mt-3 h-1.5 rounded-full bg-secondary/80 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-600 via-emerald-400 to-emerald-300 transition-all duration-500"
                    style={{
                      width: `${Math.min(100, Math.max(0, winRate))}%`,
                      boxShadow: '0 0 10px rgba(52,211,153,0.35)',
                    }}
                  />
                </div>
              </div>

              {/* Upcoming Match */}
              <section>
                <div className="flex items-center gap-2 mb-2.5">
                  <Calendar className="w-4 h-4 text-red-400" />
                  <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">下一场</h4>
                </div>
                {model?.nextMatch ? (() => {
                  const nm = model.nextMatch;
                  const radLogo = nm.radiant_team_logo || null;
                  const direLogo = nm.dire_team_logo || null;
                  const radName = nm.radiant_team_name || 'TBD';
                  const direName = nm.dire_team_name || 'TBD';
                  const countdown = formatCountdown(nm.start_time);
                  return (
                    <div className="rounded-xl border border-red-500/20 bg-gradient-to-br from-secondary/70 to-red-950/10 p-4 shadow-[var(--shadow-card)]">
                      <div className="flex justify-center mb-2.5">
                        <Badge className="animate-pulse-glow border-red-400/40 bg-red-500/15 text-red-300 text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full">
                          {countdown === 'LIVE' ? 'LIVE NOW' : '即将开始'}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex flex-col items-center gap-2.5 min-w-0 flex-1">
                          <div className="w-14 h-14 rounded-full bg-slate-700/60 border border-slate-600 flex items-center justify-center overflow-hidden">
                            <SafeImg src={radLogo} alt={radName} className="w-[52px] h-[52px] object-contain" fallback={<Shield className="w-7 h-7 text-slate-500" />} />
                          </div>
                          <span className="text-sm font-medium text-slate-100 text-center truncate w-full">{radName}</span>
                        </div>
                        <div className="flex flex-col items-center flex-shrink-0">
                          <span className="text-base font-extrabold text-red-400/90 tracking-widest">VS</span>
                          <span className="text-[10px] text-muted-foreground mt-1.5 font-mono tabular-nums">{formatTs(nm.start_time)}</span>
                          {countdown && countdown !== 'LIVE' && (
                            <span className="text-[10px] text-muted-foreground mt-0.5 font-mono tabular-nums">in {countdown}</span>
                          )}
                          {countdown === 'LIVE' && (
                            <span className="text-[10px] text-red-400 mt-0.5 font-bold uppercase animate-pulse">LIVE</span>
                          )}
                        </div>
                        <div className="flex flex-col items-center gap-2.5 min-w-0 flex-1">
                          <div className="w-14 h-14 rounded-full bg-slate-700/60 border border-slate-600 flex items-center justify-center overflow-hidden">
                            <SafeImg src={direLogo} alt={direName} className="w-[52px] h-[52px] object-contain" fallback={<Shield className="w-7 h-7 text-slate-500" />} />
                          </div>
                          <span className="text-sm font-medium text-slate-100 text-center truncate w-full">{direName}</span>
                        </div>
                      </div>
                      <div className="mt-3 pt-2.5 border-t border-border/30 text-[11px] text-muted-foreground text-center">
                        {getTournamentLabel(nm)} · {nm.series_type || 'BO3'}
                      </div>
                    </div>
                  );
                })() : (
                  <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4 text-sm text-slate-400">
                    暂无未来赛程
                  </div>
                )}
              </section>

              {/* Roster */}
              <section>
                <div className="flex items-center gap-2 mb-2.5">
                  <UserRound className="w-4 h-4 text-red-400" />
                  <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">当前阵容</h4>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {activeSquad.map((player, idx) => {
                    const flagUrl = toFlagImageUrl(player.countryCode, 32);
                    const body = (
                      <div className="flex items-center gap-2.5 rounded-xl border border-border/30 bg-gradient-to-br from-secondary/50 to-secondary/20 p-2.5 transition-all duration-200 hover:border-red-400/30 hover:bg-gradient-to-br hover:from-secondary/70 hover:to-red-950/10 hover:shadow-[var(--shadow-glow)]">
                        <div className="w-12 h-12 rounded-full bg-slate-700/60 border border-slate-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                          {player.avatarUrl ? (
                            <img src={player.avatarUrl} alt={player.name} className="h-full w-full object-cover" />
                          ) : (
                            <UserRound className="h-6 w-6 text-slate-500" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            {flagUrl ? (
                              <img src={flagUrl} alt={player.countryCode || ''} className="h-3 w-[18px] rounded-[2px] object-cover flex-shrink-0" />
                            ) : (
                              <span className="inline-block h-3 w-[18px] rounded-[2px] bg-slate-700 flex-shrink-0" />
                            )}
                            <span className="text-sm font-semibold text-slate-100 truncate">{player.name}</span>
                          </div>
                          <div className="text-xs text-slate-400 truncate mt-0.5">{player.realname || '—'}</div>
                          {player.role && (
                            <div className="text-[10px] font-medium text-amber-400/70 truncate mt-0.5 uppercase tracking-wide">{player.role}</div>
                          )}
                        </div>
                      </div>
                    );
                    return player.accountId ? (
                      <button
                        key={`squad-${player.accountId}-${idx}`}
                        type="button"
                        className="text-left"
                        data-visual-role={player.name === 'Ame' ? 'player-profile-trigger' : undefined}
                        data-player-name={player.name === 'Ame' ? 'Ame' : undefined}
                        onClick={() => onPlayerClick?.(player.accountId!)}
                      >
                        {body}
                      </button>
                    ) : (
                      <div key={`squad-${player.name}-${idx}`}>{body}</div>
                    );
                  })}
                  {!activeSquad.length && (
                    <div className="col-span-full rounded-xl border border-slate-700 bg-slate-800/40 p-4 text-sm text-slate-400">
                      暂无最近一场比赛阵容
                    </div>
                  )}
                </div>
              </section>

              {/* Hero Picks */}
              <section>
                <div className="flex items-center gap-2 mb-2.5">
                  <Target className="w-4 h-4 text-red-400" />
                  <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">常用英雄</h4>
                </div>
                <div className="space-y-2">
                  {topFiveHeroes.map(([heroId, cnt]) => {
                    const maxCnt = topFiveHeroes[0]?.[1] || 1;
                    const pct = Math.round((cnt / maxCnt) * 100);
                    const heroWinStats = heroWinRates.get(heroId);
                    const heroWr = heroWinStats && heroWinStats.total > 0
                      ? Math.round((heroWinStats.wins / heroWinStats.total) * 100)
                      : null;
                    const wins = heroWinStats?.wins ?? 0;
                    const losses = heroWinStats ? heroWinStats.total - heroWinStats.wins : 0;
                    const img = getHeroImg(heroId, heroMap);
                    const heroName = heroMap[heroId]?.name_cn || heroMap[heroId]?.name || `Hero ${heroId}`;
                    return (
                      <div key={heroId} className="flex items-center gap-2.5 rounded-xl bg-secondary/40 border border-border/30 p-2.5 hover:border-border/50 transition-colors duration-200">
                        {img ? (
                          <img src={img} alt={heroName} className="w-12 h-12 rounded object-cover flex-shrink-0 border border-slate-700/50" />
                        ) : (
                          <div className="w-12 h-12 rounded bg-slate-700 flex-shrink-0 border border-slate-700/50" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-slate-200 truncate">{heroName}</span>
                            <span className="text-xs font-medium text-slate-400 flex-shrink-0 ml-2 tabular-nums">{cnt} 场</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-[11px] tabular-nums">
                            {heroWinStats ? (
                              <>
                                <span className="text-emerald-400">{wins} 胜</span>
                                <span className="text-slate-600">·</span>
                                <span className="text-red-400">{losses} 负</span>
                                {heroWr !== null && (
                                  <>
                                    <span className="text-slate-600">·</span>
                                    <span className="text-sky-400 font-medium">{heroWr}%</span>
                                  </>
                                )}
                              </>
                            ) : (
                              <span className="text-slate-500">—</span>
                            )}
                          </div>
                          <div className="mt-2 h-1.5 rounded-full bg-slate-700/70 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-purple-500 via-purple-400 to-fuchsia-400 transition-all duration-500"
                              style={{
                                width: `${Math.max(4, pct)}%`,
                                boxShadow: `0 0 8px rgba(168,85,247,0.3)`,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {!topFiveHeroes.length && (
                    <div className="text-xs text-slate-400">暂无英雄统计</div>
                  )}
                </div>
              </section>

              {/* Recent Matches */}
              <section>
                <div className="flex items-center gap-2 mb-2.5">
                  <Trophy className="w-4 h-4 text-red-400" />
                  <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">过去 3 个月比赛</h4>
                  {isFlyoutLoading && <span className="text-[10px] text-muted-foreground ml-auto">加载中…</span>}
                </div>
                <div className="space-y-2">
                  {(model?.recentRows || []).map((row) => {
                    const resultCls = row.won === true
                      ? 'border-emerald-500/60 text-emerald-300'
                      : row.won === false
                        ? 'border-red-500/60 text-red-300'
                        : 'border-slate-600 text-slate-200';
                    return (
                      <div key={row.key} className="rounded-xl border border-border/30 bg-secondary/30 p-3 hover:border-border/50 transition-colors">
                        <div className="grid grid-cols-[minmax(0,1fr)_4.75rem_minmax(0,1fr)] items-center gap-1.5 sm:grid-cols-[minmax(0,1fr)_6rem_minmax(0,1fr)] md:grid-cols-[minmax(0,1fr)_7.5rem_minmax(0,1fr)] sm:gap-2 md:gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <button
                            type="button"
                            aria-label={`查看战队 ${row.selectedName}`}
                            className="h-7 w-7 sm:h-8 sm:w-8 rounded bg-slate-700/60 flex items-center justify-center overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                            onClick={() => onTeamSelect?.({ team_id: row.selectedTeamId || null, name: row.selectedName, logo_url: row.selectedLogo || null })}
                          >
                            <SafeImg src={row.selectedLogo} alt={row.selectedName} className="w-6 h-6 sm:w-7 sm:h-7 object-contain" fallback={<span className="text-[10px]">TEAM</span>} />
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
                              <SafeImg src={row.opponentLogo} alt={row.opponentName} className="w-6 h-6 sm:w-7 sm:h-7 object-contain" fallback={<span className="text-[10px]">OPP</span>} />
                            </button>
                          </div>
                        </div>

                        <div className="mt-2 text-xs text-slate-400">
                          {row.tournament} · {row.seriesType} · {formatTs(row.startTime)}
                        </div>

                        <div className="mt-2 flex flex-wrap gap-1">
                          {(row.teamHeroIds || []).map((heroId, idx) => {
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
                  {!!model?.recentRows?.length && hasMoreHistory && (
                    <button
                      type="button"
                      className="w-full rounded-xl border border-slate-700 bg-slate-800/40 px-4 py-3 text-sm font-medium text-slate-200 transition hover:bg-slate-800/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                      onClick={() => void loadMoreHistory()}
                      disabled={isFlyoutLoading}
                    >
                      {isFlyoutLoading ? '加载中...' : '加载更多比赛'}
                    </button>
                  )}
                </div>
              </section>

              {/* Bottom CTA */}
              <div className="mt-3 px-5 pb-6">
                <button
                  type="button"
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 py-3 text-sm font-semibold text-white shadow-lg shadow-red-950/40 transition hover:bg-red-500 active:scale-[0.98]"
                >
                  查看 {selectedTeam?.name || '战队'} 完整资料
                  <ExternalLink className="size-3.5" />
                </button>
              </div>
            </div>
          </div>
      );

      const sheetSide = isMobile ? 'bottom' : 'right';
      const sheetClass = isMobile
        ? 'h-[92vh] w-full rounded-t-2xl bg-card text-foreground p-0 border border-border/40 shadow-[0_-16px_48px_-12px_rgba(0,0,0,0.5)]'
        : 'w-full sm:max-w-lg bg-card text-foreground p-0 border-l border-border/30 shadow-[-16px_0_48px_-12px_rgba(0,0,0,0.55)]';

      return (
        <>
          <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side={sheetSide} className={sheetClass} data-visual-role="team-flyout" data-visual-state={flyoutDataState}>
              <SheetTitle className="sr-only">{selectedTeam?.name || '战队资料'}</SheetTitle>
              <SheetDescription className="sr-only">战队详细信息</SheetDescription>
              <div ref={flyoutContentRef}>{panelBody}</div>
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
