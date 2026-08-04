import { useEffect, useState } from 'react';
import { ArrowLeft, Newspaper } from 'lucide-react';
import { NewsArticleView, type NewsItem } from '@/components/custom/NewsArticle';
import { apiFetch } from '@/lib/api-cache';
import { useHashRoute } from '@/hooks/useHashRoute';

const design = {
  bg: '#0f1115',
  card: '#1a1d24',
  text2: '#a1a1aa',
  text3: '#71717a',
};

interface NewsDetailPageProps {
  newsId: string;
  onBack: () => void;
}

export function NewsDetailPage({ newsId, onBack }: NewsDetailPageProps) {
  const { navigate } = useHashRoute();
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

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
        console.error('[NewsDetailPage] Failed to load news:', error);
        setLoadError('加载新闻失败，请稍后重试');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void loadNews();
    return () => { cancelled = true; };
  }, []);

  const item = news.find((n) => n.id === newsId) || null;

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [newsId]);

  return (
    <div className="relative mx-auto min-h-screen w-full max-w-[860px] px-4 pt-24 lg:px-6" style={{ backgroundColor: design.bg }}>
      {/* 顶部返回栏 */}
      <div className="sticky top-20 z-10 -mx-4 mb-2 border-b border-white/[0.06] bg-[#0f1115]/90 px-4 py-3 backdrop-blur-lg lg:-mx-6 lg:px-6">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] px-3.5 py-2 text-[13.5px] font-semibold transition-colors hover:bg-white/[0.05]"
          style={{ color: design.text2 }}
        >
          <ArrowLeft className="size-4" />
          返回新闻列表
        </button>
      </div>

      {loading ? (
        <div className="space-y-4 py-10">
          <div className="h-8 w-3/4 rounded animate-pulse" style={{ backgroundColor: '#232733' }} />
          <div className="h-4 w-1/2 rounded animate-pulse" style={{ backgroundColor: '#232733' }} />
          <div className="aspect-video rounded-xl animate-pulse" style={{ backgroundColor: '#232733' }} />
          <div className="space-y-3">
            <div className="h-4 w-full rounded animate-pulse" style={{ backgroundColor: '#232733' }} />
            <div className="h-4 w-full rounded animate-pulse" style={{ backgroundColor: '#232733' }} />
            <div className="h-4 w-3/4 rounded animate-pulse" style={{ backgroundColor: '#232733' }} />
          </div>
        </div>
      ) : item ? (
        <NewsArticleView
          item={item}
          pool={news}
          onSelectRelated={(rel) => navigate({ page: 'news', overlay: null, newsId: rel.id })}
        />
      ) : (
        <div className="py-20 text-center" style={{ color: design.text3 }}>
          <Newspaper className="mx-auto mb-4 size-12 opacity-40" />
          <p>{loadError || '未找到该新闻，它可能已不在最新列表中'}</p>
        </div>
      )}
    </div>
  );
}
