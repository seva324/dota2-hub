import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Newspaper, TriangleAlert } from 'lucide-react';
import { NewsThumb, type NewsItem } from '@/components/custom/NewsArticle';
import { apiFetch } from '@/lib/api-cache';
import { useHashRoute } from '@/hooks/useHashRoute';
import { CATEGORY_ORDER, categoryInfo } from '@/lib/newsCategory';
import './news-page.css';

const EMPTY_NEWS: NewsItem[] = [];
const PER_PAGE = 12;

function formatNewsDate(timestamp: number) {
  if (!timestamp) return '';
  const date = new Date(timestamp * 1000);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function CategoryBadge({ category }: { category?: string }) {
  const info = categoryInfo(category);
  return (
    <span className="np-badge">
      <span className="tick" style={{ backgroundColor: info.color }} />
      {info.label}
    </span>
  );
}

function useOpenOnClick(onOpen: () => void, label: string) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    'aria-label': label,
    onClick: onOpen,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onOpen();
      }
    },
  };
}

function FeaturedCard({ item, onOpen }: { item: NewsItem; onOpen: () => void }) {
  return (
    <article className="np-featured" {...useOpenOnClick(onOpen, `阅读全文：${item.title}`)}>
      <div className="photo">
        <NewsThumb item={item} className="np-feat-img" />
      </div>
      <div className="scrim" />
      <div className="body">
        <div className="meta">
          <CategoryBadge category={item.category} />
          <span className="np-date">{formatNewsDate(item.published_at)}</span>
          <span className="np-date">· {item.source}</span>
        </div>
        <h2>{item.title}</h2>
        {item.summary ? <p className="ex">{item.summary}</p> : null}
        <button
          type="button"
          className="more"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
        >
          阅读全文 <ArrowRight width={14} height={14} />
        </button>
      </div>
    </article>
  );
}

function NewsCard({ item, onOpen }: { item: NewsItem; onOpen: () => void }) {
  const info = categoryInfo(item.category);
  return (
    <article
      {...useOpenOnClick(onOpen, `阅读全文：${item.title}`)}
      className="np-card"
      style={{ '--cat': info.color } as React.CSSProperties}
    >
      <div className="np-thumb">
        <NewsThumb item={item} className="np-thumb-img" />
        <CategoryBadge category={item.category} />
      </div>
      <div className="inner">
        <div className="meta">
          <span className="np-date">{formatNewsDate(item.published_at)}</span>
        </div>
        <h3>{item.title}</h3>
        <p className="ex">{item.summary || ''}</p>
        <div className="src">
          <span>{item.source}</span>
          <span className="go">
            阅读全文 <ArrowRight width={14} height={14} />
          </span>
        </div>
      </div>
    </article>
  );
}

function HotTopics({ items, onOpen }: { items: NewsItem[]; onOpen: (item: NewsItem) => void }) {
  return (
    <section className="np-panel">
      <h2>热门话题</h2>
      <ol className="np-hot-list">
        {items.map((item, index) => (
          <li key={item.id}>
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                e.preventDefault();
                onOpen(item);
              }}
            >
              <span className="rank">{String(index + 1).padStart(2, '0')}</span>
              <span className="h-body">
                <span className="h-title">{item.title}</span>
                <span className="h-meta">
                  {categoryInfo(item.category).label} · {item.source}
                </span>
              </span>
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}

function NewsSkeleton() {
  return (
    <div className="np-skeleton">
      <div className="np-sk-feat" />
      <div className="np-sk-grid">
        <div className="np-sk-card" />
        <div className="np-sk-card" />
        <div className="np-sk-card" />
        <div className="np-sk-card" />
      </div>
    </div>
  );
}

function Pager({ pages, page, onPage }: { pages: number; page: number; onPage: (page: number) => void }) {
  return (
    <nav className="np-pager" aria-label="分页">
      <button type="button" className="np-pg" disabled={page === 1} onClick={() => onPage(page - 1)}>
        ‹ 上一页
      </button>
      {Array.from({ length: pages }).map((_, i) => (
        <button
          key={i}
          type="button"
          className={`np-pg ${i + 1 === page ? 'on' : ''}`}
          onClick={() => onPage(i + 1)}
        >
          {i + 1}
        </button>
      ))}
      <button type="button" className="np-pg" disabled={page === pages} onClick={() => onPage(page + 1)}>
        下一页 ›
      </button>
    </nav>
  );
}

export function NewsPage() {
  const { navigate } = useHashRoute();
  const [news, setNews] = useState<NewsItem[]>(EMPTY_NEWS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);

  const openDetail = useCallback(
    (item: NewsItem) => {
      navigate({ page: 'news', overlay: null, newsId: item.id }, { replace: false });
    },
    [navigate],
  );

  const loadNews = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const payload = await apiFetch<NewsItem[]>('/api/news?limit=60', { ttlMs: 5 * 60 * 1000, cacheEmpty: false });
      setNews(Array.isArray(payload) ? payload : []);
    } catch (error) {
      console.error('[NewsPage] Failed to load news:', error);
      setLoadError('加载新闻失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNews();
  }, [loadNews]);

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

  const hot = useMemo(() => news.slice(0, 5), [news]);

  const featured = filter === 'all' ? filtered[0] : null;
  const listSource = featured ? filtered.slice(1) : filtered;
  const pages = Math.max(1, Math.ceil(listSource.length / PER_PAGE));
  const safePage = Math.min(page, pages);
  const pageItems = listSource.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  const selectFilter = (key: string) => {
    setFilter(key);
    setPage(1);
  };

  const showEmpty = !loading && !loadError && news.length === 0;

  return (
    <div className="news-page">
      <div className="np-wrap pt-16">
        <section className="np-head">
          <div className="np-eyebrow-row">
            <div className="np-eyebrow">
              <span className="dot" />Dota 2 电竞资讯
            </div>
            <span className="np-updated">
              更新于 <b className="date">{new Date().toLocaleDateString('zh-CN')}</b> ·{' '}
              <b className="count">{news.length}</b> 篇
            </span>
          </div>

          <div className="np-filters">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`np-tab ${tab.key === filter ? 'on' : ''}`}
                onClick={() => selectFilter(tab.key)}
              >
                {tab.label === 'all' ? '全部' : tab.label}
                <span className="n">{tab.count}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="np-layout">
          <div className="np-feed">
            {loading ? (
              <NewsSkeleton />
            ) : loadError ? (
              <div className="np-error" role="alert">
                <TriangleAlert width={40} height={40} />
                <p>{loadError}</p>
                <button type="button" className="retry" onClick={() => void loadNews()}>
                  重新加载
                </button>
              </div>
            ) : showEmpty ? (
              <div className="np-empty" role="status">
                <Newspaper width={40} height={40} />
                <p>暂无新闻数据</p>
              </div>
            ) : (
              <>
                {featured && <FeaturedCard item={featured} onOpen={() => openDetail(featured)} />}

                {pageItems.length > 0 ? (
                  <div className="np-grid">
                    {pageItems.map((item) => (
                      <NewsCard key={item.id} item={item} onOpen={() => openDetail(item)} />
                    ))}
                  </div>
                ) : (
                  <div className="np-empty" role="status">
                    <Newspaper width={40} height={40} />
                    <p>该分类下暂无资讯</p>
                    <span>试试其他分类，或稍后再来看看</span>
                  </div>
                )}

                {pages > 1 && <Pager pages={pages} page={safePage} onPage={setPage} />}
              </>
            )}
          </div>

          <aside className="np-rail">
            <HotTopics items={hot} onOpen={openDetail} />
          </aside>
        </section>
      </div>
    </div>
  );
}
