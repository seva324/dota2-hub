import { useCallback, useEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
} from '@/components/ui/carousel';
import { SafeImg } from '@/components/custom/SafeImg';
import { Button } from '@/components/ui/button';

export interface PrimaryLeague {
  name: string;
  logo: string | null;
  startTime: number | null;
  endTime: number | null;
  dateRange: string;
  country: string | null;
  flag: string | null;
  prizePool: string | null;
  tier: string | null;
  eventUrl: string | null;
}

const AUTOPLAY_INTERVAL_MS = 5000;

const design = {
  blue: '#2b55e8',
  red: '#ff3b30',
};

/** 解析奖金数字，如 "$1,000,000" -> 1000000；无法解析返回 null */
function parsePrizeAmount(prizePool?: string | null): number | null {
  const match = String(prizePool || '').match(/([\d,.]+)/);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(value) ? value : null;
}

function formatPrize(value?: string | null): string {
  const amount = parsePrizeAmount(value);
  if (amount == null) return value || '—';
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 2)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount}`;
}

function tierLabel(tier?: string | null): string {
  const normalized = String(tier || '').toUpperCase();
  const match = normalized.match(/^([SABC])-?TIER$/i);
  if (match) return `${match[1]}-Tier`;
  if (/^[SABC]$/.test(normalized)) return `${normalized}-Tier`;
  return normalized || 'Tier';
}

function deriveStatus(tournament: PrimaryLeague): { label: string; live?: boolean } {
  const now = Math.floor(Date.now() / 1000);
  const start = Number(tournament.startTime) || 0;
  const end = Number(tournament.endTime) || 0;
  if (start > 0 && end > 0) {
    if (now >= start && now <= end) return { label: 'LIVE', live: true };
    if (now < start) return { label: 'UPCOMING' };
    return { label: 'COMPLETED' };
  }
  return { label: 'Dota 2' };
}

function TournamentSlide({ tournament }: { tournament: PrimaryLeague }) {
  const status = deriveStatus(tournament);
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.06]">
      {/* 赛事背景图：轻微毛玻璃 */}
      <img
        src="/images/tournament-background.png"
        alt=""
        className="pointer-events-none absolute inset-0 h-full w-full object-cover blur-[2px]"
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'linear-gradient(100deg, rgba(10,14,20,0.9) 0%, rgba(10,14,20,0.72) 40%, rgba(10,14,20,0.45) 75%, rgba(10,14,20,0.6) 100%)',
        }}
      />

      <div className="relative z-10 grid min-h-[280px] items-center px-8 py-12 lg:grid-cols-[minmax(0,1fr)_280px] lg:px-14">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: '#8ca6ff' }}>
            Tournament Spotlight
          </div>
          <h3 className="mt-3 text-3xl font-black tracking-tight text-white lg:text-4xl">
            {tournament.name}
          </h3>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" style={{ color: '#a1a1aa' }}>
            {tournament.dateRange && <span>{tournament.dateRange}</span>}
            {tournament.country && (
              <span className="inline-flex items-center gap-1.5">
                {tournament.flag && (
                  <SafeImg
                    src={tournament.flag}
                    alt=""
                    className="h-3.5 w-[22px] rounded-[2px] object-cover"
                    fallback={null}
                  />
                )}
                {tournament.country}
              </span>
            )}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-x-10 gap-y-4">
            <div className="flex flex-col">
              <span className="text-xl font-black tabular-nums text-white">{formatPrize(tournament.prizePool)}</span>
              <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Prize Pool</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-black tabular-nums text-white">{tierLabel(tournament.tier)}</span>
              <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Tier</span>
            </div>
            <div className="flex flex-col">
              <span
                className="inline-flex w-fit items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-bold"
                style={{ color: status.live ? '#fff' : '#a1a1aa', backgroundColor: status.live ? design.red : '#2a2d35' }}
              >
                {status.live && <span className="size-1.5 animate-pulse rounded-full bg-white" />}
                {status.label}
              </span>
              <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Status</span>
            </div>
          </div>

          {tournament.eventUrl && (
            <a
              href={tournament.eventUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button size="lg" className="mt-8 w-fit rounded-lg px-6 text-sm font-semibold text-white hover:opacity-90" style={{ backgroundColor: design.blue }}>
                <Play className="size-4 fill-white" />
                Explore Tournament
              </Button>
            </a>
          )}
        </div>

        {/* 右侧赛事 Logo：280px，右列 280px 内留白 */}
        <div className="hidden lg:flex items-center justify-center">
          <div className="relative flex size-[280px] items-center justify-center">
            <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(255,255,255,0.08) 0%, rgba(10,14,20,0) 70%)' }} />
            <SafeImg
              src={tournament.logo || ''}
              alt={tournament.name}
              className="relative h-[280px] w-[280px] object-contain"
              fallback={<div className="relative text-center text-2xl font-bold leading-8 tracking-[0.2em] text-white/60">{tournament.name.toUpperCase()}</div>}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function TournamentCarousel({ tournaments }: { tournaments: PrimaryLeague[] }) {
  const [api, setApi] = useState<CarouselApi | null>(null);
  const [selected, setSelected] = useState(0);
  const [count, setCount] = useState(0);
  const autoplayRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!api) return;
    setCount(api.scrollSnapList().length);
    setSelected(api.selectedScrollSnap());
    const onSelect = () => setSelected(api.selectedScrollSnap());
    api.on('select', onSelect);
    api.on('reInit', onSelect);
    return () => {
      api.off('select', onSelect);
      api.off('reInit', onSelect);
    };
  }, [api]);

  const startAutoplay = useCallback(() => {
    if (autoplayRef.current) return;
    autoplayRef.current = setInterval(() => {
      api?.scrollNext();
    }, AUTOPLAY_INTERVAL_MS);
  }, [api]);

  const stopAutoplay = useCallback(() => {
    if (autoplayRef.current) {
      clearInterval(autoplayRef.current);
      autoplayRef.current = null;
    }
  }, []);

  useEffect(() => {
    startAutoplay();
    return stopAutoplay;
  }, [startAutoplay, stopAutoplay]);

  if (tournaments.length === 0) return null;

  return (
    <section
      onMouseEnter={stopAutoplay}
      onMouseLeave={startAutoplay}
      className="relative"
    >
      <Carousel
        setApi={setApi}
        opts={{ loop: true, align: 'start' }}
        className="w-full"
      >
        <CarouselContent className="-ml-4">
          {tournaments.map((tournament) => (
            <CarouselItem key={tournament.name} className="pl-4 basis-full">
              <TournamentSlide tournament={tournament} />
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>

      {/* 圆点指示器 */}
      {count > 1 && (
        <div className="mt-4 flex items-center justify-center gap-1.5">
          {Array.from({ length: count }).map((_, index) => (
            <button
              key={index}
              type="button"
              aria-label={`跳转到第 ${index + 1} 个赛事`}
              onClick={() => api?.scrollTo(index)}
              className="h-2 rounded-full transition-all"
              style={{
                width: index === selected ? 20 : 8,
                backgroundColor: index === selected ? design.blue : '#3a3d46',
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}
