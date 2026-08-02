import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Loader2, User } from 'lucide-react';
import { SafeImg } from '@/components/custom/SafeImg';
import { TeamLogoFallback } from '@/components/custom/TeamLogoFallback';
import type {
  MatchPagePayload,
  SeriesMapBlock,
  SeriesPlayerRow,
} from '@/types/matchPage';

const design = {
  blue: '#2b55e8',
  red: '#ff3b30',
  card: '#1a1d24',
  pip: '#facc15',
};

// 官方 Dota2 图标（经 /api/asset-image 代理，走国内可达通道）
const AGHS_ICON = '/api/asset-image?url=' + encodeURIComponent(
  'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/ultimate_scepter.png'
);
const SHARD_ICON = '/api/asset-image?url=' + encodeURIComponent(
  'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/aghanims_shard.png'
);

function formatDuration(sec: number | null | undefined): string {
  if (!sec || sec <= 0) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatDate(ts: number | null | undefined): string {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatGold(n: number | null | undefined): string {
  const v = Number(n) || 0;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
  return String(v);
}

/** 该选手是否拥有 A 杖：DLTV 的 aghanims_scepter 位是"升级/消耗"标记，item steamId 108 才是持有 */
function hasScepterItem(p: SeriesPlayerRow): boolean {
  if (p.hasScepter) return true;
  return p.items.some((it) => String(it.steamId) === '108');
}

/** 一列黄色 pip（系列赛累计胜场） */
function Pips({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <div className="flex items-center justify-center gap-[3px]">
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} className="size-[9px] rounded-[2px]" style={{ backgroundColor: design.pip }} />
      ))}
    </div>
  );
}

function Stat({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="leading-none" title={title}>
      <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: design.pip }}>{label}</div>
      <div className="mt-1 text-base font-bold tabular-nums text-white">{value}</div>
    </div>
  );
}

/** 单个选手行。side==='right' 时整体镜像（装备靠近中间）。 */
function PlayerRow({ player, side }: { player: SeriesPlayerRow; side: 'left' | 'right' }) {
  const name = player.playerName || `玩家 ${player.playerId ?? ''}`;
  const kda = `${player.kills}-${player.deaths}-${player.assists}`;
  const gpmXpm = `${player.gpm}/${player.xpm}`;
  const netWorth = formatGold(player.goldTotal);
  const lhDn = `${player.lastHits}/${player.denies}`;
  const hasAghs = hasScepterItem(player);
  // A杖已在侧边栏展示时，主格子里就不再重复出现（steamId 108）
  const mainItems = hasAghs
    ? player.items.filter((it) => String(it.steamId) !== '108')
    : player.items;

  // 侧边固定 2 格：中立装备 / A杖 / 魔晶（最多取 2，用占位符补足宽度）
  const sideSlots = [
    player.neutralItem
      ? {
          src: player.neutralItem.image,
          alt: player.neutralItem.title || '中立装备',
          title: `中立装备 · ${player.neutralItem.title || ''}`,
          ring: 'border-yellow-500/40',
        }
      : null,
    hasAghs
      ? {
          src: AGHS_ICON,
          alt: "Aghanim's Scepter",
          title: "Aghanim's Scepter (A杖)",
          ring: 'border-amber-400/40',
        }
      : null,
    player.hasShard
      ? {
          src: SHARD_ICON,
          alt: "Aghanim's Shard",
          title: "Aghanim's Shard (魔晶)",
          ring: 'border-cyan-400/40',
        }
      : null,
  ].filter(Boolean).slice(0, 2);

  const items = (
    <div className="flex shrink-0 items-center gap-1">
      {/* 主装备：固定 6 格（3×2） */}
      <div className="grid grid-cols-3 gap-0.5">
        {Array.from({ length: 6 }).map((_, idx) => {
          const item = mainItems[idx];
          return item ? (
            <SafeImg
              key={`${item.id ?? idx}-${item.title ?? ''}`}
              src={item.image}
              alt={item.title || ''}
              title={item.title || ''}
              className="size-8 shrink-0 rounded-full border border-white/10 bg-black/40 object-contain"
              fallback={<span className="size-8 shrink-0 rounded-full border border-white/5 bg-black/30" />}
            />
          ) : (
            <span key={`ghost-${idx}`} className="size-8 shrink-0 rounded-full border border-white/5 bg-black/20" />
          );
        })}
      </div>
      {/* 侧边：中立装备 / A杖 / 魔晶，固定 2 格 */}
      <div className="flex flex-col gap-0.5">
        {Array.from({ length: 2 }).map((_, idx) => {
          const slot = sideSlots[idx];
          return slot ? (
            <SafeImg
              key={slot.title}
              src={slot.src}
              alt={slot.alt}
              title={slot.title}
              className={`size-8 shrink-0 rounded-full border ${slot.ring} bg-black/40 object-contain`}
              fallback={<span className={`size-8 shrink-0 rounded-full border ${slot.ring} bg-black/30`} />}
            />
          ) : (
            <span key={`side-ghost-${idx}`} className="size-8 shrink-0 rounded-full border border-white/5 bg-black/20" />
          );
        })}
      </div>
    </div>
  );

  const stats = (
    <div className="grid shrink-0 grid-cols-2 gap-x-4 gap-y-2.5">
      <Stat label="KDA" value={kda} title="击杀-死亡-助攻" />
      <Stat label="Net Worth" value={netWorth} title={`总经济 ${player.goldTotal}`} />
      <Stat label="GPM/XPM" value={gpmXpm} title="每分钟金钱/经验" />
      <Stat label="正补/反补" value={lhDn} title="Last hits / Denies" />
    </div>
  );

  return (
    <div
      className={`relative flex flex-wrap items-center gap-x-2.5 gap-y-2 px-3 py-3 xl:flex-nowrap ${
        side === 'right' ? 'xl:flex-row-reverse' : ''
      } ${
        side === 'left'
          ? 'border-l border-blue-500/40 bg-gradient-to-r from-blue-500/[0.40] via-blue-500/[0.16] to-blue-500/[0.04]'
          : 'border-r border-red-500/40 bg-gradient-to-l from-red-500/[0.40] via-red-500/[0.16] to-red-500/[0.04]'
      }`}
    >
      {/* 英雄头像（外缘） */}
      <SafeImg
        src={player.heroImg}
        alt={player.heroTitle || ''}
        title={player.heroTitle || ''}
        className="size-[60px] shrink-0 rounded-lg border border-white/10 object-cover"
        fallback={<span className="size-[60px] shrink-0 rounded-lg border border-white/5 bg-black/30" />}
      />
      {/* 选手照片 */}
      <SafeImg
        src={player.avatar}
        alt={name}
        title={name}
        className="size-10 shrink-0 rounded-lg object-cover ring-1 ring-white/10"
        fallback={
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-500 ring-1 ring-white/10">
            <User className="size-5" />
          </span>
        }
      />
      {/* 等级 + 名字：窄固定列，LV 在上名字在下，保证各行对齐且不挤占装备 */}
      <div className="flex w-[130px] shrink-0 flex-col justify-center gap-0.5">
        <span
          className="self-start rounded px-1 py-px text-[10px] font-black leading-none text-black"
          style={{ backgroundColor: design.pip }}
        >
          LV {player.level ?? '?'}
        </span>
        <span className="w-full truncate text-sm font-black uppercase text-white">{name}</span>
      </div>
      {/* 2×2 统计网格 */}
      {stats}
      {/* 装备（靠中间） */}
      {items}
    </div>
  );

}

/** 单场比赛块 */
function GameBlock({
  game,
  firstTeamId,
  secondTeamId,
  firstTeamName,
  secondTeamName,
  firstLogo,
  secondLogo,
  leftPips,
  rightPips,
}: {
  game: SeriesMapBlock;
  firstTeamId: number | null;
  secondTeamId: number | null;
  firstTeamName: string | null;
  secondTeamName: string | null;
  firstLogo: string | null;
  secondLogo: string | null;
  leftPips: number;
  rightPips: number;
}) {
  // 固定布局：左边永远是 first_team，右边永远是 second_team。
  // 各队在比赛内可能换边，用每局的 radiantTeamId/direTeamId 换算出两边击杀数。
  const firstKills = game.radiantTeamId === firstTeamId ? game.radiantScore : game.direScore;
  const secondKills = game.radiantTeamId === secondTeamId ? game.radiantScore : game.direScore;
  const winnerIsFirst = game.winner === 'radiant'
    ? game.radiantTeamId === firstTeamId
    : game.winner === 'dire' ? game.direTeamId === firstTeamId : false;

  const firstPlayers = game.players.filter((p) => p.teamId === firstTeamId);
  const secondPlayers = game.players.filter((p) => p.teamId === secondTeamId);

  return (
    <div className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.02]">
      {/* 对战栏 */}
      <div className="relative border-b border-white/[0.06] bg-white/[0.03] px-4 py-3">
        <div className="mx-auto flex max-w-[900px] items-center justify-center">
          {/* 左队 */}
          <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-3">
            <SafeImg
              src={firstLogo}
              alt={firstTeamName || ''}
              className="size-8 shrink-0 object-contain md:size-10"
              fallback={<TeamLogoFallback name={firstTeamName || 'A'} size={32} />}
            />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                {winnerIsFirst ? <span style={{ color: design.pip }}>Victory</span> : 'Defeat'}
              </span>
              <span className="truncate text-sm font-black uppercase text-white md:text-base">{firstTeamName}</span>
            </div>
          </div>

          {/* 中：比分 + pip + 时间 */}
          <div className="flex shrink-0 items-center gap-2 px-2 md:gap-3 md:px-4">
            <div className="flex w-9 flex-col items-center md:w-[72px]">
              <span className={`text-2xl font-black tabular-nums leading-none md:text-[40px] ${winnerIsFirst ? 'text-white' : 'text-slate-500'}`}>
                {firstKills ?? '—'}
              </span>
              <div className="mt-1 h-1.5 md:mt-1.5">
                <Pips count={leftPips} />
              </div>
            </div>

            <div className="flex flex-col items-center">
              <span
                className="flex flex-col items-center rounded-[6px] px-2 py-0.5 font-mono text-sm font-black leading-none text-black md:px-2.5 md:py-1 md:text-lg"
                style={{ backgroundColor: design.pip }}
              >
                {formatDuration(game.duration)}
                <span className="mt-0.5 text-[8px] font-bold uppercase leading-none tracking-widest">
                  Game Time
                </span>
              </span>
            </div>

            <div className="flex w-9 flex-col items-center md:w-[72px]">
              <span className={`text-2xl font-black tabular-nums leading-none md:text-[40px] ${winnerIsFirst ? 'text-slate-500' : 'text-white'}`}>
                {secondKills ?? '—'}
              </span>
              <div className="mt-1 h-1.5 md:mt-1.5">
                <Pips count={rightPips} />
              </div>
            </div>
          </div>

          {/* 右队 */}
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2 md:gap-3">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-right text-[10px] font-bold uppercase tracking-wide text-slate-400">
                {winnerIsFirst ? 'Defeat' : <span style={{ color: design.pip }}>Victory</span>}
              </span>
              <span className="truncate text-right text-sm font-black uppercase text-white md:text-base">{secondTeamName}</span>
            </div>
            <SafeImg
              src={secondLogo}
              alt={secondTeamName || ''}
              className="size-8 shrink-0 object-contain md:size-10"
              fallback={<TeamLogoFallback name={secondTeamName || 'B'} size={32} />}
            />
          </div>
        </div>

        {/* 右上角：第几场 */}
        <div className="absolute right-4 top-3 text-[11px] font-semibold text-slate-500">第 {game.gameNo} 场</div>
      </div>

      {/* 选手两列：移动端堆叠时每队上方加队名分隔，桌面端并排 */}
      <div className="grid grid-cols-1 gap-1.5 p-1.5 md:grid-cols-2 md:gap-0 md:divide-x md:divide-white/[0.04] md:p-0">
        <div className="flex flex-col gap-1.5 md:gap-0">
          <div className="flex items-center gap-2 border-b border-white/[0.06] bg-white/[0.03] px-4 py-2 md:hidden">
            <SafeImg
              src={firstLogo}
              alt={firstTeamName || ''}
              className="size-5 shrink-0 object-contain"
              fallback={<TeamLogoFallback name={firstTeamName || 'A'} size={20} />}
            />
            <span className="truncate text-xs font-bold text-slate-200">{firstTeamName}</span>
          </div>
          {firstPlayers.map((p) => (
            <PlayerRow key={`${p.playerId}-${p.heroId}`} player={p} side="left" />
          ))}
        </div>
        <div className="flex flex-col gap-1.5 md:gap-0">
          <div className="flex items-center gap-2 border-b border-white/[0.06] bg-white/[0.03] px-4 py-2 md:hidden">
            <SafeImg
              src={secondLogo}
              alt={secondTeamName || ''}
              className="size-5 shrink-0 object-contain"
              fallback={<TeamLogoFallback name={secondTeamName || 'B'} size={20} />}
            />
            <span className="truncate text-xs font-bold text-slate-200">{secondTeamName}</span>
          </div>
          {secondPlayers.map((p) => (
            <PlayerRow key={`${p.playerId}-${p.heroId}`} player={p} side="right" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function SeriesMatchPage({ matchId, slug, onBack }: {
  matchId: string;
  slug?: string;
  onBack: () => void;
}) {
  const [payload, setPayload] = useState<MatchPagePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setPayload(null);
    setError(null);
    const params = new URLSearchParams({ series_id: matchId });
    if (slug) params.set('slug', slug);
    try {
      // 允许浏览器/EdgeOne 复用缓存（EdgeOne 按 origin Cache-Control 决定是否缓存 /api/match-page）。
      const res = await fetch(`/api/match-page?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || `加载失败（${res.status}）`);
        return;
      }
      const data: MatchPagePayload = await res.json();
      if (!data?.maps?.length) {
        setError('该系列赛暂无比赛数据');
        return;
      }
      setPayload(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '网络错误');
    }
  }, [matchId, slug]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div className="mx-auto flex max-w-[1280px] flex-col items-center gap-4 px-4 pt-28 lg:px-6" style={{ backgroundColor: '#0f1115' }}>
        <button type="button" onClick={onBack} className="flex items-center gap-2 text-sm font-semibold text-slate-300 hover:text-white">
          <ArrowLeft className="size-4" /> 返回赛程
        </button>
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-8 py-6 text-sm text-slate-300">{error}</div>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center" style={{ backgroundColor: '#0f1115' }}>
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <Loader2 className="size-6 animate-spin" />
          <span className="text-sm">正在加载比赛详情…</span>
        </div>
      </div>
    );
  }

  const first = payload.teams.radiant;
  const second = payload.teams.dire;
  const firstTeamId = first.id;
  const secondTeamId = second.id;

  // 倒叙 + 每场累计胜场（pip）
  const chrono = [...payload.maps];
  let leftWins = 0;
  let rightWins = 0;
  const gamesWithPips = chrono.map((game) => {
    const winnerTeamId = game.winner === 'radiant'
      ? game.radiantTeamId
      : game.winner === 'dire' ? game.direTeamId : null;
    if (winnerTeamId === firstTeamId) leftWins += 1;
    else if (winnerTeamId === secondTeamId) rightWins += 1;
    return { game, leftPips: leftWins, rightPips: rightWins };
  });
  const reversed = [...gamesWithPips].reverse();

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pt-24 lg:px-6" style={{ backgroundColor: '#0f1115' }}>
      <div className="flex flex-col gap-6 pb-16">
        {/* 顶部条 */}
        <div className="flex items-center justify-between gap-4">
          <button type="button" onClick={onBack} className="flex items-center gap-2 text-sm font-semibold text-slate-300 hover:text-white">
            <ArrowLeft className="size-4" /> 返回赛程
          </button>
          <div className="hidden items-center gap-2 text-xs text-slate-400 sm:flex">
            <span className="font-semibold text-slate-200">{payload.eventName || 'Dota 2'}</span>
            {payload.startTime ? <span>· {formatDate(payload.startTime)}</span> : null}
            <span>· {payload.bestOf || 'BO3'}</span>
          </div>
          <div className="w-24" />
        </div>

        {/* 系列赛总比分 */}
        <div className="flex items-center justify-center gap-6 rounded-2xl border border-white/8 bg-white/[0.03] px-6 py-5">
          <div className="flex flex-col items-center gap-1">
            <SafeImg
              src={first.logo}
              alt={first.name || ''}
              className="size-12 object-contain"
              fallback={<TeamLogoFallback name={first.name || 'A'} size={48} />}
            />
            <span className="max-w-[160px] truncate text-sm font-bold text-white">{first.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-4xl font-black tabular-nums text-white">{payload.radiantWins}</span>
            <span className="text-2xl font-bold text-slate-500">:</span>
            <span className="text-4xl font-black tabular-nums text-white">{payload.direWins}</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <SafeImg
              src={second.logo}
              alt={second.name || ''}
              className="size-12 object-contain"
              fallback={<TeamLogoFallback name={second.name || 'B'} size={48} />}
            />
            <span className="max-w-[160px] truncate text-sm font-bold text-white">{second.name}</span>
          </div>
        </div>

        {/* 每场比赛（倒叙） */}
        {reversed.map(({ game, leftPips, rightPips }) => (
          <GameBlock
            key={`${game.gameNo}-${game.steamId}`}
            game={game}
            firstTeamId={firstTeamId}
            secondTeamId={secondTeamId}
            firstTeamName={first.name}
            secondTeamName={second.name}
            firstLogo={first.logo}
            secondLogo={second.logo}
            leftPips={leftPips}
            rightPips={rightPips}
          />
        ))}
      </div>
    </div>
  );
}
