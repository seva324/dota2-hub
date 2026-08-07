import type { ReactNode } from 'react';
import { Play } from 'lucide-react';
import { SafeImg } from '@/components/custom/SafeImg';
import { TournamentNameLink } from '@/components/custom/TournamentNameLink';

export interface LiveHeroPayload {
  source?: string;
  sourceUrl?: string | null;
  sourceSeriesId?: string | null;
  sourceSeriesSlug?: string | null;
  sourceChampionshipSlug?: string | null;
  leagueName: string;
  /** 匹配到本站赛事时透传的 DLTV 赛事 slug，用于"赛事名→赛事详情"跳转 */
  event_slug?: string | null;
  stage?: string | null;
  bestOf?: string | number | null;
  seriesScore: string;
  live?: boolean;
  startedAt?: string | number | null;
  viewerCount?: number | null;
  teams?: Array<{
    side?: 'team1' | 'team2';
    name: string;
    logo?: string | null;
  }>;
  maps?: Array<{
    matchId?: string | number | null;
    label: string;
    score?: string | null;
    status?: 'completed' | 'live' | 'upcoming';
    result?: 'team1' | 'team2' | null;
    team1Score?: number | null;
    team2Score?: number | null;
    gameTime?: number | null;
  }>;
  liveMap?: {
    matchId?: string | number | null;
    label: string;
    score?: string | null;
    status?: 'live';
    gameTime?: number | null;
    team1Score?: number | null;
    team2Score?: number | null;
    team1NetWorthLead?: number | null;
    team2NetWorthLead?: number | null;
    team1TotalGold?: number | null;
    team2TotalGold?: number | null;
  } | null;
}

export const design = {
  blue: '#2b55e8',
  red: '#ff3b30',
  card: '#1a1d24',
};

const CARD = {
  logo: 'h-10 w-10',
  teamName: 'text-[13px] font-semibold leading-snug',
  badge: 'rounded px-2 py-0.5 text-[11px] font-bold',
  meta: 'text-[11px]',
};

export function formatBestOf(value?: string | number | null): string {
  if (value === null || value === undefined || value === '') return 'BO3';
  if (typeof value === 'number' && Number.isFinite(value)) return `BO${value}`;
  const normalized = String(value).trim().toUpperCase();
  if (!normalized) return 'BO3';
  if (normalized.startsWith('BO')) return normalized;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? `BO${parsed}` : normalized;
}

export function formatGameClock(seconds?: number | null): string {
  if (!seconds || seconds <= 0) return '';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function parseSeriesScore(value: string) {
  const match = String(value || '').match(/(\d+)\s*[:-]\s*(\d+)/);
  if (!match) return { team1: 0, team2: 0 };
  return { team1: Number(match[1]) || 0, team2: Number(match[2]) || 0 };
}

function formatNetWorth(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

/** 统一的队伍列：logo 上方、队名下方、固定高度两行。
 *  alignDown：把 logo+队名整体下移约 20px，使视觉中心与中间比分区对齐。
 *  badge 槽位固定高度，保证有无经济领先时三列高度一致。 */
export function TeamColumn({ name, logo, accent, badge, alignDown }: {
  name: string;
  logo?: string | null;
  accent?: boolean;
  badge?: ReactNode;
  alignDown?: boolean;
}) {
  return (
    <div className={`flex min-w-0 flex-col items-center ${alignDown ? 'translate-y-[20px]' : ''}`}>
      <SafeImg
        src={logo || ''}
        alt={name}
        className={`${CARD.logo} shrink-0 object-contain`}
        fallback={<div className="flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ backgroundColor: '#2a2d35', color: '#a1a1aa' }}>{name.substring(0, 2).toUpperCase()}</div>}
      />
      <span
        className={`${CARD.teamName} line-clamp-2 mt-1 w-full min-h-8 text-center`}
        style={{ color: accent === false ? '#a1a1aa' : '#fff' }}
      >
        {name}
      </span>
      {/* 固定高度的 badge 槽位，保持列高一致 */}
      <div className="mt-0.5 flex h-4 items-center justify-center">
        {badge}
      </div>
    </div>
  );
}

/** 统一的卡片状态标签（LIVE / COMPLETED / 时间） */
export function CardStatus({ text, tone = 'time' }: { text: string; tone?: 'live' | 'completed' | 'time' }) {
  const style = tone === 'live'
    ? { color: '#fff', backgroundColor: design.red }
    : { color: '#a1a1aa', backgroundColor: '#2a2d35' };
  return <span className={CARD.badge} style={style}>{text}</span>;
}

/** 经济领先标签：+数值，显示在领先方队伍名下方 */
export function NetWorthBadge({ value }: { value: number }) {
  return (
    <span className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] font-bold tabular-nums" style={{ color: '#ff8a80' }}>
      <span className="inline-block size-1.5 rounded-full" style={{ backgroundColor: '#ff8a80' }} />
      +{formatNetWorth(value)}
    </span>
  );
}

/** Live 比赛卡片：右上角 BO、当前局击杀大字号、Series 比分次要、经济领先、比赛时长 */
export function LiveMatchCard({ hero, onOpen }: {
  hero: LiveHeroPayload;
  onOpen?: () => void;
}) {
  const team1 = hero.teams?.[0]?.name || 'TBD';
  const team2 = hero.teams?.[1]?.name || 'TBD';
  const seriesScore = parseSeriesScore(hero.seriesScore);
  const liveMap = hero.liveMap;

  // 当前局击杀（小比分/首要）：大字号展示；系列比分（次要）：小字号
  const kills1 = liveMap?.team1Score ?? '—';
  const kills2 = liveMap?.team2Score ?? '—';

  // 经济领先：数据格式为"领先方对应字段为正值、落后方为 null"（summarizeSeriesDetail）
  // 或"team1NetWorthLead 带符号"（live-detail 解析）。统一按"领先方字段 > 0"判断。
  const team1Lead = liveMap?.team1NetWorthLead;
  const team2Lead = liveMap?.team2NetWorthLead;
  const leader = (
    team1Lead != null && Number.isFinite(team1Lead) && team1Lead > 0 ? 1
    : team2Lead != null && Number.isFinite(team2Lead) && team2Lead > 0 ? 2
    : null
  );
  const netWorthAbs = leader === 1 ? Math.abs(team1Lead!) : leader === 2 ? Math.abs(team2Lead!) : null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex h-full w-full flex-col overflow-hidden rounded-xl p-4 text-left transition-transform hover:-translate-y-0.5"
      style={{ backgroundColor: design.card }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/[0.05] to-transparent" />

      <div className="relative flex items-center justify-between">
        <CardStatus text="LIVE" tone="live" />
        <span className="rounded px-2 py-0.5 text-[11px] font-semibold" style={{ color: '#a1a1aa', backgroundColor: '#2a2d35' }}>
          {formatBestOf(hero.bestOf)}
        </span>
      </div>

      {/* 队伍竖排（logo 上、队名下），整体下移让视觉中心与比分对齐 */}
      <div className="relative mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <TeamColumn
          name={team1}
          logo={hero.teams?.[0]?.logo}
          alignDown
          badge={leader === 1 ? <NetWorthBadge value={netWorthAbs!} /> : null}
        />
        {/* 当前局击杀：首要、大字号、固定列宽 */}
        <div className="flex w-16 shrink-0 flex-col items-center justify-center">
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black tabular-nums text-white">{kills1}</span>
            <span className="text-base font-bold" style={{ color: '#71717a' }}>:</span>
            <span className="text-2xl font-black tabular-nums text-white">{kills2}</span>
          </div>
        </div>
        <TeamColumn
          name={team2}
          logo={hero.teams?.[1]?.logo}
          alignDown
          badge={leader === 2 ? <NetWorthBadge value={netWorthAbs!} /> : null}
        />
      </div>

      {/* 系列比分：独占一行，始终居中 */}
      <div className="relative mt-3 flex h-4 items-center justify-center">
        <span className="text-[11px] font-semibold tabular-nums" style={{ color: '#71717a' }}>
          Series {seriesScore.team1} : {seriesScore.team2}
        </span>
      </div>

      <div className="relative mt-3 line-clamp-2 min-h-8 text-center text-[11px]" style={{ color: '#71717a' }}>
        <TournamentNameLink slug={hero.event_slug} name={hero.leagueName} className="hover:text-slate-300" />
        {hero.stage ? ` · ${hero.stage}` : ''}
      </div>

      <div className="relative mt-2 flex items-center justify-between gap-2">
        <span className="shrink-0 text-[11px] font-semibold" style={{ color: liveMap?.status === 'live' ? design.red : '#a1a1aa' }}>
          {liveMap?.label ? liveMap.label.replace(/Map\s*(\d+)/i, 'Game $1') : 'Game 1'}
          {formatGameClock(liveMap?.gameTime) && (
            <span className="ml-1.5 font-semibold tabular-nums" style={{ color: '#71717a' }}>
              {formatGameClock(liveMap?.gameTime)}
            </span>
          )}
        </span>
        <span className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold" style={{ color: design.blue }}>
          <Play className="size-3.5 fill-current" />
          观看
        </span>
      </div>
    </button>
  );
}
