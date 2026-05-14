import { useState, useEffect, type ComponentType, type ReactNode } from 'react';
import { CalendarDays, Flame, Play, Shield, Trophy, UserRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MatchDetailModal } from '@/components/custom/MatchDetailModal';
import { PlayerProfileFlyout } from '@/components/custom/PlayerProfileFlyout';
import { SafeImg } from '@/components/custom/SafeImg';
import { TeamFlyout } from '@/components/custom/TeamFlyout';
import { HeroSection } from '@/sections/HeroSection';
import type { LiveHeroPayload } from '@/sections/HeroSection';
import { MatchesDashboard } from '@/sections/MatchesDashboard';
import { usePrototypeMode } from '@/lib/prototypeMode';
import { createMinimalPlayerFlyoutModel, fetchPlayerProfileFlyoutModel } from '@/lib/playerProfile';
import type { PlayerFlyoutModel } from '@/lib/playerProfile';

const nowTs = () => Math.floor(Date.now() / 1000);

const prototypeTeams = [
  { team_id: '1', name: 'XG', tag: 'XG', logo_url: '/images/mirror/teams/xtreme-gaming-ranking-dark.webp', region: 'China', is_cn_team: true },
  { team_id: '2', name: 'Team Spirit', tag: 'Spirit', logo_url: '/images/mirror/teams/team-spirit-white.svg', region: 'EU' },
  { team_id: '3', name: 'Falcons', tag: 'Falcons', logo_url: '/images/mirror/teams/team-falcons-ranking-dark.webp', region: 'MENA' },
  { team_id: '4', name: 'Tundra', tag: 'Tundra', logo_url: '/images/mirror/teams/tundra-esports-white.svg', region: 'EU' },
  { team_id: '5', name: 'Liquid', tag: 'Liquid', logo_url: '/images/mirror/teams/team-liquid-white.svg', region: 'EU' },
  { team_id: '6', name: 'Aurora', tag: 'Aurora', logo_url: '/images/mirror/teams/aurora-ranking-dark.png', region: 'SEA' },
  { team_id: '7', name: 'Yakult Brothers', tag: 'YB', logo_url: '/images/mirror/teams/yakult-brothers.svg', region: 'China', is_cn_team: true },
];

const teamLogoMap: Record<string, string> = {
  XG: '/images/mirror/teams/xtreme-gaming-ranking-dark.webp',
  'Team Spirit': '/images/mirror/teams/team-spirit-white.svg',
  Falcons: '/images/mirror/teams/team-falcons-ranking-dark.webp',
  Tundra: '/images/mirror/teams/tundra-esports-white.svg',
  Liquid: '/images/mirror/teams/team-liquid-white.svg',
  Aurora: '/images/mirror/teams/aurora-ranking-dark.png',
  YB: '/images/mirror/teams/yakult-brothers.svg',
  'Yakult Brothers': '/images/mirror/teams/yakult-brothers.svg',
  GG: '/images/mirror/teams/gaimin-gladiators.svg',
  Spirit: '/images/mirror/teams/team-spirit-white.svg',
  'Xtreme Gaming': '/images/mirror/teams/xtreme-gaming-ranking-dark.webp',
  'Team Falcons': '/images/mirror/teams/team-falcons-ranking-dark.webp',
  'Tundra Esports': '/images/mirror/teams/tundra-esports-white.svg',
};

const hotTeams = [
  { name: 'Team Spirit', rating: 2132, trend: 'up' as const },
  { name: 'XG', rating: 2031, trend: 'up' as const },
  { name: 'Falcons', rating: 1960, trend: 'down' as const },
  { name: 'Tundra', rating: 1899, trend: 'up' as const },
  { name: 'Liquid', rating: 1850, trend: 'down' as const },
];

const filters = ['全部', 'S 级赛事', '中国战队', 'DreamLeague', 'ESL One', 'PGL'];
const featuredUpcomingCards = [
  { time: '19:00', event: 'DreamLeague S23', left: 'XG', right: 'Aurora', bo: 'BO3' },
  { time: '22:00', event: 'ESL One 伯明翰', left: 'Liquid', right: 'Tundra', bo: 'BO3' },
  { time: '01:00 明天', event: 'PGL Wallachia S4', left: 'Team Spirit', right: 'Falcons', bo: 'BO3' },
];

const DEFAULT_FEATURED_EVENT = {
  badge: 'LIVE',
  title: 'DreamLeague S23',
  subtitle: '小组赛 · Day 5',
  ctaLabel: '观看直播',
};

const prototypeUpcoming = [
  {
    match_id: '9301',
    start_time: nowTs() + 3600,
    series_type: 'BO3',
    radiant_team_id: '1',
    dire_team_id: '6',
    radiant_team_name: 'XG',
    dire_team_name: 'Aurora',
    tournament_name: 'DreamLeague S23',
  },
  {
    match_id: '9302',
    start_time: nowTs() + 7200,
    series_type: 'BO3',
    radiant_team_id: '2',
    dire_team_id: '4',
    radiant_team_name: 'Team Spirit',
    dire_team_name: 'Tundra',
    tournament_name: 'ESL One 伯明翰',
  },
];

const mockLiveHeroes: LiveHeroPayload[] = [
  {
    source: 'mock',
    leagueName: 'DreamLeague S23',
    stage: '小组赛',
    bestOf: 3,
    seriesScore: '1:0',
    live: true,
    startedAt: Math.floor(Date.now() / 1000) - 1427,
    teams: [
      { side: 'team1', name: 'Xtreme Gaming', logo: null },
      { side: 'team2', name: 'Yakult Brothers', logo: null },
    ],
    maps: [
      { matchId: '9201', label: 'Map 1', status: 'live', score: '18-9', team1Score: 18, team2Score: 9, team1NetWorthLead: 9400, team1TotalGold: 47600, team2TotalGold: 38200, gameTime: 1427 },
      { matchId: '9202', label: 'Map 2', status: 'completed', result: 'team1', team1Score: 24, team2Score: 16, gameTime: 1716 },
      { matchId: '9203', label: 'Map 3', status: 'completed', result: 'team2', team1Score: 11, team2Score: 19, gameTime: 1512 },
    ],
    liveMap: { matchId: '9201', label: 'Map 1', score: '18-9', status: 'live', gameTime: 1427, team1Score: 18, team2Score: 9, team1NetWorthLead: 9400, team1TotalGold: 47600, team2TotalGold: 38200 },
  },
  {
    source: 'mock',
    leagueName: 'ESL One 伯明翰',
    stage: '小组赛',
    bestOf: 3,
    seriesScore: '1:1',
    live: true,
    startedAt: Math.floor(Date.now() / 1000) - 735,
    teams: [
      { side: 'team1', name: 'Team Spirit', logo: null },
      { side: 'team2', name: 'GG', logo: null },
    ],
    maps: [
      { matchId: '9301', label: 'Map 1', status: 'completed', result: 'team1' },
      { matchId: '9302', label: 'Map 2', status: 'completed', result: 'team2' },
      { matchId: '9303', label: 'Map 3', status: 'live', score: '7-4', team1Score: 7, team2Score: 4, team1NetWorthLead: 2800, team1TotalGold: 22100, team2TotalGold: 19300, gameTime: 735 },
    ],
    liveMap: { matchId: '9303', label: 'Map 3', score: '7-4', status: 'live', gameTime: 735, team1Score: 7, team2Score: 4, team1NetWorthLead: 2800, team1TotalGold: 22100, team2TotalGold: 19300 },
  },
  {
    source: 'mock',
    leagueName: 'PGL Wallachia S4',
    stage: '小组赛',
    bestOf: 3,
    seriesScore: '0:1',
    live: true,
    startedAt: Math.floor(Date.now() / 1000) - 1022,
    teams: [
      { side: 'team1', name: 'Team Falcons', logo: null },
      { side: 'team2', name: 'Tundra Esports', logo: null },
    ],
    maps: [
      { matchId: '9401', label: 'Map 1', status: 'completed', result: 'team2' },
      { matchId: '9402', label: 'Map 2', status: 'live', score: '10-16', team1Score: 10, team2Score: 16, team1NetWorthLead: -6100, team1TotalGold: 31500, team2TotalGold: 37600, gameTime: 1022 },
      { matchId: '9403', label: 'Map 3', status: 'completed', result: 'team2', team1Score: 13, team2Score: 23, gameTime: 1824 },
    ],
    liveMap: { matchId: '9402', label: 'Map 2', score: '10-16', status: 'live', gameTime: 1022, team1Score: 10, team2Score: 16, team1NetWorthLead: -6100, team1TotalGold: 31500, team2TotalGold: 37600 },
  },
];

const prototypeMatches = [
  {
    match_id: '9201',
    start_time: nowTs() - 3600,
    series_type: 'BO3',
    radiant_team_id: '1',
    dire_team_id: '7',
    radiant_team_name: 'XG',
    dire_team_name: 'Yakult Brothers',
    radiant_score: 2,
    dire_score: 0,
    radiant_win: 1,
    tournament_name: 'DreamLeague S23',
    team_hero_ids: [1, 10, 2, 86, 5],
  },
  {
    match_id: '9202',
    start_time: nowTs() - 26 * 3600,
    series_type: 'BO3',
    radiant_team_id: '1',
    dire_team_id: '4',
    radiant_team_name: 'XG',
    dire_team_name: 'Tundra',
    radiant_score: 2,
    dire_score: 1,
    radiant_win: 1,
    tournament_name: 'ESL One 伯明翰',
    team_hero_ids: [8, 75, 106, 129, 31],
  },
];
type HotPlayer = {
  name: string;
  accountId: number;
  teamName: string;
  nationality?: string | null;
  score?: string;
  avatarUrl?: string | null;
};

const hotPlayers: HotPlayer[] = [
  { name: 'Ame', accountId: 898754153, teamName: 'XG', nationality: 'CN', score: '12.4k' },
  { name: 'Yatoro', accountId: 321580662, teamName: 'Team Spirit', nationality: 'UA', score: '10.8k' },
  { name: '23savage', accountId: 185437126, teamName: 'Aurora', nationality: 'TH', score: '9.2k' },
  { name: 'Collapse', accountId: 302214028, teamName: 'Team Spirit', nationality: 'RU', score: '8.1k' },
  { name: 'dyrachyo', accountId: 116585378, teamName: 'Gaimin Gladiators', nationality: 'RU', score: '7.6k' },
];

type RailNewsItem = {
  id: string;
  title: string;
  summary?: string;
  url: string;
  image_url?: string;
  published_at: number;
  source: string;
  category?: string;
};

const railNewsCategoryLabels: Record<string, string> = {
  patch: '版本',
  gameplay: '版本',
  esports: '赛事',
  tournament: '赛事',
  community: '社区',
  news: '新闻',
  takes: '观点',
};

function createSidebarPlayerModel(player: HotPlayer): PlayerFlyoutModel {
  const minimal = createMinimalPlayerFlyoutModel(player.accountId);
  return {
    ...minimal,
    playerName: player.name,
    teamName: player.teamName || null,
    nationality: player.nationality || null,
    avatarUrl: player.avatarUrl || null,
  };
}

function mergePlayerModel(fallback: PlayerFlyoutModel, incoming: PlayerFlyoutModel | null): PlayerFlyoutModel {
  if (!incoming) return fallback;
  const apiNameIsOnlyAccountId = incoming.playerName === String(fallback.accountId);
  return {
    ...fallback,
    ...incoming,
    playerName: !incoming.playerName || apiNameIsOnlyAccountId ? fallback.playerName : incoming.playerName,
    nationality: incoming.nationality || fallback.nationality,
    teamName: incoming.teamName || fallback.teamName,
    teamLogoUrl: incoming.teamLogoUrl || fallback.teamLogoUrl,
    avatarUrl: incoming.avatarUrl || fallback.avatarUrl,
  };
}

function formatRailDate(timestamp: number): string {
  if (!timestamp) return '刚刚';
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }).replace('/', '-');
}

function getNewsCategoryLabel(category?: string): string {
  return railNewsCategoryLabels[String(category || '').toLowerCase()] || '新闻';
}

function MobileMatchToolbar() {
  return (
    <section className="lg:hidden">
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex rounded-2xl border border-white/10 bg-white/[0.045] p-1 text-sm text-slate-300">
          {['全部', 'LIVE', '即将开始', '已结束'].map((label, index) => (
            <button
              key={label}
              type="button"
              className={`rounded-xl px-3 py-2 ${index === 0 ? 'bg-red-600 text-white shadow-lg shadow-red-950/40' : ''}`}
            >
              {label === 'LIVE' ? (
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block size-1.5 rounded-full bg-red-400 animate-pulse" />
                  {label}
                </span>
              ) : label}
            </button>
          ))}
        </div>
        <div className="hidden items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.045] px-3 py-2 text-sm text-slate-300 min-[440px]:flex">
          <CalendarDays className="size-4" />
          5月18日 周日
        </div>
      </div>
    </section>
  );
}

type FeaturedCard = { time: string; event: string; left: string; right: string; bo: string; leftLogo?: string | null; rightLogo?: string | null };

type FeaturedSpotlight = {
  badge: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
};

function buildFeaturedEventAccent(title: string) {
  const seasonMatch = title.match(/\bS(?:EASON)?\s*(\d+)\b/i);
  const monogram = title
    .split(/[\s:/-]+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'DH';

  return {
    monogram,
    season: seasonMatch ? `S${seasonMatch[1]}` : null,
  };
}

function formatBannerTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const utcMs = date.getTime() + date.getTimezoneOffset() * 60000;
  const cst = new Date(utcMs + 8 * 3600000);
  return `${(cst.getMonth() + 1).toString().padStart(2, '0')}/${cst.getDate().toString().padStart(2, '0')} ${cst.getHours().toString().padStart(2, '0')}:${cst.getMinutes().toString().padStart(2, '0')} CST`;
}

function formatBannerBestOf(value?: string | number | null): string {
  if (value === null || value === undefined || value === '') return 'BO3';
  if (typeof value === 'number' && Number.isFinite(value)) return `BO${value}`;
  const normalized = String(value).trim().toUpperCase();
  if (!normalized) return 'BO3';
  if (normalized.startsWith('BO')) return normalized;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? `BO${parsed}` : normalized;
}

function FeaturedEventBanner({
  upcomingCards = featuredUpcomingCards as FeaturedCard[],
  spotlight = DEFAULT_FEATURED_EVENT,
}: {
  upcomingCards?: FeaturedCard[];
  spotlight?: FeaturedSpotlight;
}) {
  const accent = buildFeaturedEventAccent(spotlight.title);

  return (
    <section className="hidden overflow-hidden rounded-2xl border border-border/30 bg-[radial-gradient(circle_at_20%_50%,rgba(185,28,28,0.28),rgba(15,23,42,0.86)_45%,rgba(2,6,23,0.92))] p-4 shadow-[var(--shadow-elevated)] lg:block">
      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="relative overflow-hidden min-h-48 rounded-xl border border-red-400/25 p-5" style={{background: 'linear-gradient(135deg, rgba(100,8,8,0.92) 0%, rgba(60,5,5,0.88) 40%, rgba(5,5,22,0.95) 100%)'}}>
          {/* layered radial glows */}
          <div className="absolute inset-0 pointer-events-none" style={{background: 'radial-gradient(ellipse at 15% 55%, rgba(220,38,38,0.35) 0%, transparent 60%)'}} />
          <div className="absolute inset-0 pointer-events-none" style={{background: 'radial-gradient(ellipse at 85% 20%, rgba(239,68,68,0.18) 0%, transparent 50%)'}} />
          {/* Large tournament emblem decoration */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2 select-none pointer-events-none flex flex-col items-center opacity-[0.07]">
            <div className="text-[88px] font-black leading-none tracking-tighter text-white">{accent.monogram}</div>
            {accent.season && <div className="text-[22px] font-bold leading-none tracking-widest text-white -mt-1">{accent.season}</div>}
          </div>
          {/* Subtle top-right corner shine */}
          <div className="absolute top-0 right-0 size-24 pointer-events-none" style={{background: 'radial-gradient(circle at 100% 0%, rgba(255,100,100,0.12), transparent 70%)'}} />
          {/* Content */}
          <div className="relative z-10 flex h-full flex-col justify-between">
            <div>
              <Badge className="mb-3 border border-red-300/40 bg-red-600/90 px-2 text-[11px] font-semibold text-white">
                <span className="mr-1 inline-block size-1.5 rounded-full bg-white animate-pulse" />
                {spotlight.badge}
              </Badge>
              <h2 className="text-2xl font-extrabold tracking-tight text-white drop-shadow-sm">{spotlight.title}</h2>
              <p className="mt-1 text-sm text-red-200/70">{spotlight.subtitle}</p>
            </div>
            <Button size="sm" className="mt-6 w-fit border border-white/20 bg-white/10 text-white hover:bg-white/20">
              <Play className="mr-1.5 size-3.5 fill-white" />
              {spotlight.ctaLabel}
            </Button>
          </div>
        </div>
        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
              <CalendarDays className="size-4 text-slate-400" />
              即将开始
            </div>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-slate-400">完整赛程</Button>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            {upcomingCards.map((card) => (
                <div key={`${card.time}-${card.left}`} className="rounded-xl border border-white/8 bg-white/[0.045] p-4">
                  <div className="text-sm font-bold text-white">{card.time}</div>
                  <div className="text-xs text-slate-400">{card.event}</div>
                  <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
                    <div className="flex flex-col items-center gap-1.5">
                      <div className="size-8 rounded-full flex items-center justify-center text-xs font-bold text-white overflow-hidden bg-slate-700">
                        <SafeImg src={card.leftLogo || teamLogoMap[card.left]} alt={card.left} className="size-full object-contain" fallback={<span>{card.left.substring(0, 2).toUpperCase()}</span>} />
                      </div>
                      <span className="text-xs text-slate-200">{card.left}</span>
                    </div>
                    <span className="text-xs text-slate-500">VS</span>
                    <div className="flex flex-col items-center gap-1.5">
                      <div className="size-8 rounded-full flex items-center justify-center text-xs font-bold text-white overflow-hidden bg-slate-700">
                        <SafeImg src={card.rightLogo || teamLogoMap[card.right]} alt={card.right} className="size-full object-contain" fallback={<span>{card.right.substring(0, 2).toUpperCase()}</span>} />
                      </div>
                      <span className="text-xs text-slate-200">{card.right}</span>
                    </div>
                  </div>
                  <div className="mt-3 text-center text-xs text-slate-400">{card.bo}</div>
                </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function RailPanel({ title, icon: Icon, children }: {
  title: string;
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border/40 bg-card p-4 shadow-[var(--shadow-elevated)] backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-red-300" />
          <h2 className="text-base font-extrabold text-foreground tracking-tight">{title}</h2>
        </div>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-slate-400">更多</Button>
      </div>
      {children}
    </section>
  );
}

function formatGameTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function LiveMatchCard({ data, onClick }: { data: LiveHeroPayload; onClick?: () => void }) {
  const liveMap = data.liveMap;
  const team1 = data.teams[0];
  const team2 = data.teams[1];

  return (
    <button
      type="button"
      className="w-full text-left rounded-xl border border-red-500/30 bg-slate-800/80 p-4 hover:border-red-500/50 transition-all shadow-[0_0_20px_rgba(239,68,68,0.12)] hover:shadow-[0_0_30px_rgba(239,68,68,0.22)]"
      onClick={onClick}
    >
      <style>{`
        @keyframes livePulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(239,68,68,0.6); }
          50% { opacity: 0.85; box-shadow: 0 0 0 4px rgba(239,68,68,0); }
        }
        .animate-live-pulse { animation: livePulse 1.8s ease-in-out infinite; }
      `}</style>
      <div className="mb-3 flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded bg-red-600/80 px-2 py-0.5 text-[11px] font-bold text-white animate-live-pulse">
          <span className="size-1.5 rounded-full bg-white" />
          LIVE
        </span>
        <span className="text-sm text-slate-400">{data.leagueName} · {data.stage}</span>
        <span className="ml-auto text-xs font-semibold text-slate-500">{data.seriesScore}</span>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <div className="flex items-center gap-3 justify-end">
          <span className="text-sm font-semibold text-white">{team1.name}</span>
          <SafeImg
            src={teamLogoMap[team1.name]}
            alt={team1.name}
            className="size-14 object-contain"
            fallback={<div className="size-14 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-400">{team1.name.substring(0, 2).toUpperCase()}</div>}
          />
        </div>
        <div className="text-center">
          {liveMap?.score ? (
            <>
              <div className="text-2xl font-bold tabular-nums text-white">{liveMap.score}</div>
              <div className="text-xs tabular-nums text-slate-400">{formatGameTime(liveMap.gameTime ?? 0)}</div>
            </>
          ) : (
            <div className="text-sm text-slate-400">暂无数据</div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <SafeImg
            src={teamLogoMap[team2.name]}
            alt={team2.name}
            className="size-14 object-contain"
            fallback={<div className="size-14 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-400">{team2.name.substring(0, 2).toUpperCase()}</div>}
          />
          <span className="text-sm font-semibold text-white">{team2.name}</span>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        {data.maps.length > 0 && (
          <div className="flex gap-1.5 flex-1">
            {data.maps.map((map) => (
              <div
                key={map.matchId}
                className={`flex-1 rounded-md px-2 py-1.5 text-center ${
                  map.status === 'live'
                    ? 'border border-red-500/50 bg-red-500/10'
                    : map.status === 'completed'
                    ? 'border border-white/5 bg-slate-700/50'
                    : 'border border-white/5 opacity-40'
                }`}
              >
                <div className={`text-[10px] font-medium ${
                  map.status === 'live' ? 'text-red-300' : 'text-slate-400'
                }`}>
                  {map.label}
                </div>
                {map.score && (
                  <div className={`text-[10px] font-semibold tabular-nums mt-0.5 ${
                    map.status === 'live' ? 'text-white' : 'text-slate-500'
                  }`}>
                    {map.score}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <Button size="sm" className="shrink-0 border border-red-400/30 bg-red-500/15 text-red-200 hover:bg-red-500/25 h-8 px-3 text-xs">
          <Play className="mr-1 size-3 fill-red-300" />
          观看
        </Button>
      </div>
    </button>
  );
}

function UpcomingMatchCard({ data, onClick }: { data: typeof prototypeUpcoming[number]; onClick?: () => void }) {
  const [countdown, setCountdown] = useState(() => Math.max(0, data.start_time - nowTs()));

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(Math.max(0, data.start_time - nowTs()));
    }, 1000);
    return () => clearInterval(timer);
  }, [data.start_time]);

  const hours = Math.floor(countdown / 3600);
  const minutes = Math.floor((countdown % 3600) / 60);
  const seconds = countdown % 60;

  return (
    <button
      type="button"
      className="w-full text-left rounded-xl border border-white/10 bg-gradient-to-br from-slate-800/90 via-slate-800/70 to-slate-900/60 p-4 hover:border-white/20 transition-colors"
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="inline-flex items-center gap-1 rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] text-indigo-300">
          <CalendarDays className="size-3" />
          即将开始
        </span>
        <span className="text-xs rounded bg-slate-700 px-2 py-0.5 text-slate-300">{data.series_type}</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="flex items-center gap-2 justify-end">
          <span className="text-sm font-semibold text-white truncate">{data.radiant_team_name}</span>
          <SafeImg
            src={teamLogoMap[data.radiant_team_name]}
            alt={data.radiant_team_name}
            className="size-12 object-contain"
            fallback={<div className="size-12 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-400">{data.radiant_team_name.substring(0, 2).toUpperCase()}</div>}
          />
        </div>
        <span className="text-xs text-slate-500">VS</span>
        <div className="flex items-center gap-2">
          <SafeImg
            src={teamLogoMap[data.dire_team_name]}
            alt={data.dire_team_name}
            className="size-12 object-contain"
            fallback={<div className="size-12 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-400">{data.dire_team_name.substring(0, 2).toUpperCase()}</div>}
          />
          <span className="text-sm font-semibold text-white truncate">{data.dire_team_name}</span>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <Badge variant="secondary" className="bg-slate-700/50 text-slate-300 border-0 text-[10px]">{data.tournament_name}</Badge>
        <div className="flex items-center gap-0.5 tabular-nums">
          {countdown > 0 ? (
            <>
              {hours > 0 && <><span className="text-sm font-bold text-amber-300">{String(hours).padStart(2, '0')}</span><span className="text-xs text-slate-500 mx-0.5">:</span></>}
              <span className="text-sm font-bold text-amber-300">{String(minutes).padStart(2, '0')}</span>
              <span className="text-xs text-slate-500 mx-0.5">:</span>
              <span className="text-sm font-bold text-amber-300">{String(seconds).padStart(2, '0')}</span>
            </>
          ) : (
            <span className="text-sm font-semibold text-emerald-400">即将开始</span>
          )}
        </div>
      </div>
    </button>
  );
}

interface PrototypeDashboardContentProps {
  onOpenMatch: (matchId: string, seriesMaps?: Array<{
    label: string;
    matchId: string;
    radiantScore?: number;
    direScore?: number;
    duration?: number;
  }>) => void;
  onOpenTeam: (teamName: string) => void;
  onOpenPlayer: (player: HotPlayer) => void;
}

function PrototypeDashboardContent({ onOpenMatch, onOpenTeam, onOpenPlayer }: PrototypeDashboardContentProps) {
  const [activeTab, setActiveTab] = useState('全部比赛');
  const liveCount = mockLiveHeroes.length;
  const upcomingCount = prototypeUpcoming.length;
  const tabs = [
    { label: '全部比赛', count: liveCount + upcomingCount },
    { label: '即将开始', count: upcomingCount },
    { label: '已结束', count: 0 },
  ];

  return (
    <div className="flex gap-4">
      {/* Left column */}
      <div className="w-2/3 flex flex-col gap-4 min-w-0">
        <div className="flex gap-1 rounded-xl border border-border/40 bg-secondary/40 p-1">
          {tabs.map((tab) => (
            <button
              key={tab.label}
              type="button"
              className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.label
                  ? 'bg-red-600 text-white shadow-lg shadow-red-950/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              onClick={() => setActiveTab(tab.label)}
            >
              {tab.label}
              <span className={`inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                activeTab === tab.label ? 'bg-white/20 text-white' : 'bg-white/10 text-slate-300'
              }`}>{tab.count}</span>
            </button>
          ))}
        </div>

        {mockLiveHeroes.map((hero) => (
          <LiveMatchCard
            key={hero.leagueName}
            data={hero}
            onClick={() => {
              const seriesMaps = hero.maps.map((m) => ({
                label: m.label,
                matchId: String(m.matchId ?? ''),
                radiantScore: m.team1Score ?? undefined,
                direScore: m.team2Score ?? undefined,
                duration: m.gameTime ?? undefined,
              }));
              onOpenMatch(String(hero.liveMap?.matchId ?? hero.maps[0]?.matchId ?? ''), seriesMaps);
            }}
          />
        ))}

        <div className="border-t border-white/[0.06] pt-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-300">
          <CalendarDays className="size-4 text-slate-400" />
          即将开始
        </div>
        </div>

        {prototypeUpcoming.map((match) => (
          <UpcomingMatchCard
            key={match.match_id}
            data={match}
            onClick={() => onOpenMatch(match.match_id)}
          />
        ))}
      </div>

      {/* Right column */}
      <aside className="w-1/3 flex flex-col gap-5 min-w-0">
        <section className="rounded-2xl border border-border/40 bg-card p-4 shadow-[var(--shadow-card)]">
          <div className="mb-3 flex items-center gap-2">
            <Shield className="size-4 text-red-300" />
            <h2 className="text-base font-extrabold text-foreground tracking-tight">热门战队</h2>
            <Badge className="bg-amber-500/15 text-amber-300 border-0 text-[10px]">实时排名</Badge>
          </div>
          <div className="flex flex-col gap-2.5">
            {hotTeams.map((team, index) => (
              <button
                key={team.name}
                type="button"
                className="group flex w-full items-center gap-2 rounded-xl border border-border/30 bg-secondary/40 px-3 py-2 text-left transition-all hover:border-border/60 hover:bg-secondary/60 hover:shadow-[var(--shadow-glow)]"
                onClick={() => onOpenTeam(team.name)}
              >
                <span className="w-4 shrink-0 text-xs font-bold text-amber-300">{index + 1}</span>
                <SafeImg src={teamLogoMap[team.name]} alt={team.name} className="size-7 shrink-0 object-contain group-hover:scale-110 transition-transform" fallback={<div className="size-7 shrink-0 rounded-full bg-slate-700" />} />
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-100 group-hover:text-white transition-colors">{team.name}</span>
                  <span className="block text-xs text-muted-foreground group-hover:hidden">{team.rating} ELO</span>
                  <span className="hidden text-[10px] text-red-300/80 group-hover:block">点击查看详情 →</span>
                </div>
                <span className="text-xs tabular-nums text-slate-400 group-hover:hidden">{team.rating}</span>
                <span className={`text-base font-bold ${team.trend === 'up' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {team.trend === 'up' ? '↑' : '↓'}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-border/40 bg-card p-4 shadow-[var(--shadow-card)]">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserRound className="size-4 text-red-300" />
              <h2 className="text-base font-extrabold text-foreground tracking-tight">热门选手</h2>
            </div>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px] text-red-300 hover:text-red-200">查看全部</Button>
          </div>
          <div className="flex flex-col gap-2.5">
            {hotPlayers.map((player, index) => (
              <button
                key={player.accountId}
                type="button"
                className="group flex w-full items-center gap-2 rounded-xl border border-border/30 bg-secondary/40 px-3 py-2 text-left transition-all hover:border-slate-600 hover:bg-white/[0.08]"
                onClick={() => onOpenPlayer(player)}
              >
                <span className="w-4 shrink-0 text-xs font-bold text-amber-300">{index + 1}</span>
                <div className="size-7 shrink-0 rounded-full bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-300 border border-white/10">
                  {player.name.slice(0, 2)}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-100 group-hover:text-white transition-colors">{player.name}</span>
                  <span className="block text-xs text-muted-foreground">{player.teamName}</span>
                </div>
                <span className="text-xs tabular-nums text-slate-400">{player.score}</span>
              </button>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}

export function HomeDashboard() {
  const prototypeMode = usePrototypeMode();
  const devPlayer = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('devPlayer');
  const devMatch = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('devMatch');
  const devTeam = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('devTeam');
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(devMatch ? 7777 : null);
  const [selectedSeriesMaps, setSelectedSeriesMaps] = useState<Array<{
    label: string;
    matchId: string;
    radiantScore?: number;
    direScore?: number;
    duration?: number;
  }>>(devMatch ? [
    { label: '地图 1', matchId: '7777', radiantScore: 23, direScore: 18 },
    { label: '地图 2', matchId: '7778', radiantScore: 15, direScore: 29 },
    { label: '地图 3', matchId: '7779', radiantScore: 20, direScore: 15 },
  ] : []);
  const [selectedTeamName, setSelectedTeamName] = useState<string | null>(devTeam ? 'XG' : null);
  const [selectedPlayer, setSelectedPlayer] = useState<HotPlayer | null>(devPlayer ? hotPlayers[0] : null);
  const [playerModel, setPlayerModel] = useState<PlayerFlyoutModel | null>(devPlayer ? createSidebarPlayerModel(hotPlayers[0]) : null);

  const [eptTeams, setEptTeams] = useState<Array<{ rank: number; name: string; logo: string | null; points: number }>>([]);
  const [upcomingMatches, setUpcomingMatches] = useState<any[]>([]);
  const [featuredSpotlight, setFeaturedSpotlight] = useState<FeaturedSpotlight | null>(null);
  const [liveMatchCount, setLiveMatchCount] = useState(0);
  const [railNews, setRailNews] = useState<RailNewsItem[]>([]);
  const [dashboardHotPlayers, setDashboardHotPlayers] = useState<HotPlayer[]>(
    hotPlayers.map(({ name, accountId, teamName, nationality }) => ({
      name,
      accountId,
      teamName,
      nationality,
    }))
  );

  useEffect(() => {
    if (prototypeMode) return;

    const fetchData = async () => {
      const hotPlayerRequests = hotPlayers.map(async (seed) => {
        try {
          const response = await fetch(`/api/pro-players?account_id=${seed.accountId}`);
          if (!response.ok) return seed;
          const payload = await response.json();
          if (!payload || typeof payload !== 'object') return seed;
          return {
            name: payload.name || seed.name,
            accountId: seed.accountId,
            teamName: payload.team_name || seed.teamName,
            nationality: payload.country_code ? String(payload.country_code).toUpperCase() : (seed.nationality || null),
            avatarUrl: payload.avatar_url || null,
          } satisfies HotPlayer;
        } catch {
          return seed;
        }
      });

      const [eptResult, upcomingResult, liveResult, newsResult, hotPlayersResult] = await Promise.allSettled([
        fetch('/api/ept-ranking'),
        fetch('/api/upcoming?limit=3'),
        fetch('/api/live-hero'),
        fetch('/api/news'),
        Promise.all(hotPlayerRequests),
      ]);

      if (eptResult.status === 'fulfilled' && eptResult.value.ok) {
        try {
          const eptData = await eptResult.value.json();
          setEptTeams(eptData.teams?.slice(0, 5) || []);
        } catch {
          setEptTeams([]);
        }
      }

      if (upcomingResult.status === 'fulfilled' && upcomingResult.value.ok) {
        try {
          const upcomingData = await upcomingResult.value.json();
          setUpcomingMatches(upcomingData.upcoming || []);
        } catch {
          setUpcomingMatches([]);
        }
      }

      if (liveResult.status === 'fulfilled' && liveResult.value.ok) {
        try {
          const liveData = await liveResult.value.json();
          const liveMatches = Array.isArray(liveData?.liveMatches)
            ? liveData.liveMatches
            : liveData?.live
              ? [liveData.live]
              : [];
          const spotlightMatch = liveMatches[0];
          setLiveMatchCount(liveMatches.length);

          if (spotlightMatch) {
            setFeaturedSpotlight({
              badge: 'LIVE',
              title: spotlightMatch.leagueName || DEFAULT_FEATURED_EVENT.title,
              subtitle: [
                spotlightMatch.stage,
                formatBannerBestOf(spotlightMatch.bestOf),
              ].filter(Boolean).join(' · ') || DEFAULT_FEATURED_EVENT.subtitle,
              ctaLabel: '观看直播',
            });
          } else {
            setFeaturedSpotlight(null);
          }
        } catch {
          setLiveMatchCount(0);
          setFeaturedSpotlight(null);
        }
      } else {
        setLiveMatchCount(0);
        setFeaturedSpotlight(null);
      }

      if (newsResult.status === 'fulfilled' && newsResult.value.ok) {
        try {
          const newsData = await newsResult.value.json();
          setRailNews(Array.isArray(newsData) ? newsData.slice(0, 4) : []);
        } catch {
          setRailNews([]);
        }
      }

      if (hotPlayersResult.status === 'fulfilled') {
        setDashboardHotPlayers(hotPlayersResult.value);
      } else {
        console.error('Failed to fetch dashboard data:', hotPlayersResult.reason);
      }
    };

    void fetchData();
  }, [prototypeMode]);

  const handleOpenMatch = (matchId: number | string, seriesMaps: Array<{
    label: string;
    matchId: string;
    radiantScore?: number;
    direScore?: number;
    duration?: number;
  }> = []) => {
    const numericId = typeof matchId === 'string' ? Number(matchId) : matchId;
    if (Number.isFinite(numericId)) {
      setSelectedMatchId(numericId);
      setSelectedSeriesMaps(seriesMaps);
    }
  };

  const handleOpenTeam = (teamName: string) => {
    setSelectedTeamName(teamName);
  };

  const handleOpenPlayer = async (player: HotPlayer) => {
    const fallback = createSidebarPlayerModel(player);
    setSelectedPlayer(player);
    setPlayerModel(fallback);

    try {
      const model = await fetchPlayerProfileFlyoutModel(player.accountId, {
        onHydrated: (fullModel) => {
          setPlayerModel((current) => (
            current?.accountId === player.accountId ? mergePlayerModel(fallback, fullModel) : current
          ));
        },
      });
      setPlayerModel((current) => {
        if (current?.accountId !== player.accountId) return current;
        return mergePlayerModel(fallback, model);
      });
    } catch {
      setPlayerModel((current) => current?.accountId === player.accountId ? fallback : current);
    }
  };

  const handleOpenPlayerByAccountId = (accountId: number) => {
    const player = dashboardHotPlayers.find((candidate) => candidate.accountId === accountId) || {
      name: String(accountId),
      accountId,
      teamName: selectedTeamName || 'Free Agent',
    };
    void handleOpenPlayer(player);
  };

  const bannerCards: FeaturedCard[] = upcomingMatches.length > 0
    ? upcomingMatches.slice(0, 3).map((m: any) => ({
        time: (() => {
          const d = new Date(m.start_time * 1000);
          const utcMs = d.getTime() + d.getTimezoneOffset() * 60000;
          const cst = new Date(utcMs + 8 * 3600000);
          return `${(cst.getMonth() + 1).toString().padStart(2, '0')}/${cst.getDate().toString().padStart(2, '0')} ${cst.getHours().toString().padStart(2, '0')}:${cst.getMinutes().toString().padStart(2, '0')}`;
        })(),
        event: m.tournament_name || 'Unknown',
        left: m.radiant_team_name || 'TBD',
        right: m.dire_team_name || 'TBD',
        bo: m.series_type || 'BO3',
        leftLogo: m.radiant_team_logo || null,
        rightLogo: m.dire_team_logo || null,
      }))
    : (featuredUpcomingCards as FeaturedCard[]);

  const bannerSpotlight = featuredSpotlight || (upcomingMatches.length > 0
    ? {
        badge: '即将开始',
        title: upcomingMatches[0].tournament_name || DEFAULT_FEATURED_EVENT.title,
        subtitle: `${formatBannerTime(upcomingMatches[0].start_time)} · ${formatBannerBestOf(upcomingMatches[0].series_type)}`,
        ctaLabel: '查看赛程',
      }
    : DEFAULT_FEATURED_EVENT);

  const hasRealtimeEpt = eptTeams.length > 0;
  const displayTeams = hasRealtimeEpt
    ? eptTeams
    : hotTeams.map((team, index) => ({
        rank: index + 1,
        name: team.name,
        logo: teamLogoMap[team.name] || null,
        points: team.rating,
      }));

  if (selectedMatchId !== null) {
    return (
      <MatchDetailModal
        matchId={selectedMatchId}
        seriesMaps={selectedSeriesMaps}
        open={true}
        onOpenChange={(open) => { if (!open) { setSelectedMatchId(null); setSelectedSeriesMaps([]); } }}
        fullPage
        onTeamClick={(team) => { if (team.name) setSelectedTeamName(team.name); }}
        onPlayerClick={handleOpenPlayerByAccountId}
      />
    );
  }

  return (
    <div className="relative mx-auto grid max-w-[1480px] gap-5 px-4 pt-20 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-6 lg:pt-24 bg-gradient-to-b from-secondary/40 via-background to-background">
      {/* DotaHub watermark */}
      <div className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center select-none">
        <div className="text-[16vw] font-black tracking-[0.25em] text-white/[0.012] rotate-[-8deg] translate-y-[-5%]">
          DotaHub
        </div>
      </div>

      <div className="relative z-10 flex min-w-0 flex-col gap-4">
        {/* Page header */}
        <div className="flex items-center gap-4 mb-1">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-white lg:text-2xl">
              赛事中心
              <span className="ml-2 inline-flex items-center rounded-full bg-red-600/15 px-2 py-0.5 text-[11px] font-semibold text-red-300">
                <span className="size-1.5 rounded-full bg-red-400 mr-1.5 animate-pulse" />
                {liveMatchCount} 场进行中
              </span>
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">Dota 2 职业赛事 · 实时数据</p>
          </div>
        </div>
        <MobileMatchToolbar />
        <FeaturedEventBanner upcomingCards={bannerCards} spotlight={bannerSpotlight} />
        {prototypeMode ? (
          <PrototypeDashboardContent
            onOpenMatch={handleOpenMatch}
            onOpenTeam={handleOpenTeam}
            onOpenPlayer={handleOpenPlayer}
          />
        ) : (
          <>
            <HeroSection
              onOpenMatch={handleOpenMatch}
              onOpenTeam={handleOpenTeam}
              prototypeMode={prototypeMode}
            />
            <MatchesDashboard onOpenMatch={handleOpenMatch} />
          </>
        )}
      </div>

      <aside className="relative z-10 hidden min-w-0 flex-col gap-4 lg:flex">
        <RailPanel title="热门战队" icon={Shield}>
          <Badge className="mb-2 inline-flex bg-amber-500/15 text-amber-300 border-0 text-[10px]">实时排名</Badge>
          <div className="flex flex-col gap-2.5">
            {displayTeams.map((team, index) => (
              <button
                key={team.name}
                type="button"
                className="group flex w-full items-center gap-2 rounded-xl border border-border/30 bg-secondary/40 px-3 py-2 text-left transition-all hover:border-border/60 hover:bg-secondary/60 hover:shadow-[var(--shadow-glow)]"
                onClick={() => handleOpenTeam(team.name)}
              >
                <span className="w-4 shrink-0 text-xs font-bold text-amber-300">{index + 1}</span>
                <SafeImg
                  src={team.logo || ''}
                  alt={team.name}
                  className="size-7 shrink-0 object-contain group-hover:scale-110 transition-transform"
                  fallback={<div className="size-7 shrink-0 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-400">{team.name.substring(0, 2).toUpperCase()}</div>}
                />
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-100 group-hover:text-white transition-colors">{team.name}</span>
                  <span className="block text-xs text-muted-foreground group-hover:hidden">
                    {hasRealtimeEpt ? `${team.points.toLocaleString()} EPT pts` : `${team.points.toLocaleString()} ELO`}
                  </span>
                  <span className="hidden text-[10px] text-red-300/80 group-hover:block">点击查看详情 →</span>
                </div>
                {!hasRealtimeEpt && (
                  <span className={`text-base font-bold ${(hotTeams[index]?.trend || 'up') === 'up' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {(hotTeams[index]?.trend || 'up') === 'up' ? '↑' : '↓'}
                  </span>
                )}
              </button>
            ))}
          </div>
        </RailPanel>

        <div className="border-t border-white/[0.05] mx-2" />

        <RailPanel title="版本热点" icon={Flame}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] text-slate-500">实时新闻流</span>
            <a href="#news" className="h-6 px-2 text-[11px] text-red-300 hover:text-red-200 inline-flex items-center">查看全部</a>
          </div>
          <div className="flex flex-col gap-2.5">
            {railNews.length ? railNews.map((item) => (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3 rounded-xl border border-white/10 bg-black/15 px-3 py-2 transition-colors hover:border-red-400/30 hover:bg-white/[0.08]"
              >
                <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-slate-800">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.title} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-[10px] font-bold text-red-200">{getNewsCategoryLabel(item.category)}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full border border-red-400/20 bg-red-500/10 px-1.5 py-0.5 text-red-300">
                      {getNewsCategoryLabel(item.category)}
                    </span>
                    <span>{formatRailDate(item.published_at)}</span>
                  </div>
                  <span className="mt-1 block line-clamp-2 text-sm font-medium text-slate-200 group-hover:text-white">{item.title}</span>
                </div>
                <span className="shrink-0 text-xs text-red-300/80">↗</span>
              </a>
            )) : (
              <div className="rounded-xl border border-white/10 bg-black/15 px-3 py-4 text-sm text-slate-500">
                暂无可用新闻，稍后会自动刷新。
              </div>
            )}
          </div>
        </RailPanel>

        <div className="border-t border-white/[0.05] mx-2" />

        <RailPanel title="赛事筛选" icon={Trophy}>
          <div className="flex flex-wrap gap-2">
            {filters.map((filter, index) => (
              <Badge key={filter} variant={index === 0 ? 'default' : 'secondary'} className={index === 0 ? 'bg-red-600 text-white' : 'bg-white/10 text-slate-300'}>
                {filter}
              </Badge>
            ))}
          </div>
        </RailPanel>

        <div className="border-t border-white/[0.05] mx-2" />

        <RailPanel title="人气选手" icon={UserRound}>
          <div className="flex flex-col gap-2.5">
            {dashboardHotPlayers.map((player, index) => (
              <button
                key={player.accountId}
                type="button"
                className="flex w-full items-center justify-between rounded-xl border border-border/30 bg-secondary/40 px-3 py-2 text-left transition-colors hover:border-red-400/30 hover:bg-red-500/10"
                onClick={() => void handleOpenPlayer(player)}
              >
                <div className="flex items-center gap-2">
                  <span className="w-4 shrink-0 text-xs font-bold text-amber-300">{index + 1}</span>
                  <div className="size-7 shrink-0 overflow-hidden rounded-full border border-white/10 bg-gradient-to-br from-slate-500 to-slate-700">
                    <SafeImg
                      src={player.avatarUrl || ''}
                      alt={player.name}
                      className="h-full w-full object-cover"
                      fallback={<div className="flex size-full items-center justify-center text-[11px] font-bold text-white">{player.name[0].toUpperCase()}</div>}
                    />
                  </div>
                  <div className="flex min-w-0 flex-col">
                    <span className="text-sm font-semibold text-slate-100">{player.name}</span>
                    <span className="text-xs text-slate-400">{player.teamName}</span>
                  </div>
                </div>
                <span className="shrink-0 text-xs font-semibold text-red-300">{player.nationality || 'PRO'}</span>
              </button>
            ))}
          </div>
        </RailPanel>

      </aside>

      {selectedTeamName && (
        <TeamFlyout
          open={selectedTeamName !== null}
          onOpenChange={(open) => { if (!open) setSelectedTeamName(null); }}
          selectedTeam={prototypeTeams.find((team) => team.name === selectedTeamName) || { name: selectedTeamName }}
          teams={prototypeMode ? prototypeTeams : []}
          matches={prototypeMode ? prototypeMatches : []}
          upcoming={prototypeMode ? prototypeUpcoming : []}
          onPlayerClick={handleOpenPlayerByAccountId}
        />
      )}

      {selectedPlayer && (
        <PlayerProfileFlyout
          open={selectedPlayer !== null}
          onOpenChange={(open) => { if (!open) { setSelectedPlayer(null); setPlayerModel(null); } }}
          player={playerModel}
          onTeamSelect={(team) => {
            if (team.name) setSelectedTeamName(team.name);
          }}
        />
      )}
    </div>
  );
}
