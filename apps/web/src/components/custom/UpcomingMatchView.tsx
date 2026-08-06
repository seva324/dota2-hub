import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BarChart3, Calendar, ExternalLink, Trophy } from 'lucide-react';
import { SafeImg } from '@/components/custom/SafeImg';
import { TeamLogoFallback } from '@/components/custom/TeamLogoFallback';
import { resolveTeamLogo } from '@/lib/teams';
import type { MatchPagePayload, SeriesLineupPlayer, SeriesTeamInfo } from '@/types/matchPage';

const design = {
  blue: '#2b55e8',
  red: '#ff3b30',
  card: '#1a1d24',
  pip: '#facc15',
};

function formatPercent(value?: string | number | null): string {
  if (value === null || value === undefined || value === '') return '—';
  // DLTV 里队伍胜率是 "63.000"（数字串），签名英雄有 "79%"（带百分号）或纯数字 67，统一处理。
  const num = Number(String(value).trim().replace('%', ''));
  if (!Number.isFinite(num)) return '—';
  return `${Math.round(num)}%`;
}

function formatNumber(value?: string | null, digits = 1): string {
  if (!value) return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return num.toFixed(digits);
}

function formatPrize(value?: number | null): string {
  if (!value) return '—';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value}`;
}

function formatDateRange(start?: string | null, end?: string | null): string {
  if (!start) return '—';
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : null;
  if (Number.isNaN(startDate.getTime())) return '—';
  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
  return endDate && !Number.isNaN(endDate.getTime()) ? `${fmt(startDate)} - ${fmt(endDate)}` : fmt(startDate);
}

/** 倒计时字段，返回 null 表示已开赛。 */
function useCountdown(target: number | null): { d: number; h: number; m: number; s: number } | null {
  const compute = (): { d: number; h: number; m: number; s: number } | null => {
    if (!target) return null;
    const diff = Math.max(0, Math.floor(target - Date.now() / 1000));
    if (diff <= 0) return null;
    return {
      d: Math.floor(diff / 86400),
      h: Math.floor((diff % 86400) / 3600),
      m: Math.floor((diff % 3600) / 60),
      s: diff % 60,
    };
  };
  const [left, setLeft] = useState(compute);
  useEffect(() => {
    const tick = () => setLeft(compute());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return left;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="leading-none">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-bold tabular-nums text-white">{value}</div>
    </div>
  );
}

function TeamStatBlock({ team, align }: { team: SeriesTeamInfo; align: 'left' | 'right' }) {
  const logo = resolveTeamLogo({ teamId: team.id, name: team.name }, [], team.logo);
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
      <SafeImg
        src={logo}
        alt={team.name || ''}
        className="size-12 object-contain sm:size-16"
        fallback={<TeamLogoFallback name={team.name || (align === 'left' ? 'A' : 'B')} size={56} />}
      />
      <span className="w-full truncate text-center text-sm font-black uppercase text-white sm:text-lg">
        {team.name}
      </span>
      {team.rank != null && (
        <span className="rounded px-2 py-0.5 text-[11px] font-semibold text-slate-300" style={{ backgroundColor: '#2a2d35' }}>
          World Rank #{team.rank}
        </span>
      )}
      <div className="flex items-center gap-3">
        <Stat label="Winrate" value={formatPercent(team.winRate)} />
        <Stat label="FB" value={formatPercent(team.fbRate)} />
        <Stat label="F10" value={formatPercent(team.f10Rate)} />
      </div>
    </div>
  );
}

function PlayerCard({ player }: { player: SeriesLineupPlayer }) {
  const name = player.name || `选手 ${player.id ?? ''}`;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
      <SafeImg
        src={player.image}
        alt={name}
        className="size-10 shrink-0 rounded-lg object-cover ring-1 ring-white/10"
        fallback={
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-500 ring-1 ring-white/10">
            <Trophy className="size-4" />
          </span>
        }
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {player.roleLabel ? (
            <span className="shrink-0 rounded px-1.5 py-px text-[10px] font-bold text-black" style={{ backgroundColor: design.pip }}>
              {player.roleLabel}
            </span>
          ) : null}
          <span className="truncate text-sm font-bold text-white">{name}</span>
          {player.rank ? <span className="shrink-0 text-[11px] tabular-nums text-slate-500">#{player.rank}</span> : null}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="text-xs tabular-nums text-slate-400">KDA <b className="text-slate-200">{formatNumber(player.kda, 2)}</b></span>
          <span className="text-xs tabular-nums text-slate-400">GPM <b className="text-slate-200">{Math.round(Number(player.avgGpm) || 0) || '—'}</b></span>
          <span className="text-xs tabular-nums text-slate-400">XPM <b className="text-slate-200">{Math.round(Number(player.avgXpm) || 0) || '—'}</b></span>
        </div>
        {player.topHeroes.length > 0 && (
          <div className="mt-2 flex items-center gap-1.5">
            {player.topHeroes.map((hero) => (
              <div key={hero.heroId} className="flex items-center gap-1" title={`${hero.heroTitle || ''} · ${hero.maps ?? 0} 场 / ${formatPercent(hero.winRate)}`}>
                <SafeImg
                  src={hero.heroImage}
                  alt={hero.heroTitle || ''}
                  className="size-6 rounded border border-white/10 object-cover"
                  fallback={<span className="size-6 rounded border border-white/5 bg-black/30" />}
                />
                <span className="text-[10px] tabular-nums text-slate-500">{formatPercent(hero.winRate)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LineupColumn({ team }: { team: SeriesTeamInfo }) {
  const logo = resolveTeamLogo({ teamId: team.id, name: team.name }, [], team.logo);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <SafeImg
          src={logo}
          alt={team.name || ''}
          className="size-5 shrink-0 object-contain"
          fallback={<TeamLogoFallback name={team.name || 'T'} size={20} />}
        />
        <span className="truncate text-sm font-bold text-slate-200">{team.name}</span>
        <span className="shrink-0 text-[11px] text-slate-500">· {formatPercent(team.winRate)} 胜率</span>
      </div>
      {team.players.length > 0 ? (
        team.players.map((player) => <PlayerCard key={`${team.id}-${player.id}`} player={player} />)
      ) : (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 text-center text-xs text-slate-500">暂无阵容数据</div>
      )}
    </div>
  );
}

/** 单行两队对比：左队值 | 指标名 | 右队值。 */
function StatCompareRow({ label, left, right }: { label: string; left: string; right: string }) {
  return (
    <div className="grid grid-cols-[1fr_1.6fr_1fr] items-center gap-2 px-3 py-2 odd:bg-white/[0.02]">
      <span className="text-right text-sm font-semibold tabular-nums text-white">{left}</span>
      <span className="text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <span className="text-sm font-semibold tabular-nums text-slate-200">{right}</span>
    </div>
  );
}

function SignatureHeroes({ team }: { team: SeriesTeamInfo }) {
  const heroes = team.stats?.heroes || [];
  if (heroes.length === 0) return null;
  return (
    <div className="mt-4">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        签名英雄 · {team.name}（场次 / 胜率）
      </div>
      <div className="flex flex-wrap gap-2">
        {heroes.map((hero) => (
          <div
            key={hero.heroId}
            title={hero.heroTitle || ''}
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-1.5"
          >
            <SafeImg
              src={hero.heroImage}
              alt={hero.heroTitle || ''}
              className="size-7 rounded border border-white/10 object-cover"
              fallback={<span className="size-7 rounded border border-white/5 bg-black/30" />}
            />
            <div className="leading-tight">
              <div className="max-w-[90px] truncate text-[11px] font-semibold text-slate-200">{hero.heroTitle || '—'}</div>
              <div className="text-[10px] tabular-nums text-slate-500">{hero.maps ?? 0} 场 · {formatPercent(hero.winRate)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 两队数据对比（Statistics 标签同源：/api/v1/series/{id}/lineups/teams）。 */
function StatsComparison({ first, second }: { first: SeriesTeamInfo; second: SeriesTeamInfo }) {
  const a = first.stats?.overall;
  const b = second.stats?.overall;
  if (!a || !b) return null;

  const pct = (v: number | null) => (v == null ? '—' : `${v}%`);
  const num = (v: number | null) => (v == null ? '—' : v.toFixed(1));
  const mins = (v: number | null) => (v == null ? '—' : `${Math.round(v / 60)}min`);
  const rows = [
    { label: 'Winrate', left: pct(a.winRate), right: pct(b.winRate) },
    { label: 'Kills Avg', left: num(a.avgKills), right: num(b.avgKills) },
    { label: 'Deaths Avg', left: num(a.avgDeaths), right: num(b.avgDeaths) },
    { label: 'Assists', left: num(a.avgAssists), right: num(b.avgAssists) },
    { label: 'FB', left: pct(a.fbRate), right: pct(b.fbRate) },
    { label: 'F10', left: pct(a.f10Rate), right: pct(b.f10Rate) },
    { label: 'WIN WHEN FB', left: pct(a.winFbRate), right: pct(b.winFbRate) },
    { label: 'WIN WHEN F10', left: pct(a.winF10Rate), right: pct(b.winF10Rate) },
    { label: 'Avg Duration', left: mins(a.avgTime), right: mins(b.avgTime) },
  ];

  return (
    <section className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-300">
        <BarChart3 className="size-4 text-blue-400" /> 数据对比 Statistics
      </h2>
      <div className="grid grid-cols-[1fr_1.6fr_1fr] items-center gap-2 px-3 pb-2">
        <span className="truncate text-right text-xs font-bold uppercase text-slate-300">{first.name}</span>
        <span className="text-center text-[10px] font-semibold text-slate-600">近 3 个月</span>
        <span className="truncate text-xs font-bold uppercase text-slate-300">{second.name}</span>
      </div>
      {rows.map((row) => (
        <StatCompareRow key={row.label} label={row.label} left={row.left} right={row.right} />
      ))}
      <SignatureHeroes team={first} />
      <SignatureHeroes team={second} />
    </section>
  );
}

export function UpcomingMatchView({ payload, onBack }: { payload: MatchPagePayload; onBack: () => void }) {
  const first = payload.teams.radiant;
  const second = payload.teams.dire;
  const event = payload.event;
  const countdown = useCountdown(payload.startTime);
  const eventName = payload.eventName || event?.name || 'Dota 2';
  const stream = useMemo(() => payload.streams?.find((s) => s.url), [payload.streams]);

  return (
    <div className="flex flex-col gap-6 pb-16">
      {/* 顶部条 */}
      <div className="flex items-center justify-between gap-4">
        <button type="button" onClick={onBack} className="flex items-center gap-2 text-sm font-semibold text-slate-300 hover:text-white">
          <ArrowLeft className="size-4" /> 返回赛程
        </button>
        <div className="hidden items-center gap-2 text-xs text-slate-400 sm:flex">
          <span className="font-semibold text-slate-200">{eventName}</span>
          {payload.stage ? <span>· {payload.stage}</span> : null}
          {payload.bestOf ? <span>· {payload.bestOf}</span> : null}
        </div>
        <div className="w-24" />
      </div>

      {/* 倒计时 + 对阵 */}
      <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-6 sm:px-6">
        <div className="mb-5 flex items-center justify-center gap-3">
          {countdown ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-400">距开赛</span>
              {countdown.d > 0 && (
                <span className="rounded-lg px-2.5 py-1 font-mono text-2xl font-black tabular-nums text-white" style={{ backgroundColor: '#2a2d35' }}>{countdown.d}<span className="text-xs font-semibold text-slate-500">天</span></span>
              )}
              <span className="rounded-lg px-2.5 py-1 font-mono text-2xl font-black tabular-nums text-white" style={{ backgroundColor: '#2a2d35' }}>{String(countdown.h).padStart(2, '0')}</span>
              <span className="font-mono text-xl font-bold text-slate-500">:</span>
              <span className="rounded-lg px-2.5 py-1 font-mono text-2xl font-black tabular-nums text-white" style={{ backgroundColor: '#2a2d35' }}>{String(countdown.m).padStart(2, '0')}</span>
              <span className="font-mono text-xl font-bold text-slate-500">:</span>
              <span className="rounded-lg px-2.5 py-1 font-mono text-2xl font-black tabular-nums text-white" style={{ backgroundColor: '#2a2d35' }}>{String(countdown.s).padStart(2, '0')}</span>
            </div>
          ) : (
            <span className="rounded-full px-4 py-1.5 text-sm font-bold text-black" style={{ backgroundColor: design.pip }}>即将开始</span>
          )}
          {stream ? (
            <a
              href={stream.url || undefined}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-semibold text-red-400 transition-colors hover:bg-red-500/10"
            >
              <ExternalLink className="size-3.5" /> 直播
            </a>
          ) : null}
        </div>

        <div className="flex items-center gap-4 sm:gap-8">
          <TeamStatBlock team={first} align="left" />
          <div className="shrink-0">
            <div className="flex flex-col items-center gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">VS</span>
              <span className="rounded px-3 py-1 text-xs font-bold text-slate-300" style={{ backgroundColor: '#2a2d35' }}>{payload.bestOf || 'BO3'}</span>
            </div>
          </div>
          <TeamStatBlock team={second} align="right" />
        </div>
      </div>

      {/* 数据对比（stats 未预热时为 null，自动隐藏） */}
      <StatsComparison first={first} second={second} />

      {/* 阵容 */}
      {first.players.length > 0 || second.players.length > 0 ? (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-300">
            <Trophy className="size-4 text-amber-400" /> 阵容 Lineups
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
            <LineupColumn team={first} />
            <LineupColumn team={second} />
          </div>
        </section>
      ) : null}

      {/* 赛事信息 */}
      {event ? (
        <section className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-300">
            <Calendar className="size-4 text-blue-400" /> 赛事信息
          </h2>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">赛事</div>
              <div className="mt-0.5 text-sm font-bold text-white">{eventName}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">奖金池</div>
              <div className="mt-0.5 text-sm font-bold text-white">{formatPrize(event.prizePool)}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">日期</div>
              <div className="mt-0.5 text-sm font-bold text-white">{formatDateRange(event.startDate, event.endDate)}</div>
            </div>
            {event.country?.name ? (
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">举办国家</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-sm font-bold text-white">
                  <SafeImg
                    src={event.country.flag}
                    alt=""
                    className="size-4 rounded-sm object-cover"
                    fallback={null}
                  />
                  {event.country.emoji ? <span>{event.country.emoji}</span> : null}
                  {event.country.name}
                </div>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {event.bracketsLink ? (
                <a href={event.bracketsLink} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:text-white" style={{ backgroundColor: '#2a2d35' }}>
                  <ExternalLink className="size-3.5" /> 赛程
                </a>
              ) : null}
              {stream?.url ? (
                <a href={stream.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:text-white" style={{ backgroundColor: '#2a2d35' }}>
                  <ExternalLink className="size-3.5" /> Twitch
                </a>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
