import { useEffect, useState } from 'react';
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
  if (!paragraphs || paragraphs.length === 0) return null;
  return (
    <section>
      <h2 className="mb-4 flex items-center gap-2.5 text-xl font-extrabold tracking-tight text-white">
        <TrendingUp className="size-5" style={{ color: design.blue }} />
        赛事简介
      </h2>
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <p className="whitespace-pre-line text-[15px] leading-7 text-slate-300">{paragraphs.join('\n')}</p>
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
  const finished = payload.matches?.finishedMatches || [];
  const hasAny = liveMatches.length > 0 || upcomingMatches.length > 0 || finished.length > 0;
  if (!hasAny) return null;

  return (
    <section className="space-y-8">
      <div>
        <h2 className="mb-4 flex items-center gap-2.5 text-xl font-extrabold tracking-tight text-white">
          <Zap className="size-5" style={{ color: design.red }} />
          关联比赛
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {liveMatches.map((m) => <MatchCard key={`${m.left}-${m.right}-${m.center}`} match={m} live />)}
          {upcomingMatches.map((m) => <MatchCard key={`${m.left}-${m.right}`} match={m} />)}
        </div>
      </div>
      {finished.length > 0 ? (
        <div>
          <h3 className="mb-3 text-base font-bold text-slate-200">已结束比赛</h3>
          <div className="overflow-hidden rounded-2xl border border-white/10">
            {finished.slice(0, 8).map((m, index) => (
              <div
                key={`${m.left}-${m.right}-${index}`}
                className="flex items-center gap-3 border-b border-white/[0.06] bg-white/[0.02] px-4 py-2.5 last:border-b-0"
              >
                <TeamLogo src={m.leftLogo} name={m.left} size={22} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{m.left}</span>
                <MatchScore center={m.center} />
                <span className="min-w-0 flex-1 truncate text-right text-sm font-semibold text-white">{m.right}</span>
                <TeamLogo src={m.rightLogo} name={m.right} size={22} />
              </div>
            ))}
          </div>
        </div>
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

function isUpper(round: string) {
  return /upper bracket/i.test(round);
}
function isLower(round: string) {
  return /lower bracket/i.test(round);
}
function isFinal(round: string) {
  return /grand final/i.test(round);
}

function BracketMatchCard({ match }: { match: PlayoffMatch }) {
  const teams = match.teams && match.teams.length > 0
    ? match.teams
    : [{ name: 'TBD', score: '-', logo: null, winner: false }, { name: 'TBD', score: '-', logo: null, winner: false }];
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.025]">
      <div className="border-b border-white/[0.06] px-3 py-1.5 text-[11px] text-slate-400">{match.date || '待定'}</div>
      {teams.map((team, index) => (
        <div key={`${team.name}-${index}`} className={`flex items-center gap-2 px-3 py-2 ${index === 0 ? 'border-b border-white/[0.06]' : ''}`}>
          <TeamLogo src={team.logo} name={team.name} size={20} />
          <span className={`min-w-0 flex-1 truncate text-xs ${team.winner ? 'font-bold text-white' : 'text-slate-300'}`}>{team.name}</span>
          <span className={`text-sm font-black tabular-nums ${team.winner ? 'text-[#ff3b30]' : 'text-slate-400'}`}>{team.score || '-'}</span>
        </div>
      ))}
    </div>
  );
}

function BracketRound({ round }: { round: PlayoffRound }) {
  const bestOf = (round.round.match(/bo\d+/i) || [''])[0].toUpperCase();
  return (
    <div className="min-w-[200px] flex-1">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-xs font-bold text-white">{round.round.replace(/\s*\(bo\d+\)\s*/i, '')}</span>
        {bestOf ? <span className="text-[11px] font-bold tracking-wider" style={{ color: design.blue }}>{bestOf}</span> : null}
      </div>
      <div className="space-y-2">
        {round.matches.length > 0
          ? round.matches.map((m, index) => <BracketMatchCard key={`${m.url || index}`} match={m} />)
          : <div className="rounded-xl border border-dashed border-white/10 p-4 text-center text-xs text-slate-500">待定</div>}
      </div>
    </div>
  );
}

function PlayoffsSection({ rounds }: { rounds?: PlayoffRound[] }) {
  if (!rounds || rounds.length === 0) return null;
  const upper = rounds.filter((r) => isUpper(r.round));
  const lower = rounds.filter((r) => isLower(r.round));
  const finals = rounds.filter((r) => isFinal(r.round));
  const other = rounds.filter((r) => !isUpper(r.round) && !isLower(r.round) && !isFinal(r.round));
  const topRow = [...upper, ...finals, ...other.filter((r) => !/lower/i.test(r.round))];

  return (
    <section>
      <h2 className="mb-4 flex items-center gap-2.5 text-xl font-extrabold tracking-tight text-white">
        <TrendingUp className="size-5" style={{ color: design.blue }} />
        淘汰赛
      </h2>
      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#12161e] p-4">
        <div className="min-w-[880px] space-y-6">
          {topRow.length > 0 ? (
            <div className="flex gap-5">
              {topRow.map((r) => <BracketRound key={r.round} round={r} />)}
            </div>
          ) : null}
          {lower.length > 0 ? (
            <div className="flex gap-5 border-t border-white/10 pt-6">
              {lower.map((r) => <BracketRound key={r.round} round={r} />)}
            </div>
          ) : null}
        </div>
      </div>
    </section>
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
    apiFetch<EventDetailPayload>(`/api/event-detail?slug=${encodeURIComponent(slug)}`, {
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
          <PlayoffsSection rounds={payload.playoffRounds} />
          <PrizePoolSection prizes={payload.prizePool} />
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
