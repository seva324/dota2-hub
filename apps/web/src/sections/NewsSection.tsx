import { useEffect, useRef, useState } from 'react';
import { Newspaper, Flame } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api-cache';
import { NewsDetailDialog, type NewsItem } from '@/components/custom/NewsDetailDialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const EMPTY_NEWS: NewsItem[] = [];

const categoryColors: Record<string, string> = {
  transfer: 'bg-purple-500/20 text-purple-400',
  drama: 'bg-rose-500/20 text-rose-400',
  gameplay: 'bg-green-500/20 text-green-400',
  tournament: 'bg-blue-500/20 text-blue-400',
  community: 'bg-amber-500/20 text-amber-400',
  default: 'bg-slate-500/20 text-slate-400',
};

const categoryLabels: Record<string, string> = {
  transfer: '转会',
  drama: '八卦',
  gameplay: '游戏内容',
  tournament: '赛事',
  community: '社区',
  default: '资讯',
};



function useInView<T extends HTMLElement>(options?: IntersectionObserverInit) {
  const ref = useRef<T | null>(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    if (isInView || typeof IntersectionObserver === 'undefined') {
      if (typeof IntersectionObserver === 'undefined') {
        setIsInView(true);
      }
      return;
    }

    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setIsInView(true);
        observer.disconnect();
      }
    }, options);

    observer.observe(node);
    return () => observer.disconnect();
  }, [isInView, options]);

  return { ref, isInView };
}

function NewsSectionSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" aria-hidden="true">
      {Array.from({ length: 3 }).map((_, index) => (
        <Card key={index} className="h-full border-slate-800 bg-slate-900/50 overflow-hidden">
          <div className="h-40 bg-slate-800/70 animate-pulse" />
          <CardContent className="p-4 space-y-3">
            <div className="h-5 rounded bg-slate-800/70 animate-pulse" />
            <div className="h-4 rounded bg-slate-800/70 animate-pulse" />
            <div className="h-4 w-1/2 rounded bg-slate-800/70 animate-pulse" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function NewsSection({ news = EMPTY_NEWS }: { news?: NewsItem[] }) {
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);
  const [showAllNews, setShowAllNews] = useState(false);
  const [lazyNews, setLazyNews] = useState<NewsItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const { ref: sectionRef, isInView } = useInView<HTMLElement>({ rootMargin: '240px 0px' });
  const effectiveNews = lazyNews.length > 0 ? lazyNews : news;

  useEffect(() => {
    if (!isInView || hasLoaded) return;

    let cancelled = false;

    const loadNews = async () => {
      setIsLoading(true);
      setLoadError('');
      try {
        const payload = await apiFetch<NewsItem[]>('/api/news', { ttlMs: 5 * 60 * 1000, cacheEmpty: false });
        if (cancelled) return;

        setLazyNews(Array.isArray(payload) ? payload : []);
        setHasLoaded(true);
      } catch (error) {
        if (cancelled) return;
        console.error('[NewsSection] Failed to lazy load news:', error);
        setLoadError('加载新闻失败，请稍后重试');
        setLazyNews(news);
        setHasLoaded(true);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadNews();

    return () => {
      cancelled = true;
    };
  }, [hasLoaded, isInView, news]);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  const formatDateTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const openNewsDetail = (item: NewsItem) => {
    setShowAllNews(false);
    setSelectedNews(item);
  };

  return (
    <section ref={sectionRef} className="py-20 bg-slate-950" id="news">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4 mb-12">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-600 to-yellow-600 flex items-center justify-center">
            <Flame className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-white">最新资讯</h2>
            <p className="text-slate-400">DOTA2新闻与更新</p>
          </div>
        </div>

        {!isInView ? (
          <NewsSectionSkeleton />
        ) : isLoading && effectiveNews.length === 0 ? (
          <NewsSectionSkeleton />
        ) : effectiveNews.length > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {effectiveNews.slice(0, 6).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openNewsDetail(item)}
                  className="group block text-left"
                >
                  <Card className="h-full border-slate-800 bg-slate-900/50 hover:border-amber-500/30 transition-all overflow-hidden">
                    <div className="relative h-40 overflow-hidden">
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={item.title}
                          className="w-full h-full object-cover transition-transform group-hover:scale-105"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = '/images/patch-update.jpg';
                          }}
                        />
                      ) : (
                        <img
                          src="/images/patch-update.jpg"
                          alt={item.title}
                          className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-900 to-transparent" />
                      <Badge className={`absolute top-3 left-3 ${categoryColors[item.category] || categoryColors.default}`}>
                        {categoryLabels[item.category] || categoryLabels.default}
                      </Badge>
                    </div>
                    <CardContent className="p-4">
                      <h3 className="font-semibold text-white mb-2 line-clamp-2 group-hover:text-amber-400 transition-colors">
                        {item.title}
                      </h3>
                      {item.summary && (
                        <p className="text-sm text-slate-400 line-clamp-2 mb-3">{item.summary}</p>
                      )}
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span>{item.source}</span>
                        <span>·</span>
                        <span>{formatDate(item.published_at)}</span>
                      </div>
                    </CardContent>
                  </Card>
                </button>
              ))}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setShowAllNews(true)}
                className="px-4 py-2 rounded-md border border-amber-500/50 text-amber-300 hover:bg-amber-500/10 transition-colors"
              >
                更多新闻
              </button>
            </div>
          </>
        ) : (
          <div className="text-center py-12 text-slate-500">
            <Newspaper className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>{loadError || '暂无新闻数据'}</p>
          </div>
        )}
      </div>

      <Dialog open={showAllNews} onOpenChange={setShowAllNews}>
        <DialogContent className="w-[95vw] max-w-5xl h-[90vh] flex flex-col border-slate-700 bg-slate-900 text-slate-100 p-0">
          <DialogHeader className="px-6 pt-6 pb-3 border-b border-slate-800">
            <DialogTitle className="text-xl text-white pr-8">更多新闻</DialogTitle>
            <DialogDescription className="text-slate-400">包含 BO3.gg 与 Hawk Live 全部已抓取新闻</DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6 pt-4 space-y-3">
            {effectiveNews.map((item) => (
              <button
                key={`more-${item.id}`}
                type="button"
                onClick={() => openNewsDetail(item)}
                className="w-full text-left rounded-lg border border-slate-800 bg-slate-900/60 hover:border-amber-500/30 transition-colors p-4"
              >
                <div className="flex items-start gap-3">
                  <img
                    src={item.image_url || '/images/patch-update.jpg'}
                    alt={item.title}
                    className="w-24 h-16 object-cover rounded shrink-0"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '/images/patch-update.jpg';
                    }}
                  />
                  <div className="min-w-0">
                    <p className="text-sm text-slate-300 line-clamp-2">{item.title}</p>
                    <p className="text-xs text-slate-500 mt-2">{item.source} · {formatDateTime(item.published_at)}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <NewsDetailDialog
        item={selectedNews}
        pool={effectiveNews}
        onOpenChange={(open) => !open && setSelectedNews(null)}
        onSelect={setSelectedNews}
      />
    </section>
  );
}
