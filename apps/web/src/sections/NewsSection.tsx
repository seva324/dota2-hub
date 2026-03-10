import { useEffect, useMemo, useRef, useState } from 'react';
import { Newspaper, Flame, ExternalLink } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface NewsItem {
  id: string;
  title: string;
  summary?: string;
  content?: string;
  content_markdown?: string;
  content_images?: string[];
  source: string;
  url: string;
  image_url?: string;
  published_at: number;
  category: string;
}

const categoryColors: Record<string, string> = {
  transfer: 'bg-purple-500/20 text-purple-400',
  patch: 'bg-green-500/20 text-green-400',
  tournament: 'bg-blue-500/20 text-blue-400',
  default: 'bg-slate-500/20 text-slate-400',
};

const categoryLabels: Record<string, string> = {
  transfer: '转会',
  patch: '更新',
  tournament: '赛事',
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

function normalizeUrl(url?: string) {
  if (!url) return '';
  return url.replace(/&amp;/g, '&');
}

function parseInlineMarkdown(text: string) {
  const nodes: React.ReactNode[] = [];
  const pattern = /(\[[^\]]+\]\((https?:\/\/[^)\s]+)\))|(https?:\/\/[^\s]+)/g;
  let last = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(text.slice(last, match.index));
    }

    if (match[1] && match[2]) {
      const label = match[1].match(/^\[([^\]]+)\]/)?.[1] || match[2];
      nodes.push(
        <a
          key={`${match.index}-${match[2]}`}
          href={normalizeUrl(match[2])}
          target="_blank"
          rel="noopener noreferrer"
          className="text-amber-400 hover:text-amber-300 underline"
        >
          {label}
        </a>
      );
    } else if (match[3]) {
      const url = normalizeUrl(match[3]);
      nodes.push(
        <a
          key={`${match.index}-${url}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-amber-400 hover:text-amber-300 underline break-all"
        >
          {url}
        </a>
      );
    }

    last = pattern.lastIndex;
  }

  if (last < text.length) {
    nodes.push(text.slice(last));
  }

  return nodes;
}

function extractImageUrlsFromText(text: string) {
  const matches = text.match(/https?:\/\/[^\s)]+?\.(?:png|jpe?g|webp|gif|avif)(?:\?[^\s)]*)?/gi) || [];
  return Array.from(new Set(matches.map(normalizeUrl))).slice(0, 6);
}

function renderRichContent(rawText: string) {
  const text = rawText || '';
  const lines = text.split('\n');
  const blocks: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      blocks.push(<div key={`sp-${i}`} className="h-2" />);
      continue;
    }

    const imageMatch = line.match(/^!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)$/i);
    if (imageMatch) {
      const imageUrl = normalizeUrl(imageMatch[1]);
      blocks.push(
        <img
          key={`img-${i}-${imageUrl}`}
          src={imageUrl}
          alt="news-content"
          className="w-full rounded-md object-cover my-3"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      );
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.+)/);
    if (bullet) {
      blocks.push(
        <p key={`li-${i}`} className="pl-4">
          <span className="mr-2">•</span>
          {parseInlineMarkdown(bullet[1])}
        </p>
      );
      continue;
    }

    blocks.push(
      <p key={`p-${i}`}>
        {parseInlineMarkdown(line)}
      </p>
    );
  }

  return blocks;
}

export function NewsSection({ news = [] }: { news?: NewsItem[] }) {
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
        const response = await fetch('/api/news');
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const payload = await response.json();
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

  const currentContent = useMemo(() => {
    if (!selectedNews) return '';
    return selectedNews.content_markdown || selectedNews.content || selectedNews.summary || '';
  }, [selectedNews]);

  const derivedContentImages = useMemo(() => {
    if (!selectedNews) return [];
    const fromField = selectedNews.content_images || [];
    const fromContent = extractImageUrlsFromText(currentContent);
    return Array.from(new Set([...fromField, ...fromContent])).slice(0, 6);
  }, [selectedNews, currentContent]);

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
                            (e.target as HTMLImageElement).src = '/dota2-hub/images/patch-update.jpg';
                          }}
                        />
                      ) : (
                        <img
                          src="/dota2-hub/images/patch-update.jpg"
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
                    src={item.image_url || '/dota2-hub/images/patch-update.jpg'}
                    alt={item.title}
                    className="w-24 h-16 object-cover rounded shrink-0"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '/dota2-hub/images/patch-update.jpg';
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

      <Dialog open={Boolean(selectedNews)} onOpenChange={(open) => !open && setSelectedNews(null)}>
        <DialogContent className="w-[95vw] max-w-4xl h-[90vh] flex flex-col border-slate-700 bg-slate-900 text-slate-100 p-0">
          {selectedNews && (
            <>
              <DialogHeader className="px-6 pt-6 pb-2 border-b border-slate-800">
                <DialogTitle className="text-xl text-white pr-8">{selectedNews.title}</DialogTitle>
                <DialogDescription className="text-slate-400">
                  {selectedNews.source} · {formatDateTime(selectedNews.published_at)}
                </DialogDescription>
              </DialogHeader>

              <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
                {selectedNews.image_url && (
                  <img
                    src={selectedNews.image_url}
                    alt={selectedNews.title}
                    className="w-full max-h-80 rounded-md object-cover mb-4"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '/dota2-hub/images/patch-update.jpg';
                    }}
                  />
                )}

                {derivedContentImages.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                    {derivedContentImages.slice(0, 4).map((img) => (
                      <img
                        key={img}
                        src={img}
                        alt="news-inline"
                        className="w-full max-h-52 rounded-md object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ))}
                  </div>
                )}

                <div className="space-y-3 text-sm leading-7 text-slate-200">
                  {currentContent ? renderRichContent(currentContent) : <p>正文暂不可用，点击下方原文查看完整内容。</p>}
                </div>

                <div className="pt-4">
                  <a
                    href={selectedNews.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-amber-400 hover:text-amber-300"
                  >
                    查看原文 <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
