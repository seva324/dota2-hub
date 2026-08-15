import { useEffect, useState } from 'react';
import { SafeImg } from '@/components/custom/SafeImg';
import { getHeroImageUrl } from '@/lib/assetUrls';
import { apiFetch } from '@/lib/api-cache';
import type { LivePick } from '@/types/liveDetail';

const design = {
  radiant: '#34d399',
  dire: '#ff3b30',
  slot: '#14181f',
  border: 'rgba(255,255,255,0.06)',
};

interface HeroData {
  id: number;
  name: string;
  name_cn?: string;
  img?: string;
  img_url?: string;
}

/** dltv 的 hero.id 与本地 heroes 表（官方 id 体系）存在错位：英文名是权威标识，优先按名匹配。 */
function resolveHeroByName(name: string | undefined, heroesData: Record<number, HeroData>): HeroData | undefined {
  const title = String(name || '').trim().toLowerCase();
  if (!title) return undefined;
  for (const hero of Object.values(heroesData)) {
    if (hero.name && String(hero.name).trim().toLowerCase() === title) return hero;
  }
  return undefined;
}

function heroImg(pick: LivePick): string {
  const id = pick.hero.id ?? undefined;
  const img = pick.hero.codeName?.replace(/^npc_dota_hero_/, '') || undefined;
  return getHeroImageUrl(id as number, img);
}

function PicksRow({ picks, side, label, heroesData }: {
  picks: LivePick[];
  side: 'radiant' | 'dire';
  label: string;
  heroesData: Record<number, HeroData>;
}) {
  if (!picks.length) {
    return <div className="flex h-24 items-center justify-center rounded-xl text-xs" style={{ color: '#71717a', backgroundColor: design.slot }}>{label} 阵容待定</div>;
  }
  const accent = side === 'radiant' ? design.radiant : design.dire;
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold" style={{ color: accent }}>
        <span className="size-2 rounded-full" style={{ backgroundColor: accent }} />
        {label}
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {picks.map((pick, i) => {
          const heroById = heroesData[pick.hero.id ?? -1];
          const hero = resolveHeroByName(pick.hero.name, heroesData) || heroById;
          const heroNameCn = hero?.name_cn || pick.hero.name || '—';
          return (
            <div
              key={`${pick.player.id ?? i}-${pick.hero.id ?? i}`}
              className="flex flex-col items-center rounded-xl p-1.5"
              style={{ backgroundColor: design.slot, border: `1px solid ${design.border}` }}
            >
              <div className="relative">
                <SafeImg
                  src={heroImg(pick)}
                  alt={heroNameCn}
                  className="size-10 rounded-lg object-cover"
                  fallback={<div className="flex size-10 items-center justify-center rounded-lg bg-white/10 text-[10px] font-bold text-slate-400">{heroNameCn.slice(0, 2) || '?'}</div>}
                />
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded px-1 text-[8px] font-black leading-tight" style={{ backgroundColor: accent, color: '#fff' }}>
                  {pick.positionLabel || '?号位'}
                </span>
              </div>
              <span className="mt-1.5 w-full text-center text-[10px] font-semibold text-slate-200 line-clamp-2 whitespace-normal break-words" title={pick.player.name || ''}>
                {pick.player.name || '—'}
              </span>
              <span className="w-full text-center text-[9px] text-slate-500 line-clamp-2 whitespace-normal break-words" title={heroNameCn}>
                {heroNameCn}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** BP 阵容：radiant 5 + dire 5 两行，hero 头像 + 位置号 + 玩家名 + 英雄中文名 */
export function LiveLineup({ picks, team1Name, team2Name, isTeam1Radiant }: {
  picks: LivePick[];
  team1Name: string;
  team2Name: string;
  isTeam1Radiant: boolean;
}) {
  const [heroesData, setHeroesData] = useState<Record<number, HeroData>>({});

  // 英雄中英名数据静态，1h 共享缓存
  useEffect(() => {
    let cancelled = false;
    apiFetch<Record<string, unknown>>('/api/heroes', { ttlMs: 60 * 60 * 1000, cacheEmpty: false })
      .then((res) => {
        if (cancelled) return;
        const map: Record<number, HeroData> = {};
        Object.entries(res || {}).forEach(([key, value]) => {
          map[parseInt(key)] = value as HeroData;
        });
        setHeroesData(map);
      })
      .catch(() => { /* 英雄名获取失败时保留英文名 */ });
    return () => { cancelled = true; };
  }, []);

  const radiantPicks = picks.filter((p) => p.isRadiant);
  const direPicks = picks.filter((p) => !p.isRadiant);
  const radiantLabel = isTeam1Radiant ? `${team1Name}（天辉）` : `${team2Name}（天辉）`;
  const direLabel = isTeam1Radiant ? `${team2Name}（夜魇）` : `${team1Name}（夜魇）`;

  return (
    <div className="flex flex-col gap-3">
      <PicksRow picks={radiantPicks} side="radiant" label={radiantLabel} heroesData={heroesData} />
      <PicksRow picks={direPicks} side="dire" label={direLabel} heroesData={heroesData} />
    </div>
  );
}
