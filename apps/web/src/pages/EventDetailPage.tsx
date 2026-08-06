import { useEffect, useRef, useState } from 'react';
import { Trophy, Users, Zap, TrendingUp, ArrowLeft } from 'lucide-react';
import { apiFetch } from '@/lib/api-cache';
import { SafeImg } from '@/components/custom/SafeImg';
import { TeamLogoFallback } from '@/components/custom/TeamLogoFallback';

/* ------------------------------------------------------------------ */
/* 类型（与后端 /api/event-detail 契约一致）                             */
/* ------------------------------------------------------------------ */

interface EventOverview {
  Dates?: string;
  Country?: string;
  'Event tier'?: string;
  'Event type'?: string;
  'Prize pool'?: string;
  Participants?: string;
}

interface GroupStanding {
  teamUrl?: string;
  team: string;
  country?: string;
  logo?: string | null;
  position?: string;
  record?: string;
  maps?: string;
  points?: string;
  advance?: boolean;
}

interface EventGroup {
  name: string;
  heads: string[];
  rows: GroupStanding[];
}

interface PlayoffTeam {
  logo?: string | null;
  name: string;
  score?: string;
  winner?: boolean;
}

interface PlayoffMatch {
  url?: string;
  date?: string;
  teams: PlayoffTeam[];
}

interface PlayoffRound {
  round: string;
  matches: PlayoffMatch[];
}

interface MatchRow {
  url?: string;
  left: string;
  leftLogo?: string | null;
  center: string;
  isLive?: boolean;
  right: string;
  rightLogo?: string | null;
}

interface Participant {
  name: string;
  logo?: string | null;
  invite?: string;
  players: string[];
}

interface PrizeEntry {
  tone: string;
  team?: string;
  prize: string;
  place: string;
}

interface EventDetailPayload {
  slug: string;
  title: string;
  live?: boolean;
  heroImage?: string | null;
  overview?: EventOverview;
  about?: string[];
  groups?: EventGroup[];
  playoffRounds?: PlayoffRound[];
  matches?: { matches?: MatchRow[]; finishedMatches?: MatchRow[] };
  participants?: Participant[];
  prizePool?: PrizeEntry[];
  source?: string;
  empty?: boolean;
}

/* ------------------------------------------------------------------ */
/* 小工具                                                               */
/* ------------------------------------------------------------------ */

const design = { blue: '#2b55e8', red: '#ff3b30' };
const FLAG_MAP: Record<string, string> = {
  Europe: 'https://dltv.org/assets/plugins/flag-icon/flags/4x3/eu.svg',
  China: 'https://dltv.org/assets/plugins/flag-icon/flags/4x3/cn.svg',
};

const TIER_TONES: Record<string, { chip: string; dot: string }> = {
  'A-Tier': { chip: 'border-blue-400/30 bg-blue-500/10 text-blue-200', dot: '#60a5fa' },
  'S-Tier': { chip: 'border-amber-300/30 bg-amber-400/10 text-amber-200', dot: '#fbbf24' },
  'B-Tier': { chip: 'border-cyan-400/30 bg-cyan-500/10 text-cyan-200', dot: '#22d3ee' },
  'C-Tier': { chip: 'border-slate-400/30 bg-slate-500/10 text-slate-300', dot: '#94a3b8' },
};

function tierTone(tier?: string) {
  return TIER_TONES[String(tier || '').trim()] || { chip: 'border-white/10 bg-white/[0.04] text-slate-300', dot: '#94a3b8' };
}

function formatDateRange(value?: string): string {
  if (!value) return 'TBD';
  const [start, end] = value.split(' - ').map((part) => part.trim());
  const fmt = (raw: string) => {
    const date = new Date(raw.replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return raw;
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };
  if (!end) return fmt(start);
  return `${fmt(start)} - ${fmt(end)}`;
}

function MatchScore({ center }: { center: string }) {
  const parts = center.replace(/\s+/g, ' ').split('-').map((x) => x.trim());
  const isTime = /^\d{1,2}:\d{2}$/.test(center);
  if (isTime) {
    return <span className="text-sm font-bold tabular-nums text-white">{center}</span>;
  }
  const n1 = Number(parts[0]);
  const n2 = Number(parts[1]);
  const lw = n1 > n2;
  const rw = n2 > n1;
  return (
    <span className="font-black tabular-nums text-white">
      <span className={lw ? 'text-[#ff3b30]' : ''}>{parts[0]}</span>
      <span className="mx-1 text-slate-500">-</span>
      <span className={rw ? 'text-[#ff3b30]' : ''}>{parts[1]}</span>
    </span>
  );
}

function TeamLogo({ src, name, size = 24 }: { src?: string | null; name: string; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-white/10 bg-white/[0.05]"
      style={{ width: size, height: size }}
    >
      <SafeImg src={src || ''} alt={name} className="h-full w-full object-contain" fallback={<TeamLogoFallback name={name} size={size} />} />
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* 区块：Hero                                                           */
/* ------------------------------------------------------------------ */

function HeroSection({ payload }: { payload: EventDetailPayload }) {
  const overview = payload.overview || {};
  const tier = overview['Event tier'];
  const tone = tierTone(tier);
  const flag = FLAG_MAP[overview.Country || ''] || null;
  const typeZh = overview['Event type'] === 'Online' ? '线上' : overview['Event type'] === 'Offline' ? '线下' : overview['Event type'] || '';

  return (
    <section className="relative overflow-hidden rounded-2xl border border-white/10" style={{ backgroundColor: '#0a0e14' }}>
      {payload.heroImage ? (
        <img
          src={payload.heroImage}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-cover blur-[2px] brightness-[0.42]"
        />
      ) : null}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'linear-gradient(100deg, rgba(10,14,20,0.94) 0%, rgba(10,14,20,0.82) 42%, rgba(10,14,20,0.55) 78%, rgba(10,14,20,0.68) 100%)',
        }}
      />
      <div className="relative z-10 flex min-h-[360px] flex-col justify-between px-6 py-8 lg:px-10">
        <div className="flex flex-wrap items-center gap-2">
          {payload.live ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-red-300">
              <span className="size-1.5 animate-pulse rounded-full bg-red-400" />
              Live
            </span>
          ) : null}
          {tier ? (
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] ${tone.chip}`}>
              <span className="size-1.5 rounded-full" style={{ backgroundColor: tone.dot }} />
              {tier}
            </span>
          ) : null}
          {overview.Country ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-slate-300">
              {flag ? <img src={flag} alt="" className="h-3 w-[18px] rounded-[2px] object-cover" /> : null}
              {overview.Country}
              {typeZh ? ` · ${typeZh}` : ''}
            </span>
          ) : null}
        </div>

        <div className="mt-6">
          <h1 className="text-4xl font-black uppercase leading-[1.05] tracking-tight text-white lg:text-5xl">{payload.title}</h1>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-4">
          {[
            { k: '日期', v: formatDateRange(overview.Dates) },
            { k: '奖金池', v: overview['Prize pool'] || 'TBD', red: true },
            { k: '参赛队伍', v: overview.Participants || 'TBD' },
            { k: '赛事级别', v: tier || 'TBD' },
          ].map((stat) => (
            <div key={stat.k} className="bg-[#0a0e14]/90 px-3 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{stat.k}</div>
              <div className={`mt-1 truncate text-[15px] font-black tabular-nums ${stat.red ? 'text-[#ff3b30]' : 'text-white'}`}>{stat.v}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 区块：简介                                                           */
/* ------------------------------------------------------------------ */

function AboutSection({ paragraphs }: { paragraphs?: string[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!paragraphs || paragraphs.length === 0) return null;
  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-xl font-extrabold tracking-tight text-white">
          <TrendingUp className="size-5" style={{ color: design.blue }} />
          赛事简介
        </h2>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:bg-white/[0.08]"
          aria-expanded={expanded}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: expanded ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s' }}><path d="m6 9 6 6 6-6"></path></svg>
          {expanded ? '收起赛事详情' : '展开赛事详情'}
        </button>
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        {expanded ? (
          <p className="whitespace-pre-line text-[15px] leading-7 text-slate-300">{paragraphs.join('\n')}</p>
        ) : null}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 区块：关联比赛（live + upcoming + finished）                          */
/* ------------------------------------------------------------------ */

function MatchCard({ match, live }: { match: MatchRow; live?: boolean }) {
  const left = match.left || 'TBD';
  const right = match.right || 'TBD';
  return (
    <div className="flex flex-col rounded-xl p-4 transition-transform hover:-translate-y-0.5" style={{ backgroundColor: '#1a1d24' }}>
      <div className="mb-3 flex items-center justify-between">
        {live ? (
          <span className="inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-bold text-white" style={{ backgroundColor: design.red }}>
            <span className="size-1.5 animate-pulse rounded-full bg-white" />
            LIVE
          </span>
        ) : (
          <span className="text-[11px] font-semibold text-slate-400">已结束</span>
        )}
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <TeamLogo src={match.leftLogo} name={left} />
          <span className="truncate text-sm font-semibold text-white">{left}</span>
        </div>
        <MatchScore center={match.center} />
        <div className="flex min-w-0 items-center justify-end gap-2.5">
          <span className="truncate text-sm font-semibold text-white">{right}</span>
          <TeamLogo src={match.rightLogo} name={right} />
        </div>
      </div>
    </div>
  );
}

function MatchesSection({ payload }: { payload: EventDetailPayload }) {
  const liveMatches = (payload.matches?.matches || []).filter((m) => m.isLive);
  const upcomingMatches = (payload.matches?.matches || []).filter((m) => !m.isLive);
  const hasLive = liveMatches.length > 0;
  const hasUpcoming = upcomingMatches.length > 0;
  if (!hasLive && !hasUpcoming) return null;

  return (
    <section className="space-y-10">
      {hasLive ? (
        <div>
          <h2 className="mb-4 flex items-center gap-2.5 text-xl font-extrabold tracking-tight text-white">
            <Zap className="size-5" style={{ color: design.red }} />
            关联直播
            <span className="text-sm font-bold text-slate-500">Live Now</span>
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {liveMatches.map((m) => <MatchCard key={`${m.left}-${m.right}-${m.center}`} match={m} live />)}
          </div>
        </div>
      ) : null}
      {hasUpcoming ? (
        <div>
          <h2 className="mb-4 flex items-center gap-2.5 text-xl font-extrabold tracking-tight text-white">
            <Zap className="size-5" style={{ color: design.blue }} />
            即将开赛
            <span className="text-sm font-bold text-slate-500">Upcoming</span>
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {upcomingMatches.map((m) => <MatchCard key={`${m.left}-${m.right}`} match={m} />)}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function FinishedSection({ finished }: { finished: MatchRow[] }) {
  const [finishedVisible, setFinishedVisible] = useState(10);
  if (!finished || finished.length === 0) return null;
  return (
    <section>
      <h2 className="mb-4 flex items-center gap-2.5 text-xl font-extrabold tracking-tight text-white">
        <TrendingUp className="size-5 text-slate-400" />
        已结束比赛
        <span className="text-sm font-bold text-slate-500">Finished</span>
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {finished.slice(0, finishedVisible).map((m, index) => (
          <div
            key={`${m.left}-${m.right}-${index}`}
            className="flex flex-col gap-1.5 rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.05] to-white/[0.02] p-3 transition-colors hover:border-white/[0.2]"
          >
            <span className="text-[11px] font-semibold text-slate-400">已结束</span>
            <div className="flex items-center gap-2">
              <TeamLogo src={m.leftLogo} name={m.left} size={20} />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{m.left}</span>
              <MatchScore center={m.center} />
            </div>
            <div className="flex items-center gap-2">
              <TeamLogo src={m.rightLogo} name={m.right} size={20} />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{m.right}</span>
            </div>
          </div>
        ))}
      </div>
      {finishedVisible < finished.length ? (
        <button
          type="button"
          onClick={() => setFinishedVisible((v) => v + 10)}
          className="mt-4 w-full rounded-xl border border-white/10 bg-white/[0.03] py-3 text-sm font-semibold text-slate-300 transition-colors hover:bg-white/[0.06]"
        >
          加载更多比赛（剩余 {finished.length - finishedVisible} 场）
        </button>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 区块：小组赛                                                         */
/* ------------------------------------------------------------------ */

function GroupStageSection({ groups }: { groups?: EventGroup[] }) {
  if (!groups || groups.length === 0) return null;
  return (
    <section>
      <h2 className="mb-4 flex items-center gap-2.5 text-xl font-extrabold tracking-tight text-white">
        <Trophy className="size-5" style={{ color: design.blue }} />
        小组赛积分榜
      </h2>
      <div className="grid gap-4 xl:grid-cols-2">
        {groups.map((group) => (
          <div key={group.name} className="overflow-hidden rounded-2xl border border-white/10 bg-[#1a1d24]">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div className="text-sm font-bold text-white">{group.name}</div>
              <div className="flex items-center gap-3 text-[11px] text-slate-400">
                <span className="inline-flex items-center gap-1"><span className="size-2 rounded-sm bg-emerald-500/60" />晋级</span>
                <span className="inline-flex items-center gap-1"><span className="size-2 rounded-sm bg-red-500/60" />淘汰</span>
              </div>
            </div>
            <div className="grid grid-cols-[40px_minmax(0,1fr)_70px_56px_44px] gap-2 border-b border-white/10 px-4 py-2 text-[11px] uppercase tracking-wide text-slate-400">
              <span>#</span><span>队伍</span><span className="text-center">战绩</span><span className="text-center">图分</span><span className="text-center">积分</span>
            </div>
            <div className="divide-y divide-white/[0.06]">
              {group.rows.map((row) => (
                <div
                  key={`${group.name}-${row.position}-${row.team}`}
                  className={`grid grid-cols-[40px_minmax(0,1fr)_70px_56px_44px] items-center gap-2 px-4 py-2.5 ${row.advance ? 'bg-emerald-500/[0.05]' : 'bg-red-500/[0.04]'}`}
                >
                  <div className={`flex size-7 items-center justify-center rounded-lg font-black ${row.advance ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>
                    {row.position}
                  </div>
                  <div className="flex min-w-0 items-center gap-2.5">
                    <TeamLogo src={row.logo} name={row.team} size={26} />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-white">{row.team}</div>
                      {row.country ? <div className="text-[11px] text-slate-400">{row.country}</div> : null}
                    </div>
                  </div>
                  <div className="text-center text-sm text-slate-300">{row.record || '—'}</div>
                  <div className="text-center text-sm text-slate-400">{row.maps || '—'}</div>
                  <div className="text-center text-sm font-black text-white">{row.points || '—'}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 区块：淘汰赛 bracket                                                 */
/* ------------------------------------------------------------------ */

function BracketMatchCard({ match }: { match: PlayoffMatch }) {
  const teams = match.teams && match.teams.length > 0
    ? match.teams
    : [{ name: 'TBD', score: '-', logo: null, winner: false }, { name: 'TBD', score: '-', logo: null, winner: false }];
  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-gradient-to-b from-white/[0.035] to-white/[0.015]">
      <div className="border-b border-white/[0.06] px-3 py-1.5 text-[11px] tabular-nums text-slate-400">{match.date || '待定'}</div>
      {teams.map((team, index) => (
        <div key={`${team.name}-${index}`} className={`flex items-center gap-2 px-3 py-2 ${index === 0 ? 'border-b border-white/[0.06]' : ''}`}>
          <TeamLogo src={team.logo} name={team.name} size={20} />
          <span className={`min-w-0 flex-1 truncate text-xs ${team.winner ? 'font-extrabold text-white' : 'text-slate-300'}`}>{team.name}</span>
          <span className={`text-[15px] font-black tabular-nums ${team.winner ? 'text-[#ff3b30]' : 'text-slate-400'}`}>{team.score || '-'}</span>
        </div>
      ))}
    </div>
  );
}

interface BracketCell {
  key: string;
  head: string;
  bo: string;
  col: number;
  row: string;
  center: boolean;
  isFinal: boolean;
  matches: PlayoffMatch[];
}

function BracketCellBox({ cell, prizes }: { cell: BracketCell; prizes?: PrizeEntry[] }) {
  const medal = (place: string) => prizes?.find((p) => p.place === place)?.prize || '';
  return (
    <div
      className="flex flex-col gap-2.5 px-5"
      style={{ gridColumn: cell.col, gridRow: cell.row, alignSelf: cell.center ? 'center' : undefined, position: 'relative', zIndex: 2 }}
    >
      <div className="mb-0.5 flex items-baseline justify-between">
        <span className="text-xs font-bold text-white">{cell.head}</span>
        {cell.bo ? <span className="text-[11px] font-bold tracking-wider" style={{ color: design.blue }}>{cell.bo}</span> : null}
      </div>
      {cell.matches.length > 0
        ? <div data-mid={cell.key}>{cell.matches.map((m, index) => <BracketMatchCard key={`${cell.key}-${index}`} match={m} />)}</div>
        : <div data-mid={cell.key} className="flex min-h-[78px] items-center justify-center rounded-xl border border-dashed border-white/10 text-xs text-slate-500">
            待定{cell.isFinal ? ' · BO5' : ''}
          </div>}
      {cell.isFinal ? (
        <>
          <div className="mt-0.5 flex items-center gap-2 rounded-xl border border-dashed border-white/10 px-3 py-2.5 text-xs">
            <span className="flex size-4 items-center justify-center rounded-full bg-amber-400 text-[9px] font-black text-black">1</span>
            <span className="text-slate-400">{medal('1')} · 冠军</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-white/10 px-3 py-2.5 text-xs">
            <span className="flex size-4 items-center justify-center rounded-full bg-slate-300 text-[9px] font-black text-black">2</span>
            <span className="text-slate-400">{medal('2')} · 亚军</span>
          </div>
        </>
      ) : null}
    </div>
  );
}

function PlayoffsSection({ rounds, prizes }: { rounds?: PlayoffRound[]; prizes?: PrizeEntry[] }) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  if (!rounds || rounds.length === 0) return null;

  const byHead = (pat: RegExp) => rounds.find((r) => pat.test(r.round));
  const ubr1 = byHead(/upper bracket r1/i);
  const ubf = byHead(/upper bracket final/i);
  const gf = byHead(/grand final/i);
  const lbr1 = byHead(/lower bracket r1/i);
  const lbr2 = byHead(/lower bracket r2/i);
  const lbr3 = byHead(/lower bracket r3/i);
  const lbf = byHead(/lower bracket final/i);

  const head = (r?: PlayoffRound) => (r ? r.round.replace(/\s*\(bo\d+\)\s*/i, '').trim() : '');
  const bo = (r?: PlayoffRound) => (r ? (r.round.match(/bo\d+/i) || [''])[0].toUpperCase() : '');

  const cells: BracketCell[] = [
    { key: 'lbr1', head: head(lbr1), bo: bo(lbr1), col: 1, row: '2', center: false, isFinal: false, matches: lbr1?.matches || [] },
    { key: 'ubr1', head: head(ubr1), bo: bo(ubr1), col: 2, row: '1', center: false, isFinal: false, matches: ubr1?.matches || [] },
    { key: 'lbr2', head: head(lbr2), bo: bo(lbr2), col: 2, row: '2', center: false, isFinal: false, matches: lbr2?.matches || [] },
    { key: 'lbr3', head: head(lbr3), bo: bo(lbr3), col: 3, row: '2', center: false, isFinal: false, matches: lbr3?.matches || [] },
    { key: 'ubf', head: head(ubf), bo: bo(ubf), col: 4, row: '1', center: true, isFinal: false, matches: ubf?.matches || [] },
    { key: 'lbf', head: head(lbf), bo: bo(lbf), col: 4, row: '2', center: true, isFinal: false, matches: lbf?.matches || [] },
    { key: 'gf', head: head(gf), bo: bo(gf), col: 5, row: '1 / 3', center: true, isFinal: true, matches: gf?.matches || [] },
  ];

  return (
    <section>
      <h2 className="mb-4 flex items-center gap-2.5 text-xl font-extrabold tracking-tight text-white">
        <TrendingUp className="size-5" style={{ color: design.blue }} />
        淘汰赛
      </h2>
      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#12161e] p-4">
        <div className="relative min-w-[960px] p-1">
          <div ref={boxRef} className="relative grid gap-y-7" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
            {cells.map((c) => <BracketCellBox key={c.key} cell={c} prizes={prizes} />)}
            <BracketConnectors cells={cells} boxRef={boxRef} />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-4 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1.5"><span className="h-px w-5 bg-[#7aa2ff]" />胜者晋级</span>
        </div>
      </div>
    </section>
  );
}

function BracketConnectors({ cells, boxRef }: { cells: BracketCell[]; boxRef: React.RefObject<HTMLDivElement | null> }) {
  const [paths, setPaths] = useState<string[]>([]);

  const conns = [
    { from: 'ubr1', to: 'ubf' },
    { from: 'lbr1', to: 'lbr2' },
    { from: 'lbr2', to: 'lbr3' },
    { from: 'lbr3', to: 'lbf' },
    { from: 'ubf', to: 'gf' },
    { from: 'lbf', to: 'gf' },
  ];

  useEffect(() => {
    const draw = () => {
      const box = boxRef.current;
      if (!box) return;
      const boxRect = box.getBoundingClientRect();
      const portOf = (key: string, port: 'right' | 'left') => {
        const el = box.querySelector<HTMLElement>(`[data-mid="${key}"]`);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const x = r.left - boxRect.left;
        const y = r.top - boxRect.top;
        return port === 'right'
          ? { x: x + r.width, y: y + r.height / 2 }
          : { x, y: y + r.height / 2 };
      };
      const lines: string[] = [];
      for (const { from, to } of conns) {
        const s = portOf(from, 'right');
        const t = portOf(to, 'left');
        if (!s || !t) continue;
        const hx = (s.x + t.x) / 2;
        lines.push(`M ${s.x} ${s.y} L ${hx} ${s.y} L ${hx} ${t.y} L ${t.x} ${t.y}`);
      }
      setPaths(lines);
    };
    draw();
    const t = setTimeout(draw, 60);
    window.addEventListener('resize', draw);
    return () => { clearTimeout(t); window.removeEventListener('resize', draw); };
  }, [cells, boxRef]);

  return (
    <div className="pointer-events-none absolute inset-0 z-[1] overflow-visible" aria-hidden="true">
      <svg className="absolute inset-0 h-full w-full" style={{ overflow: 'visible' }}>
        <defs>
          <marker id="arrowWin" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(150,180,255,0.9)" />
          </marker>
        </defs>
        {paths.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="#7aa2ff" strokeWidth={1.5} markerEnd="url(#arrowWin)" />
        ))}
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 区块：奖金池                                                         */
/* ------------------------------------------------------------------ */

const PRIZE_TONES: Record<string, string> = {
  gold: 'border-amber-300/35',
  silver: 'border-slate-300/30',
  bronze: 'border-orange-400/32',
};
const PRIZE_PLACE: Record<string, string> = { '1': '冠军', '2': '亚军', '3': '季军' };

function PrizePoolSection({ prizes }: { prizes?: PrizeEntry[] }) {
  if (!prizes || prizes.length === 0) return null;
  return (
    <section>
      <h2 className="mb-4 flex items-center gap-2.5 text-xl font-extrabold tracking-tight text-white">
        <Trophy className="size-5" style={{ color: design.blue }} />
        奖金池
      </h2>
      <div className="grid gap-4 sm:grid-cols-3">
        {prizes.slice(0, 3).map((prize) => (
          <div key={`${prize.place}-${prize.prize}`} className={`rounded-2xl border ${PRIZE_TONES[prize.tone] || 'border-white/10'} bg-[#1a1d24] p-6 text-center`}>
            <div className="text-2xl font-black text-white">{prize.place}</div>
            <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              {PRIZE_PLACE[prize.place] || `${prize.place} 名`}
            </div>
            <div className="mt-3 text-3xl font-black tabular-nums text-white">{prize.prize}</div>
            <div className="mt-1 text-sm text-slate-400">{prize.team === 'TBD' ? '待定' : prize.team}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 区块：参赛队伍                                                       */
/* ------------------------------------------------------------------ */

function ParticipantsSection({ participants }: { participants?: Participant[] }) {
  if (!participants || participants.length === 0) return null;
  return (
    <section>
      <h2 className="mb-4 flex items-center gap-2.5 text-xl font-extrabold tracking-tight text-white">
        <Users className="size-5" style={{ color: design.blue }} />
        参赛队伍
        <span className="text-sm font-bold text-slate-500">{participants.length}</span>
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {participants.map((team) => (
          <div key={team.name} className="rounded-2xl border border-white/10 bg-[#1a1d24] p-4">
            <div className="mb-3 flex items-center gap-3">
              <TeamLogo src={team.logo} name={team.name} size={40} />
              <div className="min-w-0">
                <div className="truncate text-[15px] font-bold text-white">{team.name}</div>
                {team.invite ? <div className="text-[11px] text-slate-400">{team.invite}</div> : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {team.players.map((player, index) => (
                <span key={player} className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-slate-300">
                  <span className="flex size-3.5 items-center justify-center rounded text-[8px] font-black" style={{ backgroundColor: ['#ff6b5f', '#ff9f43', '#5f7fff', '#34d17b', '#b183ff'][index % 5] }}>
                    {index + 1}
                  </span>
                  {player}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 区块：赛事数据                                                       */
/* ------------------------------------------------------------------ */

function StatsSection() {
  return (
    <section>
      <h2 className="mb-4 flex items-center gap-2.5 text-xl font-extrabold tracking-tight text-white">
        <TrendingUp className="size-5" style={{ color: design.blue }} />
        赛事数据
        <span className="text-sm font-bold text-slate-500">Event Stats</span>
      </h2>
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-10 text-center">
        <p className="text-sm text-slate-400">该赛事暂未发布聚合统计数据。</p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 页面主体                                                             */
/* ------------------------------------------------------------------ */

function Skeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="h-[360px] animate-pulse rounded-2xl bg-white/[0.05]" />
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-white/[0.04]" />)}
      </div>
      <div className="h-64 animate-pulse rounded-2xl bg-white/[0.04]" />
    </div>
  );
}

export function EventDetailPage({ slug, onBack }: { slug: string; onBack?: () => void }) {
  const [payload, setPayload] = useState<EventDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setPayload(null);
    // cache-buster：按 5 分钟桶翻转，绕开 CDN 对精确 URL 的陈旧缓存（详情数据易变）。
    const cacheBucket = Math.floor(Date.now() / (5 * 60 * 1000));
    apiFetch<EventDetailPayload>(`/api/event-detail?slug=${encodeURIComponent(slug)}&_cb=${cacheBucket}`, {
      ttlMs: 5 * 60 * 1000,
      cacheEmpty: false,
    })
      .then((data) => {
        if (cancelled) return;
        if (!data || data.empty) {
          setError('赛事详情暂不可用，请稍后重试');
          return;
        }
        setPayload(data);
      })
      .catch(() => {
        if (!cancelled) setError('赛事详情加载失败，请稍后重试');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [slug]);

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pb-16 pt-24 lg:px-6">
      <button
        type="button"
        onClick={onBack}
        className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold transition-opacity hover:opacity-80"
        style={{ color: design.blue }}
      >
        <ArrowLeft className="size-4" />
        返回赛事列表
      </button>

      {loading ? (
        <Skeleton />
      ) : error ? (
        <div className="rounded-2xl border border-white/10 bg-[#1a1d24] px-6 py-14 text-center">
          <p className="text-sm text-slate-300">{error}</p>
        </div>
      ) : payload ? (
        <div className="flex flex-col gap-12">
          <HeroSection payload={payload} />
          <AboutSection paragraphs={payload.about} />
          <MatchesSection payload={payload} />
          <GroupStageSection groups={payload.groups} />
          <PlayoffsSection rounds={payload.playoffRounds} prizes={payload.prizePool} />
          <PrizePoolSection prizes={payload.prizePool} />
          <StatsSection />
          <FinishedSection finished={payload.matches?.finishedMatches || []} />
          <ParticipantsSection participants={payload.participants} />
          {payload.source ? (
            <p className="text-center text-[11px] text-slate-600">数据来源 DLTV · {payload.source}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default EventDetailPage;
