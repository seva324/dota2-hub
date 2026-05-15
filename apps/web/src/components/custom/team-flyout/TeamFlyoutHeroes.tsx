import { Target } from 'lucide-react';
import { getHeroImageUrl } from '@/lib/assetUrls';

type HeroMeta = Record<number, { name?: string; name_cn?: string; img?: string }>;

type Props = {
  heroes: Array<[number, number]>;
  heroMap: HeroMeta;
  heroWinRates: Map<number, { wins: number; total: number }>;
};

function getHeroImg(heroId: number, heroMap: HeroMeta) {
  return getHeroImageUrl(heroId, heroMap[heroId]?.img || null);
}

export function TeamFlyoutHeroes({ heroes, heroMap, heroWinRates }: Props) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-2.5"><Target className="w-4 h-4 text-red-400" /><h4 className="text-xs font-bold text-foreground uppercase tracking-wider">常用英雄</h4></div>
      {heroes.length ? (
        <div className="space-y-2">
          {heroes.map(([heroId, cnt]) => {
            const maxCnt = heroes[0]?.[1] || 1;
            const pct = Math.round((cnt / maxCnt) * 100);
            const heroWinStats = heroWinRates.get(heroId);
            const heroWr = heroWinStats && heroWinStats.total > 0 ? Math.round((heroWinStats.wins / heroWinStats.total) * 100) : null;
            const wins = heroWinStats?.wins ?? 0;
            const losses = heroWinStats ? heroWinStats.total - heroWinStats.wins : 0;
            const img = getHeroImg(heroId, heroMap);
            const heroName = heroMap[heroId]?.name_cn || heroMap[heroId]?.name || `Hero ${heroId}`;
            return (
              <div key={heroId} className="flex items-center gap-2.5 rounded-xl bg-secondary/40 border border-border/30 p-2.5 hover:border-border/50 transition-colors duration-200">
                {img ? <img src={img} alt={heroName} className="w-12 h-12 rounded object-cover flex-shrink-0 border border-slate-700/50" /> : <div className="w-12 h-12 rounded bg-slate-700 flex-shrink-0 border border-slate-700/50" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-200 truncate">{heroName}</span>
                    <span className="text-xs font-medium text-slate-400 flex-shrink-0 ml-2 tabular-nums">{cnt} 场</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[11px] tabular-nums">
                    {heroWinStats ? (
                      <>
                        <span className="text-emerald-400">{wins} 胜</span><span className="text-slate-600">·</span>
                        <span className="text-red-400">{losses} 负</span>
                        {heroWr !== null && <><span className="text-slate-600">·</span><span className="text-sky-400 font-medium">{heroWr}%</span></>}
                      </>
                    ) : <span className="text-slate-500">—</span>}
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-slate-700/70 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-purple-500 via-purple-400 to-fuchsia-400 transition-all duration-500"
                      style={{ width: `${Math.max(4, pct)}%`, boxShadow: '0 0 8px rgba(168,85,247,0.3)' }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-xs text-slate-400">暂无英雄统计</div>
      )}
    </section>
  );
}
