import { useEffect, useMemo, useState } from 'react';
import { Calendar, Trophy, ArrowUpRight } from 'lucide-react';
import { SafeImg } from '@/components/custom/SafeImg';
import { EmptyState } from '@/components/custom/EmptyState';
import { apiFetch } from '@/lib/api-cache';

/** 从 DLTV 赛事 URL（/events/<slug>）提取详情页 slug；提取失败返回 null。 */
function eventSlugFromUrl(sourceUrl?: string | null): string | null {
  if (!sourceUrl) return null;
  try {
    const { pathname } = new URL(sourceUrl);
    const parts = pathname.split('/').filter(Boolean);
    const eventIndex = parts.indexOf('events');
    if (eventIndex < 0) return null;
    const segments = parts.slice(eventIndex + 1);
    return segments[segments.length - 1] || null;
  } catch {
    return null;
  }
}

/**
 * 赛事目录页（Apple HK 产品风，深色电竞主题）
 * 数据：/api/events（dltv.org/events + /events/finished）
 * Ongoing → 海报架；Upcoming → 卡片网格；Finished → 清单
 */

interface EventEntry {
  sourceUrl?: string | null;
  title: string;
  status?: string | null;
  live?: boolean;
  tier?: string | null;
  location?: string | null;
  locationFlagUrl?: string | null;
  startTime?: number | null;
  endTime?: number | null;
  prizePool?: string | null;
  prizePoolUsd?: number | null;
  image?: string | null;
  winner?: string | null;
}

interface EventsPayload {
  events?: {
    ongoing?: EventEntry[];
    upcoming?: EventEntry[];
    finished?: EventEntry[];
  };
  source?: Record<string, string>;
  fetchedAt?: string;
  /** quick 模式：finished 尚在后台补齐，页面先渲染 ongoing/upcoming。 */
  partial?: boolean;
}

const design = {
  blue: '#2b55e8',
  red: '#ff3b30',
};

const TIER_TONES: Record<string, { chip: string; dot: string; label: string }> = {
  S: { chip: 'border-amber-300/30 bg-amber-400/10 text-amber-200', dot: '#fbbf24', label: 'S-Tier' },
  A: { chip: 'border-blue-400/30 bg-blue-500/10 text-blue-200', dot: '#60a5fa', label: 'A-Tier' },
  B: { chip: 'border-cyan-400/30 bg-cyan-500/10 text-cyan-200', dot: '#22d3ee', label: 'B-Tier' },
  C: { chip: 'border-slate-400/30 bg-slate-500/10 text-slate-300', dot: '#94a3b8', label: 'C-Tier' },
  'S-Qual': { chip: 'border-amber-300/20 bg-amber-400/5 text-amber-200/70', dot: '#fbbf24', label: 'S-Qual' },
  'A-Qual': { chip: 'border-blue-400/20 bg-blue-500/5 text-blue-200/70', dot: '#60a5fa', label: 'A-Qual' },
  'B-Qual': { chip: 'border-cyan-400/20 bg-cyan-500/5 text-cyan-200/70', dot: '#22d3ee', label: 'B-Qual' },
  'C-Qual': { chip: 'border-slate-400/20 bg-slate-500/5 text-slate-300/70', dot: '#94a3b8', label: 'C-Qual' },
};

function tierTone(tier?: string | null) {
  const key = String(tier || '').toUpperCase().trim();
  return TIER_TONES[key] || { chip: 'border-white/10 bg-white/[0.04] text-slate-300', dot: '#94a3b8', label: key || 'Tier' };
}

function formatRange(startTs?: number | null, endTs?: number | null): string {
  if (!startTs || !endTs) {
    if (startTs) {
      return new Date(startTs * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    return 'TBD';
  }
  const start = new Date(startTs * 1000);
  const end = new Date(endTs * 1000);
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const fmt = (d: Date, withYear: boolean) =>
    d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      ...(withYear ? { year: 'numeric' } : {}),
    });
  return `${fmt(start, false)} – ${fmt(end, sameYear ? false : true)}`;
}

function formatShortDate(ts?: number | null): string {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatPrize(prizePool?: string | null): string {
  const text = String(prizePool || '').trim();
  if (!text) return '';
  const match = text.match(/\$([\d,]+(?:\.\d+)?)/);
  if (!match) return text;
  const amount = Number(match[1].replace(/,/g, ''));
  if (!Number.isFinite(amount)) return text;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 2)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount}`;
}

function TierChip({ tier }: { tier?: string | null }) {
  const tone = tierTone(tier);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] ${tone.chip}`}>
      <span className="size-1.5 rounded-full" style={{ backgroundColor: tone.dot }} />
      {tone.label}
    </span>
  );
}

function RegionFlag({ entry, className }: { entry: EventEntry; className?: string }) {
  if (!entry.location) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 ${className || ''}`}>
      {entry.locationFlagUrl ? (
        <SafeImg
          src={entry.locationFlagUrl}
          alt=""
          className="h-3 w-[18px] rounded-[2px] object-cover"
          fallback={null}
        />
      ) : null}
      <span className="truncate">{entry.location}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* 海报卡片：进行中的赛事（Apple 产品架风格，16:9 横幅）                */
/* ------------------------------------------------------------------ */

function PosterCard({ entry }: { entry: EventEntry }) {
  const tone = tierTone(entry.tier);
  const slug = eventSlugFromUrl(entry.sourceUrl);
  return (
    <a
      href={slug ? `#/event/${encodeURIComponent(slug)}` : (entry.sourceUrl || undefined)}
      target={slug ? undefined : '_blank'}
      rel={slug ? undefined : 'noopener noreferrer'}
      className="group relative block w-[280px] shrink-0 overflow-hidden rounded-2xl border border-white/10 transition-all duration-300 hover:border-white/25 hover:shadow-[0_16px_48px_-12px_rgba(0,0,0,0.7)] sm:w-[320px]"
    >
      <div className="relative aspect-[16/9] w-full">
        <SafeImg
          src={entry.image || ''}
          alt={entry.title}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          fallback={
            <div
              className="absolute inset-0 flex items-center justify-center text-center"
              style={{ background: 'linear-gradient(160deg, #1a1d24 0%, #0f1115 100%)' }}
            >
              <span className="px-6 text-lg font-black uppercase tracking-[0.18em] text-white/40">
                {entry.title.slice(0, 3).toUpperCase()}
              </span>
            </div>
          }
        />

        {/* 底部渐变蒙版 */}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(180deg, rgba(10,12,16,0) 30%, rgba(10,12,16,0.55) 72%, rgba(10,12,16,0.94) 100%)' }}
        />

        {/* 顶部：Tier + LIVE */}
        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] ${tone.chip}`}>
            <span className="size-1.5 rounded-full" style={{ backgroundColor: tone.dot }} />
            {tone.label}
          </span>
          {entry.live && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ff3b30] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white">
              <span className="size-1.5 animate-pulse rounded-full bg-white" />
              Live
            </span>
          )}
        </div>

        {/* 底部：名称 + 地区 + 日期 */}
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4">
          <div className="min-w-0">
            <h3 className="line-clamp-1 text-base font-bold leading-snug text-white">{entry.title}</h3>
            <div className="mt-1.5 flex items-center gap-3 text-xs text-slate-300/90">
              {entry.location ? <RegionFlag entry={entry} /> : null}
              <span className="tabular-nums text-slate-400">{formatRange(entry.startTime, entry.endTime)}</span>
            </div>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1 text-xs font-semibold text-white/80 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            查看 <ArrowUpRight className="size-3.5" />
          </span>
        </div>
      </div>
    </a>
  );
}

/* ------------------------------------------------------------------ */
/* 即将开始卡片网格                                                     */
/* ------------------------------------------------------------------ */

function UpcomingCard({ entry }: { entry: EventEntry }) {
  const slug = eventSlugFromUrl(entry.sourceUrl);
  return (
    <a
      href={slug ? `#/event/${encodeURIComponent(slug)}` : (entry.sourceUrl || undefined)}
      target={slug ? undefined : '_blank'}
      rel={slug ? undefined : 'noopener noreferrer'}
      className="group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#1a1d24] transition-all duration-300 hover:border-white/25 hover:shadow-[0_16px_48px_-12px_rgba(0,0,0,0.7)]"
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden">
        <SafeImg
          src={entry.image || ''}
          alt={entry.title}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          fallback={
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-2"
              style={{ background: 'linear-gradient(160deg, #1c212b 0%, #12151b 55%, #0d1015 100%)' }}
            >
              <div
                className="pointer-events-none absolute inset-0"
                style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(43,85,232,0.18) 0%, rgba(43,85,232,0) 60%)' }}
              />
              <span
                className="relative flex size-12 items-center justify-center rounded-full border border-white/10 text-base font-black tracking-wide text-white/60"
                style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
              >
                {entry.title.slice(0, 3).toUpperCase()}
              </span>
              <span className="relative text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                封面待定
              </span>
            </div>
          }
        />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(180deg, rgba(10,12,16,0) 40%, rgba(10,12,16,0.55) 100%)' }}
        />
        <div className="absolute left-3 top-3">
          <TierChip tier={entry.tier} />
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="line-clamp-2 min-h-[2.6rem] text-[15px] font-bold leading-snug text-white">{entry.title}</h3>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
          {entry.location ? <RegionFlag entry={entry} /> : null}
          {entry.prizePool ? (
            <span className="inline-flex items-center gap-1 tabular-nums font-semibold text-slate-300">
              <Trophy className="size-3.5 text-amber-300/70" />
              {formatPrize(entry.prizePool)}
            </span>
          ) : null}
        </div>
        <div className="mt-auto flex items-center gap-1.5 pt-3 text-xs tabular-nums text-slate-500">
          <Calendar className="size-3.5" />
          {formatRange(entry.startTime, entry.endTime)}
        </div>
      </div>
    </a>
  );
}

/* ------------------------------------------------------------------ */
/* 已结束清单                                                           */
/* ------------------------------------------------------------------ */

function FinishedRow({ entry }: { entry: EventEntry }) {
  const tone = tierTone(entry.tier);
  return (
    <a
      href={entry.sourceUrl ? `#/event/${encodeURIComponent(eventSlugFromUrl(entry.sourceUrl) || '')}` : undefined}
      className="group grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-x-4 px-4 py-3 transition-colors hover:bg-white/[0.03] sm:px-5"
    >
      <span className="text-xs font-medium tabular-nums text-slate-500">{formatShortDate(entry.startTime)}</span>
      <div className="flex min-w-0 items-center gap-3">
        {entry.image ? (
          <SafeImg
            src={entry.image}
            alt=""
            className="size-9 shrink-0 rounded-lg border border-white/10 object-cover"
            fallback={<span className="size-9 shrink-0 rounded-lg border border-white/10 bg-white/[0.04]" />}
          />
        ) : null}
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: tone.dot }} title={tone.label} />
          <h3 className="truncate text-sm font-semibold text-white">{entry.title}</h3>
          <span className={`hidden shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] md:inline-flex md:items-center md:gap-1.5 ${tone.chip}`}>
            {tone.label}
          </span>
        </div>
      </div>
      <div className="flex flex-col items-end justify-center gap-0.5">
        <span className="inline-flex max-w-[180px] items-center gap-1.5 text-sm font-semibold text-slate-200">
          {entry.winner ? (
            <Trophy className="size-3.5 shrink-0 text-amber-300/70" />
          ) : null}
          <span className="truncate">{entry.winner || '—'}</span>
        </span>
        {entry.prizePool ? (
          <span className="text-[11px] tabular-nums text-slate-500">{formatPrize(entry.prizePool)}</span>
        ) : null}
      </div>
    </a>
  );
}

/* ------------------------------------------------------------------ */
/* 骨架屏                                                               */
/* ------------------------------------------------------------------ */

function PageSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-10">
      <div className="mx-auto max-w-xl space-y-4 pt-10 text-center">
        <div className="mx-auto h-3 w-40 animate-pulse rounded-full bg-white/[0.06]" />
        <div className="mx-auto h-12 w-56 animate-pulse rounded-xl bg-white/[0.07]" />
        <div className="mx-auto h-4 w-80 max-w-full animate-pulse rounded-full bg-white/[0.05]" />
      </div>
      <div>
        <div className="mb-4 h-7 w-52 animate-pulse rounded-lg bg-white/[0.06]" />
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="aspect-[16/9] w-[320px] shrink-0 animate-pulse rounded-2xl bg-white/[0.04]" />
          ))}
        </div>
      </div>
      <div>
        <div className="mb-4 h-7 w-52 animate-pulse rounded-lg bg-white/[0.06]" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-[16/9] animate-pulse rounded-2xl bg-white/[0.04]" />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 区块头                                                               */
/* ------------------------------------------------------------------ */

function SectionHeading({ eyebrow, title, count }: {
  eyebrow: string;
  title: React.ReactNode;
  count?: number;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div className="flex items-baseline gap-3">
        <h2 className="flex items-center gap-1 text-xl font-extrabold tracking-tight text-white">{title}</h2>
        {count != null && count > 0 ? (
          <span className="text-sm font-semibold tabular-nums text-slate-500">{count}</span>
        ) : null}
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">{eyebrow}</p>
    </div>
  );
}

function SectionDot({ tone }: { tone: 'red' | 'blue' | 'slate' }) {
  const color = tone === 'red' ? design.red : tone === 'blue' ? design.blue : '#94a3b8';
  return <span className="mr-2 inline-block size-1.5 rounded-full align-middle" style={{ backgroundColor: color }} />;
}

/* ------------------------------------------------------------------ */
/* 页面主体                                                             */
/* ------------------------------------------------------------------ */

export function TournamentsPage() {
  const [payload, setPayload] = useState<EventsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [finishedLoading, setFinishedLoading] = useState(false);

  // quick 模式：首屏只等 ongoing+upcoming 页（~1-6s），finished 后台补齐后轮询拉全量。
  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    const controller = new AbortController();

    const fetchFull = async () => {
      try {
        const data = await apiFetch<EventsPayload>('/api/events', { ttlMs: 5 * 60 * 1000, cacheEmpty: false, signal: controller.signal });
        if (cancelled) return;
        setPayload(data);
        setLoading(false);
        setFinishedLoading(false);
      } catch (err) {
        if (!cancelled && !(err instanceof DOMException && err.name === 'AbortError')) {
          setError('赛事数据加载失败，请稍后重试。');
        }
      }
    };

    (async () => {
      try {
        const data = await apiFetch<EventsPayload>('/api/events?quick=1', { ttlMs: 5 * 60 * 1000, cacheEmpty: false, signal: controller.signal });
        if (cancelled) return;
        // quick 响应先落盘，finished 为空时显示加载态。
        setPayload(data);
        setLoading(false);
        const finishedNow = data.events?.finished?.length || 0;
        if (data.partial || finishedNow === 0) {
          setFinishedLoading(true);
          // 后台补齐 finished 后，轮询全量接口拿完整列表。
          pollTimer = setTimeout(fetchFull, 4000);
        }
      } catch (err) {
        if (!cancelled && !(err instanceof DOMException && err.name === 'AbortError')) {
          // quick 失败则回退全量。
          await fetchFull();
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, []);

  const ongoing = useMemo(() => payload?.events?.ongoing || [], [payload]);
  const upcoming = useMemo(() => payload?.events?.upcoming || [], [payload]);
  const finished = useMemo(() => payload?.events?.finished || [], [payload]);
  const hasData = ongoing.length > 0 || upcoming.length > 0 || finished.length > 0;

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pb-16 pt-24 lg:px-6">
      {/* Hero */}
      <header className="relative mx-auto max-w-3xl pb-12 pt-8 text-center">
        <div
          className="pointer-events-none absolute left-1/2 top-[-80px] h-[340px] w-[620px] max-w-full -translate-x-1/2"
          style={{ background: 'radial-gradient(ellipse at center, rgba(43,85,232,0.16) 0%, rgba(43,85,232,0) 70%)' }}
        />
        <p className="relative text-[11px] font-bold uppercase tracking-[0.32em] text-slate-500">
          Dota 2 · Tournament Directory
        </p>
        <h1 className="relative mt-5 text-5xl font-black leading-none tracking-tight text-white lg:text-6xl">
          赛事
          <span className="mt-2 block bg-gradient-to-r from-white via-white to-slate-500 bg-clip-text text-transparent">
            Tournaments
          </span>
        </h1>
        <div className="relative mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm">
          <span className="inline-flex items-center gap-2 text-slate-300">
            <span className="size-1.5 rounded-full" style={{ backgroundColor: design.red }} />
            <span className="font-bold tabular-nums text-white">{ongoing.length}</span> 进行中
          </span>
          <span className="inline-flex items-center gap-2 text-slate-300">
            <span className="size-1.5 rounded-full" style={{ backgroundColor: design.blue }} />
            <span className="font-bold tabular-nums text-white">{upcoming.length}</span> 即将开始
          </span>
          <span className="inline-flex items-center gap-2 text-slate-300">
            <span className="size-1.5 rounded-full bg-slate-500" />
            <span className="font-bold tabular-nums text-white">{finished.length}</span> 已结束
          </span>
        </div>
      </header>

      {loading ? (
        <PageSkeleton />
      ) : error ? (
        <EmptyState label={error} />
      ) : !hasData ? (
        <EmptyState label="暂无赛事数据，稍后再来看看。" />
      ) : (
        <div className="flex flex-col gap-12">
          {/* Ongoing */}
          {ongoing.length > 0 && (
            <section>
              <SectionHeading eyebrow="Live Now" title={<span className="inline-flex items-center gap-2"><SectionDot tone="red" />进行中的赛事</span>} count={ongoing.length} />
              <div className="flex gap-4 overflow-x-auto pb-2 [scrollbar-width:thin]">
                {ongoing.map((entry) => (
                  <PosterCard key={`${entry.title}-${entry.startTime || ''}`} entry={entry} />
                ))}
              </div>
            </section>
          )}

          {/* Upcoming */}
          {upcoming.length > 0 && (
            <section>
              <SectionHeading eyebrow="Coming Up" title={<span className="inline-flex items-center gap-2"><SectionDot tone="blue" />即将开始</span>} count={upcoming.length} />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {upcoming.map((entry) => (
                  <UpcomingCard key={`${entry.title}-${entry.startTime || ''}`} entry={entry} />
                ))}
              </div>
            </section>
          )}

          {/* Finished */}
          {finishedLoading && finished.length === 0 ? (
            <section>
              <SectionHeading eyebrow="History" title={<span className="inline-flex items-center gap-2"><SectionDot tone="slate" />已结束</span>} count={0} />
              <div className="flex h-16 items-center justify-center gap-3 rounded-2xl border border-white/10 bg-[#1a1d24] text-sm text-slate-500">
                <span className="size-4 animate-spin rounded-full border-2 border-slate-600 border-t-slate-300" />
                已结束赛事加载中…
              </div>
            </section>
          ) : finished.length > 0 ? (
            <section>
              <SectionHeading eyebrow="History" title={<span className="inline-flex items-center gap-2"><SectionDot tone="slate" />已结束</span>} count={finished.length} />
              <div className="divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/10 bg-[#1a1d24]">
                {finished.map((entry) => (
                  <FinishedRow key={`${entry.title}-${entry.startTime || ''}`} entry={entry} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}

      {hasData && payload?.fetchedAt && (
        <p className="mt-12 text-center text-[11px] text-slate-600">
          数据来源 DLTV · 更新于 {new Date(payload.fetchedAt).toLocaleString('zh-CN', { hour12: false })}
        </p>
      )}
    </div>
  );
}

export default TournamentsPage;
