import { PagePlaceholder } from '@/pages/PagePlaceholder';
import type { TopLevelPage } from '@/lib/hashRouter';

const PAGE_META: Record<Exclude<TopLevelPage, 'home'>, { title: string; badge: string; description: string }> = {
  tournaments: {
    title: '赛事',
    badge: 'Tournaments',
    description: '各大赛事的赛程、分组与淘汰赛信息即将上线。现在先回到首页查看即将开始的比赛。',
  },
  matches: {
    title: '比赛',
    badge: 'Matches',
    description: '全部比赛的完整列表与筛选即将上线。现在先回到首页查看直播与即将开始的比赛。',
  },
  teams: {
    title: '战队',
    badge: 'Teams',
    description: '战队排名、阵容与近期战绩页面即将上线。现在先回到首页查看热门战队速览。',
  },
  players: {
    title: '选手',
    badge: 'Players',
    description: '选手数据、英雄池与近期表现页面即将上线。现在先回到首页查看人气选手速览。',
  },
};

export function TopLevelPlaceholder({ page, onBack }: { page: Exclude<TopLevelPage, 'home'>; onBack: () => void }) {
  const meta = PAGE_META[page];
  return <PagePlaceholder title={meta.title} badge={meta.badge} description={meta.description} onBack={onBack} />;
}
