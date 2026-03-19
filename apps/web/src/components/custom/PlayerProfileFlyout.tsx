import { useEffect, useMemo, useState } from 'react';
import { Calendar, Shield, Target, Trophy, UserRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  buildRecentMatchDraftRows,
  formatBirthDisplay,
  toFlagImageUrl,
} from '@/lib/playerProfile';
import { resolveTeamLogo } from '@/lib/teams';
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
  onTeamSelect?: (team: { team_id?: string | null; name?: string | null; logo_url?: string | null }) => void;
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

function TeamInline({
  name,
  logoUrl,
  align = 'left',
  onNameClick,
}: {
  name?: string | null;
  logoUrl?: string | null;
  align?: 'left' | 'right';
  onNameClick?: (() => void) | undefined;
}) {
  const nameNode = onNameClick && name ? (
    <button
      type="button"
      onClick={onNameClick}
      className="truncate text-left transition hover:text-white hover:underline underline-offset-2"
    >
      {name}
    </button>
  ) : (
    <span className="truncate">{name || 'TBD'}</span>
  );

  return (
    <div className={`flex min-w-0 items-center gap-2 ${align === 'right' ? 'justify-end' : ''}`}>
      {align === 'right' ? (
        <>
          {nameNode}
          <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-700 bg-slate-800">
            {logoUrl ? (
              <img src={logoUrl} alt={name || 'Team'} className="h-full w-full object-cover" />
            ) : (
              <span className="text-[10px] text-slate-500">队</span>
            )}
          </span>
        </>
      ) : (
        <>
          <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-700 bg-slate-800">
            {logoUrl ? (
              <img src={logoUrl} alt={name || 'Team'} className="h-full w-full object-cover" />
            ) : (
              <span className="text-[10px] text-slate-500">队</span>
            )}
          </span>
          {nameNode}
        </>
      )}
    </div>
  );
}

let heroMapCache: Record<number, HeroMeta> | null = null;
let heroMapPromise: Promise<Record<number, HeroMeta>> | null = null;

async function loadHeroMap(): Promise<Record<number, HeroMeta>> {
  if (heroMapCache) return heroMapCache;
  if (!heroMapPromise) {
    heroMapPromise = fetch('/api/heroes')
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => {
        heroMapCache = (data || {}) as Record<number, HeroMeta>;
        return heroMapCache;
      })
      .catch(() => ({}))
      .finally(() => {
        heroMapPromise = null;
      });
  }
  return heroMapPromise;
}

export function PlayerProfileFlyout({ open, onOpenChange, player, onTeamSelect }: PlayerProfileFlyoutProps) {
  const [heroMap, setHeroMap] = useState<Record<number, HeroMeta>>({});

  useEffect(() => {
    if (!open) return;
    loadHeroMap().then((data) => setHeroMap(data || {}));
  }, [open]);

  const recentRows = useMemo(() => buildRecentMatchDraftRows(player?.recentMatches || []), [player?.recentMatches]);
  const flagImageUrl = toFlagImageUrl(player?.nationality, 40);
  const birthDisplay = formatBirthDisplay(player?.birthDate, player?.birthMonth, player?.birthYear);
  const playerTeamLogoUrl = resolveTeamLogo(
    { teamId: player?.teamId || undefined, name: player?.teamName || undefined },
    [],
    player?.teamLogoUrl || null
  ) || null;
  const signatureHeroes = player?.signatureHeroes?.length
    ? player.signatureHeroes.slice(0, 3)
    : (player?.signatureHero ? [player.signatureHero] : []);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="w-full sm:max-w-2xl bg-slate-900 border-slate-700 text-slate-100 p-0 overscroll-contain"
      >
        <div className="h-full overflow-y-auto">
          <SheetHeader className="border-b border-slate-700 bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950/40 p-6 pl-12">
            <div className="flex items-center gap-4">
              <div className="h-28 w-28 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden shadow-lg shadow-slate-950/40">
                {player?.avatarUrl ? (
                  <img
                    src={player.avatarUrl}
                    alt={player.playerName}
                    width={112}
                    height={112}
                    className="h-28 w-28 object-cover"
                  />
                ) : (
                  <UserRound className="h-10 w-10 text-slate-400" />
                )}
              </div>

              <div className="min-w-0">
                <SheetTitle className="text-xl text-white truncate">{player?.playerName || 'Player'}</SheetTitle>
                <SheetDescription className="mt-1 text-slate-300">
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-700 bg-slate-800">
                      {playerTeamLogoUrl ? (
                        <img src={playerTeamLogoUrl} alt={player?.teamName || 'Team'} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-[10px] text-slate-500">队</span>
                      )}
                    </span>
                    {player?.teamName ? (
                      <button
                        type="button"
                        className="truncate transition hover:text-white hover:underline underline-offset-2"
                        onClick={() => onTeamSelect?.({
                          team_id: player?.teamId || null,
                          name: player?.teamName || null,
                          logo_url: playerTeamLogoUrl || null,
                        })}
                      >
                        {player.teamName}
                      </button>
                    ) : (
                      <span className="truncate">Free Agent</span>
                    )}
                  </span>
                </SheetDescription>
                <div className="mt-2 text-xs text-slate-400">
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
                  {flagImageUrl ? (
                    <img src={flagImageUrl} alt={player.nationality} className="h-3.5 w-5 rounded-[2px] object-cover" />
                  ) : (
                    <span className="inline-block h-3.5 w-5 rounded-[2px] bg-slate-700" />
                  )}
                  {player.nationality}
                </Badge>
              )}
              <Badge variant="outline" className="border-slate-600 text-slate-200">
                <Calendar className="mr-1 h-3 w-3" />
                {birthDisplay}
              </Badge>
              {typeof player?.age === 'number' && (
                <Badge variant="outline" className="border-slate-600 text-slate-200">{player.age} 岁</Badge>
              )}
              {typeof player?.winRate === 'number' && (
                <Badge variant="outline" className="border-slate-600 text-slate-200">
                  <Target className="mr-1 h-3 w-3" />
                  近三个月胜率 {player.winRate.toFixed(1)}%
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
                  <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 text-sm text-slate-200">
                    <TeamInline
                      name={player.teamName || player.playerName}
                      logoUrl={player.nextMatch.selectedTeamLogoUrl || playerTeamLogoUrl}
                      onNameClick={() => onTeamSelect?.({
                        team_id: player.nextMatch?.selectedTeamId || player.teamId || null,
                        name: player.teamName || null,
                        logo_url: player.nextMatch?.selectedTeamLogoUrl || playerTeamLogoUrl || null,
                      })}
                    />
                    <div className="rounded-full border border-slate-600 px-2 py-0.5 text-xs text-slate-300">VS</div>
                    <TeamInline
                      name={player.nextMatch.opponentName || 'TBD'}
                      logoUrl={player.nextMatch.opponentLogoUrl}
                      align="right"
                      onNameClick={() => onTeamSelect?.({
                        team_id: player.nextMatch?.opponentTeamId || null,
                        name: player.nextMatch?.opponentName || null,
                        logo_url: player.nextMatch?.opponentLogoUrl || null,
                      })}
                    />
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
                <h4 className="font-semibold">招牌英雄（近两年 &gt;10 场，胜率最高）</h4>
              </div>
              {signatureHeroes.length ? (
                <div className="grid grid-cols-3 gap-3">
                  {signatureHeroes.map((hero) => {
                    const img = getHeroImg(hero.heroId, heroMap);
                    const heroName = heroMap[hero.heroId]?.name_cn || heroMap[hero.heroId]?.name || `Hero ${hero.heroId}`;
                    return (
                      <div key={`sig-${hero.heroId}`} className="rounded-xl border border-slate-700 bg-slate-800/50 p-3">
                        <div className="flex items-center gap-3">
                          {img ? (
                            <img src={img} alt={heroName} width={44} height={44} className="h-11 w-11 rounded-md object-cover" />
                          ) : (
                            <div className="h-11 w-11 rounded-md bg-slate-700" />
                          )}
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-slate-100">{heroName}</div>
                            <div className="text-xs text-slate-300">{hero.winRate.toFixed(1)}%</div>
                            <div className="text-xs text-slate-500">{hero.wins}/{hero.games}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4 text-sm text-slate-400">
                  暂无满足近两年超过 10 场条件的英雄样本
                </div>
              )}
            </section>

            <section>
              <div className="mb-3 flex items-center gap-2 text-white">
                <Shield className="h-4 w-4 text-cyan-400" />
                <h4 className="font-semibold">过去 3 个月常用英雄</h4>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
                  <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4 text-sm text-slate-400 sm:col-span-2">
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
                      <div className="grid grid-cols-[minmax(0,1fr)_4.75rem_minmax(0,1fr)] items-center gap-3">
                        <div className="min-w-0 text-sm text-slate-100">
                          <TeamInline
                            name={row.teamName}
                            logoUrl={row.teamLogoUrl}
                            onNameClick={() => onTeamSelect?.({
                              team_id: row.teamId || null,
                              name: row.teamName || null,
                              logo_url: row.teamLogoUrl || null,
                            })}
                          />
                        </div>
                        <div className={`justify-self-center rounded-full border px-2 py-1 text-center text-xs font-medium ${resultCls}`}>
                          {row.won === true ? 'Win' : row.won === false ? 'Lose' : 'N/A'}
                        </div>
                        <div className="min-w-0 text-sm text-slate-200">
                          <TeamInline
                            name={row.opponentName}
                            logoUrl={row.opponentLogoUrl}
                            align="right"
                            onNameClick={() => onTeamSelect?.({
                              team_id: row.opponentTeamId || null,
                              name: row.opponentName || null,
                              logo_url: row.opponentLogoUrl || null,
                            })}
                          />
                        </div>
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
