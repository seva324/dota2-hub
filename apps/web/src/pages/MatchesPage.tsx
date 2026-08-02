import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Clock, Trophy } from 'lucide-react';
import { SafeImg } from '@/components/custom/SafeImg';
import { LiveMatchesCarousel } from '@/components/custom/LiveMatchesCarousel';
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

/** 统一的队伍展示：logo + 队名 横向，左右对称，严格垂直居中 */
function TeamWithLogo({ name, logo, winner, alignRight }: {
  name: string;
  logo?: string | null;
  winner?: boolean;
  alignRight?: boolean;
}) {
  const nameCls = winner ? 'text-white' : 'text-slate-400';
  return (
    <div className={`flex min-w-0 items-center gap-2 ${alignRight ? 'flex-row-reverse' : ''}`}>
      <SafeImg
        src={logo || ''}
        alt={name}
        className="size-6 shrink-0 object-contain"
        fallback={<div className="flex size-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold" style={{ backgroundColor: '#2a2d35', color: '#a1a1aa' }}>{name.substring(0, 2).toUpperCase()}</div>}
      />
      <span className={`truncate text-sm font-semibold leading-6 ${nameCls}`}>{name}</span>
    </div>
  );
}

function UpcomingRow({ match, onOpen }: {
  match: UpcomingMatch;
  onOpen?: (id: string | number) => void;
}) {
  const left = match.radiant_team_name || 'TBD';
  const right = match.dire_team_name || 'TBD';
  return (
    <button
      type="button"
      onClick={() => onOpen?.(match.series_id ?? match.id ?? '')}
      className="grid w-full grid-cols-[90px_1.4fr_1.6fr_56px_96px] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.04]"
    >
      <div className="text-left">
        <div className="text-sm font-bold tabular-nums leading-6 text-white">{formatMatchTime(match.start_time)}</div>
      </div>
      <div className="min-w-0">
        <div className="truncate text-xs leading-6 text-slate-400">{match.tournament_name_cn || match.tournament_name || ''}</div>
      </div>
      <div className="flex min-w-0 items-center justify-center gap-2">
        <div className="flex min-w-0 flex-1 items-center justify-end">
          <TeamWithLogo name={left} logo={match.radiant_team_logo} />
        </div>
        <span className="shrink-0 text-xs font-bold leading-6" style={{ color: '#71717a' }}>VS</span>
        <div className="flex min-w-0 flex-1 items-center">
          <TeamWithLogo name={right} logo={match.dire_team_logo} />
        </div>
      </div>
      <div className="text-center text-[11px] leading-6" style={{ color: '#71717a' }}>
        {formatBestOf(match.series_type)}
      </div>
      <div className="flex justify-end">
        <span className="rounded-md px-3 py-1.5 text-xs font-semibold" style={{ color: '#d4d4d8', backgroundColor: '#2a2d35', border: '1px solid rgba(255,255,255,0.08)' }}>
          View Match
        </span>
      </div>
    </button>
  );
}

function CompletedRow({ match, onOpen }: {
  match: FinishedMatch;
  onOpen?: (id: string | number) => void;
}) {
  const radiantWon = (match.radiant_score ?? 0) > (match.dire_score ?? 0);
  const direWon = (match.dire_score ?? 0) > (match.radiant_score ?? 0);
  return (
    <button
      type="button"
      onClick={() => onOpen?.(match.match_id)}
      className="grid w-full grid-cols-[90px_1.4fr_1.6fr_56px_96px] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.04]"
    >
      <div className="flex items-center gap-2">
        <span className="shrink-0 rounded px-2 py-0.5 text-[10px] font-bold" style={{ color: '#34d399', backgroundColor: 'rgba(52,211,153,0.12)' }}>
          COMPLETED
        </span>
      </div>
      <div className="min-w-0">
        <div className="truncate text-xs leading-6 text-slate-400">{match.tournament_name || ''}</div>
      </div>
      <div className="flex min-w-0 items-center justify-center gap-2">
        <div className="flex min-w-0 flex-1 items-center justify-end">
          <TeamWithLogo name={match.radiant_team_name} logo={match.radiant_team_logo} winner={radiantWon} />
        </div>
        <span className={`shrink-0 text-lg font-black tabular-nums leading-6 ${radiantWon ? 'text-white' : 'text-slate-500'}`}>{match.radiant_score}</span>
        <span className="shrink-0 text-sm font-bold leading-6" style={{ color: '#71717a' }}>:</span>
        <span className={`shrink-0 text-lg font-black tabular-nums leading-6 ${direWon ? 'text-white' : 'text-slate-500'}`}>{match.dire_score}</span>
        <div className="flex min-w-0 flex-1 items-center">
          <TeamWithLogo name={match.dire_team_name} logo={match.dire_team_logo} winner={direWon} />
        </div>
      </div>
      <div className="text-center">
        <div className="text-[11px] leading-6" style={{ color: '#71717a' }}>{formatBestOf(match.series_type)}</div>
        <div className="text-[10px] text-slate-500">{formatTimeAgo(match.start_time)}</div>
      </div>
      <div className="flex justify-end">
        <span className="rounded-md px-3 py-1.5 text-xs font-semibold" style={{ color: '#d4d4d8', backgroundColor: '#2a2d35', border: '1px solid rgba(255,255,255,0.08)' }}>
          View Match
        </span>
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
    label: string;
    matchId: string;
    radiantScore?: number;
    direScore?: number;
    duration?: number;
  }>) => void;
}) {
  const [liveHeroes, setLiveHeroes] = useState<LiveHeroPayload[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingMatch[]>([]);
  const [finished, setFinished] = useState<FinishedMatch[]>([]);
  const [visibleCount, setVisibleCount] = useState(10);

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
            <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-white/10 text-sm" style={{ color: '#71717a' }}>
              当前没有进行中的比赛
            </div>
          )}
        </section>

        {/* UPCOMING MATCHES */}
        <section>
          <SectionHeader
            icon={CalendarDays}
            title="Upcoming Matches"
            linkLabel="View Full Schedule"
          />
          {upcoming.length > 0 ? (
            <div className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03]">
              <div className="divide-y divide-white/[0.04]">
                {upcoming.map((match) => (
                  <UpcomingRow key={String(match.series_id ?? match.id ?? match.start_time)} match={match} onOpen={(id) => onOpenMatch?.(id)} />
                ))}
              </div>
            </div>
          ) : (
            <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-white/10 text-sm" style={{ color: '#71717a' }}>
              暂无即将开始的比赛
            </div>
          )}
        </section>

        {/* COMPLETED MATCHES */}
        <section>
          <SectionHeader icon={Trophy} title="Completed Matches" />
          {finished.length > 0 ? (
            <div className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03]">
              <div className="divide-y divide-white/[0.04]">
                {finished.slice(0, visibleCount).map((match) => (
                  <CompletedRow key={String(match.match_id)} match={match} onOpen={(id) => onOpenMatch?.(id)} />
                ))}
              </div>
              {visibleCount < finished.length && (
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
            <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-white/10 text-sm" style={{ color: '#71717a' }}>
              暂无比赛结果
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
