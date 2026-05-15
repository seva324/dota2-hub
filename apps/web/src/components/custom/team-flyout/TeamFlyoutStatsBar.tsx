type Props = { wins: number; losses: number; winRate: number };

export function TeamFlyoutStatsBar({ wins, losses, winRate }: Props) {
  return (
    <div className="rounded-xl border border-border/30 bg-gradient-to-b from-secondary/70 to-secondary/40 p-4 shadow-[var(--shadow-card)]">
      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest text-center mb-2.5">近 10 场战绩</div>
      <div className="flex items-center justify-between">
        <div className="text-center flex-1">
          <div className="text-2xl font-extrabold text-emerald-400 tabular-nums">{wins}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wide">胜</div>
        </div>
        <div className="w-px h-8 bg-border/40" />
        <div className="text-center flex-1">
          <div className="text-2xl font-extrabold text-red-400 tabular-nums">{losses}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wide">负</div>
        </div>
        <div className="w-px h-8 bg-border/40" />
        <div className="text-center flex-1">
          <div className="text-[1.65rem] font-extrabold text-foreground tabular-nums">{winRate}%</div>
          <div className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wide">胜率</div>
        </div>
      </div>
      <div className="mt-3 h-1.5 rounded-full bg-secondary/80 overflow-hidden">
        <div className="h-full rounded-full bg-gradient-to-r from-emerald-600 via-emerald-400 to-emerald-300 transition-all duration-500"
          style={{ width: `${Math.min(100, Math.max(0, winRate))}%`, boxShadow: '0 0 10px rgba(52,211,153,0.35)' }} />
      </div>
    </div>
  );
}
