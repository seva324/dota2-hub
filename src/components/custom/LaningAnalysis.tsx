import { useEffect, useMemo, useState } from 'react';
import { Clock3, Crown, Zap } from 'lucide-react';

interface Player {
  player_slot: number;
  account_id: number;
  personaname?: string;
  name?: string;
  hero_id: number;
  lane?: number;
  lane_role?: number;
  gold_t?: number[];
  xp_t?: number[];
  lh_t?: number[];
  dn_t?: number[];
  gold_per_min: number;
  xp_per_min: number;
  lane_efficiency?: number;
}

interface MatchData {
  match_id: number;
  radiant_team_name: string;
  dire_team_name: string;
  radiant_win: boolean;
  duration?: number;
  players: Player[];
}

interface HeroesData {
  [key: number]: { name?: string; name_cn?: string; img: string };
}

interface LaningAnalysisProps {
  matchId: number;
  radiantTeamName: string;
  direTeamName: string;
  heroesData: HeroesData;
}

type LaneSideRow = {
  player: Player;
  goldAt10: number;
  xpAt10: number;
  lhAt10: number;
  dnAt10: number;
};

type LaneData = {
  laneName: string;
  radiant: LaneSideRow[];
  dire: LaneSideRow[];
  radiantGoldAt10: number;
  direGoldAt10: number;
  radiantXpAt10: number;
  direXpAt10: number;
  winner: 'radiant' | 'dire' | 'even';
};

function getHeroName(id: number, heroesData: HeroesData): string {
  return heroesData[id]?.name_cn || heroesData[id]?.name || `Hero ${id}`;
}

function getHeroImg(id: number, heroesData: HeroesData): string {
  const img = heroesData[id]?.img || `hero_${id}`;
  return `https://steamcdn-a.akamaihd.net/apps/dota2/images/heroes/${img}_lg.png`;
}

function getPlayerName(player: Player, heroesData: HeroesData): string {
  return player.name || player.personaname || getHeroName(player.hero_id, heroesData);
}

function getValueAt(arr: number[] | undefined, minute: number): number {
  if (!arr?.length) return 0;
  const idx = Math.min(minute, arr.length - 1);
  return Number(arr[idx] || 0);
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatK(value: number): string {
  if (!Number.isFinite(value)) return '-';
  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  return String(Math.round(value));
}

function getTeamLabel(name: string): string {
  const map: Record<string, string> = {
    'Team Spirit': 'Spirit',
    'Xtreme Gaming': 'XG',
    'Team Liquid': 'Liquid',
    'PSG.LGD': 'LGD',
    'Gaimin Gladiators': 'GG',
  };
  return map[name] || name;
}

function buildLaneData(players: Player[]): LaneData[] {
  const radiant = players.filter((p) => p.player_slot < 128);
  const dire = players.filter((p) => p.player_slot >= 128);

  const byLaneR: Record<number, Player[]> = { 1: [], 2: [], 3: [] };
  const byLaneD: Record<number, Player[]> = { 1: [], 2: [], 3: [] };

  radiant.forEach((p) => {
    const lane = p.lane || 1;
    if (byLaneR[lane]) byLaneR[lane].push(p);
  });
  dire.forEach((p) => {
    const lane = p.lane || 1;
    if (byLaneD[lane]) byLaneD[lane].push(p);
  });

  const defs = [
    { lane: 1, laneName: 'TOP LANE' },
    { lane: 2, laneName: 'MID LANE' },
    { lane: 3, laneName: 'BOT LANE' },
  ];

  const minute = 10;
  return defs.map(({ lane, laneName }) => {
    const radiantRows: LaneSideRow[] = (byLaneR[lane] || []).map((p) => ({
      player: p,
      goldAt10: getValueAt(p.gold_t, minute),
      xpAt10: getValueAt(p.xp_t, minute),
      lhAt10: getValueAt(p.lh_t, minute),
      dnAt10: getValueAt(p.dn_t, minute),
    }));

    const direRows: LaneSideRow[] = (byLaneD[lane] || []).map((p) => ({
      player: p,
      goldAt10: getValueAt(p.gold_t, minute),
      xpAt10: getValueAt(p.xp_t, minute),
      lhAt10: getValueAt(p.lh_t, minute),
      dnAt10: getValueAt(p.dn_t, minute),
    }));

    const radiantGoldAt10 = radiantRows.reduce((sum, r) => sum + r.goldAt10, 0);
    const direGoldAt10 = direRows.reduce((sum, r) => sum + r.goldAt10, 0);
    const radiantXpAt10 = radiantRows.reduce((sum, r) => sum + r.xpAt10, 0);
    const direXpAt10 = direRows.reduce((sum, r) => sum + r.xpAt10, 0);

    const winner: 'radiant' | 'dire' | 'even' =
      radiantGoldAt10 > direGoldAt10 ? 'radiant' : direGoldAt10 > radiantGoldAt10 ? 'dire' : 'even';

    return {
      laneName,
      radiant: radiantRows,
      dire: direRows,
      radiantGoldAt10,
      direGoldAt10,
      radiantXpAt10,
      direXpAt10,
      winner,
    };
  });
}

export function LaningAnalysis({ matchId, radiantTeamName, direTeamName, heroesData }: LaningAnalysisProps) {
  const [match, setMatch] = useState<MatchData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`https://api.opendota.com/api/matches/${matchId}`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.error) setMatch(data);
      })
      .catch(() => setMatch(null))
      .finally(() => setLoading(false));
  }, [matchId]);

  const laneData = useMemo(() => buildLaneData(match?.players || []), [match]);

  const totalEfficiency = useMemo(() => {
    const rows = match?.players || [];
    const radiantRows = rows.filter((p) => p.player_slot < 128);
    const direRows = rows.filter((p) => p.player_slot >= 128);

    const radiant = radiantRows.reduce((sum, p) => sum + Number(p.lane_efficiency || 0), 0) / Math.max(1, radiantRows.length);
    const dire = direRows.reduce((sum, p) => sum + Number(p.lane_efficiency || 0), 0) / Math.max(1, direRows.length);

    return { radiant, dire };
  }, [match]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-14">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  if (!match) {
    return <div className="py-8 text-center text-sm text-slate-500">对线数据加载失败</div>;
  }

  const winnerSide: 'radiant' | 'dire' = match.radiant_win ? 'radiant' : 'dire';
  const sideTextClass = (side: 'radiant' | 'dire') => (side === winnerSide ? 'text-emerald-300' : 'text-rose-300');
  const sideBoxClass = (side: 'radiant' | 'dire') =>
    side === winnerSide
      ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-100'
      : 'border-rose-500/25 bg-rose-500/10 text-rose-100';

  return (
    <div className="space-y-3 sm:space-y-4">
      <section className="rounded-xl border border-slate-800 bg-[linear-gradient(145deg,rgba(15,23,42,0.88),rgba(2,6,23,0.95))] px-3 py-2.5 sm:px-4 sm:py-3">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className={`min-w-0 text-xs sm:text-sm font-semibold truncate ${sideTextClass('radiant')}`}>{getTeamLabel(radiantTeamName)}</div>
          <div className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900/70 px-2 py-1 text-[11px] text-slate-300">
            <Clock3 className="h-3 w-3" />
            {formatDuration(match.duration || 0)}
          </div>
          <div className={`min-w-0 text-right text-xs sm:text-sm font-semibold truncate ${sideTextClass('dire')}`}>{getTeamLabel(direTeamName)}</div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] sm:text-xs">
          <div className={`rounded border px-2 py-1 ${sideBoxClass('radiant')}`}>
            对线效率 {Math.max(0, totalEfficiency.radiant * 100).toFixed(1)}%
          </div>
          <div className={`rounded border px-2 py-1 text-right ${sideBoxClass('dire')}`}>
            对线效率 {Math.max(0, totalEfficiency.dire * 100).toFixed(1)}%
          </div>
        </div>
      </section>

      {laneData.map((lane) => {
        const totalGold = lane.radiantGoldAt10 + lane.direGoldAt10;
        const radiantGoldPct = totalGold > 0 ? (lane.radiantGoldAt10 / totalGold) * 100 : 50;
        const goldDiff = lane.radiantGoldAt10 - lane.direGoldAt10;
        const laneLeader = lane.winner === 'even' ? null : lane.winner;
        const laneLeaderClass = laneLeader
          ? laneLeader === winnerSide
            ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
            : 'border-rose-500/35 bg-rose-500/10 text-rose-200'
          : 'border border-slate-600 bg-slate-800/60 text-slate-300';
        const diffClass =
          laneLeader === null
            ? 'text-slate-300'
            : laneLeader === winnerSide
              ? 'text-emerald-300'
              : 'text-rose-300';

        return (
          <section key={lane.laneName} className="rounded-xl border border-slate-800 bg-slate-900/45 p-2.5 sm:p-3.5">
            <header className="mb-2 flex items-center justify-between">
              <div className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900/70 px-2 py-0.5 text-[10px] sm:text-[11px] tracking-wide text-slate-300">
                <Zap className="h-3 w-3 text-amber-300" />
                {lane.laneName}
              </div>
              <div className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] sm:text-[11px] ${laneLeaderClass}`}>
                {lane.winner !== 'even' && <Crown className="h-3 w-3" />}
                {lane.winner === 'radiant' ? 'Radiant 优势' : lane.winner === 'dire' ? 'Dire 优势' : '均势'}
              </div>
            </header>

            <div className="mb-2 rounded border border-slate-800 bg-slate-950/60 p-2">
              <div className="mb-1 flex items-center justify-between text-[10px] text-slate-400">
                <span>10:00 经济对比</span>
                <span className={diffClass}>
                  {goldDiff >= 0 ? '+' : ''}{formatK(goldDiff)}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-800 relative">
                <div
                  className={`h-full absolute left-0 top-0 ${lane.winner === 'radiant' ? (winnerSide === 'radiant' ? 'bg-emerald-500' : 'bg-rose-500') : 'bg-slate-600/70'}`}
                  style={{ width: `${Math.max(0, Math.min(100, radiantGoldPct))}%` }}
                />
                <div
                  className={`h-full absolute right-0 top-0 ${lane.winner === 'dire' ? (winnerSide === 'dire' ? 'bg-emerald-500' : 'bg-rose-500') : 'bg-slate-600/70'}`}
                  style={{ width: `${Math.max(0, Math.min(100, 100 - radiantGoldPct))}%` }}
                />
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px]">
                <span className={sideTextClass('radiant')}>{formatK(lane.radiantGoldAt10)}</span>
                <span className={sideTextClass('dire')}>{formatK(lane.direGoldAt10)}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              <div className="space-y-1.5">
                {lane.radiant.map((row) => (
                  <PlayerLaneRow
                    key={`r-${lane.laneName}-${row.player.account_id}-${row.player.hero_id}`}
                    row={row}
                    heroesData={heroesData}
                    tone={winnerSide === 'radiant' ? 'winner' : 'loser'}
                  />
                ))}
                {lane.radiant.length === 0 && <div className="rounded border border-slate-800 bg-slate-950/50 px-2 py-1 text-xs text-slate-500">暂无英雄</div>}
              </div>

              <div className="space-y-1.5">
                {lane.dire.map((row) => (
                  <PlayerLaneRow
                    key={`d-${lane.laneName}-${row.player.account_id}-${row.player.hero_id}`}
                    row={row}
                    heroesData={heroesData}
                    tone={winnerSide === 'dire' ? 'winner' : 'loser'}
                  />
                ))}
                {lane.dire.length === 0 && <div className="rounded border border-slate-800 bg-slate-950/50 px-2 py-1 text-xs text-slate-500">暂无英雄</div>}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function PlayerLaneRow({ row, heroesData, tone }: { row: LaneSideRow; heroesData: HeroesData; tone: 'winner' | 'loser' }) {
  const toneCls =
    tone === 'winner'
      ? 'border-emerald-500/20 bg-emerald-500/5'
      : 'border-rose-500/20 bg-rose-500/5';

  return (
    <div className={`rounded-lg border px-2 py-1.5 ${toneCls}`}>
      <div className="flex items-center gap-2">
        <img
          src={getHeroImg(row.player.hero_id, heroesData)}
          alt={getHeroName(row.player.hero_id, heroesData)}
          className="h-8 w-12 rounded object-cover"
          loading="lazy"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium text-slate-100">{getPlayerName(row.player, heroesData)}</div>
          <div className="truncate text-[10px] text-slate-400">{getHeroName(row.player.hero_id, heroesData)}</div>
        </div>
        <div className="text-right text-[10px] text-slate-300 leading-tight">
          <div>LH/DN {row.lhAt10}/{row.dnAt10}</div>
          <div className={tone === 'winner' ? 'text-emerald-300' : 'text-rose-300'}>10分金 {formatK(row.goldAt10)}</div>
        </div>
      </div>
    </div>
  );
}

export default LaningAnalysis;
