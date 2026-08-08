import { PagePlaceholder } from '@/pages/PagePlaceholder';
import type { TopLevelPage } from '@/lib/hashRouter';

const PAGE_META: Record<Exclude<TopLevelPage, 'home'>, { title: string; badge: string; description: string }> = {
  tournaments: {
    title: '赛事',
    badge: '赛事',
    description: '各大赛事的赛程、分组与淘汰赛信息即将上线。现在先回到首页查看即将开始的比赛。',
  },
  matches: {
    title: '比赛',
    badge: '比赛',
    description: '全部比赛的完整列表与筛选即将上线。现在先回到首页查看直播与即将开始的比赛。',
  },
  teams: {
    title: '战队',
    badge: '战队',
    description: '战队排名、阵容与近期战绩页面即将上线。现在先回到首页查看热门战队速览。',
  },
  players: {
    title: '选手',
    badge: '选手',
    description: '选手数据、英雄池与近期表现页面即将上线。现在先回到首页查看人气选手速览。',
  },
  news: {
    title: '新闻',
    badge: '新闻',
    description: 'Dota 2 资讯聚合即将上线。现在先回到首页查看最新新闻。',
  },
  match: {
    title: '比赛详情',
    badge: '比赛详情',
    description: '比赛详情页面加载失败，现在先回到首页。',
  },
  live: {
    title: '直播详情',
    badge: '直播详情',
    description: '直播详情页面加载失败，现在先回到首页。',
  },
  event: {
    title: '赛事详情',
    badge: '赛事详情',
    description: '赛事详情页面加载失败，现在先回到赛事列表。',
  },
  team: {
    title: '战队详情',
    badge: '战队详情',
    description: '战队详情页面加载失败，现在先回到战队列表。',
  },
};

export function TopLevelPlaceholder({ page, onBack }: { page: Exclude<TopLevelPage, 'home'>; onBack: () => void }) {
  const meta = PAGE_META[page];
  return <PagePlaceholder title={meta.title} badge={meta.badge} description={meta.description} onBack={onBack} />;
}
