import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Clock, Trophy } from 'lucide-react';
import { SafeImg } from '@/components/custom/SafeImg';
import { LiveMatchesCarousel } from '@/components/custom/LiveMatchesCarousel';
import { EmptyState, LiveEmptyState } from '@/components/custom/EmptyState';
import { TeamLogoFallback } from '@/components/custom/TeamLogoFallback';
import type { LiveHeroPayload } from '@/components/custom/LiveMatchCard';
import { Button } from '@/components/ui/button';

const design = {
  blue: '#2b55e8',
  red: '#ff3b30',
  card: '#1a1d24',
};

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

/** 从 DLTV match_url（https://dltv.org/matches/<id>/<slug>）提取 slug，用于比赛详情页加载数据 */
function slugFromMatchUrl(url?: string | null): string {
  if (!url) return '';
  const match = String(url).match(/\/matches\/\d+\/([^/]+)/i);
  return match?.[1] ?? '';
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
 * 左右队等宽容器(内容右/左对齐)，VS/比分严格居中，队名超宽省略。
 */
function TeamMatchup({ left, right, center }: {
  left: { name: string; logo?: string | null; winner?: boolean };
  right: { name: string; logo?: string | null; winner?: boolean };
  center: React.ReactNode;
}) {
  return (
    <div className="flex items-center">
      <div className="flex w-48 items-center justify-end">
        <TeamWithLogo name={left.name} logo={left.logo} winner={left.winner} />
      </div>
      <div className="flex w-24 shrink-0 items-center justify-center">{center}</div>
      <div className="flex w-48 items-center">
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
  return (
    <button
      type="button"
      onClick={() => onOpen?.(match.series_id ?? match.id ?? '', [{ slug: slugFromMatchUrl(match.match_url) }])}
      className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-white/[0.04]"
    >
      {/* 左信息列：时间 + 赛事名 */}
      <div className="flex min-w-0 items-center gap-4">
        <div className="w-20 shrink-0">
          <div className="text-sm font-bold tabular-nums text-white">{formatMatchTime(match.start_time)}</div>
          <div className="text-[10px] text-slate-500">{formatCountdown(match.start_time)}</div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-slate-200">{match.tournament_name_cn || match.tournament_name || ''}</div>
          <div className="truncate text-[11px] text-slate-500">Upcoming</div>
        </div>
      </div>

      {/* 中间列：队伍整体居中 */}
      <TeamMatchup
        left={{ name: left, logo: match.radiant_team_logo }}
        right={{ name: right, logo: match.dire_team_logo }}
        center={(
          <span className="shrink-0 rounded-md px-3 py-1 text-xs font-bold" style={{ color: '#a1a1aa', backgroundColor: '#2a2d35' }}>
            VS
          </span>
        )}
      />

      {/* 右信息列：赛制 + 按钮 */}
      <div className="flex items-center justify-end gap-4">
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
  return (
    <button
      type="button"
      onClick={() => onOpen?.(match.match_id, [{ slug: slugFromMatchUrl(match.match_url) }])}
      className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-white/[0.04]"
    >
      {/* 左信息列：COMPLETED 标签 + 赛事名 */}
      <div className="flex min-w-0 items-center gap-3">
        <span className="shrink-0 whitespace-nowrap rounded px-2 py-0.5 text-[10px] font-bold" style={{ color: '#34d399', backgroundColor: 'rgba(52,211,153,0.12)' }}>
          COMPLETED
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-slate-200">{match.tournament_name || ''}</div>
          <div className="truncate text-[11px] text-slate-500">Completed</div>
        </div>
      </div>

      {/* 中间列：队伍整体居中 */}
      <TeamMatchup
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

      {/* 右信息列：赛制 + 时间 + 按钮 */}
      <div className="flex items-center justify-end gap-4">
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
  }>) => void;
}) {
  const [liveHeroes, setLiveHeroes] = useState<LiveHeroPayload[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingMatch[]>([]);
  const [finished, setFinished] = useState<FinishedMatch[]>([]);
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
    try {
      const [liveRes, upcomingRes, matchesRes] = await Promise.all([
        fetch('/api/live-hero', { cache: 'no-store' }),
        fetch('/api/upcoming?limit=20&days=7'),
        fetch('/api/matches?limit=40'),
      ]);

      if (liveRes.ok) {
        const data = await liveRes.json();
        const liveMatches = Array.isArray(data?.liveMatches)
          ? data.liveMatches
          : data?.live
            ? [data.live]
            : [];
        setLiveHeroes(liveMatches);
      }

      if (upcomingRes.ok) {
        const data = await upcomingRes.json();
        setUpcoming(Array.isArray(data?.upcoming) ? data.upcoming : []);
      }

      if (matchesRes.ok) {
        const data = await matchesRes.json();
        const matches: FinishedMatch[] = Array.isArray(data) ? data : (data.matches || []);
        setFinished(matches.filter((m) => m.radiant_team_name && m.dire_team_name));
      }
    } catch (e) {
      console.error('[MatchesPage] Failed to load data:', e);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
