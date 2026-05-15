import { Crosshair } from 'lucide-react';
import { getHeroImageUrl } from '@/lib/assetUrls';

type HeroEntry = { heroId: number; games: number; winRate: number };
type HeroMeta = Record<number, { name?: string; name_cn?: string; img?: string }>;

type Props = { heroes: HeroEntry[]; heroMap: HeroMeta };

function getHeroImg(heroId: number, heroMap: HeroMeta) {
  const hero = heroMap[heroId];
  if (hero?.img) return getHeroImageUrl(heroId, hero.img);
  return `/images/mirror/heroes/${heroId}.png`;
}

const HERO_NAMES: Record<number, string> = {
  1: '敌法师', 2: '斧王', 3: '蝙蝠骑士', 4: '血魔', 5: '冰女', 6: '沉默术士',
  7: '幻刺', 8: '主宰', 9: '巨魔战将', 10: '痛苦女王', 11: '影魔',
  35: '狙击手', 41: '虚空假面', 44: '幻影刺客', 46: '圣堂刺客',
  74: '法身', 75: '沙王', 86: '沙漠巫妖', 99: '破法者', 106: '酒仙',
  114: '混沌骑士', 129: '龙骑士',
};

function getHeroName(heroId: number, heroMap: HeroMeta) {
  return HERO_NAMES[heroId] || heroMap[heroId]?.name_cn || heroMap[heroId]?.name || `英雄${heroId}`;
}

export function HeroPoolGrid({ heroes, heroMap }: Props) {
  if (!heroes.length) {
    return (
      <section>
        <h4 className="mb-3 flex items-center gap-1.5 text-xs font-bold text-foreground uppercase tracking-wider">
          <Crosshair className="size-3.5 text-red-400" /> 英雄池
        </h4>
        <div className="rounded-xl border border-border/30 bg-secondary/30 p-4 text-sm text-slate-500">暂无英雄统计</div>
      </section>
    );
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 text-xs font-bold text-foreground uppercase tracking-wider">
          <Crosshair className="size-3.5 text-red-400" /> 英雄池
        </h4>
        <button type="button" className="text-xs text-slate-400 hover:text-slate-200">更多 ›</button>
      </div>
      <div className="space-y-2">
        {heroes.slice(0, 6).map((hero) => {
          const img = getHeroImg(hero.heroId, heroMap);
          const heroName = getHeroName(hero.heroId, heroMap);
          const isPositive = hero.winRate >= 50;
          return (
            <div key={hero.heroId} className="flex items-center gap-3 rounded-xl border border-border/30 bg-secondary/30 p-2.5 transition hover:border-slate-600/60 hover:bg-slate-800/50">
              <div className="size-16 shrink-0 overflow-hidden rounded-lg bg-slate-700">
                {img ? (
                  <img src={img} alt={heroName} className="h-full w-full object-cover object-top" />
                ) : (
                  <div className="h-full w-full bg-slate-700" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="truncate text-sm font-medium text-slate-100">{heroName}</span>
                  <span className="ml-2 shrink-0 text-[10px] text-slate-500">{hero.games}场</span>
                </div>
                <div className="mt-1.5 flex items-center gap-2.5">
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-700/80">
                    <div className={`h-full rounded-full transition-all ${isPositive ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ width: `${Math.min(hero.winRate, 100)}%` }} />
                  </div>
                  <span className={`shrink-0 text-xs font-bold tabular-nums ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>{hero.winRate.toFixed(1)}%</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
