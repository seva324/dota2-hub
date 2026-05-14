import { SafeImg } from '@/components/custom/SafeImg';
import { getHeroImageUrl } from '@/lib/assetUrls';

interface PicksBans {
  is_pick: boolean;
  hero_id: number;
  team: number;
  order: number;
}

interface HeroInfo {
  id: number;
  name: string;
  img: string;
  name_cn: string;
}

function heroPlaceholderColor(heroId: number): React.CSSProperties {
  return { background: `hsl(${(heroId * 67) % 360}, 35%, 18%)` };
}

function heroPlaceholderLabel(heroId: number, heroesData: Record<number, HeroInfo>): string {
  const hero = heroesData[heroId];
  if (!hero) return `H${heroId}`;
  return (hero.name_cn || hero.name || `H${heroId}`).charAt(0);
}

function getHeroName(heroId: number, heroesData: Record<number, HeroInfo>): string {
  const hero = heroesData[heroId];
  return hero?.name_cn || hero?.name || `Hero ${heroId}`;
}

function getHeroImg(heroId: number, heroesData: Record<number, HeroInfo>): string {
  const hero = heroesData[heroId];
  if (!hero?.img) return '';
  return getHeroImageUrl(heroId, hero.img);
}

export function PicksBansInline({ picksBans, heroesData }: { picksBans: PicksBans[]; heroesData: Record<number, HeroInfo> }) {
  if (picksBans.length === 0) return null;

  return (
    <div className="border-t border-slate-800 px-4 py-3 bg-slate-900/30">
      <div className="text-xs text-slate-400 mb-2">Picks / Bans</div>
      <div className="overflow-x-auto pb-1">
        <div className="flex min-w-max flex-nowrap items-start gap-2.5">
          {picksBans.map((entry) => {
            const label = entry.is_pick ? '选择' : '禁止';
            const orderText = typeof entry.order === 'number' ? entry.order + 1 : '-';
            const heroName = getHeroName(entry.hero_id, heroesData);
            const heroImg = getHeroImg(entry.hero_id, heroesData);

            return (
              <section key={`${entry.team}-${entry.order}-${entry.hero_id}-${entry.is_pick ? 'p' : 'b'}`} className="flex-shrink-0">
                <div className="h-10 w-10 rounded-md overflow-hidden bg-slate-800 border border-slate-700 relative md:h-10 md:w-10">
                  <SafeImg
                    src={heroImg || undefined}
                    alt={heroName}
                    className={`w-full h-full object-cover ${entry.is_pick ? '' : 'grayscale brightness-75'}`}
                    fallback={
                      <div className="h-full w-full flex items-center justify-center" style={heroPlaceholderColor(entry.hero_id)}>
                        <span className="text-[7px] text-slate-400 px-0.5 text-center leading-tight">{heroPlaceholderLabel(entry.hero_id, heroesData)}</span>
                      </div>
                    }
                  />
                  {!entry.is_pick && <div className="absolute inset-0 border-2 border-slate-500/60" />}
                </div>
                <aside className="mt-1 text-[11px] text-slate-400 text-center whitespace-nowrap">
                  {label} <b className="text-slate-200">{orderText}</b>
                </aside>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
