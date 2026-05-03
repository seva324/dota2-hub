import { Bell, CalendarDays, Home, Moon, Search, Shield, UserCircle, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HomeDashboard } from '@/sections/HomeDashboard';
import { Footer } from '@/sections/Footer';

const desktopNavItems = ['首页', '赛事', '比赛', '战队', '选手'];

const mobileNavItems = [
  { label: '首页', icon: Home },
  { label: '赛程', icon: CalendarDays },
  { label: '战队', icon: Shield },
  { label: '选手', icon: Users },
  { label: '我的', icon: UserCircle },
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
  return (
    <div className="min-h-screen bg-[#05090d] text-foreground">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[#05090d]/88 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1480px] items-center gap-5 px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <DotaHubMark />
            <span className="text-xl font-black tracking-tight text-white">DotaHub</span>
          </div>

          <nav aria-label="主导航" className="hidden h-full items-center gap-1 lg:flex">
            {desktopNavItems.map((item) => (
              <Button
                key={item}
                variant="ghost"
                className="h-full rounded-none border-b-2 border-transparent px-4 text-sm font-semibold text-slate-300 hover:border-red-500 hover:bg-transparent hover:text-white"
              >
                {item}
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
        <HomeDashboard />
      </main>

      <nav aria-label="移动端主导航" className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-white/10 bg-[#071017]/95 px-2 py-2 backdrop-blur-xl lg:hidden">
        {mobileNavItems.map((item, index) => (
          <Button
            key={item.label}
            variant="ghost"
            className={`h-14 flex-col gap-1 rounded-xl text-xs ${index === 0 ? 'text-red-400' : 'text-slate-400'}`}
          >
            <item.icon className="size-5" />
            {item.label}
          </Button>
        ))}
      </nav>

      <Footer lastUpdated={new Date().toISOString()} />
    </div>
  );
}

export default App;
