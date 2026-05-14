import { useEffect, useState } from 'react';
import { Star, ExternalLink, UserRound, Trophy, Crosshair, Clock, TrendingUp, Medal } from 'lucide-react';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { SafeImg } from '@/components/custom/SafeImg';
import { getHeroImageUrl } from '@/lib/assetUrls';
import { formatBirthDisplay, toFlagImageUrl } from '@/lib/playerProfile';
import { resolveTeamLogo } from '@/lib/teams';
import type { PlayerFlyoutModel, PlayerFlyoutRecentMatch } from '@/lib/playerProfile';

type HeroMeta = {
  name?: string;
  name_cn?: string;
  img?: string;
};

const HERO_NAMES: Record<number, string> = {
  1: '敌法师', 2: '斧王', 3: '蝙蝠骑士', 4: '血魔', 5: '冰女', 6: '沉默术士',
  7: '幻刺', 8: '主宰', 9: '巨魔战将', 10: '痛苦女王', 11: '影魔',
  12: '剃刀', 13: '冥魂大帝', 14: '宙斯', 15: '船长', 16: '莉娜',
  17: '莱恩', 18: '巫医', 19: '冥界亚龙', 20: '力丸', 21: '谜团',
  22: '修补匠', 25: '莱萨克', 26: '先知', 27: '复仇之灵', 28: '深海巨怪',
  29: '潮汐猎人', 31: '露娜', 35: '狙击手', 36: '瘟疫法师', 38: '兽王',
  39: '痛苦女王', 41: '虚空假面', 44: '幻影刺客', 46: '圣堂刺客',
  47: '毒蛇', 48: '月之骑士', 50: '薄暮督军', 54: '双头龙', 55: '蝙蝠骑士',
  57: '幽鬼', 58: '冰魄', 62: '赏金猎人', 63: '编织者', 67: '暗裔剑魔',
  69: '末日使者', 74: '法身', 75: '沙王', 76: '暗影萨满', 80: '酿酒师',
  86: '沙漠巫妖', 90: '保护神', 91: '幻影长矛手', 92: '战祸先兆',
  95: '灰烬之灵', 99: '破法者', 101: '天怒法师', 104: '地狱熊怪',
  105: '折磁者', 106: '酒仙', 107: '鱼人守卫', 108: '暗夜魔王',
  111: '暗夜铸魂者', 114: '混沌骑士', 120: '嗜血先锋', 121: '虚空灵魂',
  129: '龙骑士', 135: '虚空灵魂', 136: '祈求者',
};

const COUNTRY_NAMES: Record<string, string> = {
  CN: '中国', RU: '俄罗斯', TH: '泰国', PH: '菲律宾', MY: '马来西亚',
  AE: '阿联酋', US: '美国', EG: '埃及', JO: '约旦', TR: '土耳其',
  DE: '德国', SE: '瑞典', DK: '丹麦', FI: '芬兰', FR: '法国',
  AU: '澳大利亚', CA: '加拿大', PE: '秘鲁', BR: '巴西', AR: '阿根廷',
  UA: '乌克兰', PL: '波兰', RO: '罗马尼亚', BG: '保加利亚', SK: '斯洛伐克',
};

export interface PlayerProfileFlyoutProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  player: PlayerFlyoutModel | null;
  onTeamSelect?: (team: { team_id?: string | null; name?: string | null; logo_url?: string | null }) => void;
}

function getHeroImg(heroId: number, heroMap: Record<number, HeroMeta>): string {
  const hero = heroMap[heroId];
  if (hero?.img) return getHeroImageUrl(heroId, hero.img);
  // Fall back to locally mirrored hero images
  return `/images/mirror/heroes/${heroId}.png`;
}

function getHeroName(heroId: number, heroMap: Record<number, HeroMeta>): string {
  return HERO_NAMES[heroId] || heroMap[heroId]?.name_cn || heroMap[heroId]?.name || `英雄${heroId}`;
}

/** Mini sparkline SVG built from a recent-match win/loss sequence */
function WinLossSparkline({ matches, width = 80, height = 28 }: { matches: PlayerFlyoutRecentMatch[]; width?: number; height?: number }) {
  const last8 = matches.slice(0, 8).reverse();
  if (last8.length < 2) return <div className="text-xs text-slate-500">--</div>;
  const pts = last8.map((m, i) => {
    const x = (i / (last8.length - 1)) * (width - 4) + 2;
    const y = m.won ? 4 : height - 4;
    return `${x},${y}`;
  });
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke="#34d399"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {last8.map((m, i) => {
        const x = (i / (last8.length - 1)) * (width - 4) + 2;
        const y = m.won ? 4 : height - 4;
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={2}
            fill={m.won ? '#34d399' : '#f87171'}
          />
        );
      })}
    </svg>
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
  const isMobile = useIsMobile();
  const [heroMap, setHeroMap] = useState<Record<number, HeroMeta>>({});

  useEffect(() => {
    if (!open) return;
    loadHeroMap().then((data) => setHeroMap(data || {}));
  }, [open]);

  const flagImageUrl = toFlagImageUrl(player?.nationality, 40);
  const playerTeamLogoUrl = resolveTeamLogo(
    { teamId: player?.teamId || undefined, name: player?.teamName || undefined },
    [],
    player?.teamLogoUrl || null
  ) || null;

  const signatureHeroes = player?.signatureHeroes?.length
    ? player.signatureHeroes.slice(0, 3)
    : (player?.signatureHero ? [player.signatureHero] : []);

  const heroPool = (player?.mostPlayedHeroes || []).slice(0, 5);
  const recentMatches = player?.recentMatches || [];
  const winCount = recentMatches.filter((m) => m.won).length;
  const lossCount = recentMatches.filter((m) => m.won === false).length;
  const birthDisplay = formatBirthDisplay(player?.birthDate, player?.birthMonth, player?.birthYear);
  const nationalityLabel = player?.nationality ? (COUNTRY_NAMES[player.nationality] || player.nationality) : '--';
  const mobileProfileFacts = [
    { label: '年龄', value: player?.age != null ? String(player.age) : '--' },
    { label: '国家/地区', value: nationalityLabel, flag: player?.nationality != null && !!flagImageUrl },
    { label: '生日', value: birthDisplay !== '未知' ? birthDisplay : '--' },
    { label: '胜率', value: player?.winRate != null ? `${player.winRate.toFixed(1)}%` : '--' },
  ];
  const profileFacts = [
    { label: '真实姓名', value: player?.realName || '未公开' },
    { label: '常用中文名', value: player?.chineseName || '未记录' },
    { label: '国家/地区', value: nationalityLabel },
    { label: '生日', value: birthDisplay !== '未知' ? birthDisplay : '未记录' },
  ];

  // Compute tournament performance by grouping recentMatches
  const tournamentPerf: Record<string, { wins: number; losses: number; latestTs: number }> = {};
  for (const m of recentMatches) {
    const key = m.tournament || '其他';
    if (!tournamentPerf[key]) tournamentPerf[key] = { wins: 0, losses: 0, latestTs: 0 };
    if (m.won === true) tournamentPerf[key].wins++;
    else if (m.won === false) tournamentPerf[key].losses++;
    if ((m.startTime || 0) > tournamentPerf[key].latestTs) tournamentPerf[key].latestTs = m.startTime || 0;
  }
  const tournamentList = Object.entries(tournamentPerf)
    .map(([name, { wins, losses, latestTs }]) => ({ name, wins, losses, latestTs }))
    .sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses));

  const sheetSide = isMobile ? 'bottom' : 'right';
  const sheetClassName = isMobile
    ? 'h-[92vh] w-full rounded-t-3xl border-border/60 bg-card text-foreground p-0 overscroll-contain shadow-[var(--shadow-card)]'
    : 'w-full sm:max-w-[420px] bg-card rounded-xl border-border/60 text-foreground p-0 overscroll-contain shadow-[var(--shadow-card),0_0_40px_rgba(0,50,100,0.12)]';

  /** ── Desktop header ── */
  const desktopHeader = (
    <div className="relative border-b border-border/60 bg-secondary/30 px-5 pb-0 pt-5">
      {/* 关注 button */}
      <button
        type="button"
        className="absolute right-4 top-4 flex items-center gap-1.5 rounded-lg border border-primary/70 px-3 py-1.5 text-xs font-medium text-primary transition hover:border-red-400 hover:bg-red-500/10"
      >
        <Star className="size-3" />
        关注
      </button>

      <div className="flex gap-4">
        {/* Player photo - gradient border ring */}
        <div className="size-24 shrink-0 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 p-[2px] shadow-lg shadow-blue-900/25">
          <div className="h-full w-full overflow-hidden rounded-full bg-gradient-to-br from-slate-700 to-slate-900">
            <SafeImg
              src={player?.avatarUrl}
              alt={player?.playerName || 'Player'}
              className="h-full w-full object-cover"
              fallback={<div className="flex size-full items-center justify-center bg-gradient-to-br from-slate-600 to-slate-800"><span className="text-2xl font-bold text-slate-400">{player?.playerName?.[0] || '?'}</span></div>}
            />
          </div>
        </div>

        <div className="min-w-0 pt-1 pr-20">
          {/* Name + verified */}
          <div className="flex items-center gap-1.5">
            <h2 className="truncate text-xl font-bold text-foreground">{player?.playerName || '—'}</h2>
            <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-sky-500 text-[9px] font-bold text-white">✓</span>
          </div>
          {/* Real name */}
          {player?.realName && (
            <div className="mt-0.5 text-xs text-slate-400">{player.realName}{player?.chineseName ? ` · ${player.chineseName}` : ''}</div>
          )}
          {/* Team */}
          <button
            type="button"
            className="mt-1.5 flex items-center gap-1.5 text-sm text-slate-300 transition hover:text-white"
            onClick={() => onTeamSelect?.({ team_id: player?.teamId, name: player?.teamName, logo_url: playerTeamLogoUrl })}
          >
            <span className="flex size-5 shrink-0 items-center justify-center overflow-hidden rounded border border-slate-700 bg-slate-800">
              <SafeImg src={playerTeamLogoUrl} alt={player?.teamName || ''} className="h-full w-full object-contain" fallback={<span className="text-[9px] text-slate-500">队</span>} />
            </span>
            <span className="truncate">{player?.teamName || 'Free Agent'}</span>
          </button>
          {/* Rank row + nationality */}
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs">
            {player?.hotRank != null && (
              <span className="text-slate-500">人气排名 <span className="font-semibold text-amber-300">#{player.hotRank}</span></span>
            )}
            {player?.hotScore && (
              <span className="text-slate-500">热度 <span className="text-slate-300">{player.hotScore}</span></span>
            )}
            {player?.nationality && (
              <span className="flex items-center gap-1 text-slate-400">
                {flagImageUrl && <img src={flagImageUrl} alt={player.nationality} className="h-3 w-4 rounded-[2px] object-cover" />}
                {nationalityLabel}
              </span>
            )}
            {birthDisplay !== '未知' && (
              <span className="text-slate-500">生日 <span className="text-slate-300">{birthDisplay}</span></span>
            )}
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="mt-4 grid grid-cols-5 divide-x divide-border/30 overflow-hidden rounded-xl border border-border/60 bg-gradient-to-r from-secondary/70 via-secondary/40 to-secondary/70">
        {[
          { label: '胜率', value: player?.winRate != null ? `${player.winRate.toFixed(1)}%` : '--', color: player?.winRate != null ? (player.winRate >= 50 ? 'text-emerald-400' : 'text-red-400') : 'text-white' },
          { label: '场均击杀', value: player?.avgKills != null ? player.avgKills.toFixed(1) : '--', color: 'text-white' },
          { label: '场均死亡', value: player?.avgDeaths != null ? player.avgDeaths.toFixed(1) : '--', color: 'text-red-400' },
          { label: '场均GPM', value: player?.avgGpm != null ? String(player.avgGpm) : '--', color: 'text-amber-400' },
          { label: '场均XPM', value: player?.avgXpm != null ? String(player.avgXpm) : '--', color: 'text-amber-400' },
        ].map((stat) => (
            <div key={stat.label} className="flex flex-col items-center justify-center gap-1 py-3">
              <span className={`text-3xl font-bold tabular-nums ${stat.color}`}>{stat.value}</span>
              <span className="text-[10px] font-medium text-slate-400">{stat.label}</span>
            </div>
          ))}
      </div>
    </div>
  );

  /** ── Mobile header ── */
  const mobileHeader = (
    <div className="relative border-b border-slate-700/60 bg-[#151b27] p-4 pt-6">
      {/* drag handle */}
      <div className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-slate-600" />

      <div className="flex gap-3">
        {/* Photo */}
        <div className="h-[120px] w-[90px] shrink-0 overflow-hidden rounded-xl border border-slate-700/60 bg-slate-800">
          <SafeImg
            src={player?.avatarUrl}
            alt={player?.playerName || 'Player'}
            className="h-full w-full object-cover object-top"
            fallback={<div className="flex size-full items-center justify-center"><UserRound className="size-10 text-slate-500" /></div>}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <h2 className="text-2xl font-bold text-white">{player?.playerName || '—'}</h2>
              <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-sky-500 text-[9px] font-bold text-white">✓</span>
            </div>
            <button
              type="button"
              className="flex shrink-0 items-center gap-1.5 rounded-xl border border-red-500/70 bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-300"
            >
              <Star className="size-3.5" />
              关注
            </button>
          </div>
          {/* Team */}
          <button
            type="button"
            className="mt-1 flex items-center gap-1.5 text-sm text-slate-300 transition hover:text-white"
            onClick={() => onTeamSelect?.({ team_id: player?.teamId, name: player?.teamName, logo_url: playerTeamLogoUrl })}
          >
            <span className="flex size-5 shrink-0 items-center justify-center overflow-hidden rounded border border-slate-700 bg-slate-800">
              <SafeImg src={playerTeamLogoUrl} alt={player?.teamName || ''} className="h-full w-full object-contain" fallback={<span className="text-[9px] text-slate-500">队</span>} />
            </span>
            <span className="truncate">{player?.teamName || 'Free Agent'}</span>
          </button>
          {player?.realName && (
            <div className="mt-1.5 text-xs text-slate-400">{player.realName}{player?.chineseName ? ` · ${player.chineseName}` : ''}</div>
          )}
        </div>
      </div>

      {/* 4-box stats row */}
      <div className="mt-4 grid grid-cols-4 divide-x divide-slate-700/40 rounded-xl border border-slate-700/40 bg-slate-800/30">
        {mobileProfileFacts.map((box) => (
          <div key={box.label} className="flex flex-col items-center py-3 px-2">
            {box.flag && player?.nationality && flagImageUrl ? (
              <div className="flex flex-col items-center gap-0.5">
                <img src={flagImageUrl} alt={player.nationality} className="h-3.5 w-5 rounded-[2px] object-cover" />
                <span className="text-sm font-bold leading-tight text-white">{nationalityLabel}</span>
              </div>
            ) : (
              <span className="text-base font-bold text-white">{box.value}</span>
            )}
            <span className="mt-0.5 text-[10px] text-slate-500">{box.label}</span>
          </div>
        ))}
      </div>
    </div>
  );

  /** ── Hero pool section ── */
  const heroPoolSection = (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 font-semibold text-white">
          <Crosshair className="size-3.5 text-slate-400" />
          英雄池
        </h4>
        <button type="button" className="text-xs text-slate-400 hover:text-slate-200">更多 ›</button>
      </div>
      {heroPool.length ? (
        <div className="space-y-2">
          {heroPool.slice(0, 6).map((hero) => {
            const img = getHeroImg(hero.heroId, heroMap);
            const heroName = getHeroName(hero.heroId, heroMap);
            const isPositive = hero.winRate >= 50;
            const barColor = isPositive ? 'bg-emerald-500' : 'bg-red-500';
            const textColor = isPositive ? 'text-emerald-400' : 'text-red-400';
            return (
              <div key={hero.heroId} className="flex items-center gap-3 rounded-xl border border-slate-700/60 bg-slate-800/30 p-2.5 transition hover:border-slate-600/60 hover:bg-slate-800/50">
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
                      <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(hero.winRate, 100)}%` }} />
                    </div>
                    <span className={`shrink-0 text-xs font-bold tabular-nums ${textColor}`}>{hero.winRate.toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-700/60 bg-slate-800/30 p-4 text-sm text-slate-500">暂无英雄统计</div>
      )}
    </section>
  );

  /** ── Recent matches section ── */
  const recentMatchSection = (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 font-semibold text-white">
          <Clock className="size-3.5 text-slate-400" />
          近期比赛
        </h4>
        <button type="button" className="text-xs text-slate-400 hover:text-slate-200">全部比赛 ›</button>
      </div>
      {recentMatches.length ? (
        <div className="overflow-hidden rounded-xl border border-slate-700/60">
          {/* Table header */}
          <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_3rem_3rem_3.5rem] items-center gap-x-2 border-b border-slate-700/60 bg-slate-800/60 px-3 py-2 text-[10px] font-medium text-slate-400">
            <span className="text-center">英雄</span>
            <span className="text-center">KDA</span>
            <span className="text-center">GPM</span>
            <span className="text-center">XPM</span>
            <span className="text-center">结果</span>
          </div>
          {recentMatches.slice(0, 5).map((match, idx) => {
            const playerHeroImg = match.playerHeroId ? getHeroImg(match.playerHeroId, heroMap) : '';
            const playerHeroName = match.playerHeroId ? getHeroName(match.playerHeroId, heroMap) : '';
            const heroInitial = playerHeroName?.[0] || '?';
            const won = match.won;
            const kdaDisplay = match.kda || '--';
            const gpmDisplay = match.gpm != null ? String(match.gpm) : '--';
            const xpmDisplay = match.xpm != null ? String(match.xpm) : '--';
            const rowBg = won === true
              ? 'bg-emerald-950/20'
              : won === false
                ? 'bg-red-950/20'
                : idx % 2 === 0 ? 'bg-slate-800/20' : 'bg-transparent';

            return (
              <div
                key={`${match.matchId}-${idx}`}
                className={`grid grid-cols-[2.5rem_minmax(0,1fr)_3rem_3rem_3.5rem] items-center gap-x-2 border-b border-slate-700/20 px-3 py-2.5 text-sm last:border-b-0 transition hover:bg-slate-800/30 ${rowBg}`}
              >
                {/* Hero image */}
                <div className="flex justify-center">
                  {playerHeroImg ? (
                    <SafeImg
                      src={playerHeroImg}
                      alt={playerHeroName}
                      className="size-8 rounded object-cover"
                      fallback={<div className="flex size-8 items-center justify-center rounded bg-gradient-to-br from-slate-700 to-slate-800 text-xs font-bold text-slate-400">{heroInitial}</div>}
                    />
                  ) : (
                    <div className="flex size-8 items-center justify-center rounded bg-gradient-to-br from-slate-700 to-slate-800 text-xs font-bold text-slate-400">{heroInitial}</div>
                  )}
                </div>
                {/* KDA */}
                <div className="text-center">
                  <span className="text-[11px] font-medium text-slate-200 tabular-nums">{kdaDisplay}</span>
                </div>
                {/* GPM */}
                <div className="text-center">
                  <span className="text-[11px] text-slate-300 tabular-nums">{gpmDisplay}</span>
                </div>
                {/* XPM */}
                <div className="text-center">
                  <span className="text-[11px] text-slate-300 tabular-nums">{xpmDisplay}</span>
                </div>
                {/* Result badge */}
                <div className="flex justify-center">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    won === true ? 'bg-emerald-500/20 text-emerald-300' :
                    won === false ? 'bg-red-500/20 text-red-300' :
                    'bg-slate-700 text-slate-400'
                  }`}>
                    {won === true ? 'WIN' : won === false ? 'LOSS' : '--'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-700/60 bg-slate-800/30 p-4 text-sm text-slate-500">暂无近期比赛</div>
      )}
    </section>
  );

  /** ── Signature heroes ── */
  const signatureSection = (
    <div className="space-y-4">
      <section>
        <h4 className="mb-3 flex items-center gap-2 rounded-lg bg-gradient-to-r from-amber-500/10 to-transparent px-2 py-1.5 font-semibold text-white">
          <Trophy className="size-4 text-amber-400" />
          招牌英雄
        </h4>
        {signatureHeroes.length ? (
          <div className="grid grid-cols-3 gap-3">
            {signatureHeroes.map((hero) => {
              const img = getHeroImg(hero.heroId, heroMap);
              const heroName = getHeroName(hero.heroId, heroMap);
              const isPositive = hero.winRate >= 50;
              return (
                <div key={hero.heroId} className="flex flex-col items-center gap-2 rounded-xl border border-slate-700/60 bg-gradient-to-b from-slate-800/60 to-slate-800/20 p-3 transition hover:border-slate-600/60 hover:from-slate-700/60 hover:to-slate-700/30">
                  <div className="size-20 overflow-hidden rounded-xl bg-slate-700">
                    {img ? (
                      <img src={img} alt={heroName} className="h-full w-full object-cover object-top" />
                    ) : (
                      <div className="h-full w-full bg-slate-700" />
                    )}
                  </div>
                  <div className="w-full text-center">
                    <div className="truncate text-xs font-medium text-slate-100">{heroName}</div>
                    <div className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      isPositive ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'
                    }`}>
                      {hero.winRate.toFixed(1)}%
                    </div>
                    <div className="mt-0.5 text-[10px] text-slate-500">{hero.games} 场</div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-slate-700/60 bg-slate-800/30 p-3 text-xs text-slate-500">暂无数据</div>
        )}
      </section>

      <section>
        <h4 className="mb-2 flex items-center gap-1.5 font-semibold text-white">
          <Medal className="size-3.5 text-amber-400" />
          选手档案
        </h4>
        <div className="space-y-1.5 text-xs text-slate-400">
          {profileFacts.map((fact) => (
            <div key={fact.label} className="flex items-start gap-1.5 rounded-lg border border-slate-700/40 bg-slate-800/20 px-2 py-1.5">
              <span className="text-sm text-amber-300">•</span>
              <div className="min-w-0">
                <div className="text-[10px] font-medium text-slate-300 leading-tight">{fact.label}</div>
                <div className="text-[9px] text-slate-500">{fact.value}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );

  /** ── Tournament performance section ── */
  const tournamentPerfSection = tournamentList.length > 0 ? (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 font-semibold text-white">
          <TrendingUp className="size-3.5 text-slate-400" />
          近期赛事表现
        </h4>
        <button type="button" className="text-xs text-slate-400 hover:text-slate-200">更多 ›</button>
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-700/60">
        {tournamentList.map((t, i) => {
          const total = t.wins + t.losses;
          const wr = total > 0 ? Math.round((t.wins / total) * 100) : 0;
          const rank = wr === 100 ? '小组第一' : wr >= 67 ? '小组第二' : wr >= 50 ? '小组第三' : '小组末位';
          const dateStr = t.latestTs
            ? new Date(t.latestTs * 1000).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }).replace('/', '-')
            : '';
          return (
            <div
              key={t.name}
              className={`flex items-center gap-2 px-3 py-2.5 text-xs ${i > 0 ? 'border-t border-slate-700/30' : ''}`}
            >
              {/* Tournament icon placeholder */}
              <div className="size-7 shrink-0 overflow-hidden rounded-md bg-slate-700/60 flex items-center justify-center">
                <span className="text-[10px] text-slate-400">🏆</span>
              </div>
              {/* Name + rank */}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] font-medium text-slate-200">{t.name}</div>
                <div className="text-[10px] text-slate-500">小组赛</div>
              </div>
              {/* Score */}
              <div className="shrink-0 text-center">
                <div className="text-[13px] font-bold">
                  <span className="text-emerald-400">{t.wins}</span>
                  <span className="text-slate-500 mx-0.5">-</span>
                  <span className="text-red-400">{t.losses}</span>
                </div>
              </div>
              {/* Rank label */}
              <div className="shrink-0 w-14 text-right">
                <span className="text-[10px] font-semibold text-amber-400">{rank}</span>
                {dateStr ? <div className="text-[9px] text-slate-500">{dateStr}</div> : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  ) : null;

  /** ── Mobile near-performance stats ── */
  const mobilePerformanceSection = (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 font-semibold text-white">
          <TrendingUp className="size-3.5 text-slate-400" />
          近期表现
        </h4>
        <button type="button" className="text-xs text-slate-400">近20场 ›</button>
      </div>
      <div className="rounded-xl border border-slate-700/60 bg-slate-800/20 p-4">
        <div className="grid grid-cols-5 gap-2">
          {[
            { label: 'KDA', value: '--', rank: '#--', up: true },
            { label: 'GPM', value: '--', rank: '#--', up: true },
            { label: 'XPM', value: '--', rank: '#--', up: true },
            { label: '参战率', value: '--', rank: '#--', up: true },
            { label: '胜率', value: player?.winRate != null ? `${player.winRate.toFixed(1)}%` : '--', rank: null, up: null },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-sm font-bold text-white">{stat.value}</div>
              {stat.rank ? (
                <div className="text-[10px] text-slate-500">{stat.rank} {stat.up ? '▲' : '▼'}</div>
              ) : null}
              <div className="text-[10px] text-slate-500 mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div className="text-[11px] text-slate-400">
            {recentMatches.length}场 {winCount}胜 {lossCount}负
          </div>
          <WinLossSparkline matches={recentMatches} width={80} height={24} />
        </div>
      </div>
    </section>
  );

  /** ── Mobile achievements 2x2 ── */
  const mobileAchievementsSection = (
    <section>
      <h4 className="mb-3 flex items-center gap-1.5 font-semibold text-white">
        <Medal className="size-3.5 text-amber-400" />
        选手档案
      </h4>
      <div className="grid grid-cols-2 gap-2">
        {profileFacts.map((fact) => (
          <div key={fact.label} className="flex items-center gap-2 rounded-xl border border-slate-700/60 bg-slate-800/30 p-3">
            <span className="text-xl text-amber-300">•</span>
            <div>
              <div className="text-sm font-bold text-white">{fact.value}</div>
              <div className="text-[10px] text-slate-400">{fact.label}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={sheetSide} className={sheetClassName} data-visual-role="player-profile-flyout">
        {/* Accessibility titles (visually hidden by structure but required) */}
        <SheetTitle className="sr-only">{player?.playerName || '选手资料'}</SheetTitle>
        <SheetDescription className="sr-only">{player?.teamName || ''} 选手资料</SheetDescription>

        <div className="h-full overflow-y-auto">
          {/* ── Header (desktop / mobile variants) ── */}
          {isMobile ? mobileHeader : desktopHeader}

          {/* Divider */}
          <div className="h-px bg-gradient-to-r from-transparent via-slate-600/40 to-transparent" />

          {/* ── Body ── */}
          <div className="space-y-4 p-4">
            {heroPoolSection}

            {isMobile && mobilePerformanceSection}

            {isMobile ? mobileAchievementsSection : null}

            {recentMatchSection}

            {!isMobile && signatureSection}

            {tournamentPerfSection}
          </div>

          {/* ── CTA ── */}
          <div className={`${isMobile ? 'grid grid-cols-[1fr_auto] gap-2' : ''} px-4 pb-6`}>
            <button
              type="button"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 py-3.5 text-base font-semibold text-white shadow-lg shadow-red-950/40 transition hover:bg-red-500"
            >
              查看 {player?.playerName || '选手'} 的完整资料页
              <ExternalLink className="size-4" />
            </button>
            {isMobile && (
              <button
                type="button"
                className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-700/60 bg-slate-800/40 px-4 py-3.5 text-sm text-slate-300 hover:bg-slate-700/40"
              >
                分享
              </button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
