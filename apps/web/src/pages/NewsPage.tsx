import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Newspaper } from 'lucide-react';
import { SafeImg } from '@/components/custom/SafeImg';
import { apiFetch } from '@/lib/api-cache';
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

const EMPTY_NEWS: NewsItem[] = [];

const design = {
  bg: '#0f1115',
  card: '#1a1d24',
  card2: '#20242e',
  blue: '#2b55e8',
  blue2: '#5b7cff',
  red: '#ff3b30',
  text2: '#a1a1aa',
  text3: '#71717a',
};

const CATEGORY_COLORS: Record<string, string> = {
  esports: '#3b82f6',
  tournament: '#3b82f6',
  patch: '#22c55e',
  gameplay: '#22c55e',
  news: '#94a3b8',
  transfer: '#a855f7',
  roster: '#a855f7',
  drama: '#f43f5e',
  takes: '#f59e0b',
  community: '#f59e0b',
  default: '#94a3b8',
};

const CATEGORY_LABELS: Record<string, string> = {
  esports: '赛事',
  tournament: '赛事',
  patch: '版本',
  gameplay: '版本',
  news: '资讯',
  transfer: '转会',
  roster: '阵容',
  drama: '八卦',
  takes: '观点',
  community: '社区',
  default: '资讯',
};

const CATEGORY_ORDER = ['赛事', '版本', '转会', '阵容', '八卦', '观点', '社区', '资讯'];

function categoryInfo(category?: string): { label: string; color: string } {
  const key = String(category || '').toLowerCase();
  return {
    label: CATEGORY_LABELS[key] || CATEGORY_LABELS.default,
    color: CATEGORY_COLORS[key] || CATEGORY_COLORS.default,
  };
}

function normalizeUrl(url?: string) {
  if (!url) return '';
  return url.replace(/&amp;/g, '&');
}

function extractImageUrlsFromText(text: string) {
  const matches = text.match(/https?:\/\/[^\s)]+?\.(?:png|jpe?g|webp|gif|avif)(?:\?[^\s)]*)?/gi) || [];
  return Array.from(new Set(matches.map(normalizeUrl))).slice(0, 6);
}

function formatNewsDate(timestamp: number) {
  if (!timestamp) return '';
  const date = new Date(timestamp * 1000);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDateTime(timestamp: number) {
  const date = new Date(timestamp * 1000);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
          className="text-[#5b7cff] underline hover:text-[#7d97ff]"
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
          className="break-all text-[#5b7cff] underline hover:text-[#7d97ff]"
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
          className="my-3 w-full rounded-md object-cover"
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

    blocks.push(<p key={`p-${i}`}>{parseInlineMarkdown(line)}</p>);
  }

  return blocks;
}

function CategoryBadge({ category }: { category?: string }) {
  const info = categoryInfo(category);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-[#0f1115]/80 px-2 py-0.5 text-[11px] font-bold tracking-wide backdrop-blur"
      style={{ color: '#fff' }}
    >
      <span className="size-1.5 rounded-[3px]" style={{ backgroundColor: info.color }} />
      {info.label}
    </span>
  );
}

function NewsThumb({ item, className }: { item: NewsItem; className?: string }) {
  const info = categoryInfo(item.category);
  return (
    <SafeImg
      src={item.image_url}
      alt={item.title}
      className={className}
      fallback={(
        <div
          className={`flex items-center justify-center ${className ?? ''}`}
          style={{ background: 'linear-gradient(135deg, #1b2440, #111728 55%, #26314f)' }}
        >
          <span
            className="text-[20px] uppercase tracking-widest"
            style={{ fontFamily: "'Anton', sans-serif", color: `${info.color}55` }}
          >
            Dota 2
          </span>
        </div>
      )}
    />
  );
}

function FeaturedCard({ item }: { item: NewsItem }) {
  return (
    <article
      className="relative mb-6 overflow-hidden rounded-2xl border border-white/[0.06]"
      style={{ backgroundColor: design.card, minHeight: 400 }}
    >
      {item.image_url ? (
        <SafeImg
          src={item.image_url}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          fallback={null}
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(135deg, #1c2440, #131a2c 55%, #2a3352)' }}
        />
      )}
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(180deg, rgba(15,17,21,0.15) 0%, rgba(15,17,21,0.45) 45%, rgba(15,17,21,0.94) 100%)' }}
      />
      <div className="relative z-10 flex min-h-[400px] flex-col justify-end p-7">
        <div className="mb-3.5 flex items-center gap-3">
          <CategoryBadge category={item.category} />
          <span className="text-xs font-medium" style={{ color: 'rgba(238,242,247,0.75)' }}>
            {formatNewsDate(item.published_at)}
          </span>
          <span className="text-xs font-medium" style={{ color: 'rgba(238,242,247,0.75)' }}>
            · {item.source}
          </span>
        </div>
        <h2 className="max-w-2xl text-2xl font-extrabold leading-snug tracking-tight text-white lg:text-3xl">
          <a href={item.url} target="_blank" rel="noopener noreferrer" className="hover:text-[#5b7cff]">
            {item.title}
          </a>
        </h2>
        {item.summary && (
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-[rgba(238,242,247,0.78)] line-clamp-2">
            {item.summary}
          </p>
        )}
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex w-fit items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: design.blue }}
        >
          阅读全文 <ArrowRight className="size-4" />
        </a>
      </div>
    </article>
  );
}

function NewsCard({ item }: { item: NewsItem }) {
  const info = categoryInfo(item.category);
  return (
    <article
      className="group flex flex-col overflow-hidden rounded-xl border border-white/[0.06] transition-all hover:-translate-y-0.5 hover:border-white/[0.12]"
      style={{ backgroundColor: design.card }}
    >
      <div className="h-[3px] w-full" style={{ backgroundColor: info.color }} />
      <div className="relative aspect-[16/9] overflow-hidden" style={{ backgroundColor: '#0d1120' }}>
        <NewsThumb item={item} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
        <span className="absolute left-3 top-3 rounded-md border border-white/10 bg-[#0f1115]/80 px-2 py-0.5 text-[11px] font-bold backdrop-blur">
          <span className="mr-1.5 inline-block size-1.5 rounded-[3px] align-middle" style={{ backgroundColor: info.color }} />
          <span className="align-middle">{info.label}</span>
        </span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <span className="text-xs font-medium" style={{ color: design.text3 }}>
            {formatNewsDate(item.published_at)}
          </span>
        </div>
        <h3 className="text-[16.5px] font-bold leading-snug tracking-tight text-white line-clamp-2">
          <a href={item.url} target="_blank" rel="noopener noreferrer" className="hover:text-[#5b7cff]">
            {item.title}
          </a>
        </h3>
        {item.summary && (
          <p className="mt-2 flex-1 text-[13.5px] leading-relaxed text-[#a1a1aa] line-clamp-2">{item.summary}</p>
        )}
        <div className="mt-3.5 flex items-center justify-between border-t border-white/[0.06] pt-3 text-xs" style={{ color: '#8a93a5' }}>
          <span className="font-medium">{item.source}</span>
          <span className="font-semibold transition-colors group-hover:text-[#5b7cff]">
            阅读全文 <ArrowRight className="ml-0.5 inline-block size-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </article>
  );
}

function NewsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="overflow-hidden rounded-xl border border-white/[0.06]" style={{ backgroundColor: design.card }}>
          <div className="aspect-[16/9] animate-pulse" style={{ backgroundColor: '#232733' }} />
          <div className="space-y-3 p-4">
            <div className="h-4 w-24 rounded animate-pulse" style={{ backgroundColor: '#232733' }} />
            <div className="h-5 w-full rounded animate-pulse" style={{ backgroundColor: '#2a2d35' }} />
            <div className="h-4 w-3/4 rounded animate-pulse" style={{ backgroundColor: '#232733' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function NewsPage() {
  const [news, setNews] = useState<NewsItem[]>(EMPTY_NEWS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<NewsItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadNews = async () => {
      setLoading(true);
      setLoadError('');
      try {
        const payload = await apiFetch<NewsItem[]>('/api/news?limit=30', { ttlMs: 5 * 60 * 1000, cacheEmpty: false });
        if (cancelled) return;
        setNews(Array.isArray(payload) ? payload : []);
      } catch (error) {
        if (cancelled) return;
        console.error('[NewsPage] Failed to load news:', error);
        setLoadError('加载新闻失败，请稍后重试');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void loadNews();
    return () => { cancelled = true; };
  }, []);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of news) {
      const label = categoryInfo(item.category).label;
      map.set(label, (map.get(label) || 0) + 1);
    }
    return map;
  }, [news]);

  const tabs = useMemo(() => {
    const cats = Array.from(counts.entries()).sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a[0]);
      const ib = CATEGORY_ORDER.indexOf(b[0]);
      if (ia === -1 && ib === -1) return 0;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    return [{ label: 'all', key: 'all', count: news.length }]
      .concat(cats.map(([label, count]) => ({ label, key: label, count })));
  }, [counts, news.length]);

  const filtered = useMemo(() => {
    if (filter === 'all') return news;
    return news.filter((item) => categoryInfo(item.category).label === filter);
  }, [news, filter]);

  const PER_PAGE = 12;
  const featured = filter === 'all' ? filtered[0] : null;
  const listSource = featured ? filtered.slice(1) : filtered;
  const pages = Math.max(1, Math.ceil(listSource.length / PER_PAGE));
  const safePage = Math.min(page, pages);
  const pageItems = listSource.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  const currentContent = selected?.content_markdown || selected?.content || selected?.summary || '';
  const derivedContentImages = useMemo(() => {
    if (!selected) return [];
    const fromField = selected.content_images || [];
    const fromContent = extractImageUrlsFromText(currentContent);
    return Array.from(new Set([...fromField, ...fromContent])).slice(0, 6);
  }, [selected, currentContent]);

  const selectFilter = (key: string) => {
    setFilter(key);
    setPage(1);
  };

  return (
    <div className="relative mx-auto w-full max-w-[1200px] px-4 pt-24 lg:px-6" style={{ backgroundColor: design.bg }}>
      {/* 页头 */}
      <div className="pb-2 pt-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-[11.5px] font-bold uppercase tracking-[0.22em]" style={{ color: design.text2 }}>
            <span className="size-1.5 rounded-full" style={{ backgroundColor: design.red, boxShadow: '0 0 10px rgba(255,59,48,0.8)' }} />
            Dota 2 Esports News
          </div>
          <span className="text-xs font-medium" style={{ color: design.text3 }}>
            更新于 <span className="font-semibold text-[#a1a1aa]">{new Date().toLocaleDateString('zh-CN')}</span>
            {' · '}<span className="font-bold" style={{ color: design.blue2 }}>{news.length}</span> 篇
          </span>
        </div>
        <h1
          className="mt-2 text-[clamp(52px,8vw,96px)] uppercase leading-[0.9] tracking-wide text-white"
          style={{ fontFamily: "'Anton', 'Arial Narrow', sans-serif", fontWeight: 400 }}
        >
          News<span style={{ color: design.red }}>.</span>
        </h1>
      </div>

      {/* 分类筛选 */}
      <div className="mb-8 mt-7 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => selectFilter(tab.key)}
            className="inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-[13px] font-semibold transition-colors"
            style={
              tab.key === filter
                ? { color: '#fff', borderColor: design.blue, backgroundColor: 'rgba(43,85,232,0.18)' }
                : { color: design.text2, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'transparent' }
            }
          >
            {tab.label === 'all' ? '全部' : tab.label}
            <span className="text-[11px] font-bold" style={{ color: tab.key === filter ? design.blue2 : design.text3 }}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* 内容 */}
      {loading ? (
        <NewsSkeleton />
      ) : news.length === 0 ? (
        <div className="py-16 text-center" style={{ color: design.text3 }}>
          <Newspaper className="mx-auto mb-4 size-12 opacity-40" />
          <p>{loadError || '暂无新闻数据'}</p>
        </div>
      ) : (
        <>
          {featured && <FeaturedCard item={featured} />}

          {pageItems.length > 0 ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {pageItems.map((item) => (
                <NewsCard key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <div className="py-16 text-center" style={{ color: design.text3 }}>
              <p>该分类下暂无资讯</p>
            </div>
          )}

          {/* 分页 */}
          {pages > 1 && (
            <nav className="mt-10 flex items-center justify-center gap-2" aria-label="分页">
              <button
                type="button"
                disabled={safePage === 1}
                onClick={() => setPage(safePage - 1)}
                className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-white/[0.08] px-2.5 text-[13.5px] font-semibold transition-colors disabled:opacity-35"
                style={{ color: design.text2 }}
              >
                ‹ 上一页
              </button>
              {Array.from({ length: pages }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPage(i + 1)}
                  className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-2 text-[13.5px] font-semibold transition-colors"
                  style={
                    i + 1 === safePage
                      ? { color: '#fff', borderColor: design.blue, backgroundColor: design.blue }
                      : { color: design.text2, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'transparent' }
                  }
                >
                  {i + 1}
                </button>
              ))}
              <button
                type="button"
                disabled={safePage === pages}
                onClick={() => setPage(safePage + 1)}
                className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-white/[0.08] px-2.5 text-[13.5px] font-semibold transition-colors disabled:opacity-35"
                style={{ color: design.text2 }}
              >
                下一页 ›
              </button>
            </nav>
          )}
        </>
      )}

      {/* 详情弹窗 */}
      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="flex h-[90vh] w-[95vw] max-w-4xl flex-col border-slate-700 bg-slate-900 p-0 text-slate-100">
          {selected && (
            <>
              <DialogHeader className="border-b border-slate-800 px-6 pb-3 pt-6">
                <DialogTitle className="pr-8 text-xl text-white">{selected.title}</DialogTitle>
                <DialogDescription className="text-slate-400">
                  {selected.source} · {formatDateTime(selected.published_at)}
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                {selected.image_url && (
                  <img
                    src={selected.image_url}
                    alt={selected.title}
                    className="mb-4 max-h-80 w-full rounded-md object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                )}
                {derivedContentImages.length > 0 && (
                  <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {derivedContentImages.slice(0, 4).map((img) => (
                      <img
                        key={img}
                        src={img}
                        alt="news-inline"
                        className="max-h-52 w-full rounded-md object-cover"
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
                    href={selected.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 font-semibold text-[#5b7cff] hover:text-[#7d97ff]"
                  >
                    查看原文 <ArrowRight className="size-4" />
                  </a>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
