import { Clock } from 'lucide-react';
import { SafeImg } from '@/components/custom/SafeImg';
import { getHeroImageUrl } from '@/lib/assetUrls';

type MatchRow = {
  matchId: number | null;
  playerHeroId: number | null;
  kda: string;
  gpm: number | null;
  xpm: number | null;
  won: boolean | null;
};

type HeroMeta = Record<number, { name?: string; name_cn?: string; img?: string }>;

type Props = { matches: MatchRow[]; heroMap: HeroMeta };

function getHeroImg(heroId: number, heroMap: HeroMeta) {
  const hero = heroMap[heroId];
  if (hero?.img) return getHeroImageUrl(heroId, hero.img);
  return `/images/mirror/heroes/${heroId}.png`;
}

export function PlayerRecentMatches({ matches, heroMap }: Props) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 text-xs font-bold text-foreground uppercase tracking-wider">
          <Clock className="size-3.5 text-red-400" /> 近期比赛
        </h4>
        <button type="button" className="text-xs text-slate-400 hover:text-slate-200">全部比赛 ›</button>
      </div>
      {matches.length ? (
        <div className="overflow-hidden rounded-xl border border-slate-700/60">
          <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_3rem_3rem_3.5rem] items-center gap-x-2 border-b border-slate-700/60 bg-slate-800/60 px-3 py-2 text-[10px] font-medium text-slate-400">
            <span className="text-center">英雄</span>
            <span className="text-center">KDA</span>
            <span className="text-center">GPM</span>
            <span className="text-center">XPM</span>
            <span className="text-center">结果</span>
          </div>
          {matches.slice(0, 5).map((match, idx) => {
            const heroImg = match.playerHeroId ? getHeroImg(match.playerHeroId, heroMap) : '';
            const heroInitial = heroImg ? '' : '?';
            const rowBg = match.won === true
              ? 'bg-emerald-950/20'
              : match.won === false ? 'bg-red-950/20'
              : idx % 2 === 0 ? 'bg-slate-800/20' : 'bg-transparent';

            return (
              <div key={`${match.matchId}-${idx}`} className={`grid grid-cols-[2.5rem_minmax(0,1fr)_3rem_3rem_3.5rem] items-center gap-x-2 border-b border-border/15 px-3 py-2.5 text-sm last:border-b-0 transition hover:bg-slate-800/30 ${rowBg}`}>
                <div className="flex justify-center">
                  {heroImg ? (
                    <SafeImg src={heroImg} alt="" className="size-8 rounded object-cover"
                      fallback={<div className="flex size-8 items-center justify-center rounded bg-gradient-to-br from-slate-700 to-slate-800 text-xs font-bold text-slate-400">{heroInitial}</div>} />
                  ) : (
                    <div className="flex size-8 items-center justify-center rounded bg-gradient-to-br from-slate-700 to-slate-800 text-xs font-bold text-slate-400">{heroInitial}</div>
                  )}
                </div>
                <div className="text-center"><span className="text-[11px] font-medium text-slate-200 tabular-nums">{match.kda || '--'}</span></div>
                <div className="text-center"><span className="text-[11px] text-slate-300 tabular-nums">{match.gpm != null ? String(match.gpm) : '--'}</span></div>
                <div className="text-center"><span className="text-[11px] text-slate-300 tabular-nums">{match.xpm != null ? String(match.xpm) : '--'}</span></div>
                <div className="flex justify-center">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    match.won === true ? 'bg-emerald-500/20 text-emerald-300' :
                    match.won === false ? 'bg-red-500/20 text-red-300' : 'bg-slate-700 text-slate-400'
                  }`}>{match.won === true ? 'WIN' : match.won === false ? 'LOSS' : '--'}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-border/30 bg-secondary/30 p-4 text-sm text-slate-500">暂无近期比赛</div>
      )}
    </section>
  );
}
