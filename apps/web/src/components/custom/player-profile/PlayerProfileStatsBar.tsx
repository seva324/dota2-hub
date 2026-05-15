type Props = {
  winRate: number | null;
  avgKills: number | null;
  avgDeaths: number | null;
  avgGpm: number | null;
  avgXpm: number | null;
};

export function PlayerProfileStatsBar({ winRate, avgKills, avgDeaths, avgGpm, avgXpm }: Props) {
  const stats = [
    { label: '胜率', value: winRate != null ? `${winRate.toFixed(1)}%` : '--', color: winRate != null ? (winRate >= 50 ? 'text-emerald-400' : 'text-red-400') : 'text-white' },
    { label: '场均击杀', value: avgKills != null ? avgKills.toFixed(1) : '--', color: 'text-white' },
    { label: '场均死亡', value: avgDeaths != null ? avgDeaths.toFixed(1) : '--', color: 'text-red-400' },
    { label: '场均GPM', value: avgGpm != null ? String(avgGpm) : '--', color: 'text-amber-400' },
    { label: '场均XPM', value: avgXpm != null ? String(avgXpm) : '--', color: 'text-amber-400' },
  ];

  return (
    <div className="mt-4 grid grid-cols-5 divide-x divide-border/30 overflow-hidden rounded-xl border border-border/60 bg-gradient-to-r from-secondary/70 via-secondary/40 to-secondary/70">
      {stats.map((stat) => (
        <div key={stat.label} className="flex flex-col items-center justify-center gap-1 py-3">
          <span className={`text-3xl font-bold tabular-nums ${stat.color}`}>{stat.value}</span>
          <span className="text-[10px] font-medium text-slate-400">{stat.label}</span>
        </div>
      ))}
    </div>
  );
}
