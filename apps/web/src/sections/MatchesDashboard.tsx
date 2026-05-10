import { useState, useEffect, useCallback } from 'react';
import { CalendarDays, Trophy } from 'lucide-react';
import { SafeImg } from '@/components/custom/SafeImg';
import { aggregateMatchesBySeries } from '@/lib/seriesAggregation';

interface UpcomingMatch {
  id: string | number;
  radiant_team_name: string | null;
  dire_team_name: string | null;
  radiant_team_logo: string | null;
  dire_team_logo: string | null;
  start_time: number;
  series_type: string;
  tournament_name: string | null;
  tournament_name_cn?: string | null;
}

interface FinishedMatch {
  match_id: string | number;
  series_id?: string | number | null;
  radiant_team_id?: string | number | null;
  dire_team_id?: string | number | null;
  radiant_team_name: string;
  dire_team_name: string;
  radiant_team_logo?: string | null;
  dire_team_logo?: string | null;
  radiant_score?: number | null;
  dire_score?: number | null;
  radiant_win?: boolean | number | null;
  start_time: number;
  tournament_name?: string | null;
  series_type?: string | null;
}

interface FinishedSeries {
  match_id: string | number;
  series_id?: string | number | null;
  radiant_team_name: string;
  dire_team_name: string;
  radiant_team_logo?: string | null;
  dire_team_logo?: string | null;
  radiant_score: number;
  dire_score: number;
  start_time: number;
  tournament_name?: string | null;
}

function resolveSeriesWins(series: readonly FinishedMatch[], team: 'radiant' | 'dire') {
  const primaryMatch = series[0];
  const targetId = String(team === 'radiant' ? primaryMatch?.radiant_team_id ?? '' : primaryMatch?.dire_team_id ?? '');
  const targetName = team === 'radiant' ? primaryMatch?.radiant_team_name : primaryMatch?.dire_team_name;

  return series.reduce((wins, match) => {
    if (match.radiant_win === null || match.radiant_win === undefined) {
      return wins;
    }

    const radiantWon = match.radiant_win === true || match.radiant_win === 1;
    const winnerId = String((radiantWon ? match.radiant_team_id : match.dire_team_id) ?? '');
    const winnerName = radiantWon ? match.radiant_team_name : match.dire_team_name;

    if ((targetId && winnerId === targetId) || (!targetId && winnerName === targetName)) {
      return wins + 1;
    }

    return wins;
  }, 0);
}

function toFinishedSeries(matches: FinishedMatch[]): FinishedSeries[] {
  return aggregateMatchesBySeries(matches)
    .map((series) => {
      const orderedMatches = series.maps.map((map) => map.match);
      const primaryMatch = series.primaryMatch;
      const latestMatch = orderedMatches[orderedMatches.length - 1] ?? primaryMatch;
      const detailMatchId = [...series.maps]
        .reverse()
        .map((map) => map.matchId)
        .find((matchId) => matchId !== null) || primaryMatch.match_id;
      const radiantWins = resolveSeriesWins(orderedMatches, 'radiant');
      const direWins = resolveSeriesWins(orderedMatches, 'dire');

      return {
        match_id: detailMatchId,
        series_id: primaryMatch.series_id,
        radiant_team_name: primaryMatch.radiant_team_name,
        dire_team_name: primaryMatch.dire_team_name,
        radiant_team_logo: primaryMatch.radiant_team_logo,
        dire_team_logo: primaryMatch.dire_team_logo,
        radiant_score: radiantWins,
        dire_score: direWins,
        start_time: latestMatch.start_time,
        tournament_name: primaryMatch.tournament_name || null,
      };
    })
    .filter((series) => series.radiant_score > 0 || series.dire_score > 0)
    .sort((left, right) => right.start_time - left.start_time)
    .slice(0, 6);
}

function formatCountdown(targetTime: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = targetTime - now;
  if (diff <= 0) return '即将开始';
  if (diff < 3600) return `${Math.floor(diff / 60)}分后`;
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  if (h < 24) return `${h}小时${m > 0 ? `${m}分` : ''}后`;
  const d = Math.floor(h / 24);
  return d === 1 ? '明天' : `${d}天后`;
}

function formatMatchTime(ts: number): string {
  const date = new Date(ts * 1000);
  const utcMs = date.getTime() + date.getTimezoneOffset() * 60000;
  const cst = new Date(utcMs + 8 * 3600000);
  return `${cst.getHours().toString().padStart(2, '0')}:${cst.getMinutes().toString().padStart(2, '0')}`;
}

function formatMatchDate(ts: number): string {
  const date = new Date(ts * 1000);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function UpcomingCard({ match }: { match: UpcomingMatch }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  const radiantName = match.radiant_team_name || '未知';
  const direName = match.dire_team_name || '未知';

  return (
    <div className="shrink-0 w-52 rounded-2xl border border-white/10 bg-slate-800/60 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] truncate text-slate-400 min-w-0">
          {match.tournament_name || 'Upcoming'}
        </span>
        <span className="text-[10px] rounded bg-slate-700 px-1.5 py-0.5 text-slate-300 shrink-0">
          {match.series_type}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col items-center gap-1 w-16 min-w-0">
          <SafeImg
            src={match.radiant_team_logo || ''}
            alt={radiantName}
            className="size-10 object-contain"
            fallback={
              <div className="size-10 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-400">
                {radiantName.substring(0, 2).toUpperCase()}
              </div>
            }
          />
          <span className="text-[11px] text-center text-slate-200 truncate w-full">{radiantName}</span>
        </div>

        <span className="text-xs text-slate-500 shrink-0">VS</span>

        <div className="flex flex-col items-center gap-1 w-16 min-w-0">
          <SafeImg
            src={match.dire_team_logo || ''}
            alt={direName}
            className="size-10 object-contain"
            fallback={
              <div className="size-10 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-400">
                {direName.substring(0, 2).toUpperCase()}
              </div>
            }
          />
          <span className="text-[11px] text-center text-slate-200 truncate w-full">{direName}</span>
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px]">
        <span className="text-slate-400">{formatMatchTime(match.start_time)} CST</span>
        <span className="text-amber-300 font-medium">{formatCountdown(match.start_time)}</span>
      </div>
    </div>
  );
}

function FinishedMatchRow({
  match,
  onOpen,
}: {
  match: FinishedSeries;
  onOpen?: (id: number) => void;
}) {
  const radiantWon = match.radiant_score > match.dire_score;
  const direWon = match.dire_score > match.radiant_score;

  return (
    <button
      type="button"
      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.04] transition-colors text-left"
      onClick={() => {
        const id = Number(match.match_id);
        if (Number.isFinite(id)) onOpen?.(id);
      }}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
        <span className={`text-sm font-semibold truncate ${radiantWon ? 'text-white' : 'text-slate-500'}`}>
          {match.radiant_team_name}
        </span>
        <SafeImg
          src={match.radiant_team_logo || ''}
          alt={match.radiant_team_name}
          className="size-7 object-contain shrink-0"
          fallback={<div className="size-7 rounded-full bg-slate-700" />}
        />
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <span className={`text-lg font-black tabular-nums w-5 text-center ${radiantWon ? 'text-white' : 'text-slate-500'}`}>
          {match.radiant_score ?? '-'}
        </span>
        <span className="text-slate-600 text-sm">:</span>
        <span className={`text-lg font-black tabular-nums w-5 text-center ${direWon ? 'text-white' : 'text-slate-500'}`}>
          {match.dire_score ?? '-'}
        </span>
      </div>

      <div className="flex items-center gap-2 flex-1 min-w-0">
        <SafeImg
          src={match.dire_team_logo || ''}
          alt={match.dire_team_name}
          className="size-7 object-contain shrink-0"
          fallback={<div className="size-7 rounded-full bg-slate-700" />}
        />
        <span className={`text-sm font-semibold truncate ${direWon ? 'text-white' : 'text-slate-500'}`}>
          {match.dire_team_name}
        </span>
      </div>

      <div className="shrink-0 text-right hidden sm:block min-w-[90px]">
        <div className="text-[10px] text-slate-500 truncate">{match.tournament_name || '近期结束'}</div>
        <div className="text-[10px] text-slate-600">{formatMatchDate(match.start_time)}</div>
      </div>
    </button>
  );
}

export function MatchesDashboard({
  onOpenMatch,
}: {
  onOpenMatch?: (id: number, maps?: any[]) => void;
}) {
  const [upcoming, setUpcoming] = useState<UpcomingMatch[]>([]);
  const [finished, setFinished] = useState<FinishedSeries[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [upcomingRes, matchesRes] = await Promise.all([
        fetch('/api/upcoming?limit=8&days=7'),
        fetch('/api/matches?limit=24'),
      ]);

      if (upcomingRes.ok) {
        const data = await upcomingRes.json();
        setUpcoming(data.upcoming || []);
      }

      if (matchesRes.ok) {
        const data = await matchesRes.json();
        const matches: FinishedMatch[] = Array.isArray(data) ? data : (data.matches || []);
        setFinished(toFinishedSeries(
          matches.filter((match) => match.radiant_team_name && match.dire_team_name)
        ));
      }
    } catch (e) {
      console.error('[MatchesDashboard] Failed to load data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return <div className="h-32 animate-pulse rounded-2xl bg-white/[0.04]" aria-label="加载中" />;
  }

  return (
    <div className="flex flex-col gap-6">
      {upcoming.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <CalendarDays className="size-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-200">即将开始</h2>
            <span className="text-[11px] text-slate-500">· {upcoming.length} 场</span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
            {upcoming.map((match) => (
              <div key={match.id} className="snap-start shrink-0">
                <UpcomingCard match={match} />
              </div>
            ))}
          </div>
        </section>
      )}

      {finished.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="size-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-200">近期赛果</h2>
          </div>
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] divide-y divide-white/[0.04] overflow-hidden">
            {finished.map((match) => (
              <FinishedMatchRow
                key={match.match_id}
                match={match}
                onOpen={(id) => onOpenMatch?.(id)}
              />
            ))}
          </div>
        </section>
      )}

      {upcoming.length === 0 && finished.length === 0 && (
        <div className="text-center py-12 text-slate-500 text-sm">暂无赛事数据</div>
      )}
    </div>
  );
}
