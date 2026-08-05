import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Play, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MatchDetailModal } from '@/components/custom/MatchDetailModal';
import { PlayerProfileFlyout } from '@/components/custom/PlayerProfileFlyout';
import { SafeImg } from '@/components/custom/SafeImg';
import { TeamFlyout } from '@/components/custom/TeamFlyout';
import { EmptyState, LiveEmptyState } from '@/components/custom/EmptyState';
import { TeamLogoFallback } from '@/components/custom/TeamLogoFallback';
import { LiveMatchCard, type LiveHeroPayload } from '@/components/custom/LiveMatchCard';
import { TournamentCarousel, type PrimaryLeague } from '@/components/custom/TournamentCarousel';
import { createMinimalPlayerFlyoutModel, fetchPlayerProfileFlyoutModel } from '@/lib/playerProfile';
import type { PlayerFlyoutModel } from '@/lib/playerProfile';
import { slugFromMatchUrl } from '@/lib/matchUrl';
import { apiFetch, getCachedValue } from '@/lib/api-cache';
import type { RouteState } from '@/lib/hashRouter';

const nowTs = () => Math.floor(Date.now() / 1000);
const LIVE_REFRESH_INTERVAL_MS = 30_000;
// 冷启动/抓取失败时 API 可能间歇返回空：连续 2 次空轮询才清空 live 卡片，
// 避免"加载出来又没了"的闪烁。与 HeroSection 的容忍逻辑对齐。
const LIVE_EMPTY_GRACE_POLLS = 2;
// live 短缓存：小于轮询间隔，轮询仍每次真刷新比分；从详情页返回时 20s 内
// 命中缓存立即显示，不闪空、不重拉。与比赛页共用同一份缓存（同 URL 精确键）。
const LIVE_CACHE_TTL_MS = 20_000;
// 与比赛页共用同一份缓存：URL 必须完全一致才能命中（精确键）。
const UPCOMING_API_URL = '/api/upcoming?limit=20&days=7';
const RESULTS_API_URL = '/api/matches?limit=40';
const LIVE_API_URL = '/api/live-hero';

/** live-hero API 响应：liveMatches 数组（常规）或 live 单场（旧格式兼容）。 */
type LiveHeroApi = { liveMatches?: LiveHeroPayload[]; live?: LiveHeroPayload };

function normalizeLiveHeroes(data: LiveHeroApi | undefined): LiveHeroPayload[] {
  return Array.isArray(data?.liveMatches) ? data.liveMatches : data?.live ? [data.live] : [];
}

const design = {
  bg: '#0f1115',
  card: '#1a1d24',
  blue: '#2b55e8',
  red: '#ff3b30',
};

function formatCSTTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
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

function formatTimeAgo(timestamp: number): string {
  const diff = Math.max(0, nowTs() - timestamp);
  const minutes = Math.floor(diff / 60);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

function mergePlayerModel(fallback: PlayerFlyoutModel, incoming: PlayerFlyoutModel | null): PlayerFlyoutModel {
  if (!incoming) return fallback;
  const apiNameIsOnlyAccountId = incoming.playerName === String(fallback.accountId);
  return {
    ...fallback,
    ...incoming,
    playerName: !incoming.playerName || apiNameIsOnlyAccountId ? fallback.playerName : incoming.playerName,
    nationality: incoming.nationality || fallback.nationality,
    teamName: incoming.teamName || fallback.teamName,
    teamLogoUrl: incoming.teamLogoUrl || fallback.teamLogoUrl,
    avatarUrl: incoming.avatarUrl || fallback.avatarUrl,
  };
}

/* ------------------------------------------------------------------ */
/* 数据模型                                                             */
/* ------------------------------------------------------------------ */

interface UpcomingMatch {
  id?: string | number;
  match_id?: string | number;
  series_id?: string | number | null;
  start_time: number;
  series_type?: string | null;
  radiant_team_id?: string | null;
  dire_team_id?: string | null;
  radiant_team_name?: string | null;
  dire_team_name?: string | null;
  radiant_team_logo?: string | null;
  dire_team_logo?: string | null;
  tournament_name?: string | null;
  tournament_name_cn?: string | null;
  match_url?: string | null;
}

interface FinishedSeries {
  match_id: string | number;
  radiant_team_name: string;
  dire_team_name: string;
  radiant_team_logo?: string | null;
  dire_team_logo?: string | null;
  radiant_score: number;
  dire_score: number;
  start_time: number;
  tournament_name?: string | null;
  series_type?: string | null;
  match_url?: string | null;
}

/* ------------------------------------------------------------------ */
/* 区块头                                                               */
/* ------------------------------------------------------------------ */

function SectionHeader({ title, accent, linkLabel, onClick }: {
  title: string;
  accent?: { text: string; count: string };
  linkLabel: string;
  onClick?: () => void;
}) {
  return (
    <div className="mb-5 flex items-center justify-between">
      <h2 className="flex items-center gap-2.5 text-xl font-extrabold tracking-tight text-white">
        {title}
        {accent && (
          <span className="rounded-md px-2 py-0.5 text-xs font-bold" style={{ color: accent.text, backgroundColor: `${accent.text}1f` }}>
            {accent.count}
          </span>
        )}
      </h2>
      <button
        type="button"
        onClick={onClick}
        className="text-sm font-semibold transition-opacity hover:opacity-80"
        style={{ color: design.blue }}
      >
        {linkLabel} <span aria-hidden>→</span>
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hero                                                                 */
/* ------------------------------------------------------------------ */

function HeroBanner({ liveCount, upcomingCount, resultsCount }: {
  liveCount: number;
  upcomingCount: number;
  resultsCount: number;
}) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-white/[0.06]" style={{ backgroundColor: '#0a0e14' }}>
      {/* Hero 背景图：轻微毛玻璃 */}
      <img
        src="/images/hero-background.png"
        alt=""
        className="pointer-events-none absolute inset-0 h-full w-full object-cover blur-[2px]"
      />
      {/* 半透明蒙版 */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'linear-gradient(100deg, rgba(10,14,20,0.9) 0%, rgba(10,14,20,0.72) 40%, rgba(10,14,20,0.45) 75%, rgba(10,14,20,0.6) 100%)',
        }}
      />
      <div className="relative z-10 flex min-h-[440px] flex-col justify-center px-8 py-14 lg:px-14">
        <h1 className="text-5xl font-black leading-[1.05] tracking-tight text-white lg:text-6xl">
          LIVE.
        </h1>
        <h2 className="mt-1 text-3xl font-bold leading-tight tracking-tight text-white lg:text-4xl">
          Dota Never Stops.
        </h2>
        <p className="mt-5 max-w-md text-base leading-6" style={{ color: '#a1a1aa' }}>
          Your home for live matches, real-time stats, and everything Dota.
        </p>

        <div className="mt-8 flex items-center gap-10">
          <div className="flex flex-col">
            <span className="text-3xl font-black tabular-nums" style={{ color: design.red }}>{liveCount}</span>
            <span className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Live Matches</span>
          </div>
          <div className="flex flex-col">
            <span className="text-3xl font-black tabular-nums text-white">{upcomingCount}</span>
            <span className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Upcoming</span>
          </div>
          <div className="flex flex-col">
            <span className="text-3xl font-black tabular-nums text-white">{resultsCount}</span>            <span className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Results</span>
          </div>
        </div>

        <Button
          size="lg"
          className="mt-10 w-fit rounded-lg px-6 text-sm font-semibold text-white hover:opacity-90"
          style={{ backgroundColor: design.blue }}
        >
          <Play className="size-4 fill-white" />
          Watch Live Matches
        </Button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 共享卡片原子组件                                                       */
/* ------------------------------------------------------------------ */

const CARD = {
  logo: 'h-10 w-10',
  teamName: 'text-[13px] font-semibold leading-snug',
  badge: 'rounded px-2 py-0.5 text-[11px] font-bold',
  meta: 'text-[11px]',
};

/** 统一的队伍列：logo 上方、队名下方、固定高度两行。三组卡片共用。
 *  alignDown：把 logo+队名整体下移约 20px，使视觉中心与中间比分区对齐。
 *  badge 槽位固定高度，保证有无经济领先时三列高度一致。 */
function TeamColumn({ name, logo, accent, badge, alignDown }: {
  name: string;
  logo?: string | null;
  accent?: boolean;
  badge?: ReactNode;
  alignDown?: boolean;
}) {
  return (
    <div className={`flex min-w-0 flex-col items-center ${alignDown ? 'translate-y-[20px]' : ''}`}>
      <SafeImg
        src={logo || ''}
        alt={name}
        className={`${CARD.logo} shrink-0 object-contain`}
        fallback={<TeamLogoFallback name={name} size={40} />}
      />
      <span
        className={`${CARD.teamName} line-clamp-2 mt-1 w-full min-h-8 text-center`}
        style={{ color: accent === false ? '#a1a1aa' : '#fff' }}
      >
        {name}
      </span>
      {/* 固定高度的 badge 槽位，保持列高一致 */}
      <div className="mt-0.5 flex h-4 items-center justify-center">
        {badge}
      </div>
    </div>
  );
}

/** 统一的卡片状态标签（LIVE / COMPLETED / 时间） */
function CardStatus({ text, tone = 'time' }: { text: string; tone?: 'live' | 'completed' | 'time' }) {
  const style = tone === 'live'
    ? { color: '#fff', backgroundColor: design.red }
    : { color: '#a1a1aa', backgroundColor: '#2a2d35' };
  return <span className={CARD.badge} style={style}>{text}</span>;
}

/* ------------------------------------------------------------------ */
/* Schedule 卡片                                                         */
/* ------------------------------------------------------------------ */

function ScheduleCard({ match, isLive, onOpen }: {
  match: UpcomingMatch;
  isLive: boolean;
  onOpen?: () => void;
}) {
  const left = match.radiant_team_name || 'TBD';
  const right = match.dire_team_name || 'TBD';
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex flex-col rounded-xl p-4 text-left transition-transform hover:-translate-y-0.5"
      style={{ backgroundColor: design.card }}
    >
      <div className="flex items-center justify-between">
        <CardStatus text={isLive ? 'LIVE' : formatCSTTime(match.start_time)} tone={isLive ? 'live' : 'time'} />
        <span className="rounded px-2 py-0.5 text-[11px] font-semibold" style={{ color: '#a1a1aa', backgroundColor: '#2a2d35' }}>
          {formatBestOf(match.series_type)}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <TeamColumn name={left} logo={match.radiant_team_logo} />
        <span className="shrink-0 text-xs font-bold" style={{ color: '#71717a' }}>VS</span>
        <TeamColumn name={right} logo={match.dire_team_logo} />
      </div>

      <div className="mt-3 line-clamp-1 min-h-4 text-center text-[11px]" style={{ color: '#71717a' }}>
        {match.tournament_name_cn || match.tournament_name || ''}
      </div>

      <Button
        size="sm"
        className="mt-3 w-full rounded-md text-xs font-semibold"
        style={isLive
          ? { backgroundColor: design.red, color: '#fff' }
          : { backgroundColor: '#2a2d35', color: '#d4d4d8', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        {isLive ? 'Watch Live' : 'View Match'}
      </Button>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Result 卡片                                                           */
/* ------------------------------------------------------------------ */

function ResultCard({ match, onOpen }: {
  match: FinishedSeries;
  onOpen?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex flex-col rounded-xl p-4 text-left transition-transform hover:-translate-y-0.5"
      style={{ backgroundColor: design.card }}
    >
      <div className="flex items-center justify-between">
        <CardStatus text="COMPLETED" tone="completed" />
        <span className="text-[11px] font-semibold" style={{ color: '#71717a' }}>
          {formatBestOf(match.series_type)}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <TeamColumn
          name={match.radiant_team_name}
          logo={match.radiant_team_logo}
          alignDown
          accent={match.radiant_score > match.dire_score}
        />
        <div className="flex shrink-0 items-center px-1">
          <div className="flex items-baseline gap-1.5">
            <span className={`text-2xl font-black tabular-nums ${match.radiant_score > match.dire_score ? 'text-white' : ''}`} style={{ color: match.radiant_score > match.dire_score ? '#fff' : '#71717a' }}>
              {match.radiant_score}
            </span>
            <span className="text-sm font-bold" style={{ color: '#71717a' }}>:</span>
            <span className={`text-2xl font-black tabular-nums ${match.dire_score > match.radiant_score ? 'text-white' : ''}`} style={{ color: match.dire_score > match.radiant_score ? '#fff' : '#71717a' }}>
              {match.dire_score}
            </span>
          </div>
        </div>
        <TeamColumn
          name={match.dire_team_name}
          logo={match.dire_team_logo}
          alignDown
          accent={match.dire_score > match.radiant_score}
        />
      </div>

      <div className="mt-3 min-h-4 truncate text-center text-[11px]" style={{ color: '#71717a' }}>
        {match.tournament_name || formatTimeAgo(match.start_time)}
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Tournament Spotlight                                                  */
/* ------------------------------------------------------------------ */

function TournamentSpotlight() {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-white/[0.06]" style={{ backgroundColor: '#0a0e14' }}>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at 15% 50%, rgba(43,85,232,0.16) 0%, transparent 55%), radial-gradient(ellipse at 85% 60%, rgba(255,59,48,0.08) 0%, transparent 50%)',
        }}
      />
      <div className="relative z-10 grid min-h-[280px] items-center gap-8 px-8 py-12 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-14">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: '#8ca6ff' }}>
            Tournament Spotlight
          </div>
          <h3 className="mt-3 text-4xl font-black tracking-tight text-white">
            Riyadh Masters 2024
          </h3>
          <p className="mt-2 text-sm" style={{ color: '#a1a1aa' }}>
            The world's best teams. One crown.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-x-10 gap-y-4">
            <div className="flex flex-col">
              <span className="text-xl font-black tabular-nums text-white">$5,000,000</span>
              <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Prize Pool</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-black tabular-nums text-white">24</span>
              <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Teams</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-black tabular-nums" style={{ color: design.red }}>LIVE NOW</span>
              <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Playoffs</span>
            </div>
          </div>

          <Button
            size="lg"
            className="mt-8 w-fit rounded-lg px-6 text-sm font-semibold text-white hover:opacity-90"
            style={{ backgroundColor: design.blue }}
          >
            Explore Tournament
          </Button>
        </div>

        {/* 右侧金色赛事 Logo 占位：后续替换 */}
        <div className="hidden lg:flex items-center justify-center">
          <div className="relative flex size-56 items-center justify-center overflow-hidden rounded-2xl border border-amber-300/20">
            <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(212,164,74,0.14) 0%, rgba(10,14,20,0) 70%)' }} />
            <div className="absolute inset-3 rounded-xl border border-amber-300/10" />
            <span className="relative text-center text-sm font-bold leading-6 tracking-[0.2em] text-amber-300/90">
              RIYADH<br />MASTERS
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Latest News                                                          */
/* ------------------------------------------------------------------ */

interface NewsItem {
  id: string;
  title: string;
  url: string;
  image_url?: string;
  published_at: number;
  category?: string;
  source?: string;
}

const newsCategoryLabels: Record<string, string> = {
  patch: '版本',
  gameplay: '版本',
  esports: '赛事',
  tournament: '赛事',
  community: '社区',
  news: '新闻',
  takes: '观点',
};

function formatNewsDate(timestamp: number): string {
  const diff = Math.max(0, nowTs() - timestamp);
  const minutes = Math.floor(diff / 60);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

function getNewsCategory(category?: string): string {
  return newsCategoryLabels[String(category || '').toLowerCase()] || '新闻';
}

function LatestNewsSection({ items, onMore, onOpenItem }: {
  items: NewsItem[];
  onMore?: () => void;
  onOpenItem?: (item: NewsItem) => void;
}) {
  const featured = items[0];
  const rest = items.slice(1, 4);
  return (
    <section>
      <SectionHeader title="Latest News" linkLabel="View All News" onClick={onMore} />
      <div className="grid gap-4 lg:grid-cols-2">
        {featured && (
          <button
            type="button"
            onClick={() => onOpenItem?.(featured)}
            className="group relative flex min-h-[220px] w-full flex-col justify-end overflow-hidden rounded-xl p-5 text-left transition-transform hover:-translate-y-0.5"
            style={{ backgroundColor: design.card }}
          >
            {featured.image_url && (
              <SafeImg
                src={featured.image_url}
                alt=""
                className="absolute inset-0 h-full w-full object-cover opacity-40 transition-opacity group-hover:opacity-55"
                fallback={null}
              />
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
            <div className="relative z-10 mb-3 flex items-center gap-2">
              <span className="rounded px-2 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: design.red }}>
                {getNewsCategory(featured.category)}
              </span>
              <span className="text-[11px]" style={{ color: '#a1a1aa' }}>{formatNewsDate(featured.published_at)}</span>
            </div>
            <h3 className="relative z-10 text-lg font-bold leading-snug text-white group-hover:opacity-90">{featured.title}</h3>
          </button>
        )}
        <div className="flex flex-col justify-between gap-2">
          {rest.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpenItem?.(item)}
              className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
            >
              <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10" style={{ backgroundColor: '#2a2d35' }}>
                <SafeImg
                  src={item.image_url || ''}
                  alt={item.title}
                  className="h-full w-full object-cover"
                  fallback={<span className="text-[10px] font-bold" style={{ color: '#f0f0f5' }}>{getNewsCategory(item.category)}</span>}
                />
              </div>
              <div className="min-w-0 flex-1">
                <span className="block text-[11px]" style={{ color: '#71717a' }}>
                  {formatNewsDate(item.published_at)} · {getNewsCategory(item.category)}
                </span>
                <span className="mt-0.5 block line-clamp-2 text-sm font-medium text-white group-hover:opacity-90">{item.title}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

/* 主组件                                                               */
/* ------------------------------------------------------------------ */

interface HomeDashboardProps {
  route: RouteState;
  navigate: (route: RouteState, options?: { replace?: boolean }) => void;
  closeOverlay: () => void;
}

export function HomeDashboard({ route, navigate, closeOverlay }: HomeDashboardProps) {
  const [playerModel, setPlayerModel] = useState<PlayerFlyoutModel | null>(null);
  const emptyLivePollsRef = useRef(0);

  // useState 延迟初始化从共享缓存同步读取：从详情页返回时首帧即有数据，
  // 不闪空态/fallback；随后 useEffect 异步刷新（命中 TTL 内缓存则 0 网络请求）。
  const [upcoming, setUpcoming] = useState<UpcomingMatch[]>(() => {
    const cached = getCachedValue<{ upcoming: UpcomingMatch[] }>(UPCOMING_API_URL);
    return Array.isArray(cached?.upcoming) ? cached.upcoming : [];
  });
  const [liveHeroes, setLiveHeroes] = useState<LiveHeroPayload[]>(() =>
    normalizeLiveHeroes(getCachedValue<LiveHeroApi>(LIVE_API_URL)));
  const [results, setResults] = useState<FinishedSeries[]>(() => {
    const cached = getCachedValue<FinishedSeries[] | { matches: FinishedSeries[] }>(RESULTS_API_URL);
    const list = Array.isArray(cached) ? cached : (cached?.matches || []);
    return list
      .filter((m) => m.radiant_team_name && m.dire_team_name)
      .sort((a, b) => (b.start_time ?? 0) - (a.start_time ?? 0));
  });
  const [loading, setLoading] = useState(true);
  const [news, setNews] = useState<Array<{
    id: string;
    title: string;
    url: string;
    image_url?: string;
    published_at: number;
    category?: string;
    source?: string;
  }>>(() => (getCachedValue<NewsItem[]>('/api/news?limit=4') ?? []).slice(0, 4));
  const [primaryLeagues, setPrimaryLeagues] = useState<PrimaryLeague[]>(() => {
    const cached = getCachedValue<{ tournaments?: PrimaryLeague[] }>('/api/primary-leagues');
    return Array.isArray(cached?.tournaments) ? cached.tournaments : [];
  });

  useEffect(() => {
    let cancelled = false;

    const loadLive = async () => {
      try {
        // live 有 20s 短缓存：首次/过期后真请求；返回页面时直接命中缓存立即显示。
        const data = await apiFetch<LiveHeroApi>(LIVE_API_URL, { ttlMs: LIVE_CACHE_TTL_MS });
        if (cancelled) return;
        setLiveHeroes(normalizeLiveHeroes(data));
      } catch { /* 保留现有数据 */ }
    };

    const loadUpcoming = async () => {
      try {
        // cacheEmpty: false —— 抓取失败返回空时不写缓存，避免空数据顶住 60s
        const data = await apiFetch<{ upcoming: UpcomingMatch[] }>(UPCOMING_API_URL, { cacheEmpty: false });
        if (cancelled) return;
        setUpcoming(Array.isArray(data?.upcoming) ? data.upcoming : []);
      } catch { /* 保留空态 */ } finally {
        // loading 只 gate 赛程骨架屏：upcoming 一回来就结束骨架屏，其余区块独立渐进渲染
        if (!cancelled) setLoading(false);
      }
    };

    const loadResults = async () => {
      try {
        // cacheEmpty: false —— 抓取失败返回空时不写缓存，避免空数据顶住 60s
        const data = await apiFetch<FinishedSeries[] | { matches: FinishedSeries[] }>(RESULTS_API_URL, { cacheEmpty: false });
        if (cancelled) return;
        const matches: FinishedSeries[] = Array.isArray(data) ? data : (data.matches || []);
        // DLTV results 已是系列赛成品比分（radiant_score/dire_score），直接使用。
        setResults(
          matches
            .filter((m) => m.radiant_team_name && m.dire_team_name)
            .sort((a, b) => (b.start_time ?? 0) - (a.start_time ?? 0))
        );
      } catch { /* 保留空态 */ }
    };

    const loadNews = async () => {
      try {
        const data = await apiFetch<NewsItem[]>('/api/news?limit=4', { ttlMs: 5 * 60 * 1000, cacheEmpty: false });
        if (cancelled) return;
        setNews((Array.isArray(data) ? data : []).slice(0, 4));
      } catch { /* 保留空态 */ }
    };

    const loadLeagues = async () => {
      try {
        const data = await apiFetch<{ tournaments?: PrimaryLeague[] }>('/api/primary-leagues', { ttlMs: 5 * 60 * 1000, cacheEmpty: false });
        if (cancelled) return;
        setPrimaryLeagues(Array.isArray(data?.tournaments) ? data.tournaments : []);
      } catch { /* 保留空态 */ }
    };

    // 各自独立 fetch → 渐进渲染：快端点先填充，慢端点(如 news)后填充
    void loadLive();
    void loadUpcoming();
    void loadResults();
    void loadNews();
    void loadLeagues();

    return () => { cancelled = true; };
  }, []);

  // Live 30s 自动刷新：首页/比赛页直播区比分持续更新，无需手动刷新
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

  // 手动刷新：?refresh=1 绕过 CDN 缓存强制源站重新抓取，刷新按钮用
  const [isLiveRefreshing, setIsLiveRefreshing] = useState(false);
  const handleRefreshLive = async () => {
    if (isLiveRefreshing) return;
    setIsLiveRefreshing(true);
    try {
      const data = await apiFetch<LiveHeroApi>(`${LIVE_API_URL}?refresh=1`, { ttlMs: 0 });
      const liveMatches = Array.isArray(data?.liveMatches)
        ? data.liveMatches
        : data?.live
          ? [data.live]
          : [];
      emptyLivePollsRef.current = 0;
      setLiveHeroes(liveMatches);
    } catch { /* 保留现有数据 */ } finally {
      setIsLiveRefreshing(false);
    }
  };

  const overlay = route.overlay;
  const activeMatchId = overlay?.type === 'match' ? Number(overlay.matchId) : null;
  const activeTeamName = overlay?.type === 'team' ? overlay.teamName : null;
  const activePlayerId = overlay?.type === 'player' ? Number(overlay.accountId) : null;

  const openOverlay = (next: Extract<RouteState['overlay'], NonNullable<RouteState['overlay']>>) => {
    navigate({ page: 'home', overlay: next }, { replace: overlay !== null });
  };

  const [seriesMaps, setSeriesMaps] = useState<Array<{
    label: string;
    matchId: string;
    radiantScore?: number;
    direScore?: number;
    duration?: number;
  }>>([]);

  useEffect(() => {
    if (activeMatchId === null || !Number.isFinite(activeMatchId)) setSeriesMaps([]);
  }, [activeMatchId]);

  useEffect(() => {
    if (activePlayerId === null || !Number.isFinite(activePlayerId)) return;
    let cancelled = false;
    setPlayerModel((current) =>
      current?.accountId === activePlayerId ? current : createMinimalPlayerFlyoutModel(activePlayerId),
    );
    void fetchPlayerProfileFlyoutModel(activePlayerId, {
      onHydrated: (fullModel) => {
        if (cancelled) return;
        setPlayerModel((current) =>
          current?.accountId === activePlayerId ? mergePlayerModel(current, fullModel) : current,
        );
      },
    })
      .then((model) => {
        if (cancelled) return;
        setPlayerModel((current) => (current?.accountId !== activePlayerId ? current : mergePlayerModel(current, model)));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activePlayerId]);

  const handleOpenMatch = (matchId: number | string, maps: Array<{
    label: string;
    matchId: string;
    radiantScore?: number;
    direScore?: number;
    duration?: number;
  }> = [], slug = '') => {
    const numericId = typeof matchId === 'string' ? Number(matchId) : matchId;
    if (!Number.isFinite(numericId)) return;
    if (slug) {
      // 已结束的系列赛：带 DLTV slug，跳独立比赛详情页
      navigate({ page: 'match', overlay: null, matchId: String(numericId), slug }, { replace: false });
      return;
    }
    // 直播：无 DLTV slug，保留弹窗
    setSeriesMaps(maps);
    openOverlay({ type: 'match', matchId: String(numericId) });
  };

  // live 卡片：带 hawk sourceSeriesId 打开 live detail 全屏页；无则回退旧直播弹窗
  const handleOpenLive = (hero: LiveHeroPayload) => {
    if (hero.sourceSeriesId) {
      navigate({
        page: 'live',
        overlay: null,
        seriesId: String(hero.sourceSeriesId),
        slug: hero.sourceSeriesSlug ?? undefined,
        champ: hero.sourceChampionshipSlug ?? undefined,
      }, { replace: false });
      return;
    }
    handleOpenMatch(hero.liveMap?.matchId ?? hero.maps?.[0]?.matchId ?? '', buildSeriesMaps(hero));
  };

  const handleOpenTeam = (teamName: string) => {
    openOverlay({ type: 'team', teamName });
  };

  const handleOpenPlayerByAccountId = (accountId: number) => {
    setPlayerModel(null);
    openOverlay({ type: 'player', accountId: String(accountId) });
  };

  const liveCount = liveHeroes.length;
  const scheduleUpcoming = upcoming.filter((m) => m.start_time >= nowTs()).slice(0, 4);
  const liveUpcomingCount = upcoming.filter((m) => m.start_time >= nowTs()).length;
  const resultsCount = results.length;

  // 每张卡片打开比赛详情时携带系列赛信息
  const buildSeriesMaps = (hero: LiveHeroPayload) =>
    hero.maps
      ?.filter((m) => m.matchId !== null && m.matchId !== undefined)
      .map((m) => ({
        label: m.label,
        matchId: String(m.matchId),
        radiantScore: m.team1Score ?? undefined,
        direScore: m.team2Score ?? undefined,
        duration: m.gameTime ?? undefined,
      })) || [];

  const scheduleCards = useMemo(() => {
    return scheduleUpcoming.map((match) => ({
      match,
      isLive: match.start_time <= nowTs(),
      onClick: () => handleOpenMatch(
        match.series_id ?? match.match_id ?? match.id ?? '',
        [],
        slugFromMatchUrl(match.match_url),
      ),
    }));
  }, [scheduleUpcoming]);

  return (
    <div className="relative mx-auto w-full max-w-[1280px] px-4 pt-24 lg:px-6" style={{ backgroundColor: design.bg }}>
      <div className="flex flex-col gap-12 pb-16">
        <HeroBanner
          liveCount={liveCount}
          upcomingCount={liveUpcomingCount}
          resultsCount={resultsCount}
        />

        {/* Today's Schedule */}
        <section>
          <SectionHeader
            title="Today's Schedule"
            linkLabel="View Full Schedule"
            onClick={() => navigate({ page: 'matches', overlay: null })}
          />
          {loading || scheduleCards.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {scheduleCards.length > 0
                ? scheduleCards.map(({ match, isLive, onClick }) => (
                    <ScheduleCard key={String(match.match_id || match.id || `${match.start_time}-${match.radiant_team_name}`)} match={match} isLive={isLive} onOpen={onClick} />
                  ))
                : Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-[172px] animate-pulse rounded-xl" style={{ backgroundColor: design.card }} />
                  ))}
            </div>
          ) : (
            <EmptyState label="今日暂无赛程安排" />
          )}
        </section>

        {/* Live Matches */}
        <section>
          <SectionHeader
            title="Live Matches"
            accent={{ text: design.red, count: `${liveCount} LIVE` }}
            linkLabel="View All Live"
            onClick={() => navigate({ page: 'matches', overlay: null })}
          />
          <button
            type="button"
            onClick={() => void handleRefreshLive()}
            disabled={isLiveRefreshing}
            className="mb-4 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{ color: design.blue, backgroundColor: `${design.blue}1f` }}
          >
            <RefreshCw size={14} className={isLiveRefreshing ? 'animate-spin' : ''} />
            {isLiveRefreshing ? '刷新中...' : '刷新 Live'}
          </button>
          {liveHeroes.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {liveHeroes.slice(0, 4).map((hero) => (
                <LiveMatchCard
                  key={`${hero.leagueName}-${hero.teams?.[0]?.name}-${hero.teams?.[1]?.name}`}
                  hero={hero}
                  onOpen={() => handleOpenLive(hero)}
                />
              ))}
            </div>
          ) : (
            <LiveEmptyState />
          )}
        </section>

        {/* Recent Results */}
        <section>
          <SectionHeader
            title="Recent Results"
            linkLabel="View All Results"
            onClick={() => navigate({ page: 'matches', overlay: null })}
          />
          {results.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {results.slice(0, 4).map((match) => (
                <ResultCard
                  key={String(match.match_id)}
                  match={match}
                  onOpen={() => handleOpenMatch(match.match_id, [], slugFromMatchUrl(match.match_url))}
                />
              ))}
            </div>
          ) : (
            <EmptyState label="暂无比赛结果" />
          )}
        </section>

        {/* Tournament Spotlight / Primary Leagues */}
        {primaryLeagues.length > 0 ? (
          <section>
            <SectionHeader title="Tournaments" linkLabel="View All Tournaments" />
            <TournamentCarousel tournaments={primaryLeagues} />
          </section>
        ) : (
          <TournamentSpotlight />
        )}

        {/* Latest News */}
        <LatestNewsSection
          items={news}
          onMore={() => navigate({ page: 'news', overlay: null })}
          onOpenItem={(item) => navigate({ page: 'news', overlay: null, newsId: item.id })}
        />
      </div>

      {activeTeamName !== null && (
        <TeamFlyout
          open
          onOpenChange={(open) => { if (!open) closeOverlay(); }}
          selectedTeam={{ name: activeTeamName }}
          onPlayerClick={handleOpenPlayerByAccountId}
          onTeamSelect={(team) => { if (team.name) handleOpenTeam(team.name); }}
        />
      )}

      {activePlayerId !== null && Number.isFinite(activePlayerId) && (
        <PlayerProfileFlyout
          open
          onOpenChange={(open) => { if (!open) closeOverlay(); }}
          player={playerModel}
          onTeamSelect={(team) => { if (team.name) handleOpenTeam(team.name); }}
        />
      )}

      {activeMatchId !== null && Number.isFinite(activeMatchId) && (
        <MatchDetailModal
          matchId={activeMatchId}
          seriesMaps={seriesMaps}
          open
          onOpenChange={(open) => { if (!open) closeOverlay(); }}
          fullPage
          onTeamClick={(team) => { if (team.name) handleOpenTeam(team.name); }}
          onPlayerClick={handleOpenPlayerByAccountId}
        />
      )}
    </div>
  );
}
