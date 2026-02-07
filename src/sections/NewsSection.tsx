import { Newspaper, Flame } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface NewsItem {
  id: string;
  title: string;
  summary?: string;
  source: string;
  url: string;
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

export function NewsSection({ news }: { news: NewsItem[] }) {
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  return (
    <section className="py-20 bg-slate-950">
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

        {news.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {news.slice(0, 6).map((item) => (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group block"
              >
                <Card className="h-full border-slate-800 bg-slate-900/50 hover:border-amber-500/30 transition-all overflow-hidden">
                  <div className="relative h-40 overflow-hidden">
                    <img
                      src={`/dota2-hub/images/patch-update.jpg`}
                      alt={item.title}
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    />
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
              </a>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-slate-500">
            <Newspaper className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>暂无新闻数据</p>
          </div>
        )}
      </div>
    </section>
  );
}
