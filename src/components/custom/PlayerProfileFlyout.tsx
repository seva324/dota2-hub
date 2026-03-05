import { useEffect, useMemo, useState } from 'react';
import { Calendar, Flag, Shield, Target, Trophy, UserRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  buildRecentMatchDraftRows,
  toBirthMonthYear,
} from '@/lib/playerProfile';
import type { PlayerFlyoutModel } from '@/lib/playerProfile';

type HeroMeta = {
  name?: string;
  name_cn?: string;
  img?: string;
};

export interface PlayerProfileFlyoutProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  player: PlayerFlyoutModel | null;
}

function formatTs(ts?: number | null): string {
  if (!ts) return 'TBD';
  return new Date(ts * 1000).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getHeroImg(heroId: number, heroMap: Record<number, HeroMeta>): string {
  const hero = heroMap[heroId];
  if (!hero?.img) return '';
  return `https://steamcdn-a.akamaihd.net/apps/dota2/images/heroes/${hero.img}_lg.png`;
}

export function PlayerProfileFlyout({ open, onOpenChange, player }: PlayerProfileFlyoutProps) {
  const [heroMap, setHeroMap] = useState<Record<number, HeroMeta>>({});

  useEffect(() => {
    if (!open) return;

    fetch('/api/heroes')
      .then((res) => res.json())
      .then((data) => {
        setHeroMap(data || {});
      })
      .catch(() => {});
  }, [open]);

  const recentRows = useMemo(() => buildRecentMatchDraftRows(player?.recentMatches || []), [player?.recentMatches]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="w-full sm:max-w-2xl bg-slate-900 border-slate-700 text-slate-100 p-0 overscroll-contain"
      >
        <div className="h-full overflow-y-auto">
          <SheetHeader className="border-b border-slate-700 bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950/40 p-6 pl-12">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden">
                {player?.avatarUrl ? (
                  <img
                    src={player.avatarUrl}
                    alt={player.playerName}
                    width={56}
                    height={56}
                    className="h-14 w-14 object-cover"
                  />
                ) : (
                  <UserRound className="h-6 w-6 text-slate-400" />
                )}
              </div>

              <div className="min-w-0">
                <SheetTitle className="text-lg text-white truncate">{player?.playerName || 'Player'}</SheetTitle>
                <SheetDescription className="text-slate-400">
                  {player?.teamName || 'Free Agent'}
                </SheetDescription>
                <div className="mt-1 text-xs text-slate-400">
                  {player?.realName || 'Unknown Real Name'}
                  {player?.chineseName ? ` · ${player.chineseName}` : ''}
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Badge variant="outline" className="border-slate-600 text-slate-200">
                ID {player?.accountId ?? '-'}
              </Badge>
              {player?.nationality && (
                <Badge variant="outline" className="border-slate-600 text-slate-200">
                  <Flag className="mr-1 h-3 w-3" />
                  {player.nationality}
                </Badge>
              )}
              <Badge variant="outline" className="border-slate-600 text-slate-200">
                <Calendar className="mr-1 h-3 w-3" />
                出生 {toBirthMonthYear(player?.birthMonth, player?.birthYear)}
              </Badge>
              {typeof player?.age === 'number' && (
                <Badge variant="outline" className="border-slate-600 text-slate-200">{player.age} 岁</Badge>
              )}
              {typeof player?.winRate === 'number' && (
                <Badge variant="outline" className="border-slate-600 text-slate-200">
                  <Target className="mr-1 h-3 w-3" />
                  生涯胜率 {player.winRate.toFixed(1)}%
                </Badge>
              )}
            </div>
          </SheetHeader>

          <div className="space-y-6 p-6">
            <section>
              <div className="mb-3 flex items-center gap-2 text-white">
                <Calendar className="h-4 w-4 text-blue-400" />
                <h4 className="font-semibold">下一场比赛</h4>
              </div>
              {player?.nextMatch ? (
                <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
                  <div className="text-sm text-slate-200">
                    {player.teamName || player.playerName} vs {player.nextMatch.opponentName || 'TBD'}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    {player.nextMatch.tournament || 'Unknown Tournament'} · {player.nextMatch.seriesType || 'BO3'}
                  </div>
                  <div className="mt-2 text-xs text-blue-300">{formatTs(player.nextMatch.startTime)}</div>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4 text-sm text-slate-400">暂无未来赛程</div>
              )}
            </section>

            <section>
              <div className="mb-3 flex items-center gap-2 text-white">
                <Trophy className="h-4 w-4 text-amber-400" />
                <h4 className="font-semibold">招牌英雄（最高胜率）</h4>
              </div>
              {player?.signatureHero ? (
                <div className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/50 p-3">
                  {getHeroImg(player.signatureHero.heroId, heroMap) ? (
                    <img
                      src={getHeroImg(player.signatureHero.heroId, heroMap)}
                      alt={String(heroMap[player.signatureHero.heroId]?.name_cn || heroMap[player.signatureHero.heroId]?.name || player.signatureHero.heroId)}
                      width={44}
                      height={44}
                      className="h-11 w-11 rounded-md object-cover"
                    />
                  ) : (
                    <div className="h-11 w-11 rounded-md bg-slate-700" />
                  )}
                  <div>
                    <div className="text-sm font-medium text-slate-100">
                      {heroMap[player.signatureHero.heroId]?.name_cn || heroMap[player.signatureHero.heroId]?.name || `Hero ${player.signatureHero.heroId}`}
                    </div>
                    <div className="text-xs text-slate-300">
                      胜率 {player.signatureHero.winRate.toFixed(1)}% · {player.signatureHero.wins}/{player.signatureHero.games}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4 text-sm text-slate-400">
                  暂无英雄样本
                </div>
              )}
            </section>

            <section>
              <div className="mb-3 flex items-center gap-2 text-white">
                <Shield className="h-4 w-4 text-cyan-400" />
                <h4 className="font-semibold">过去 3 个月常用英雄</h4>
              </div>
              <div className="space-y-2">
                {(player?.mostPlayedHeroes || []).map((hero) => {
                  const img = getHeroImg(hero.heroId, heroMap);
                  const heroName = heroMap[hero.heroId]?.name_cn || heroMap[hero.heroId]?.name || `Hero ${hero.heroId}`;
                  return (
                    <div
                      key={`mp-${hero.heroId}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-800/40 p-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {img ? (
                          <img src={img} alt={heroName} width={36} height={36} className="h-9 w-9 rounded-md object-cover" />
                        ) : (
                          <div className="h-9 w-9 rounded-md bg-slate-700" />
                        )}
                        <div className="min-w-0">
                          <div className="text-sm text-slate-100 truncate">{heroName}</div>
                          <div className="text-xs text-slate-400">{hero.games} 场</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-slate-400">胜率</div>
                        <div className="text-sm font-semibold text-slate-100">{hero.winRate.toFixed(1)}%</div>
                      </div>
                    </div>
                  );
                })}
                {!player?.mostPlayedHeroes?.length && (
                  <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4 text-sm text-slate-400">
                    暂无近 3 个月英雄统计
                  </div>
                )}
              </div>
            </section>

            <section>
              <div className="mb-3 flex items-center gap-2 text-white">
                <Shield className="h-4 w-4 text-sky-400" />
                <h4 className="font-semibold">近期比赛（队伍 5 选）</h4>
              </div>
              <div className="mb-2 text-[11px] text-slate-500">蓝色边框为该选手本场使用英雄</div>
              <div className="space-y-2">
                {recentRows.map((row) => {
                  const resultCls = row.won === true
                    ? 'border-emerald-500/50 text-emerald-300'
                    : row.won === false
                      ? 'border-red-500/50 text-red-300'
                      : 'border-slate-600 text-slate-300';

                  return (
                    <div key={`${row.matchId}-${row.startTime}`} className="rounded-xl border border-slate-700 bg-slate-800/40 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 text-sm text-slate-100 truncate">{row.teamName}</div>
                        <div className={`rounded-full border px-2 py-0.5 text-xs ${resultCls}`}>
                          {row.won === true ? 'Win' : row.won === false ? 'Lose' : 'N/A'}
                        </div>
                        <div className="min-w-0 text-right text-sm text-slate-200 truncate">{row.opponentName}</div>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {row.teamPicks.map((heroId, idx) => {
                          const img = getHeroImg(heroId, heroMap);
                          const heroName = heroMap[heroId]?.name_cn || heroMap[heroId]?.name || `Hero ${heroId}`;
                          const active = row.playerHeroId === heroId;
                          const ringCls = active
                            ? 'border-sky-300 ring-2 ring-sky-500/80 ring-offset-1 ring-offset-slate-900'
                            : 'border-slate-700';

                          return img ? (
                            <img
                              key={`${row.matchId}-${heroId}-${idx}`}
                              src={img}
                              alt={heroName}
                              title={heroName}
                              width={30}
                              height={30}
                              className={`h-7 w-7 rounded object-cover border ${ringCls}`}
                            />
                          ) : (
                            <div
                              key={`${row.matchId}-${heroId}-${idx}`}
                              className={`h-7 w-7 rounded bg-slate-700 border ${ringCls}`}
                              title={heroName}
                            />
                          );
                        })}
                      </div>

                      <div className="mt-2 text-xs text-slate-400">
                        {row.tournament} · {row.seriesType} · {formatTs(row.startTime)}
                      </div>
                    </div>
                  );
                })}
                {!recentRows.length && (
                  <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4 text-sm text-slate-400">暂无近期比赛</div>
                )}
              </div>
            </section>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
