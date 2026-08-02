import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
} from '@/components/ui/carousel';
import { LiveMatchCard, type LiveHeroPayload } from '@/components/custom/LiveMatchCard';

const AUTOPLAY_INTERVAL_MS = 5000;
const BLUE = '#2b55e8';

/** Live 比赛滑动卡片：展示全部 live 比赛，自动播 + 拖拽 + 圆点 */
export function LiveMatchesCarousel({ liveHeroes, onOpenMatch }: {
  liveHeroes: LiveHeroPayload[];
  onOpenMatch?: (matchId: string | number, maps?: Array<{
    label: string;
    matchId: string;
    radiantScore?: number;
    direScore?: number;
    duration?: number;
  }>) => void;
}) {
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

  if (liveHeroes.length === 0) return null;

  return (
    <section onMouseEnter={stopAutoplay} onMouseLeave={startAutoplay} className="relative">
      <Carousel setApi={setApi} opts={{ loop: true, align: 'start' }} className="w-full">
        <CarouselContent className="-ml-4">
          {liveHeroes.map((hero) => (
            <CarouselItem key={`${hero.leagueName}-${hero.teams?.[0]?.name}-${hero.teams?.[1]?.name}`} className="pl-4 basis-full sm:basis-1/2 lg:basis-1/3 xl:basis-1/4">
              <LiveMatchCard
                hero={hero}
                onOpen={() => {
                  const liveMap = hero.liveMap;
                  const maps = (hero.maps || [])
                    .filter((m) => m.matchId !== null && m.matchId !== undefined)
                    .map((m) => ({
                      label: m.label,
                      matchId: String(m.matchId),
                      radiantScore: m.team1Score ?? undefined,
                      direScore: m.team2Score ?? undefined,
                      duration: m.gameTime ?? undefined,
                    }));
                  onOpenMatch?.(liveMap?.matchId ?? hero.maps?.[0]?.matchId ?? '', maps);
                }}
              />
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
              aria-label={`跳转到第 ${index + 1} 场直播`}
              onClick={() => api?.scrollTo(index)}
              className="h-2 rounded-full transition-all"
              style={{
                width: index === selected ? 20 : 8,
                backgroundColor: index === selected ? BLUE : '#3a3d46',
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}
