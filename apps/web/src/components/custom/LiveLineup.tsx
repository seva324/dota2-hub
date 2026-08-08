import { SafeImg } from '@/components/custom/SafeImg';
import { getHeroImageUrl } from '@/lib/assetUrls';
import type { LivePick } from '@/types/liveDetail';

const design = {
  radiant: '#34d399',
  dire: '#ff3b30',
  slot: '#14181f',
  border: 'rgba(255,255,255,0.06)',
};

function heroImg(pick: LivePick): string {
  const id = pick.hero.id ?? undefined;
  const img = pick.hero.codeName?.replace(/^npc_dota_hero_/, '') || undefined;
  return getHeroImageUrl(id as number, img);
}

function PicksRow({ picks, side, label }: { picks: LivePick[]; side: 'radiant' | 'dire'; label: string }) {
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
        {picks.map((pick, i) => (
          <div
            key={`${pick.player.id ?? i}-${pick.hero.id ?? i}`}
            className="flex flex-col items-center rounded-xl p-1.5"
            style={{ backgroundColor: design.slot, border: `1px solid ${design.border}` }}
          >
            <div className="relative">
              <SafeImg
                src={heroImg(pick)}
                alt={pick.hero.name || '英雄'}
                className="size-10 rounded-lg object-cover"
                fallback={<div className="flex size-10 items-center justify-center rounded-lg bg-white/10 text-[10px] font-bold text-slate-400">{pick.hero.name?.slice(0, 2) || '?'}</div>}
              />
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded px-1 text-[8px] font-black leading-tight" style={{ backgroundColor: accent, color: '#fff' }}>
                {pick.player.name?.slice(0, 2).toUpperCase() || '??'}
              </span>
            </div>
            <span className="mt-1.5 w-full truncate text-center text-[10px] font-semibold text-slate-200" title={pick.player.name || ''}>
              {pick.player.name || '—'}
            </span>
            <span className="w-full truncate text-center text-[9px] text-slate-500" title={pick.hero.name || ''}>
              {pick.hero.name || '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** BP 阵容：radiant 5 + dire 5 两行，hero 头像 + 玩家名 */
export function LiveLineup({ picks, team1Name, team2Name, isTeam1Radiant }: {
  picks: LivePick[];
  team1Name: string;
  team2Name: string;
  isTeam1Radiant: boolean;
}) {
  const radiantPicks = picks.filter((p) => p.isRadiant);
  const direPicks = picks.filter((p) => !p.isRadiant);
  const radiantLabel = isTeam1Radiant ? `${team1Name}（天辉）` : `${team2Name}（天辉）`;
  const direLabel = isTeam1Radiant ? `${team2Name}（夜魇）` : `${team1Name}（夜魇）`;

  return (
    <div className="flex flex-col gap-3">
      <PicksRow picks={radiantPicks} side="radiant" label={radiantLabel} />
      <PicksRow picks={direPicks} side="dire" label={direLabel} />
    </div>
  );
}
