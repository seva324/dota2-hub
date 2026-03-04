import { useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { Shield, Swords, Droplets, Skull, RotateCcw } from 'lucide-react';

interface MatchObjective {
  time: number;
  type: string;
  slot?: number;
  player_slot?: number;
  key?: string | number;
}

interface TeamfightPlayer {
  deaths?: number;
  gold_delta?: number;
  xp_delta?: number;
  buybacks?: number;
}

interface TeamfightData {
  start: number;
  end: number;
  players?: TeamfightPlayer[];
}

interface MatchPlayer {
  player_slot: number;
  hero_id: number;
  personaname?: string;
  name?: string;
  gold_t?: number[];
  xp_t?: number[];
  net_worth?: number;
  gold?: number;
}

interface TimelineFirstBloodEvent {
  id: string;
  type: 'firstblood';
  time: number;
  killer?: MatchPlayer;
  victim?: MatchPlayer;
}

interface TimelineRoshanEvent {
  id: string;
  type: 'roshan';
  time: number;
  owner?: MatchPlayer;
}

interface TimelineTeamfightEvent {
  id: string;
  type: 'teamfight';
  time: number;
  end: number;
  players: TeamfightPlayer[];
}

type TimelineEvent = TimelineFirstBloodEvent | TimelineRoshanEvent | TimelineTeamfightEvent;
type EventSide = 'radiant' | 'dire' | 'neutral';

interface MatchGraphsProps {
  match: {
    radiant_gold_adv?: number[];
    radiant_xp_adv?: number[];
    duration: number;
    players: MatchPlayer[];
    objectives?: MatchObjective[];
    teamfights?: TeamfightData[];
  };
  radiantTeamName: string;
  direTeamName: string;
  heroesData: Record<number, { name: string; img: string; name_cn?: string }>;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function generateTimeLabels(duration: number, count: number): string[] {
  if (count <= 0) return [];
  if (count === 1) return ['0:00'];
  const step = duration / (count - 1);
  return Array.from({ length: count }, (_, i) => formatDuration(Math.round(i * step)));
}

function getHeroName(id: number, heroes: Record<number, { name: string; img: string; name_cn?: string }>): string {
  const hero = heroes[id];
  if (!hero) return `Hero ${id}`;
  return hero.name_cn || hero.name || `Hero ${id}`;
}

function getHeroImg(id: number, heroes: Record<number, { name: string; img: string }>): string {
  const hero = heroes[id];
  if (!hero?.img) return '';
  return `https://steamcdn-a.akamaihd.net/apps/dota2/images/heroes/${hero.img}_lg.png`;
}

function getPlayerName(player: MatchPlayer, heroes: Record<number, { name: string; img: string; name_cn?: string }>): string {
  return player.name || player.personaname || getHeroName(player.hero_id, heroes);
}

function getNetWorth(player: MatchPlayer): number {
  if (typeof player.net_worth === 'number') return player.net_worth;
  return player.gold || 0;
}

function resolvePlayerFromObjective(
  objective: MatchObjective,
  players: MatchPlayer[],
  byPlayerSlot: Map<number, MatchPlayer>
): MatchPlayer | undefined {
  if (typeof objective.slot === 'number' && players[objective.slot]) return players[objective.slot];
  if (typeof objective.player_slot === 'number') return byPlayerSlot.get(objective.player_slot);
  return undefined;
}

function resolveVictimFromObjective(
  objective: MatchObjective,
  players: MatchPlayer[],
  byPlayerSlot: Map<number, MatchPlayer>
): MatchPlayer | undefined {
  if (typeof objective.key === 'number') {
    return players[objective.key] || byPlayerSlot.get(objective.key);
  }
  if (typeof objective.key === 'string') {
    const maybeNum = Number(objective.key);
    if (Number.isFinite(maybeNum)) {
      return players[maybeNum] || byPlayerSlot.get(maybeNum);
    }
  }
  return undefined;
}

function getPlayerSide(player: MatchPlayer): 'radiant' | 'dire' {
  return player.player_slot < 128 ? 'radiant' : 'dire';
}

export function MatchGraphs({ match, radiantTeamName, direTeamName, heroesData }: MatchGraphsProps) {
  const { radiant_gold_adv = [], radiant_xp_adv = [], duration, players = [], objectives = [], teamfights = [] } = match;
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const axisCount = Math.max(radiant_gold_adv.length, radiant_xp_adv.length);

  const timeLabels = useMemo(
    () => generateTimeLabels(duration, axisCount),
    [duration, axisCount]
  );

  const axisStep = useMemo(() => {
    if (axisCount <= 1 || duration <= 0) return 0;
    return duration / (axisCount - 1);
  }, [axisCount, duration]);

  const getAlignedTime = (seconds: number): number => {
    if (!axisStep || !Number.isFinite(seconds)) return Math.max(0, Math.round(seconds));
    const idx = Math.max(0, Math.min(axisCount - 1, Math.round(seconds / axisStep)));
    return Math.round(idx * axisStep);
  };

  const getAxisTimeLabel = (seconds: number): string => {
    if (!timeLabels.length || !axisStep) return formatDuration(Math.max(0, Math.round(seconds)));
    const idx = Math.max(0, Math.min(timeLabels.length - 1, Math.round(seconds / axisStep)));
    return timeLabels[idx];
  };

  const playersBySlot = useMemo(() => new Map(players.map((p) => [p.player_slot, p])), [players]);

  const timelineEvents = useMemo<TimelineEvent[]>(() => {
    const result: TimelineEvent[] = [];

    const firstBloodObjective = objectives
      .filter((obj) => obj.type?.includes('FIRSTBLOOD'))
      .sort((a, b) => a.time - b.time)[0];

    if (firstBloodObjective) {
      result.push({
        id: `fb-${firstBloodObjective.time}`,
        type: 'firstblood',
        time: firstBloodObjective.time,
        killer: resolvePlayerFromObjective(firstBloodObjective, players, playersBySlot),
        victim: resolveVictimFromObjective(firstBloodObjective, players, playersBySlot),
      });
    }

    const roshanEvents: TimelineRoshanEvent[] = [];
    objectives
      .filter((obj) => obj.type?.includes('AEGIS') || obj.type?.includes('ROSHAN'))
      .sort((a, b) => a.time - b.time)
      .forEach((obj, index) => {
        roshanEvents.push({
          id: `roshan-${obj.time}-${index}`,
          type: 'roshan',
          time: obj.time,
          owner: resolvePlayerFromObjective(obj, players, playersBySlot),
        });
      });
    roshanEvents.forEach((event, idx) => {
      const next = roshanEvents[idx + 1];
      const shouldDropUnknownDuplicate =
        !event.owner && !!next?.owner && Math.abs(next.time - event.time) <= 120;
      if (!shouldDropUnknownDuplicate) result.push(event);
    });

    teamfights
      .filter((fight) => Array.isArray(fight.players) && typeof fight.start === 'number' && typeof fight.end === 'number')
      .forEach((fight, index) => {
        result.push({
          id: `tf-${fight.start}-${index}`,
          type: 'teamfight',
          time: fight.start,
          end: fight.end,
          players: fight.players || [],
        });
      });

    return result.sort((a, b) => a.time - b.time);
  }, [objectives, players, playersBySlot, teamfights]);

  const activeEvent = useMemo(() => {
    if (!timelineEvents.length) return null;
    if (!activeEventId) return timelineEvents[0];
    return timelineEvents.find((e) => e.id === activeEventId) || timelineEvents[0];
  }, [activeEventId, timelineEvents]);

  const getEventSide = (event: TimelineEvent | null): EventSide => {
    if (!event) return 'neutral';
    if (event.type === 'firstblood') {
      if (!event.killer) return 'neutral';
      return getPlayerSide(event.killer) === 'radiant' ? 'radiant' : 'dire';
    }
    if (event.type === 'roshan') {
      if (!event.owner) return 'neutral';
      return getPlayerSide(event.owner) === 'radiant' ? 'radiant' : 'dire';
    }
    let radiantGoldDelta = 0;
    let direGoldDelta = 0;
    event.players.forEach((p, idx) => {
      const player = players[idx];
      if (!player) return;
      if (getPlayerSide(player) === 'radiant') {
        radiantGoldDelta += Number(p.gold_delta || 0);
      } else {
        direGoldDelta += Number(p.gold_delta || 0);
      }
    });
    if (radiantGoldDelta === direGoldDelta) return 'neutral';
    return radiantGoldDelta > direGoldDelta ? 'radiant' : 'dire';
  };

  const getEventTone = (side: EventSide) => {
    if (side === 'radiant') {
      return {
        active: 'border-red-400/85 bg-red-500/25 text-red-100 ring-1 ring-red-300/70',
        idle: 'border-red-400/70 bg-red-500/20 text-red-100 hover:border-red-300',
        badge: 'bg-red-500/15 text-red-200',
        panel: 'border-red-500/30 bg-red-500/5',
        line: 'border-red-400/40',
      };
    }
    if (side === 'dire') {
      return {
        active: 'border-green-400/85 bg-green-500/25 text-green-100 ring-1 ring-green-300/70',
        idle: 'border-green-400/70 bg-green-500/20 text-green-100 hover:border-green-300',
        badge: 'bg-green-500/15 text-green-200',
        panel: 'border-green-500/30 bg-green-500/5',
        line: 'border-green-400/40',
      };
    }
    return {
      active: 'border-slate-500/70 bg-slate-700/35 text-slate-100',
      idle: 'border-slate-700 bg-slate-900/70 text-slate-300 hover:border-slate-500/50',
      badge: 'bg-slate-500/15 text-slate-200',
      panel: 'border-slate-700 bg-slate-950/60',
      line: 'border-slate-500/35',
    };
  };

  const getEventAxisRatio = (seconds: number): number => {
    if (axisCount <= 1 || !axisStep) return 0;
    const idx = Math.max(0, Math.min(axisCount - 1, Math.round(seconds / axisStep)));
    return idx / (axisCount - 1);
  };

  const advantageChartOption: EChartsOption = useMemo(
    () => ({
      backgroundColor: 'transparent',
      grid: { left: 56, right: 20, top: 42, bottom: 34 },
      legend: {
        top: 8,
        textStyle: { color: '#94a3b8', fontSize: 11 },
        data: ['经济优势', '经验优势'],
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#0f172a',
        borderColor: '#334155',
        textStyle: { color: '#e2e8f0' },
        formatter: (params: any) => {
          const rows = (Array.isArray(params) ? params : [params]).filter(Boolean) as any[];
          const axisText = rows[0]?.axisValueLabel ?? rows[0]?.axisValue ?? '';
          const head = axisText ? `<b>${axisText}</b><br/>` : '';
          return `${head}${rows
            .map((row) => {
              const value = Number(row?.value ?? 0);
              return `${row?.marker || ''}${row?.seriesName || ''}: ${value >= 0 ? '+' : ''}${Math.round(value).toLocaleString()}`;
            })
            .join('<br/>')}`;
        },
      },
      xAxis: {
        type: 'category',
        data: timeLabels,
        axisLine: { lineStyle: { color: '#475569' } },
        axisLabel: { color: '#94a3b8', fontSize: 10 },
      },
      yAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: '#475569' } },
        axisLabel: {
          color: '#94a3b8',
          formatter: (value: number) => `${value >= 0 ? '+' : ''}${Math.round(value / 1000)}k`,
        },
        splitLine: { lineStyle: { color: '#334155', type: 'dashed' } },
      },
      series: [
        {
          name: '经济优势',
          type: 'line',
          smooth: 0.35,
          showSymbol: false,
          data: radiant_gold_adv,
          lineStyle: { width: 2.2, color: '#22c55e' },
          areaStyle: { color: 'rgba(34, 197, 94, 0.16)' },
          markLine: { symbol: 'none', lineStyle: { color: '#64748b', type: 'dashed' }, data: [{ yAxis: 0 }] },
        },
        {
          name: '经验优势',
          type: 'line',
          smooth: 0.35,
          showSymbol: false,
          data: radiant_xp_adv,
          lineStyle: { width: 2.1, color: '#38bdf8' },
          areaStyle: { color: 'rgba(56, 189, 248, 0.12)' },
        },
      ],
      graphic: [
        {
          type: 'text',
          left: 66,
          top: 48,
          style: { text: radiantTeamName || 'Radiant', fill: '#f87171', fontSize: 11, fontWeight: 600 },
        },
        {
          type: 'text',
          left: 66,
          bottom: 38,
          style: { text: direTeamName || 'Dire', fill: '#4ade80', fontSize: 11, fontWeight: 600 },
        },
      ],
    }),
    [direTeamName, radiantTeamName, radiant_gold_adv, radiant_xp_adv, timeLabels]
  );

  const netWorthChartOption: EChartsOption = useMemo(() => {
    const radiantPalette = ['#34d399', '#22c55e', '#10b981', '#15803d', '#166534'];
    const direPalette = ['#fb7185', '#f43f5e', '#ef4444', '#dc2626', '#991b1b'];
    const radiantPlayers = players.filter((p) => p.player_slot < 128);
    const direPlayers = players.filter((p) => p.player_slot >= 128);

    const series = [
      ...radiantPlayers.map((player, i) => ({
        name: getHeroName(player.hero_id, heroesData),
        type: 'line' as const,
        smooth: 0.28,
        showSymbol: false,
        data: player.gold_t || [],
        lineStyle: { width: 1.6, color: radiantPalette[i % radiantPalette.length] },
        emphasis: { lineStyle: { width: 2.6 } },
      })),
      ...direPlayers.map((player, i) => ({
        name: getHeroName(player.hero_id, heroesData),
        type: 'line' as const,
        smooth: 0.28,
        showSymbol: false,
        data: player.gold_t || [],
        lineStyle: { width: 1.6, color: direPalette[i % direPalette.length] },
        emphasis: { lineStyle: { width: 2.6 } },
      })),
    ];

    return {
      backgroundColor: 'transparent',
      grid: { left: 56, right: 20, top: 42, bottom: 34 },
      legend: {
        top: 8,
        textStyle: { color: '#94a3b8', fontSize: 10 },
        type: 'scroll' as const,
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#0f172a',
        borderColor: '#334155',
        textStyle: { color: '#e2e8f0' },
        formatter: (params: any) => {
          const rows = (Array.isArray(params) ? params : [params]).filter(Boolean).sort((a: any, b: any) => (b?.value || 0) - (a?.value || 0));
          const axisText = rows[0]?.axisValueLabel ?? rows[0]?.axisValue ?? '';
          const header = axisText ? `<b>${axisText}</b><br/>` : '';
          return `${header}${rows
            .slice(0, 10)
            .map((row: any) => `${row?.marker || ''}${row?.seriesName || ''}: ${((Number(row?.value) || 0) / 1000).toFixed(1)}k`)
            .join('<br/>')}`;
        },
      },
      xAxis: {
        type: 'category',
        data: timeLabels,
        axisLine: { lineStyle: { color: '#475569' } },
        axisLabel: { color: '#94a3b8', fontSize: 10 },
      },
      yAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: '#475569' } },
        axisLabel: { color: '#94a3b8', formatter: (value: number) => `${Math.round(value / 1000)}k` },
        splitLine: { lineStyle: { color: '#334155', type: 'dashed' } },
      },
      series,
    };
  }, [heroesData, players, timeLabels]);

  const activeFightRows = useMemo(() => {
    if (!activeEvent || activeEvent.type !== 'teamfight') return [];
    return activeEvent.players
      .map((fightPlayer, index) => {
        const player = players[index];
        if (!player) return null;
        return { player, fightPlayer };
      })
      .filter((row): row is { player: MatchPlayer; fightPlayer: TeamfightPlayer } => Boolean(row))
      .sort((a, b) => Math.abs((b.fightPlayer.gold_delta || 0)) - Math.abs(a.fightPlayer.gold_delta || 0));
  }, [activeEvent, players]);

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-slate-800 bg-slate-900/35 p-3">
        <header className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-100">关键时间轴</h4>
          <span className="text-[11px] text-slate-400">点击事件查看详情</span>
        </header>

        {timelineEvents.length === 0 ? (
          <div className="rounded border border-slate-800 bg-slate-950/50 px-3 py-2 text-xs text-slate-500">暂无可解析事件</div>
        ) : (
          <>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {timelineEvents.map((event) => {
                const isActive = activeEvent?.id === event.id;
                const tone = getEventTone(getEventSide(event));
                if (event.type === 'firstblood') {
                  return (
                    <button
                      key={event.id}
                      onClick={() => setActiveEventId(event.id)}
                      className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded border px-2 py-1 text-xs transition ${
                        isActive ? tone.active : tone.idle
                      }`}
                    >
                      <Droplets className="h-3.5 w-3.5" />
                      <span>{getAxisTimeLabel(getAlignedTime(event.time))}</span>
                    </button>
                  );
                }

                if (event.type === 'roshan') {
                  return (
                    <button
                      key={event.id}
                      onClick={() => setActiveEventId(event.id)}
                      className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded border px-2 py-1 text-xs transition ${
                        isActive ? tone.active : tone.idle
                      }`}
                    >
                      <img
                        src="https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/aegis.png"
                        alt="Aegis"
                        className="h-3.5 w-3.5 rounded-sm object-cover"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                      <span>{getAxisTimeLabel(getAlignedTime(event.time))}</span>
                    </button>
                  );
                }

                return (
                  <button
                    key={event.id}
                    onClick={() => setActiveEventId(event.id)}
                    className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded border px-2 py-1 text-xs transition ${
                      isActive ? tone.active : tone.idle
                    }`}
                  >
                    <Swords className="h-3.5 w-3.5" />
                    <span>{getAxisTimeLabel(getAlignedTime(event.time))}</span>
                  </button>
                );
              })}
            </div>

            {activeEvent && (
              <div className={`rounded-md border p-3 ${getEventTone(getEventSide(activeEvent)).panel}`}>
                {activeEvent.type === 'firstblood' && (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-200">
                    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 ${getEventTone(getEventSide(activeEvent)).badge}`}>
                      <Droplets className="h-3 w-3" />
                      {getAxisTimeLabel(getAlignedTime(activeEvent.time))} First Blood
                    </span>
                    <span className="text-slate-300">
                      {activeEvent.killer ? getHeroName(activeEvent.killer.hero_id, heroesData) : '未知英雄'} 击杀了{' '}
                      {activeEvent.victim ? getHeroName(activeEvent.victim.hero_id, heroesData) : '未知英雄'}
                    </span>
                  </div>
                )}

                {activeEvent.type === 'roshan' && (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-200">
                    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 ${getEventTone(getEventSide(activeEvent)).badge}`}>
                      <Shield className="h-3 w-3" />
                      {getAxisTimeLabel(getAlignedTime(activeEvent.time))} Roshan
                    </span>
                    <span>
                      Aegis 归属：
                      {activeEvent.owner ? `${getHeroName(activeEvent.owner.hero_id, heroesData)} (${getPlayerName(activeEvent.owner, heroesData)})` : '未知英雄'}
                    </span>
                  </div>
                )}

                {activeEvent.type === 'teamfight' && (
                  <div className="space-y-2">
                    <div className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs ${getEventTone(getEventSide(activeEvent)).badge}`}>
                      <Swords className="h-3 w-3" />
                      {getAxisTimeLabel(getAlignedTime(activeEvent.time))} - {getAxisTimeLabel(getAlignedTime(activeEvent.end))} Teamfight
                    </div>
                    <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
                      {activeFightRows.map(({ player, fightPlayer }) => {
                        const side = getPlayerSide(player);
                        const sideCls =
                          side === 'radiant'
                            ? 'border-red-500/25 bg-red-500/8'
                            : 'border-green-500/25 bg-green-500/8';
                        return (
                          <div key={`${player.player_slot}-${player.hero_id}`} className={`rounded border px-2 py-1 ${sideCls}`}>
                            <div className="flex items-center gap-2">
                              {getHeroImg(player.hero_id, heroesData) ? (
                                <div className="relative">
                                  <img
                                    src={getHeroImg(player.hero_id, heroesData)}
                                    alt={getHeroName(player.hero_id, heroesData)}
                                    className={`h-6 w-10 rounded object-cover ${fightPlayer.deaths && fightPlayer.deaths > 0 ? 'grayscale brightness-75' : ''}`}
                                    loading="lazy"
                                  />
                                  {(fightPlayer.deaths ?? 0) > 0 && (
                                    <span className="absolute inset-0 flex items-center justify-center rounded bg-slate-950/35">
                                      <Skull className="h-3.5 w-3.5 text-red-300" />
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <div className="h-6 w-10 rounded bg-slate-800" />
                              )}
                              <div className="min-w-0">
                                <div className="truncate text-xs text-slate-100">{getHeroName(player.hero_id, heroesData)}</div>
                                <div className="text-[11px] text-slate-400">{getPlayerName(player, heroesData)}</div>
                              </div>
                              <div className="ml-auto text-right text-[11px]">
                                <div className={`${(fightPlayer.gold_delta || 0) >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                                  金钱 {fightPlayer.gold_delta && fightPlayer.gold_delta > 0 ? '+' : ''}
                                  {fightPlayer.gold_delta || 0}
                                </div>
                                {(fightPlayer.buybacks ?? 0) > 0 ? (
                                  <div className="mt-0.5 flex items-center justify-end gap-1 text-amber-300">
                                    <RotateCcw className="h-3 w-3" />
                                    买活 {fightPlayer.buybacks}
                                  </div>
                                ) : null}
                                {(fightPlayer.deaths ?? 0) > 0 ? (
                                  <div className="flex items-center justify-end gap-1 text-slate-300">
                                    <Skull className="h-3 w-3" />
                                    死亡 {fightPlayer.deaths}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/35 p-3">
        <h4 className="mb-2 text-sm font-semibold text-slate-100">经济 / 经验优势曲线</h4>
        <div className="relative pt-10">
          <div className="absolute inset-x-0 top-0 bottom-0 pointer-events-none">
            {timelineEvents.map((event) => {
              const ratio = getEventAxisRatio(event.time);
              const tone = getEventTone(getEventSide(event));
              const left = `calc(56px + (100% - 76px) * ${ratio})`;
              const isActive = activeEvent?.id === event.id;
              return (
                <div key={`axis-${event.id}`} className="absolute top-0 bottom-0 -translate-x-1/2 flex flex-col items-center" style={{ left }}>
                  <button
                    type="button"
                    onClick={() => setActiveEventId(event.id)}
                    className={`pointer-events-auto inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] ${isActive ? tone.active : tone.idle}`}
                    title={`${getAxisTimeLabel(getAlignedTime(event.time))}`}
                  >
                    {event.type === 'firstblood' ? (
                      <Droplets className="h-3 w-3" />
                    ) : event.type === 'roshan' ? (
                      <img
                        src="https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/aegis.png"
                        alt="Aegis"
                        className="h-3 w-3 rounded-sm object-cover"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <Swords className="h-3 w-3" />
                    )}
                    <span>{getAxisTimeLabel(getAlignedTime(event.time))}</span>
                  </button>
                  <div className={`mt-1 w-px flex-1 border-l border-dashed ${tone.line}`} />
                </div>
              );
            })}
          </div>
          <div className="h-60">
            <ReactECharts option={advantageChartOption} style={{ height: '100%' }} />
          </div>
          <div className="mt-4 h-72">
            <ReactECharts option={netWorthChartOption} style={{ height: '100%' }} />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-2 text-xs text-slate-400 sm:grid-cols-2">
        <div className="rounded border border-slate-800 bg-slate-900/35 px-3 py-2">
          Radiant 经济前二：{' '}
          {players
            .filter((p) => p.player_slot < 128)
            .sort((a, b) => getNetWorth(b) - getNetWorth(a))
            .slice(0, 2)
            .map((p) => `${getHeroName(p.hero_id, heroesData)} (${Math.round(getNetWorth(p) / 1000)}k)`)
            .join(' / ') || '无数据'}
        </div>
        <div className="rounded border border-slate-800 bg-slate-900/35 px-3 py-2">
          Dire 经济前二：{' '}
          {players
            .filter((p) => p.player_slot >= 128)
            .sort((a, b) => getNetWorth(b) - getNetWorth(a))
            .slice(0, 2)
            .map((p) => `${getHeroName(p.hero_id, heroesData)} (${Math.round(getNetWorth(p) / 1000)}k)`)
            .join(' / ') || '无数据'}
        </div>
      </section>
    </div>
  );
}
