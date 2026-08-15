import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BarChart3, Calendar, ExternalLink, Trophy } from 'lucide-react';
import { SafeImg } from '@/components/custom/SafeImg';
import { TeamLogoFallback } from '@/components/custom/TeamLogoFallback';
import { resolveTeamLogo } from '@/lib/teams';
import { apiFetch } from '@/lib/api-cache';
import type { MatchPagePayload, SeriesHeroStat, SeriesLineupPlayer, SeriesTeamInfo } from '@/types/matchPage';

const design = {
  blue: '#2b55e8',
  red: '#ff3b30',
  card: '#1a1d24',
  pip: '#facc15',
};

function formatPercent(value?: string | number | null): string {
  if (value === null || value === undefined || value === '') return '—';
  // DLTV 里队伍胜率是 "63.000"（数字串），签名英雄有 "79%"（带百分号）或纯数字 67，统一处理。
  const num = Number(String(value).trim().replace('%', ''));
  if (!Number.isFinite(num)) return '—';
  return `${Math.round(num)}%`;
}

function formatNumber(value?: string | null, digits = 1): string {
  if (!value) return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return num.toFixed(digits);
}

function formatPrize(value?: number | null): string {
  if (!value) return '—';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value}`;
}

function formatDateRange(start?: string | null, end?: string | null): string {
  if (!start) return '—';
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : null;
  if (Number.isNaN(startDate.getTime())) return '—';
  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
  return endDate && !Number.isNaN(endDate.getTime()) ? `${fmt(startDate)} - ${fmt(endDate)}` : fmt(startDate);
}

/** 倒计时字段，返回 null 表示已开赛。 */
function useCountdown(target: number | null): { d: number; h: number; m: number; s: number } | null {
  const compute = (): { d: number; h: number; m: number; s: number } | null => {
    if (!target) return null;
    const diff = Math.max(0, Math.floor(target - Date.now() / 1000));
    if (diff <= 0) return null;
    return {
      d: Math.floor(diff / 86400),
      h: Math.floor((diff % 86400) / 3600),
      m: Math.floor((diff % 3600) / 60),
      s: diff % 60,
    };
  };
  const [left, setLeft] = useState(compute);
  useEffect(() => {
    const tick = () => setLeft(compute());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return left;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="leading-none">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-bold tabular-nums text-white">{value}</div>
    </div>
  );
}

type OpenTeamHandler = (team: { name: string; slug?: string | null }) => void;

function TeamStatBlock({ team, align, onOpenTeam }: {
  team: SeriesTeamInfo;
  align: 'left' | 'right';
  onOpenTeam?: OpenTeamHandler;
}) {
  const logo = resolveTeamLogo({ teamId: team.id, name: team.name }, [], team.logo);
  const inner = (
    <>
      <SafeImg
        src={logo}
        alt={team.name || ''}
        className="size-12 object-contain sm:size-16"
        fallback={<TeamLogoFallback name={team.name || (align === 'left' ? 'A' : 'B')} size={56} />}
      />
      <span className="w-full truncate text-center text-sm font-black uppercase text-white sm:text-lg">
        {team.name}
      </span>
    </>
  );
  const clickable = Boolean(team.name) && Boolean(onOpenTeam);
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
      {clickable ? (
        <button
          type="button"
          onClick={() => onOpenTeam?.({ name: team.name as string, slug: team.slug })}
          title={`查看 ${team.name} 战队资料`}
          className="flex flex-col items-center gap-2 rounded-xl px-2 py-1 transition-colors hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400/60"
        >
          {inner}
        </button>
      ) : (
        <div className="flex flex-col items-center gap-2">{inner}</div>
      )}
      {team.rank != null && (
        <span className="rounded px-2 py-0.5 text-[11px] font-semibold text-slate-300" style={{ backgroundColor: '#2a2d35' }}>
          World Rank #{team.rank}
        </span>
      )}
      <div className="flex items-center gap-3">
        <Stat label="胜率" value={formatPercent(team.winRate)} />
        <Stat label="一血" value={formatPercent(team.fbRate)} />
        <Stat label="10杀" value={formatPercent(team.f10Rate)} />
      </div>
    </div>
  );
}

function PlayerCard({ player }: { player: SeriesLineupPlayer }) {
  const name = player.name || `选手 ${player.id ?? ''}`;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
      <SafeImg
        src={player.image}
        alt={name}
        className="size-10 shrink-0 rounded-lg object-cover ring-1 ring-white/10"
        fallback={
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-500 ring-1 ring-white/10">
            <Trophy className="size-4" />
          </span>
        }
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {player.roleLabel ? (
            <span className="shrink-0 rounded px-1.5 py-px text-[10px] font-bold text-black" style={{ backgroundColor: design.pip }}>
              {player.roleLabel}
            </span>
          ) : null}
          <span className="truncate text-sm font-bold text-white">{name}</span>
          {player.rank ? <span className="shrink-0 text-[11px] tabular-nums text-slate-500">#{player.rank}</span> : null}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="text-xs tabular-nums text-slate-400">KDA <b className="text-slate-200">{formatNumber(player.kda, 2)}</b></span>
          <span className="text-xs tabular-nums text-slate-400">GPM <b className="text-slate-200">{Math.round(Number(player.avgGpm) || 0) || '—'}</b></span>
          <span className="text-xs tabular-nums text-slate-400">XPM <b className="text-slate-200">{Math.round(Number(player.avgXpm) || 0) || '—'}</b></span>
        </div>
        {player.topHeroes.length > 0 && (
          <div className="mt-2 flex items-center gap-1.5">
            {player.topHeroes.map((hero) => (
              <div key={hero.heroId} className="flex items-center gap-1" title={`${hero.heroTitle || ''} · ${hero.maps ?? 0} 场 / ${formatPercent(hero.winRate)}`}>
                <SafeImg
                  src={hero.heroImage}
                  alt={hero.heroTitle || ''}
                  className="size-6 rounded border border-white/10 object-cover"
                  fallback={<span className="size-6 rounded border border-white/5 bg-black/30" />}
                />
                <span className="text-[10px] tabular-nums text-slate-500">{formatPercent(hero.winRate)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LineupColumn({ team, onOpenTeam }: { team: SeriesTeamInfo; onOpenTeam?: OpenTeamHandler }) {
  const logo = resolveTeamLogo({ teamId: team.id, name: team.name }, [], team.logo);
  const header = (
    <>
      <SafeImg
        src={logo}
        alt={team.name || ''}
        className="size-5 shrink-0 object-contain"
        fallback={<TeamLogoFallback name={team.name || 'T'} size={20} />}
      />
      <span className="truncate text-sm font-bold text-slate-200">{team.name}</span>
      <span className="shrink-0 text-[11px] text-slate-500">· {formatPercent(team.winRate)} 胜率</span>
    </>
  );
  return (
    <div className="flex flex-col gap-2">
      {Boolean(team.name) && onOpenTeam ? (
        <button
          type="button"
          onClick={() => onOpenTeam({ name: team.name as string, slug: team.slug })}
          title={`查看 ${team.name} 战队资料`}
          className="flex w-fit max-w-full items-center gap-2 rounded-lg py-0.5 pr-1 transition-colors hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400/60"
        >
          {header}
        </button>
      ) : (
        <div className="flex items-center gap-2">{header}</div>
      )}
      {team.players.length > 0 ? (
        team.players.map((player) => <PlayerCard key={`${team.id}-${player.id}`} player={player} />)
      ) : (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 text-center text-xs text-slate-500">暂无阵容数据</div>
      )}
    </div>
  );
}

/** 单行两队对比：左值(radiant 绿) | 指标名(emoji + 相对条) | 右值(dire 红)；更优方加亮标记。 */
function StatCompareRow({ label, icon, left, right, better }: {
  label: string;
  icon: string;
  left: string;
  right: string;
  better: string | number | null;
}) {
  const lNum = typeof left === 'string' ? Number(String(left).replace(/[^\d.-]/g, '')) : NaN;
  const rNum = typeof right === 'string' ? Number(String(right).replace(/[^\d.-]/g, '')) : NaN;
  const hasBar = Number.isFinite(lNum) && Number.isFinite(rNum) && lNum >= 0 && rNum >= 0 && lNum + rNum > 0;
  const lRatio = hasBar ? lNum / (lNum + rNum) : 0;
  // radiant=绿(#34d399) 在左，dire=红(#ff3b30) 在右；更优方加粗 + 前导小圆点。
  const leftCls = `text-right text-sm font-semibold tabular-nums ${better === 'left' ? 'font-black text-[#34d399]' : 'text-[#34d399]/70'}`;
  const rightCls = `text-sm font-semibold tabular-nums ${better === 'right' ? 'font-black text-[#ff5b51]' : 'text-[#ff5b51]/70'}`;

  return (
    <div className="grid grid-cols-[1fr_1.7fr_1fr] items-center gap-2 px-3 py-2 odd:bg-white/[0.02]">
      <span className={`flex items-center justify-end gap-1 ${leftCls}`}>
        {better === 'left' && <span className="size-1 rounded-full bg-[#34d399]" />}
        {left}
      </span>
      {/* 指标名(emoji) + 相对条 */}
      <div className="flex flex-col items-center gap-1">
        <span className="flex items-center gap-1 text-[11px] font-semibold tracking-wide text-slate-400">
          <span aria-hidden="true">{icon}</span>
          {label}
        </span>
        {hasBar && (
          <div className="flex h-1.5 w-full max-w-[72px] overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-[#34d399]/70" style={{ width: `${Math.round(lRatio * 100)}%` }} />
            <div className="h-full flex-1 rounded-full bg-[#ff3b30]/70" />
          </div>
        )}
      </div>
      <span className={`flex items-center justify-start gap-1 ${rightCls}`}>
        {right}
        {better === 'right' && <span className="size-1 rounded-full bg-[#ff3b30]" />}
      </span>
    </div>
  );
}

/** 单个招牌英雄徽章（头像 + 中文名 + 场次/胜率）。经 heroesData 按 heroId 回填中文名/图；
 *  名称与图都无法解析(如 DLTV 空数据占位)时返回 null 不渲染。 */
type HeroesMeta = Record<number, { name?: string; name_cn?: string; img_url?: string }>;

/** dltv 的 heroId 与本地 heroes 表（官方 id 体系）存在错位（如 dltv 73=Invoker 而表 73=Alchemist）：
 *  英文名是权威标识，优先按 heroTitle 精确匹配；匹配不到再退回 heroId 索引。 */
function resolveHeroMeta(
  heroId: number | null | undefined,
  heroTitle: string | null | undefined,
  heroesData: HeroesMeta,
): { name?: string; name_cn?: string; img_url?: string } | undefined {
  const title = String(heroTitle || '').trim().toLowerCase();
  if (title) {
    for (const meta of Object.values(heroesData)) {
      if (meta?.name && String(meta.name).trim().toLowerCase() === title) return meta;
    }
  }
  return heroId != null ? heroesData[heroId] : undefined;
}

function HeroBadge({ hero, heroesData }: { hero: SeriesHeroStat; heroesData: HeroesMeta }) {
  if (!hero?.heroId) return null;
  const meta = resolveHeroMeta(hero.heroId, hero.heroTitle, heroesData);
  const name = meta?.name_cn || hero.heroTitle || '';
  const img = hero.heroImage || meta?.img_url || '';
  // 名称和图都没有 → 无效占位行，直接不渲染（避免出现 "— 2场"）。
  if (!name && !img) return null;
  return (
    <div
      title={name || hero.heroTitle || ''}
      className="flex items-center gap-1.5 rounded-lg border px-2 py-1.5"
      style={{ borderColor: 'rgba(255,255,255,0.06)', backgroundColor: 'rgba(255,255,255,0.02)' }}
    >
      <SafeImg
        src={img}
        alt={name || '英雄'}
        className="size-7 shrink-0 rounded border border-white/10 object-cover"
        fallback={<span className="size-7 shrink-0 rounded border border-white/5 bg-black/30" />}
      />
      <div className="leading-tight min-w-0">
        <div className="max-w-[88px] text-[11px] font-semibold leading-snug text-slate-200 line-clamp-2 whitespace-normal break-words">{name || '—'}</div>
        <div className="text-[10px] tabular-nums text-slate-500">{hero.maps ?? 0} 场 · {formatPercent(hero.winRate)}</div>
      </div>
    </div>
  );
}

/** 一列队伍招牌英雄（含队伍名头）；heroes 为空时返回 null。 */
function HeroColumn({ teamName, heroes, accent, heroesData }: {
  teamName: string;
  heroes: SeriesHeroStat[];
  accent: string;
  heroesData: HeroesMeta;
}) {
  const valid = heroes.filter((h) => {
    if (!h?.heroId) return false;
    const meta = resolveHeroMeta(h.heroId, h.heroTitle, heroesData);
    return Boolean(meta?.name_cn || h.heroTitle || h.heroImage || meta?.img_url);
  });
  if (valid.length === 0) return null;
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: accent }} />
        <span className="min-w-0 break-words">{teamName}</span>
      </div>
      <div className="flex flex-wrap justify-start gap-2">{valid.map((h) => <HeroBadge key={h.heroId} hero={h} heroesData={heroesData} />)}</div>
    </div>
  );
}

/** 两队招牌英雄对比：左队 | 共同英雄 | 右队，左右排布；两边共有的英雄居中显示为"共同英雄"。 */
function SignatureHeroesComparison({ first, second }: { first: SeriesTeamInfo; second: SeriesTeamInfo }) {
  const [heroesData, setHeroesData] = useState<HeroesMeta>({});

  // 英雄中英名/图静态，1h 共享缓存；用于招牌英雄中文名 + 回填 DLTV 缺失的 title/图。
  useEffect(() => {
    let cancelled = false;
    apiFetch<Record<string, unknown>>('/api/heroes', { ttlMs: 60 * 60 * 1000, cacheEmpty: false })
      .then((res) => {
        if (cancelled) return;
        const map: HeroesMeta = {};
        Object.entries(res || {}).forEach(([key, value]) => {
          const v = value as { name?: string; name_cn?: string; img_url?: string };
          map[parseInt(key)] = {
            name: v.name || undefined,
            name_cn: v.name_cn || undefined,
            img_url: v.img_url || undefined,
          };
        });
        setHeroesData(map);
      })
      .catch(() => { /* 拿不到中文名时保留英文 */ });
    return () => { cancelled = true; };
  }, []);

  const aHeroes = first.stats?.heroes || [];
  const bHeroes = second.stats?.heroes || [];
  if (aHeroes.length === 0 && bHeroes.length === 0) return null;

  const aIds = new Set(aHeroes.map((h) => h.heroId));
  const bIds = new Set(bHeroes.map((h) => h.heroId));
  const common = aHeroes.filter((h) => h.heroId != null && bIds.has(h.heroId));
  const aUnique = aHeroes.filter((h) => h.heroId == null || !bIds.has(h.heroId));
  const bUnique = bHeroes.filter((h) => h.heroId == null || !aIds.has(h.heroId));

  return (
    <div className="mt-5">
      <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        <span className="size-1.5 rounded-full bg-amber-400/80" />
        招牌英雄 Signature Heroes（场次 / 胜率）
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto_1fr] md:items-start md:gap-6">
        {/* 左队 A */}
        <HeroColumn teamName={first.name || '天辉'} heroes={aUnique} accent="#34d399" heroesData={heroesData} />

        {/* 中间：共同英雄 */}
        <div className="min-w-0 rounded-xl border px-3 py-2.5" style={{ borderColor: 'rgba(250,204,21,0.25)', backgroundColor: 'rgba(250,204,21,0.06)' }}>
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-300/90">
            <span className="size-1.5 rounded-full bg-amber-400" />
            共同英雄 {common.length > 0 ? `· ${common.length}` : ''}
          </div>
          {common.length > 0 ? (
            <div className="flex flex-wrap justify-center gap-2">
              {common.map((h) => <HeroBadge key={h.heroId} hero={h} heroesData={heroesData} />)}
            </div>
          ) : (
            <div className="py-2 text-center text-[11px] text-slate-600">两队招牌英雄无交集</div>
          )}
        </div>

        {/* 右队 B */}
        <HeroColumn teamName={second.name || '夜魇'} heroes={bUnique} accent="#ff3b30" heroesData={heroesData} />
      </div>
    </div>
  );
}

/** 两队数据对比（Statistics 标签同源：/api/v1/series/{id}/lineups/teams）。 */
function StatsComparison({ first, second }: { first: SeriesTeamInfo; second: SeriesTeamInfo }) {
  const a = first.stats?.overall;
  const b = second.stats?.overall;
  if (!a || !b) return null;

  const pct = (v: number | null) => (v == null ? '—' : `${v}%`);
  const num = (v: number | null) => (v == null ? '—' : v.toFixed(1));
  const mins = (v: number | null) => (v == null ? '—' : `${Math.round(v / 60)} 分钟`);
  // better: 'left' | 'right' | null —— 该指标下更优一方（更高优；场均死亡取更低）。
  const higher = (lv: number | null, rv: number | null): 'left' | 'right' | null => {
    if (lv == null || rv == null || lv === rv) return null;
    return lv > rv ? 'left' : 'right';
  };
  const lower = (lv: number | null, rv: number | null): 'left' | 'right' | null => {
    if (lv == null || rv == null || lv === rv) return null;
    return lv < rv ? 'left' : 'right';
  };
  const rows = [
    { label: '胜率', icon: '📈', left: pct(a.winRate), right: pct(b.winRate), better: higher(a.winRate, b.winRate) },
    { label: '场均击杀', icon: '⚔️', left: num(a.avgKills), right: num(b.avgKills), better: higher(a.avgKills, b.avgKills) },
    { label: '场均死亡', icon: '💀', left: num(a.avgDeaths), right: num(b.avgDeaths), better: lower(a.avgDeaths, b.avgDeaths) },
    { label: '场均助攻', icon: '🤝', left: num(a.avgAssists), right: num(b.avgAssists), better: higher(a.avgAssists, b.avgAssists) },
    { label: '一血率', icon: '🩸', left: pct(a.fbRate), right: pct(b.fbRate), better: higher(a.fbRate, b.fbRate) },
    { label: '前10杀率', icon: '🎯', left: pct(a.f10Rate), right: pct(b.f10Rate), better: higher(a.f10Rate, b.f10Rate) },
    { label: '一血后胜率', icon: '🛡️', left: pct(a.winFbRate), right: pct(b.winFbRate), better: higher(a.winFbRate, b.winFbRate) },
    { label: '10杀后胜率', icon: '⚡', left: pct(a.winF10Rate), right: pct(b.winF10Rate), better: higher(a.winF10Rate, b.winF10Rate) },
    { label: '平均时长', icon: '⏱️', left: mins(a.avgTime), right: mins(b.avgTime), better: null },
  ];

  const teamHead = (team: SeriesTeamInfo, align: 'left' | 'right') => (
    <div className={`flex min-w-0 items-center gap-2 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
      <SafeImg
        src={team.logo || ''}
        alt={team.name || ''}
        className="size-6 shrink-0 rounded-md object-contain"
        fallback={<TeamLogoFallback name={team.name || '?'} size={24} />}
      />
      <span className={`truncate text-xs font-bold uppercase text-slate-300 ${align === 'right' ? 'text-right' : ''}`}>{team.name}</span>
    </div>
  );

  return (
    <section className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-300">
        <BarChart3 className="size-4 text-blue-400" /> 数据对比 Statistics
      </h2>
      <div className="grid grid-cols-[1fr_1.6fr_1fr] items-center gap-2 px-3 pb-2">
        {teamHead(first, 'left')}
        <span className="text-center text-[10px] font-semibold text-slate-600">近 3 个月</span>
        {teamHead(second, 'right')}
      </div>
      {rows.map((row) => (
        <StatCompareRow key={row.label} label={row.label} icon={row.icon} left={row.left} right={row.right} better={row.better} />
      ))}
      <SignatureHeroesComparison first={first} second={second} />
    </section>
  );
}

export function UpcomingMatchView({ payload, onBack, onOpenTeam }: {
  payload: MatchPagePayload;
  onBack: () => void;
  onOpenTeam?: OpenTeamHandler;
}) {
  const first = payload.teams.radiant;
  const second = payload.teams.dire;
  const event = payload.event;
  const countdown = useCountdown(payload.startTime);
  const eventName = payload.eventName || event?.name || 'Dota 2';
  const stream = useMemo(() => payload.streams?.find((s) => s.url), [payload.streams]);

  return (
    <div className="flex flex-col gap-6 pb-16">
      {/* 顶部条 */}
      <div className="flex items-center justify-between gap-4">
        <button type="button" onClick={onBack} className="flex items-center gap-2 text-sm font-semibold text-slate-300 hover:text-white">
          <ArrowLeft className="size-4" /> 返回赛程
        </button>
        <div className="hidden items-center gap-2 text-xs text-slate-400 sm:flex">
          <span className="font-semibold text-slate-200">{eventName}</span>
          {payload.stage ? <span>· {payload.stage}</span> : null}
          {payload.bestOf ? <span>· {payload.bestOf}</span> : null}
        </div>
        <div className="w-24" />
      </div>

      {/* 倒计时 + 对阵 */}
      <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-6 sm:px-6">
        <div className="mb-5 flex items-center justify-center gap-3">
          {countdown ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-400">距开赛</span>
              {countdown.d > 0 && (
                <span className="rounded-lg px-2.5 py-1 font-mono text-2xl font-black tabular-nums text-white" style={{ backgroundColor: '#2a2d35' }}>{countdown.d}<span className="text-xs font-semibold text-slate-500">天</span></span>
              )}
              <span className="rounded-lg px-2.5 py-1 font-mono text-2xl font-black tabular-nums text-white" style={{ backgroundColor: '#2a2d35' }}>{String(countdown.h).padStart(2, '0')}</span>
              <span className="font-mono text-xl font-bold text-slate-500">:</span>
              <span className="rounded-lg px-2.5 py-1 font-mono text-2xl font-black tabular-nums text-white" style={{ backgroundColor: '#2a2d35' }}>{String(countdown.m).padStart(2, '0')}</span>
              <span className="font-mono text-xl font-bold text-slate-500">:</span>
              <span className="rounded-lg px-2.5 py-1 font-mono text-2xl font-black tabular-nums text-white" style={{ backgroundColor: '#2a2d35' }}>{String(countdown.s).padStart(2, '0')}</span>
            </div>
          ) : (
            <span className="rounded-full px-4 py-1.5 text-sm font-bold text-black" style={{ backgroundColor: design.pip }}>即将开始</span>
          )}
          {stream ? (
            <a
              href={stream.url || undefined}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-semibold text-red-400 transition-colors hover:bg-red-500/10"
            >
              <ExternalLink className="size-3.5" /> 直播
            </a>
          ) : null}
        </div>

        <div className="flex items-center gap-4 sm:gap-8">
          <TeamStatBlock team={first} align="left" onOpenTeam={onOpenTeam} />
          <div className="shrink-0">
            <div className="flex flex-col items-center gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">VS</span>
              <span className="rounded px-3 py-1 text-xs font-bold text-slate-300" style={{ backgroundColor: '#2a2d35' }}>{payload.bestOf || 'BO3'}</span>
            </div>
          </div>
          <TeamStatBlock team={second} align="right" onOpenTeam={onOpenTeam} />
        </div>
      </div>

      {/* 数据对比（stats 未预热时为 null，自动隐藏） */}
      <StatsComparison first={first} second={second} />

      {/* 阵容 */}
      {first.players.length > 0 || second.players.length > 0 ? (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-300">
            <Trophy className="size-4 text-amber-400" /> 阵容 Lineups
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
            <LineupColumn team={first} onOpenTeam={onOpenTeam} />
            <LineupColumn team={second} onOpenTeam={onOpenTeam} />
          </div>
        </section>
      ) : null}

      {/* 赛事信息 */}
      {event ? (
        <section className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-300">
            <Calendar className="size-4 text-blue-400" /> 赛事信息
          </h2>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">赛事</div>
              {event.eventSlug ? (
                <a href={`#/event/${encodeURIComponent(event.eventSlug)}`} className="mt-0.5 block text-sm font-bold text-white transition-colors hover:text-blue-300" title={`查看 ${eventName} 赛事详情`}>
                  {eventName}
                </a>
              ) : (
                <div className="mt-0.5 text-sm font-bold text-white">{eventName}</div>
              )}
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">奖金池</div>
              <div className="mt-0.5 text-sm font-bold text-white">{formatPrize(event.prizePool)}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">日期</div>
              <div className="mt-0.5 text-sm font-bold text-white">{formatDateRange(event.startDate, event.endDate)}</div>
            </div>
            {event.country?.name ? (
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">举办国家</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-sm font-bold text-white">
                  <SafeImg
                    src={event.country.flag}
                    alt=""
                    className="size-4 rounded-sm object-cover"
                    fallback={null}
                  />
                  {event.country.emoji ? <span>{event.country.emoji}</span> : null}
                  {event.country.name}
                </div>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {event.eventSlug ? (
                <a href={`#/event/${encodeURIComponent(event.eventSlug)}`} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:text-white" style={{ backgroundColor: '#2a2d35' }}>
                  <Trophy className="size-3.5" /> 赛程
                </a>
              ) : event.bracketsLink ? (
                <a href={event.bracketsLink} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:text-white" style={{ backgroundColor: '#2a2d35' }}>
                  <ExternalLink className="size-3.5" /> 赛程
                </a>
              ) : null}
              {stream?.url ? (
                <a href={stream.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:text-white" style={{ backgroundColor: '#2a2d35' }}>
                  <ExternalLink className="size-3.5" /> Twitch
                </a>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
