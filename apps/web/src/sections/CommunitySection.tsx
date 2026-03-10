import { MessageCircle, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface Post {
  id: string;
  title: string;
  author: string;
  source: string;
  upvotes: number;
  comments: number;
  url: string;
  publishedAt: string;
}

export function CommunitySection({ posts }: { posts?: Post[] }) {
  if (!posts || posts.length === 0) return null;

  const redditPosts = posts.filter((p) => p.source === 'reddit');
  const ngaPosts = posts.filter((p) => p.source === 'nga');

  return (
    <section className="py-20 bg-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4 mb-12">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center">
            <MessageCircle className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-white">社区热点</h2>
            <p className="text-slate-400">Reddit & NGA 热门讨论</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {redditPosts.slice(0, 3).map((post) => (
            <a key={post.id} href={post.url} target="_blank" rel="noopener noreferrer" className="block">
              <Card className="border-slate-800 bg-slate-950/50 hover:border-orange-500/30 transition-all">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-orange-600/20 flex items-center justify-center flex-shrink-0">
                      <TrendingUp className="w-5 h-5 text-orange-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-white line-clamp-2 mb-2">{post.title}</h4>
                      <div className="flex items-center gap-4 text-xs text-slate-500">
                        <span>@{post.author}</span>
                        <span>{post.upvotes} 赞</span>
                        <span>{post.comments} 评论</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </a>
          ))}
          
          {ngaPosts.slice(0, 3).map((post) => (
            <a key={post.id} href={post.url} target="_blank" rel="noopener noreferrer" className="block">
              <Card className="border-slate-800 bg-slate-950/50 hover:border-green-500/30 transition-all">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-green-600/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-green-400 font-bold text-xs">NGA</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-white line-clamp-2 mb-2">{post.title}</h4>
                      <div className="flex items-center gap-4 text-xs text-slate-500">
                        <span>@{post.author}</span>
                        <span>{post.upvotes} 赞</span>
                        <span>{post.comments} 评论</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
