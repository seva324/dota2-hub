import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarDays, Clock, Trophy } from 'lucide-react';
import { SafeImg } from '@/components/custom/SafeImg';
import { LiveMatchesCarousel } from '@/components/custom/LiveMatchesCarousel';
import { EmptyState, LiveEmptyState } from '@/components/custom/EmptyState';
import { TeamLogoFallback } from '@/components/custom/TeamLogoFallback';
import type { LiveHeroPayload } from '@/components/custom/LiveMatchCard';
import { Button } from '@/components/ui/button';
import { slugFromMatchUrl } from '@/lib/matchUrl';
import { apiFetch, getCachedValue } from '@/lib/api-cache';

const design = {
  blue: '#2b55e8',
  red: '#ff3b30',
  card: '#1a1d24',
};

const LIVE_REFRESH_INTERVAL_MS = 30_000;
// 冷启动/抓取失败时 API 可能间歇返回空：连续 2 次空轮询才清空 live 卡片，
// 避免"加载出来又没了"的闪烁。与 HeroSection 的容忍逻辑对齐。
const LIVE_EMPTY_GRACE_POLLS = 2;
// live 短缓存：小于轮询间隔，轮询仍每次真刷新比分；从详情页返回时 20s 内
// 命中缓存立即显示，不闪空、不重拉。与首页共用同一份缓存（同 URL 精确键）。
const LIVE_CACHE_TTL_MS = 20_000;

// 与首页共用同一份缓存：URL 必须完全一致才能命中（精确键）。
const UPCOMING_API_URL = '/api/upcoming?limit=20&days=7';
const RESULTS_API_URL = '/api/matches?limit=40';
const LIVE_API_URL = '/api/live-hero';

type LiveHeroApi = { liveMatches?: LiveHeroPayload[]; live?: LiveHeroPayload };

function normalizeLiveHeroes(data: LiveHeroApi | undefined): LiveHeroPayload[] {
  return Array.isArray(data?.liveMatches) ? data.liveMatches : data?.live ? [data.live] : [];
}

interface UpcomingMatch {
  id?: string | number;
  series_id?: string | number | null;
  radiant_team_name?: string | null;
  dire_team_name?: string | null;
  radiant_team_logo?: string | null;
  dire_team_logo?: string | null;
  start_time: number;
  series_type?: string | null;
  tournament_name?: string | null;
  tournament_name_cn?: string | null;
  match_url?: string | null;
}

interface FinishedMatch {
  match_id: string | number;
  series_id?: string | number | null;
  radiant_team_name: string;
  dire_team_name: string;
  radiant_team_logo?: string | null;
  dire_team_logo?: string | null;
  radiant_score?: number | null;
  dire_score?: number | null;
  start_time: number;
  duration?: number | null;
  tournament_name?: string | null;
  series_type?: string | null;
  match_url?: string | null;
}

function formatMatchTime(ts: number): string {
  const date = new Date(ts * 1000);
  const utcMs = date.getTime() + date.getTimezoneOffset() * 60000;
  const cst = new Date(utcMs + 8 * 3600000);
  return `${cst.getHours().toString().padStart(2, '0')}:${cst.getMinutes().toString().padStart(2, '0')}`;
}

function formatBestOf(value?: string | number | null): string {
  if (value === null || value === undefined || value === '') return 'BO3';
  if (typeof value === 'number' && Number.isFinite(value)) return `BO${value}`;
  const normalized = String(value).trim().toUpperCase();
  if (!normalized) return 'BO3';
  if (normalized.startsWith('BO')) return normalized;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? `BO${parsed}` : normalized;
}

function formatTimeAgo(ts: number): string {
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  const minutes = Math.floor(diff / 60);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

function formatCountdown(targetTime: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = targetTime - now;
  if (diff <= 0) return '即将开始';
  if (diff < 3600) return `${Math.floor(diff / 60)}分后`;
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  if (h < 24) return `${h}h ${m}m`;
  const d = Math.floor(h / 24);
  return d === 1 ? '明天' : `${d}天后`;
}

/**
 * 统一的队伍展示，与首页卡片一致：队名 text-[13px] font-semibold。
 * 原型比例：队名在外侧、LOGO 在内侧靠近 VS/比分；LOGO 44px，视觉冲击。
 */
function TeamWithLogo({ name, logo, winner, alignRight }: {
  name: string;
  logo?: string | null;
  winner?: boolean;
  alignRight?: boolean;
}) {
  const nameCls = winner ? 'text-white' : 'text-slate-300';
  const nameEl = (
    <span className={`truncate text-[13px] font-semibold leading-9 ${nameCls}`}>{name}</span>
  );
  const logoEl = (
    <SafeImg
      src={logo || ''}
      alt={name}
      className="size-11 shrink-0 object-contain"
      fallback={<TeamLogoFallback name={name} size={44} />}
    />
  );
  // 左队伍(alignRight=false)：队名 + LOGO；右队伍(alignRight=true)：LOGO + 队名
  // LOGO 都靠近中间的 VS/比分
  return (
    <div className="flex min-w-0 items-center gap-3">
      {alignRight ? <>{logoEl}{nameEl}</> : <>{nameEl}{logoEl}</>}
    </div>
  );
}

/**
 * 居中队伍区：队名+LOGO | VS/比分 | LOGO+队名。
 * 左右队等宽伸缩（min-w-0 + truncate），VS/比分严格居中，队名超宽省略。
 * 移动端作为整行 flex 填充，桌面端在 1fr_auto_1fr 网格的中间列。
 */
function TeamMatchup({ left, right, center, className = '' }: {
  left: { name: string; logo?: string | null; winner?: boolean };
  right: { name: string; logo?: string | null; winner?: boolean };
  center: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-1 md:gap-0 ${className}`}>
      <div className="flex min-w-0 flex-1 items-center justify-end md:w-48 md:flex-none">
        <TeamWithLogo name={left.name} logo={left.logo} winner={left.winner} />
      </div>
      <div className="flex shrink-0 items-center justify-center px-0.5 md:w-24 md:px-0">{center}</div>
      <div className="flex min-w-0 flex-1 items-center md:w-48 md:flex-none">
        <TeamWithLogo name={right.name} logo={right.logo} winner={right.winner} alignRight />
      </div>
    </div>
  );
}

function UpcomingRow({ match, onOpen }: {
  match: UpcomingMatch;
  onOpen?: (id: string | number, maps?: Array<{ slug?: string }>) => void;
}) {
  const left = match.radiant_team_name || 'TBD';
  const right = match.dire_team_name || 'TBD';
  const tournamentName = match.tournament_name_cn || match.tournament_name || '';
  return (
    <button
      type="button"
      onClick={() => onOpen?.(match.series_id ?? match.id ?? '', [{ slug: slugFromMatchUrl(match.match_url) }])}
      className="grid w-full grid-cols-1 gap-y-2 px-5 py-4 text-left transition-colors hover:bg-white/[0.04] md:grid-cols-[1fr_auto_1fr] md:items-center md:gap-4"
    >
      {/* 移动端 meta 行：时间 + BO3 + View Match */}
      <div className="flex items-center justify-between gap-2 md:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-sm font-bold tabular-nums text-white">{formatMatchTime(match.start_time)}</span>
          <span className="truncate text-[10px] text-slate-500">{formatCountdown(match.start_time)}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[11px]" style={{ color: '#71717a' }}>{formatBestOf(match.series_type)}</span>
          <span className="whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-semibold" style={{ color: '#d4d4d8', backgroundColor: '#2a2d35', border: '1px solid rgba(255,255,255,0.08)' }}>
            View Match
          </span>
        </div>
      </div>
      {/* 移动端赛事名行 */}
      <div className="flex min-w-0 items-center gap-2 md:hidden">
        <span className="truncate text-[11px] text-slate-500">{tournamentName}</span>
        <span className="shrink-0 text-[10px] text-slate-600">Upcoming</span>
      </div>

      {/* 队伍匹配（桌面中间列） */}
      <TeamMatchup
        className="md:order-2"
        left={{ name: left, logo: match.radiant_team_logo }}
        right={{ name: right, logo: match.dire_team_logo }}
        center={(
          <span className="shrink-0 rounded-md px-3 py-1 text-xs font-bold" style={{ color: '#a1a1aa', backgroundColor: '#2a2d35' }}>
            VS
          </span>
        )}
      />

      {/* 桌面左信息列 */}
      <div className="hidden min-w-0 items-center gap-4 md:order-1 md:flex">
        <div className="w-20 shrink-0">
          <div className="text-sm font-bold tabular-nums text-white">{formatMatchTime(match.start_time)}</div>
          <div className="text-[10px] text-slate-500">{formatCountdown(match.start_time)}</div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-slate-200">{tournamentName}</div>
          <div className="truncate text-[11px] text-slate-500">Upcoming</div>
        </div>
      </div>

      {/* 桌面右信息列 */}
      <div className="hidden items-center justify-end gap-4 md:order-3 md:flex">
        <div className="w-10 text-center text-[11px]" style={{ color: '#71717a' }}>
          {formatBestOf(match.series_type)}
        </div>
        <div className="w-24 text-right">
          <span className="whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold" style={{ color: '#d4d4d8', backgroundColor: '#2a2d35', border: '1px solid rgba(255,255,255,0.08)' }}>
            View Match
          </span>
        </div>
      </div>
    </button>
  );
}

function CompletedRow({ match, onOpen }: {
  match: FinishedMatch;
  onOpen?: (id: string | number, maps?: Array<{ slug?: string }>) => void;
}) {
  const radiantWon = (match.radiant_score ?? 0) > (match.dire_score ?? 0);
  const direWon = (match.dire_score ?? 0) > (match.radiant_score ?? 0);
  const tournamentName = match.tournament_name || '';
  return (
    <button
      type="button"
      onClick={() => onOpen?.(match.match_id, [{ slug: slugFromMatchUrl(match.match_url) }])}
      className="grid w-full grid-cols-1 gap-y-2 px-5 py-4 text-left transition-colors hover:bg-white/[0.04] md:grid-cols-[1fr_auto_1fr] md:items-center md:gap-4"
    >
      {/* 移动端 meta 行：COMPLETED + 赛事名（左），BO3 + View Match（右） */}
      <div className="flex items-center justify-between gap-2 md:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 whitespace-nowrap rounded px-2 py-0.5 text-[10px] font-bold" style={{ color: '#34d399', backgroundColor: 'rgba(52,211,153,0.12)' }}>
            COMPLETED
          </span>
          <span className="truncate text-[11px] text-slate-500">{tournamentName}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[11px]" style={{ color: '#71717a' }}>{formatBestOf(match.series_type)}</span>
          <span className="whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-semibold" style={{ color: '#d4d4d8', backgroundColor: '#2a2d35', border: '1px solid rgba(255,255,255,0.08)' }}>
            View Match
          </span>
        </div>
      </div>

      {/* 队伍匹配（桌面中间列） */}
      <TeamMatchup
        className="md:order-2"
        left={{ name: match.radiant_team_name, logo: match.radiant_team_logo, winner: radiantWon }}
        right={{ name: match.dire_team_name, logo: match.dire_team_logo, winner: direWon }}
        center={(
          <div className="flex items-center gap-2">
            <span className={`text-2xl font-black tabular-nums ${radiantWon ? 'text-white' : 'text-slate-500'}`}>{match.radiant_score}</span>
            <span className="text-sm font-bold" style={{ color: '#71717a' }}>:</span>
            <span className={`text-2xl font-black tabular-nums ${direWon ? 'text-white' : 'text-slate-500'}`}>{match.dire_score}</span>
          </div>
        )}
      />

      {/* 桌面左信息列：COMPLETED 标签 + 赛事名 */}
      <div className="hidden min-w-0 items-center gap-3 md:order-1 md:flex">
        <span className="shrink-0 whitespace-nowrap rounded px-2 py-0.5 text-[10px] font-bold" style={{ color: '#34d399', backgroundColor: 'rgba(52,211,153,0.12)' }}>
          COMPLETED
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-slate-200">{tournamentName}</div>
          <div className="truncate text-[11px] text-slate-500">Completed</div>
        </div>
      </div>

      {/* 桌面右信息列：赛制 + 时间 + 按钮 */}
      <div className="hidden items-center justify-end gap-4 md:order-3 md:flex">
        <div className="w-16 text-center">
          <div className="text-[11px]" style={{ color: '#71717a' }}>{formatBestOf(match.series_type)}</div>
          <div className="text-[10px] text-slate-500">{formatTimeAgo(match.start_time)}</div>
        </div>
        <div className="w-24 text-right">
          <span className="whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold" style={{ color: '#d4d4d8', backgroundColor: '#2a2d35', border: '1px solid rgba(255,255,255,0.08)' }}>
            View Match
          </span>
        </div>
      </div>
    </button>
  );
}

function SectionHeader({ icon: Icon, title, count, linkLabel, onLink }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count?: number;
  linkLabel?: string;
  onLink?: () => void;
}) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-slate-400" />
        <h2 className="text-base font-extrabold tracking-tight text-white">{title}</h2>
        {count !== undefined && (
          <span className="text-xs font-bold" style={{ color: design.red }}>{count} LIVE</span>
        )}
      </div>
      {linkLabel && (
        <button type="button" onClick={onLink} className="text-sm font-semibold hover:opacity-80" style={{ color: design.blue }}>
          {linkLabel} <span aria-hidden>→</span>
        </button>
      )}
    </div>
  );
}

export function MatchesPage({
  onOpenMatch,
}: {
  onOpenMatch?: (matchId: string | number, maps?: Array<{
    slug?: string;
    label?: string;
    matchId?: string;
    radiantScore?: number;
    direScore?: number;
    duration?: number;
  }>, seriesId?: string, slug?: string, champ?: string) => void;
}) {
  const [liveHeroes, setLiveHeroes] = useState<LiveHeroPayload[]>(() =>
    normalizeLiveHeroes(getCachedValue<LiveHeroApi>(LIVE_API_URL)));
  const emptyLivePollsRef = useRef(0);
  const [upcoming, setUpcoming] = useState<UpcomingMatch[]>(() => {
    const cached = getCachedValue<{ upcoming: UpcomingMatch[] }>(UPCOMING_API_URL);
    return Array.isArray(cached?.upcoming) ? cached.upcoming : [];
  });
  const [finished, setFinished] = useState<FinishedMatch[]>(() => {
    const cached = getCachedValue<FinishedMatch[] | { matches: FinishedMatch[] }>(RESULTS_API_URL);
    const list = Array.isArray(cached) ? cached : (cached?.matches || []);
    return list.filter((m) => m.radiant_team_name && m.dire_team_name);
  });
  const [upcomingExpanded, setUpcomingExpanded] = useState(false);
  const [visibleCount, setVisibleCount] = useState(10);
  const [dateFilter, setDateFilter] = useState<string>('today');
  const [tournamentFilter, setTournamentFilter] = useState<string>('all');
  const [upcomingTournamentFilter, setUpcomingTournamentFilter] = useState<string>('all');
  const [customDate, setCustomDate] = useState<string | null>(null);

  const upcomingLimit = 4;
  const upcomingTournaments = Array.from(new Set(upcoming.map((m) => m.tournament_name_cn || m.tournament_name).filter(Boolean))) as string[];
  const filteredUpcoming = upcomingTournamentFilter === 'all'
    ? upcoming
    : upcoming.filter((m) => (m.tournament_name_cn || m.tournament_name) === upcomingTournamentFilter);
  const displayedUpcoming = upcomingExpanded ? filteredUpcoming : filteredUpcoming.slice(0, upcomingLimit);

  // Completed 日期筛选：today / 过去 N 天 / 自定义
  const todayStart = (() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return Math.floor(now.getTime() / 1000);
  })();
  const dateOptions = Array.from({ length: 5 }).map((_, i) => {
    const d = new Date((todayStart - i * 86400) * 1000);
    const label = i === 0 ? 'Today' : `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, '0')}`;
    return { key: i === 0 ? 'today' : String(i), label, dayStart: todayStart - i * 86400 };
  });

  const isInDateWindow = (ts: number, dayStart: number) => ts >= dayStart && ts < dayStart + 86400;

  const filteredFinished = finished.filter((match) => {
    // 日期筛选
    if (dateFilter === 'today') {
      if (!isInDateWindow(match.start_time, todayStart)) return false;
    } else if (dateFilter === 'custom') {
      if (!customDate) return true;
      const customStart = Math.floor(new Date(customDate).getTime() / 1000);
      if (!Number.isFinite(customStart) || !isInDateWindow(match.start_time, customStart)) return false;
    } else {
      const idx = Number(dateFilter);
      if (Number.isFinite(idx) && dateOptions[idx]) {
        if (!isInDateWindow(match.start_time, dateOptions[idx].dayStart)) return false;
      }
    }
    // 赛事筛选
    if (tournamentFilter !== 'all' && match.tournament_name !== tournamentFilter) return false;
    return true;
  });

  const tournamentOptions = Array.from(new Set(finished.map((m) => m.tournament_name).filter(Boolean))) as string[];

  const loadData = useCallback(async () => {
    // 各段独立加载：live 失败/挂起不影响 upcoming 与 completed 渲染，
    // 避免"信息不见了"整页空白。live 有 20s 短缓存，返回页面时直接命中。
    const [liveResult, upcomingResult, matchesResult] = await Promise.allSettled([
      apiFetch<LiveHeroApi>(LIVE_API_URL, { ttlMs: LIVE_CACHE_TTL_MS }),
      apiFetch<{ upcoming: UpcomingMatch[] }>(UPCOMING_API_URL, { ttlMs: 5 * 60 * 1000, cacheEmpty: false }),
      apiFetch<FinishedMatch[] | { matches: FinishedMatch[] }>(RESULTS_API_URL, { ttlMs: 5 * 60 * 1000, cacheEmpty: false }),
    ]);

    if (liveResult.status === 'fulfilled') {
      setLiveHeroes(normalizeLiveHeroes(liveResult.value));
    } else {
      console.warn('[MatchesPage] live-hero failed, keeping existing cards:', liveResult.reason);
    }
    if (upcomingResult.status === 'fulfilled') {
      setUpcoming(Array.isArray(upcomingResult.value?.upcoming) ? upcomingResult.value.upcoming : []);
    } else {
      console.warn('[MatchesPage] upcoming failed, keeping existing rows:', upcomingResult.reason);
    }
    if (matchesResult.status === 'fulfilled') {
      const finishedList: FinishedMatch[] = Array.isArray(matchesResult.value)
        ? matchesResult.value
        : (matchesResult.value.matches || []);
      setFinished(finishedList.filter((m) => m.radiant_team_name && m.dire_team_name));
    } else {
      console.warn('[MatchesPage] matches failed, keeping existing rows:', matchesResult.reason);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Live 30s 自动刷新：直播区比分持续更新，无需手动刷新
  useEffect(() => {
    let cancelled = false;
    const refreshLive = async () => {
      try {
        // 短缓存（20s < 30s 轮询间隔）：轮询照常每次真刷新比分；
        // 若轮询中途被中断（如切页），缓存里仍是新鲜比分，返回时直接命中。
        const data = await apiFetch<LiveHeroApi>(LIVE_API_URL, { ttlMs: LIVE_CACHE_TTL_MS });
        if (cancelled) return;
        const liveMatches = normalizeLiveHeroes(data);
        if (liveMatches.length === 0) {
          // 间歇空响应（冷启动/抓取失败）不立即清空，保留现有卡片
          emptyLivePollsRef.current += 1;
          if (emptyLivePollsRef.current < LIVE_EMPTY_GRACE_POLLS) return;
        } else {
          emptyLivePollsRef.current = 0;
        }
        setLiveHeroes(liveMatches);
      } catch { /* 保留现有数据 */ }
    };
    const timer = setInterval(() => void refreshLive(), LIVE_REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="relative mx-auto w-full max-w-[1280px] px-4 pt-24 lg:px-6" style={{ backgroundColor: '#0f1115' }}>
      <div className="flex flex-col gap-10 pb-16">
        {/* 主标题 */}
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white">Matches</h1>
        </div>

        {/* LIVE MATCHES */}
        <section>
          <SectionHeader
            icon={Clock}
            title="Live Matches"
            count={liveHeroes.length}
          />
          {liveHeroes.length > 0 ? (
            <LiveMatchesCarousel liveHeroes={liveHeroes} onOpenMatch={onOpenMatch} />
          ) : (
            <LiveEmptyState />
          )}
        </section>

        {/* UPCOMING MATCHES */}
        <section>
          <SectionHeader icon={CalendarDays} title="Upcoming Matches" />
          {/* 赛事筛选（深色下拉，浅色文字） */}
          <div className="mb-4 flex items-center">
            <select
              value={upcomingTournamentFilter}
              onChange={(e) => setUpcomingTournamentFilter(e.target.value)}
              className="rounded-md border border-white/15 bg-[#1a1d24] px-3 py-2 text-xs font-semibold text-slate-200"
              style={{ colorScheme: 'dark' }}
            >
              <option value="all">All Tournaments</option>
              {upcomingTournaments.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
          {filteredUpcoming.length > 0 ? (
            <div className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03]">
              <div className="divide-y divide-white/[0.04]">
                {displayedUpcoming.map((match) => (
                  <UpcomingRow key={String(match.series_id ?? match.id ?? match.start_time)} match={match} onOpen={(id, maps) => onOpenMatch?.(id, maps)} />
                ))}
              </div>
              {filteredUpcoming.length > upcomingLimit && (
                <div className="border-t border-white/[0.04] p-4">
                  <Button
                    variant="ghost"
                    className="mx-auto flex w-fit items-center gap-2 rounded-lg px-5 py-2 text-sm font-semibold text-slate-300 hover:text-white"
                    style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                    onClick={() => setUpcomingExpanded((expanded) => !expanded)}
                  >
                    {upcomingExpanded ? '收起' : `展开更多 (${filteredUpcoming.length - upcomingLimit})`}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <EmptyState label="暂无即将开始的比赛" hint="未来赛程会在这里显示" />
          )}
        </section>

        {/* COMPLETED MATCHES */}
        <section>
          <SectionHeader icon={Trophy} title="Completed Matches" />

          {/* 日期 + 赛事 筛选 */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {dateOptions.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setDateFilter(opt.key)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    dateFilter === opt.key ? 'text-white' : 'text-slate-400 hover:text-white'
                  }`}
                  style={dateFilter === opt.key ? { backgroundColor: design.red, boxShadow: '0 2px 12px rgba(255,59,48,0.3)' } : { backgroundColor: 'rgba(255,255,255,0.05)' }}
                >
                  {opt.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setDateFilter('custom')}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${dateFilter === 'custom' ? 'text-white' : 'text-slate-400 hover:text-white'}`}
                style={dateFilter === 'custom' ? { backgroundColor: design.red, boxShadow: '0 2px 12px rgba(255,59,48,0.3)' } : { backgroundColor: 'rgba(255,255,255,0.05)' }}
              >
                📅 自定义日期
              </button>
              {dateFilter === 'custom' && (
                <input
                  type="date"
                  value={customDate || ''}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="rounded-md border border-white/15 bg-[#1a1d24] px-2 py-1.5 text-xs text-white"
                  style={{ colorScheme: 'dark' }}
                />
              )}
            </div>
            <select
              value={tournamentFilter}
              onChange={(e) => setTournamentFilter(e.target.value)}
              className="rounded-md border border-white/15 bg-[#1a1d24] px-3 py-2 text-xs font-semibold text-slate-200"
              style={{ colorScheme: 'dark' }}
            >
              <option value="all">All Tournaments</option>
              {tournamentOptions.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          {filteredFinished.length > 0 ? (
            <div className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03]">
              <div className="divide-y divide-white/[0.04]">
                {filteredFinished.slice(0, visibleCount).map((match) => (
                  <CompletedRow key={String(match.match_id)} match={match} onOpen={(id, maps) => onOpenMatch?.(id, maps)} />
                ))}
              </div>
              {visibleCount < filteredFinished.length && (
                <div className="border-t border-white/[0.04] p-4">
                  <Button
                    variant="ghost"
                    className="mx-auto flex w-fit items-center gap-2 rounded-lg px-5 py-2 text-sm font-semibold text-slate-300 hover:text-white"
                    style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                    onClick={() => setVisibleCount((count) => count + 10)}
                  >
                    Load More Matches
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <EmptyState label="该日期暂无比赛结果" hint="换个日期或赛事试试" />
          )}
        </section>
      </div>
    </div>
  );
}
