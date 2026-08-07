import { Bell, CalendarDays, Home, Moon, Newspaper, Search, Shield, UserCircle, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HomeDashboard } from '@/sections/HomeDashboard';
import { Footer } from '@/sections/Footer';
import { TopLevelPlaceholder } from '@/pages/TopLevelPlaceholder';
import { MatchesPage } from '@/pages/MatchesPage';
import { SeriesMatchPage } from '@/pages/SeriesMatchPage';
import { LiveMatchDetailPage } from '@/pages/LiveMatchDetailPage';
import { TeamsPage } from '@/pages/TeamsPage';
import { TeamDetailPage } from '@/pages/TeamDetailPage';
import { NewsPage } from '@/pages/NewsPage';
import { NewsDetailPage } from '@/pages/NewsDetailPage';
import { TournamentsPage } from '@/pages/TournamentsPage';
import { EventDetailPage } from '@/pages/EventDetailPage';
import { MatchDetailModal } from '@/components/custom/MatchDetailModal';
import { useHashRoute } from '@/hooks/useHashRoute';
import type { TopLevelPage, RouteState } from '@/lib/hashRouter';

const desktopNavItems: Array<{ label: string; page: TopLevelPage }> = [
  { label: '首页', page: 'home' },
  { label: '赛程', page: 'matches' },
  { label: '赛事', page: 'tournaments' },
  { label: '战队', page: 'teams' },
  { label: '选手', page: 'players' },
  { label: '新闻', page: 'news' },
];

const mobileNavItems: Array<{ label: string; page: TopLevelPage; icon: typeof Home }> = [
  { label: '首页', page: 'home', icon: Home },
  { label: '赛程', page: 'matches', icon: CalendarDays },
  { label: '赛事', page: 'tournaments', icon: Shield },
  { label: '战队', page: 'teams', icon: Users },
  { label: '选手', page: 'players', icon: UserCircle },
  { label: '新闻', page: 'news', icon: Newspaper },
];

function DotaHubMark() {
  return (
    <div className="relative size-9 shrink-0 rounded-xl bg-gradient-to-br from-red-500 to-red-700 shadow-[0_0_24px_rgba(239,68,68,0.25)]">
      <div className="absolute inset-2 rounded-md border-4 border-slate-950/80" />
      <div className="absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-950" />
    </div>
  );
}

function App() {
  const { route, navigate, closeOverlay } = useHashRoute();
  const page = route.page;
  const goTo = (target: TopLevelPage) => {
    navigate({ page: target, overlay: null } satisfies RouteState, { replace: false });
  };
  const handleOpenTeam = (team: { name: string; slug?: string | null }) => {
    if (!team?.name) return;
    navigate(
      { page: 'team', overlay: null, teamName: team.name, teamSlug: team.slug ?? undefined },
      { replace: false },
    );
  };

  return (
    <div className="min-h-screen bg-[#05090d] text-foreground">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[#05090d]/88 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1480px] items-center gap-5 px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" className="flex items-center gap-3" onClick={() => goTo('home')}>
              <DotaHubMark />
              <span className="text-xl font-black tracking-tight text-white">DotaHub</span>
            </button>
          </div>

          <nav aria-label="主导航" className="hidden h-full items-center gap-1 lg:flex">
            {desktopNavItems.map((item) => (
              <Button
                key={item.page}
                variant="ghost"
                className={`h-full rounded-none border-b-2 px-4 text-sm font-semibold ${
                  page === item.page
                    ? 'border-red-500 text-white'
                    : 'border-transparent text-slate-300 hover:border-red-500 hover:bg-transparent hover:text-white'
                }`}
                onClick={() => goTo(item.page)}
              >
                {item.label}
              </Button>
            ))}
          </nav>

          {/* Desktop: search + dark mode + login */}
          <div className="ml-auto hidden items-center gap-2 lg:flex">
            <div className="relative flex items-center">
              <Search className="absolute left-3 size-4 text-slate-400" />
              <input
                type="text"
                placeholder="搜索战队、选手、比赛..."
                className="h-9 w-52 rounded-xl border border-white/10 bg-white/5 pl-9 pr-8 text-sm text-slate-300 placeholder:text-slate-500 focus:border-red-400/50 focus:outline-none focus:ring-1 focus:ring-red-400/30 xl:w-64"
              />
              <span className="absolute right-2 rounded border border-white/20 px-1 text-[10px] text-slate-500">/</span>
            </div>
            <Button variant="ghost" size="icon" className="size-9 text-slate-400 hover:text-white">
              <Moon className="size-4" />
            </Button>
            <Button size="sm" className="bg-white/10 text-sm text-white hover:bg-white/15">
              登录 / 注册
            </Button>
          </div>

          {/* Mobile: search + bell + user */}
          <div className="ml-auto flex items-center gap-0.5 lg:hidden">
            <Button variant="ghost" size="icon" className="size-9 text-slate-400">
              <Search className="size-5" />
            </Button>
            <Button variant="ghost" size="icon" className="relative size-9 text-slate-400">
              <Bell className="size-5" />
              <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-red-500" />
            </Button>
            <Button variant="ghost" size="icon" className="size-9 text-slate-400">
              <UserCircle className="size-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="pb-24 lg:pb-0">
        {page === 'home' ? (
          <HomeDashboard route={route} navigate={navigate} closeOverlay={closeOverlay} />
        ) : page === 'tournaments' ? (
          <TournamentsPage />
        ) : page === 'event' && route.eventSlug ? (
          <EventDetailPage
            slug={route.eventSlug}
            onBack={() => navigate({ page: 'tournaments', overlay: null }, { replace: false })}
            onOpenTeam={(team) => {
              if (!team?.name) return;
              navigate(
                { page: 'team', overlay: null, teamName: team.name, teamSlug: team.slug ?? undefined },
                { replace: false },
              );
            }}
          />
        ) : page === 'matches' ? (
          <MatchesPage
            onOpenMatch={(matchId, maps, seriesId, hawkSlug, hawkChamp) => {
              const numericId = typeof matchId === 'string' ? Number(matchId) : matchId;
              if (!Number.isFinite(numericId)) return;
              const firstMap = Array.isArray(maps) && maps.length > 0 ? maps[0] : null;
              const slug = typeof firstMap?.slug === 'string' && firstMap.slug ? firstMap.slug : '';
              if (seriesId && slug) {
                // 已结束 / 未开始的 DLTV 系列赛：带 seriesId + slug 走比赛详情页
                navigate({ page: 'match', overlay: null, matchId: String(seriesId), slug }, { replace: false });
                return;
              }
              if (slug) {
                // 有 DLTV slug 但无 seriesId：用 matchId 作为系列赛 ID
                navigate({ page: 'match', overlay: null, matchId: String(numericId), slug }, { replace: false });
                return;
              }
              if (seriesId) {
                // live 卡片：带 hawk seriesId + slug/champ 打开 live detail 全屏页
                navigate({ page: 'live', overlay: null, seriesId: String(seriesId), slug: hawkSlug, champ: hawkChamp }, { replace: false });
                return;
              }
              // 直播：OpenDota matchId（无 DLTV slug），保留弹窗
              navigate({ page: 'matches', overlay: { type: 'match', matchId: String(numericId) } }, { replace: false });
            }}
          />
        ) : page === 'match' && route.matchId ? (
          <SeriesMatchPage
            matchId={route.matchId}
            slug={route.slug}
            onBack={() => navigate({ page: 'matches', overlay: null }, { replace: false })}
            onOpenTeam={handleOpenTeam}
          />
        ) : page === 'live' && route.seriesId ? (
          <LiveMatchDetailPage
            seriesId={route.seriesId}
            slug={route.slug}
            champ={route.champ}
            onBack={() => navigate({ page: 'matches', overlay: null }, { replace: false })}
            onOpenTeam={handleOpenTeam}
          />
        ) : page === 'news' && route.newsId ? (
          <NewsDetailPage
            newsId={route.newsId}
            onBack={() => navigate({ page: 'news', overlay: null }, { replace: false })}
          />
        ) : page === 'news' ? (
          <NewsPage />
        ) : page === 'teams' ? (
          <TeamsPage onOpenTeam={handleOpenTeam} />
        ) : page === 'team' && route.teamName ? (
          <TeamDetailPage
            teamName={route.teamName}
            teamId={route.teamId}
            teamSlug={route.teamSlug}
            onBack={() => navigate({ page: 'teams', overlay: null }, { replace: false })}
          />
        ) : (
          <TopLevelPlaceholder page={page} onBack={() => goTo('home')} />
        )}
      </main>

      <nav aria-label="移动端主导航" className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-6 border-t border-white/10 bg-[#071017]/95 px-1 py-2 backdrop-blur-xl lg:hidden">
        {mobileNavItems.map((item, index) => (
          <Button
            key={`${item.page}-${index}`}
            variant="ghost"
            className={`h-14 flex-col gap-1 rounded-xl text-xs ${page === item.page ? 'text-red-400' : 'text-slate-400'}`}
            onClick={() => goTo(item.page)}
          >
            <item.icon className="size-5" />
            {item.label}
          </Button>
        ))}
      </nav>

      <Footer lastUpdated={new Date().toISOString()} />

      {/* matches 页的直播比赛弹窗（无 DLTV slug 的 OpenDota matchId） */}
      {page === 'matches' && route.overlay?.type === 'match' && Number.isFinite(Number(route.overlay.matchId)) && (
        <MatchDetailModal
          matchId={Number(route.overlay.matchId)}
          open
          onOpenChange={(open) => { if (!open) closeOverlay(); }}
          fullPage
        />
      )}
    </div>
  );
}

export default App;
