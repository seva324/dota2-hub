import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';

interface MatchGraphsProps {
  match: {
    radiant_gold_adv?: number[];
    radiant_xp_adv?: number[];
    duration: number;
    players: Array<{
      player_slot: number;
      hero_id: number;
      personaname?: string;
      gold_t?: number[];
      xp_t?: number[];
      net_worth?: number;
      gold?: number;
    }>;
  };
  radiantTeamName: string;
  direTeamName: string;
  heroesData: Record<number, { name: string; img: string }>;
}

function getHeroName(id: number, heroes: Record<number, { name: string; img: string }>): string {
  return heroes[id]?.name || `Hero ${id}`;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function generateTimeLabels(duration: number, intervals: number = 33): string[] {
  const labels: string[] = [];
  const step = duration / (intervals - 1);
  for (let i = 0; i < intervals; i++) {
    labels.push(formatDuration(Math.round(i * step)));
  }
  return labels;
}

export function MatchGraphs({ match, radiantTeamName, direTeamName, heroesData }: MatchGraphsProps) {
  const { radiant_gold_adv = [], radiant_xp_adv = [], duration, players } = match;
  
  const radiantPlayers = players.filter(p => p.player_slot < 128);
  const direPlayers = players.filter(p => p.player_slot >= 128);
  
  const timeLabels = useMemo(() => generateTimeLabels(duration, radiant_gold_adv.length), [duration, radiant_gold_adv.length]);
  
  // Gold Advantage Chart
  const goldChartOption: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    grid: {
      left: 60,
      right: 20,
      top: 40,
      bottom: 30,
    },
    title: {
      text: 'Gold Advantage',
      left: 'center',
      top: 5,
      textStyle: {
        color: '#94a3b8',
        fontSize: 12,
        fontWeight: 'normal',
      },
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#1e293b',
      borderColor: '#334155',
      textStyle: { color: '#f1f5f9' },
      formatter: (params: any) => {
        const time = params[0]?.axisValue || '0:00';
        let html = `<div style="padding:4px"><strong>${time}</strong><br/>`;
        params.forEach((p: any) => {
          const val = p.value ?? 0;
          const color = val >= 0 ? '#4ade80' : '#f87171';
          html += `<span style="color:${color}">${p.seriesName}: ${val >= 0 ? '+' : ''}${val.toLocaleString()}</span><br/>`;
        });
        html += '</div>';
        return html;
      },
    },
    legend: {
      data: [radiantTeamName || 'Radiant', direTeamName || 'Dire'],
      top: 20,
      textStyle: { color: '#94a3b8', fontSize: 11 },
    },
    xAxis: {
      type: 'category',
      data: timeLabels,
      axisLine: { lineStyle: { color: '#475569' } },
      axisLabel: { color: '#94a3b8', fontSize: 10 },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLine: { lineStyle: { color: '#475569' } },
      axisLabel: { 
        color: '#94a3b8', 
        fontSize: 10,
        formatter: (val: number) => val >= 0 ? `+${(val/1000).toFixed(0)}k` : `${(val/1000).toFixed(0)}k`
      },
      splitLine: { lineStyle: { color: '#334155', type: 'dashed' } },
    },
    series: [
      {
        name: radiantTeamName || 'Radiant',
        type: 'line',
        data: radiant_gold_adv,
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#4ade80', width: 2 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(74, 222, 128, 0.3)' },
              { offset: 0.5, color: 'rgba(74, 222, 128, 0.05)' },
              { offset: 1, color: 'rgba(248, 113, 113, 0.05)' },
            ],
          },
        },
      },
    ],
    animation: true,
  }), [radiant_gold_adv, timeLabels, radiantTeamName]);
  
  // XP Advantage Chart
  const xpChartOption: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    grid: {
      left: 60,
      right: 20,
      top: 40,
      bottom: 30,
    },
    title: {
      text: 'XP Advantage',
      left: 'center',
      top: 5,
      textStyle: {
        color: '#94a3b8',
        fontSize: 12,
        fontWeight: 'normal',
      },
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#1e293b',
      borderColor: '#334155',
      textStyle: { color: '#f1f5f9' },
      formatter: (params: any) => {
        const time = params[0]?.axisValue || '0:00';
        let html = `<div style="padding:4px"><strong>${time}</strong><br/>`;
        params.forEach((p: any) => {
          const val = p.value ?? 0;
          const color = val >= 0 ? '#4ade80' : '#f87171';
          html += `<span style="color:${color}">${p.seriesName}: ${val >= 0 ? '+' : ''}${val.toLocaleString()}</span><br/>`;
        });
        html += '</div>';
        return html;
      },
    },
    legend: {
      data: [radiantTeamName || 'Radiant', direTeamName || 'Dire'],
      top: 20,
      textStyle: { color: '#94a3b8', fontSize: 11 },
    },
    xAxis: {
      type: 'category',
      data: timeLabels,
      axisLine: { lineStyle: { color: '#475569' } },
      axisLabel: { color: '#94a3b8', fontSize: 10 },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLine: { lineStyle: { color: '#475569' } },
      axisLabel: { 
        color: '#94a3b8', 
        fontSize: 10,
        formatter: (val: number) => val >= 0 ? `+${(val/1000).toFixed(0)}k` : `${(val/1000).toFixed(0)}k`
      },
      splitLine: { lineStyle: { color: '#334155', type: 'dashed' } },
    },
    series: [
      {
        name: radiantTeamName || 'Radiant',
        type: 'line',
        data: radiant_xp_adv,
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#4ade80', width: 2 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(74, 222, 128, 0.3)' },
              { offset: 0.5, color: 'rgba(74, 222, 128, 0.05)' },
              { offset: 1, color: 'rgba(248, 113, 113, 0.05)' },
            ],
          },
        },
      },
    ],
    animation: true,
  }), [radiant_xp_adv, timeLabels, radiantTeamName]);
  
  // Net Worth per Hero Chart
  const netWorthColors = [
    '#4ade80', '#22c55e', '#16a34a', '#15803d', '#166534',
    '#f87171', '#ef4444', '#dc2626', '#b91c1c', '#991b1b'
  ];
  
  const netWorthChartOption: EChartsOption = useMemo(() => {
    const series: any[] = [];
    
    radiantPlayers.forEach((p, i) => {
      const data = p.gold_t || [];
      if (data.length > 0) {
        series.push({
          name: getHeroName(p.hero_id, heroesData),
          type: 'line',
          data: data,
          smooth: true,
          symbol: 'none',
          lineStyle: { color: netWorthColors[i], width: 1.5 },
          emphasis: { lineStyle: { width: 2 } },
        });
      }
    });
    
    direPlayers.forEach((p, i) => {
      const data = p.gold_t || [];
      if (data.length > 0) {
        series.push({
          name: getHeroName(p.hero_id, heroesData),
          type: 'line',
          data: data,
          smooth: true,
          symbol: 'none',
          lineStyle: { color: netWorthColors[5 + i], width: 1.5 },
          emphasis: { lineStyle: { width: 2 } },
        });
      }
    });
    
    return {
      backgroundColor: 'transparent',
      grid: {
        left: 60,
        right: 20,
        top: 40,
        bottom: 30,
      },
      title: {
        text: 'Net Worth by Hero',
        left: 'center',
        top: 5,
        textStyle: {
          color: '#94a3b8',
          fontSize: 12,
          fontWeight: 'normal',
        },
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#1e293b',
        borderColor: '#334155',
        textStyle: { color: '#f1f5f9' },
        formatter: (params: any) => {
          const time = params[0]?.axisValue || '0:00';
          let html = `<div style="padding:4px"><strong>${time}</strong></div>`;
          const sortedParams = [...params].sort((a, b) => (b.value || 0) - (a.value || 0));
          sortedParams.slice(0, 5).forEach((p: any) => {
            html += `<div><span style="color:${p.color}">●</span> ${p.seriesName}: ${((p.value || 0)/1000).toFixed(1)}k</div>`;
          });
          return html;
        },
      },
      legend: {
        data: series.map(s => s.name),
        top: 20,
        textStyle: { color: '#94a3b8', fontSize: 10 },
        type: 'scroll',
        orient: 'horizontal',
      },
      xAxis: {
        type: 'category',
        data: timeLabels,
        axisLine: { lineStyle: { color: '#475569' } },
        axisLabel: { color: '#94a3b8', fontSize: 10 },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: '#475569' } },
        axisLabel: { 
          color: '#94a3b8', 
          fontSize: 10,
          formatter: (val: number) => `${(val/1000).toFixed(0)}k`
        },
        splitLine: { lineStyle: { color: '#334155', type: 'dashed' } },
      },
      series,
      animation: true,
    };
  }, [radiantPlayers, direPlayers, heroesData, timeLabels]);
  
  return (
    <div className="space-y-4">
      <div className="h-48">
        <ReactECharts option={goldChartOption} style={{ height: '100%' }} />
      </div>
      <div className="h-48">
        <ReactECharts option={xpChartOption} style={{ height: '100%' }} />
      </div>
      <div className="h-64">
        <ReactECharts option={netWorthChartOption} style={{ height: '100%' }} />
      </div>
    </div>
  );
}
