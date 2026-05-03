import { useState, type ComponentType, type ReactNode } from 'react';
import { CalendarDays, Flame, MapPin, Monitor, Newspaper, Play, Radio, Shield, Trophy, UserRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MatchDetailModal } from '@/components/custom/MatchDetailModal';
import { PlayerProfileFlyout } from '@/components/custom/PlayerProfileFlyout';
import { SafeImg } from '@/components/custom/SafeImg';
import { TeamFlyout } from '@/components/custom/TeamFlyout';
import { HeroSection } from '@/sections/HeroSection';
import type { LiveHeroPayload } from '@/sections/HeroSection';
import { TournamentSection } from '@/sections/TournamentSection';
import { usePrototypeMode } from '@/lib/prototypeMode';
import { fetchPlayerProfileFlyoutModel } from '@/lib/playerProfile';
import type { PlayerFlyoutModel } from '@/lib/playerProfile';

const nowTs = () => Math.floor(Date.now() / 1000);

const prototypeTeams = [
  { team_id: '1', name: 'XG', tag: 'XG', logo_url: '/images/mirror/teams/xtreme-gaming-ranking-dark.webp', region: 'China', is_cn_team: true },
  { team_id: '2', name: 'Team Spirit', tag: 'Spirit', logo_url: '/images/mirror/teams/team-spirit-white.svg', region: 'EU' },
  { team_id: '3', name: 'Falcons', tag: 'Falcons', logo_url: '/images/mirror/teams/team-falcons.svg', region: 'MENA' },
  { team_id: '4', name: 'Tundra', tag: 'Tundra', logo_url: '/images/mirror/teams/tundra-esports.svg', region: 'EU' },
  { team_id: '5', name: 'Liquid', tag: 'Liquid', logo_url: '/images/mirror/teams/team-liquid-white.svg', region: 'EU' },
  { team_id: '6', name: 'Aurora', tag: 'Aurora', logo_url: '/images/mirror/teams/aurora.svg', region: 'SEA' },
  { team_id: '7', name: 'Yakult Brothers', tag: 'YB', logo_url: '/images/mirror/teams/yakult-brothers.svg', region: 'China', is_cn_team: true },
];

const teamLogoMap: Record<string, string> = {
  XG: '/images/mirror/teams/xtreme-gaming-ranking-dark.webp',
  'Team Spirit': '/images/mirror/teams/team-spirit-white.svg',
  Falcons: '/images/mirror/teams/team-falcons.svg',
  Tundra: '/images/mirror/teams/tundra-esports.svg',
  Liquid: '/images/mirror/teams/team-liquid-white.svg',
  Aurora: '/images/mirror/teams/aurora.svg',
  YB: '/images/mirror/teams/yakult-brothers.svg',
  'Yakult Brothers': '/images/mirror/teams/yakult-brothers.svg',
  GG: '/images/mirror/teams/gaimin-gladiators.svg',
  Spirit: '/images/mirror/teams/team-spirit-white.svg',
  'Xtreme Gaming': '/images/mirror/teams/xtreme-gaming-ranking-dark.webp',
  'Team Falcons': '/images/mirror/teams/team-falcons.svg',
  'Tundra Esports': '/images/mirror/teams/tundra-esports.svg',
};

const hotTeams = [
  { name: 'Team Spirit', rating: 2132, trend: 'up' as const },
  { name: 'XG', rating: 2031, trend: 'up' as const },
  { name: 'Falcons', rating: 1960, trend: 'down' as const },
  { name: 'Tundra', rating: 1899, trend: 'up' as const },
  { name: 'Liquid', rating: 1850, trend: 'down' as const },
];
const patchNotes = [
  { category: '英雄', text: '维萨吉基础攻击力提升' },
  { category: '物品', text: '赤红甲护甲降低 3 → 2' },
  { category: '地图', text: '肉山巢穴位置微调' },
];

const recentEvents = [
  { name: 'DreamLeague S23', format: '线上赛', dates: '5月15日 - 5月28日' },
  { name: 'ESL One 伯明翰', format: '线下赛 · 伯明翰', dates: '5月20日 - 5月25日' },
  { name: 'PGL Wallachia S4', format: '线上赛', dates: '5月22日 - 5月30日' },
];

const filters = ['全部', 'S 级赛事', '中国战队', 'DreamLeague', 'ESL One', 'PGL'];
const featuredUpcomingCards = [
  { time: '19:00', event: 'DreamLeague S23', left: 'XG', right: 'Aurora', bo: 'BO3' },
  { time: '22:00', event: 'ESL One 伯明翰', left: 'Liquid', right: 'Tundra', bo: 'BO3' },
  { time: '01:00 明天', event: 'PGL Wallachia S4', left: 'Team Spirit', right: 'Falcons', bo: 'BO3' },
];

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
  nationality?: string;
  score: string;
};

const hotPlayers: HotPlayer[] = [
  { name: 'Ame', accountId: 898754153, teamName: 'XG', nationality: 'CN', score: '12.4k' },
  { name: 'Yatoro', accountId: 321580662, teamName: 'Team Spirit', nationality: 'UA', score: '10.8k' },
  { name: '23savage', accountId: 185437126, teamName: 'Aurora', nationality: 'TH', score: '9.2k' },
  { name: 'Collapse', accountId: 302214028, teamName: 'Team Spirit', nationality: 'RU', score: '8.1k' },
  { name: 'dyrachyo', accountId: 116585378, teamName: 'Gaimin Gladiators', nationality: 'RU', score: '7.6k' },
];

function createHotPlayerModel(player: HotPlayer): PlayerFlyoutModel {
  const richAmeProfile: Partial<PlayerFlyoutModel> = player.accountId === 898754153 ? {
    realName: '王淳煜',
    chineseName: 'Ame',
    nationality: 'CN',
    teamId: '1',
    teamName: 'Xtreme Gaming',
    teamLogoUrl: '/images/mirror/teams/xtreme-gaming-ranking-dark.webp',
    winRate: 72.1,
    hotRank: 1,
    hotScore: '12.4K',
    avgKda: 7.48,
    avgGpm: 792,
    leagueKdaRank: '联赛 #2',
    leagueGpmRank: '联赛 #3',
    leagueWinRateRank: '联赛 #1',
    signatureHeroes: [
      { heroId: 11, games: 28, wins: 21, winRate: 75.0 },
      { heroId: 69, games: 24, wins: 17, winRate: 70.8 },
      { heroId: 1, games: 21, wins: 14, winRate: 66.7 },
    ],
    signatureHero: { heroId: 11, games: 28, wins: 21, winRate: 75.0 },
    mostPlayedHeroes: [
      { heroId: 11, games: 28, wins: 21, winRate: 75.0 },
      { heroId: 69, games: 24, wins: 17, winRate: 70.8 },
      { heroId: 1, games: 21, wins: 14, winRate: 66.7 },
      { heroId: 8, games: 19, wins: 12, winRate: 63.2 },
      { heroId: 5, games: 17, wins: 11, winRate: 64.7 },
    ],
    nextMatch: {
      opponentName: 'Aurora',
      opponentTeamId: '6',
      selectedTeamId: '1',
      selectedTeamLogoUrl: '/images/mirror/teams/xtreme-gaming-ranking-dark.webp',
      seriesType: 'BO3',
      tournament: 'DreamLeague S23',
      startTime: nowTs() + 3600,
    },
    recentMatches: [
      {
        matchId: 9201,
        startTime: nowTs() - 3600,
        tournament: 'DreamLeague S23',
        seriesType: 'BO3',
        teamId: '1',
        teamName: 'XG',
        teamLogoUrl: '/images/mirror/teams/xtreme-gaming-ranking-dark.webp',
        opponentTeamId: '7',
        opponentName: 'Yakult Brothers',
        teamPicks: [11, 69, 1, 8, 5],
        playerHeroId: 11,
        won: true,
        kda: '9/2/14',
        gpm: 612,
      },
      {
        matchId: 9202,
        startTime: nowTs() - 26 * 3600,
        tournament: 'ESL One 伯明翰',
        seriesType: 'BO3',
        teamId: '1',
        teamName: 'XG',
        teamLogoUrl: '/images/mirror/teams/xtreme-gaming-ranking-dark.webp',
        opponentTeamId: '4',
        opponentName: 'Tundra',
        teamPicks: [8, 75, 106, 129, 31],
        playerHeroId: 8,
        won: true,
        kda: '11/1/8',
        gpm: 724,
      },
      {
        matchId: 9203,
        startTime: nowTs() - 50 * 3600,
        tournament: 'PGL Wallachia S4',
        seriesType: 'BO3',
        teamId: '1',
        teamName: 'XG',
        teamLogoUrl: '/images/mirror/teams/xtreme-gaming-ranking-dark.webp',
        opponentTeamId: '3',
        opponentName: 'Falcons',
        teamPicks: [69, 1, 8, 75, 106],
        playerHeroId: 69,
        won: true,
        kda: '7/3/11',
        gpm: 581,
      },
      {
        matchId: 9204,
        startTime: nowTs() - 75 * 3600,
        tournament: 'DreamLeague S23',
        seriesType: 'BO3',
        teamId: '1',
        teamName: 'XG',
        teamLogoUrl: '/images/mirror/teams/xtreme-gaming-ranking-dark.webp',
        opponentTeamId: '6',
        opponentName: 'Aurora',
        teamPicks: [1, 5, 8, 11, 129],
        playerHeroId: 1,
        won: false,
        kda: '4/6/7',
        gpm: 498,
      },
      {
        matchId: 9205,
        startTime: nowTs() - 99 * 3600,
        tournament: 'ESL One 伯明翰',
        seriesType: 'BO3',
        teamId: '1',
        teamName: 'XG',
        teamLogoUrl: '/images/mirror/teams/xtreme-gaming-ranking-dark.webp',
        opponentTeamId: '4',
        opponentName: 'Tundra',
        teamPicks: [11, 5, 69, 8, 1],
        playerHeroId: 5,
        won: true,
        kda: '6/2/16',
        gpm: 543,
      },
    ],
  } : {};

  return {
    accountId: player.accountId,
    playerName: player.name,
    realName: null,
    chineseName: null,
    nationality: player.nationality || null,
    teamId: null,
    teamName: player.teamName,
    teamLogoUrl: null,
    avatarUrl: null,
    birthDate: null,
    birthMonth: null,
    birthYear: null,
    age: null,
    winRate: null,
    signatureHeroes: [],
    signatureHero: null,
    mostPlayedHeroes: [],
    nextMatch: null,
    recentMatches: [],
    ...richAmeProfile,
  };
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

function FeaturedEventBanner() {
  return (
    <section className="hidden overflow-hidden rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_20%_50%,rgba(185,28,28,0.28),rgba(15,23,42,0.86)_45%,rgba(2,6,23,0.92))] p-4 shadow-[0_28px_90px_rgba(0,0,0,0.28)] lg:block">
      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="relative overflow-hidden min-h-48 rounded-xl border border-red-400/25 p-5" style={{background: 'linear-gradient(135deg, rgba(100,8,8,0.92) 0%, rgba(60,5,5,0.88) 40%, rgba(5,5,22,0.95) 100%)'}}>
          {/* layered radial glows */}
          <div className="absolute inset-0 pointer-events-none" style={{background: 'radial-gradient(ellipse at 15% 55%, rgba(220,38,38,0.35) 0%, transparent 60%)'}} />
          <div className="absolute inset-0 pointer-events-none" style={{background: 'radial-gradient(ellipse at 85% 20%, rgba(239,68,68,0.18) 0%, transparent 50%)'}} />
          {/* Large tournament emblem decoration */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2 select-none pointer-events-none flex flex-col items-center opacity-[0.07]">
            <div className="text-[88px] font-black leading-none tracking-tighter text-white">DL</div>
            <div className="text-[22px] font-bold leading-none tracking-widest text-white -mt-1">S23</div>
          </div>
          {/* Subtle top-right corner shine */}
          <div className="absolute top-0 right-0 size-24 pointer-events-none" style={{background: 'radial-gradient(circle at 100% 0%, rgba(255,100,100,0.12), transparent 70%)'}} />
          {/* Content */}
          <div className="relative z-10 flex h-full flex-col justify-between">
            <div>
              <Badge className="mb-3 border border-red-300/40 bg-red-600/90 px-2 text-[11px] font-semibold text-white">
                <span className="mr-1 inline-block size-1.5 rounded-full bg-white animate-pulse" />
                LIVE
              </Badge>
              <h2 className="text-2xl font-extrabold tracking-tight text-white drop-shadow-sm">DreamLeague S23</h2>
              <p className="mt-1 text-sm text-red-200/70">小组赛 · Day 5</p>
            </div>
            <Button size="sm" className="mt-6 w-fit border border-white/20 bg-white/10 text-white hover:bg-white/20">
              <Play className="mr-1.5 size-3.5 fill-white" />
              观看直播
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
            {featuredUpcomingCards.map((card) => (
                <div key={`${card.time}-${card.left}`} className="rounded-xl border border-white/8 bg-white/[0.045] p-4">
                  <div className="text-sm font-bold text-white">{card.time}</div>
                  <div className="text-xs text-slate-400">{card.event}</div>
                  <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
                    <div className="flex flex-col items-center gap-1.5">
                      <div className="size-8 rounded-full flex items-center justify-center text-xs font-bold text-white overflow-hidden bg-slate-700">
                        <SafeImg src={teamLogoMap[card.left]} alt={card.left} className="size-full object-contain" fallback={<span>{card.left.substring(0, 2).toUpperCase()}</span>} />
                      </div>
                      <span className="text-xs text-slate-200">{card.left}</span>
                    </div>
                    <span className="text-xs text-slate-500">VS</span>
                    <div className="flex flex-col items-center gap-1.5">
                      <div className="size-8 rounded-full flex items-center justify-center text-xs font-bold text-white overflow-hidden bg-slate-700">
                        <SafeImg src={teamLogoMap[card.right]} alt={card.right} className="size-full object-contain" fallback={<span>{card.right.substring(0, 2).toUpperCase()}</span>} />
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
    <section className="rounded-2xl border border-white/10 bg-white/[0.045] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.22)] backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-red-300" />
          <h2 className="text-sm font-bold text-white">{title}</h2>
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
      className="w-full text-left rounded-xl border border-slate-700 bg-slate-800/80 p-4 hover:border-slate-600 transition-colors"
      onClick={onClick}
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded bg-red-600/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          <span className="size-1 rounded-full bg-white animate-pulse" />
          LIVE
        </span>
        <span className="text-sm text-slate-400">{data.leagueName} · {data.stage}</span>
        <span className="ml-auto text-xs text-slate-500">{data.seriesScore}</span>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <div className="flex items-center gap-3 justify-end">
          <span className="text-sm font-semibold text-white">{team1.name}</span>
          <SafeImg
            src={teamLogoMap[team1.name]}
            alt={team1.name}
            className="size-12 object-contain"
            fallback={<div className="size-12 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-400">{team1.name.substring(0, 2).toUpperCase()}</div>}
          />
        </div>
        <div className="text-center">
          {liveMap?.score ? (
            <>
              <div className="text-2xl font-bold tabular-nums text-white">{liveMap.score}</div>
              <div className="text-xs tabular-nums text-slate-400">{formatGameTime(liveMap.gameTime)}</div>
            </>
          ) : (
            <div className="text-sm text-slate-400">暂无数据</div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <SafeImg
            src={teamLogoMap[team2.name]}
            alt={team2.name}
            className="size-12 object-contain"
            fallback={<div className="size-12 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-400">{team2.name.substring(0, 2).toUpperCase()}</div>}
          />
          <span className="text-sm font-semibold text-white">{team2.name}</span>
        </div>
      </div>

      {data.maps.length > 0 && (
        <div className="mt-4 flex gap-1.5">
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
    </button>
  );
}

function UpcomingMatchCard({ data, onClick }: { data: typeof prototypeUpcoming[number]; onClick?: () => void }) {
  const diff = data.start_time - nowTs();
  const hoursLeft = Math.floor(diff / 3600);
  const minsLeft = Math.floor((diff % 3600) / 60);
  const timeStr = diff <= 0
    ? '即将开始'
    : hoursLeft > 0
    ? `${hoursLeft}小时${minsLeft}分钟后`
    : `${minsLeft}分钟后`;

  return (
    <button
      type="button"
      className="w-full text-left rounded-xl border border-white/10 bg-slate-800 p-3.5 hover:border-white/20 transition-colors"
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="inline-flex items-center gap-1 rounded bg-slate-700/60 px-1.5 py-0.5 text-[10px] text-slate-400">
          <CalendarDays className="size-3" />
          即将开始
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">{timeStr}</span>
          <span className="text-xs rounded bg-slate-700 px-2 py-0.5 text-slate-300">{data.series_type}</span>
        </div>
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
      <div className="mt-2.5">
        <Badge variant="secondary" className="bg-slate-700/50 text-slate-300 border-0 text-[10px]">{data.tournament_name}</Badge>
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
}

function PrototypeDashboardContent({ onOpenMatch, onOpenTeam }: PrototypeDashboardContentProps) {
  const [activeFilter, setActiveFilter] = useState('全部');

  return (
    <div className="flex gap-4">
      {/* Left column */}
      <div className="w-2/3 flex flex-col gap-4 min-w-0">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">全部比赛 <span className="inline-flex items-center justify-center rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold text-slate-300">{mockLiveHeroes.length + prototypeUpcoming.length}</span></h2>
          <div className="flex gap-1 rounded-lg bg-slate-800 p-1">
            {['全部', 'S级赛事', '中国战队', 'DreamLeague', 'ESL One'].map((f) => (
              <button
                key={f}
                type="button"
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeFilter === f
                    ? 'bg-red-600 text-white shadow-lg shadow-red-950/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                onClick={() => setActiveFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {mockLiveHeroes.map((hero) => (
          <LiveMatchCard
            key={hero.leagueName}
            data={hero}
            onClick={() => {
              const seriesMaps = hero.maps.map((m) => ({
                label: m.label,
                matchId: m.matchId,
                radiantScore: m.team1Score,
                direScore: m.team2Score,
                duration: m.gameTime,
              }));
              onOpenMatch(hero.liveMap?.matchId ?? hero.maps[0]?.matchId ?? '', seriesMaps);
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
      <aside className="w-1/3 flex flex-col gap-4 min-w-0">
        <section className="rounded-2xl border border-white/10 bg-slate-800 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Shield className="size-4 text-red-300" />
            <h2 className="text-sm font-bold text-white">热门战队</h2>
            <Badge className="bg-amber-500/15 text-amber-300 border-0 text-[10px]">TOP 5</Badge>
          </div>
          <div className="flex flex-col gap-2">
            {hotTeams.map((team, index) => (
              <button
                key={team.name}
                type="button"
                className="flex w-full items-center gap-2 rounded-xl border border-white/8 bg-black/15 px-3 py-2 text-left transition-colors hover:border-slate-600 hover:bg-white/[0.06]"
                onClick={() => onOpenTeam(team.name)}
              >
                <span className="w-4 shrink-0 text-xs font-bold text-amber-300">{index + 1}</span>
                <SafeImg src={teamLogoMap[team.name]} alt={team.name} className="size-6 shrink-0 object-contain" fallback={<div className="size-6 shrink-0 rounded-full bg-slate-700" />} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-100">{team.name}</span>
                <span className="text-xs tabular-nums text-slate-400">{team.rating}</span>
                <span className={team.trend === 'up' ? 'text-xs text-emerald-400' : 'text-xs text-red-400'}>
                  {team.trend === 'up' ? '↑' : '↓'}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-slate-800 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Trophy className="size-4 text-red-300" />
            <h2 className="text-sm font-bold text-white">近期赛事</h2>
          </div>
          <div className="flex flex-col gap-2">
            {recentEvents.map((event) => {
              const isOnline = event.format.startsWith('线上');
              const Icon = isOnline ? Monitor : MapPin;
              const location = event.format.replace(/^(线上赛|线下赛)( · )?/, '');
              return (
                <div key={event.name} className="rounded-xl border border-white/8 bg-black/15 px-3 py-2.5">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="size-3.5 shrink-0 text-slate-500" />
                    <span className="text-sm font-semibold text-slate-100">{event.name}</span>
                    <Badge variant="secondary" className={`ml-auto border-0 text-[10px] ${isOnline ? 'bg-emerald-500/15 text-emerald-300' : 'bg-blue-500/15 text-blue-300'}`}>
                      {isOnline ? '线上' : '线下'}
                    </Badge>
                  </div>
                  {location && <div className="text-xs text-slate-400 ml-5.5">{location}</div>}
                  <div className="text-xs text-slate-500 ml-5.5 flex items-center gap-1">
                    <CalendarDays className="size-3" />
                    {event.dates}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-slate-800 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Flame className="size-4 text-red-300" />
            <h2 className="text-sm font-bold text-white">版本动态</h2>
          </div>
          <div className="flex flex-col gap-2">
            {patchNotes.map((note) => (
              <div key={note.text} className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/15 px-3 py-2">
                <div className={`size-9 shrink-0 rounded-lg flex items-center justify-center text-[10px] font-bold border ${
                  note.category === '英雄' ? 'bg-red-900/70 text-red-200 border-red-600/40' :
                  note.category === '物品' ? 'bg-amber-900/70 text-amber-200 border-amber-600/40' :
                  'bg-emerald-900/70 text-emerald-200 border-emerald-600/40'
                }`}>
                  {note.category}
                </div>
                <span className="text-sm text-slate-300">{note.text}</span>
              </div>
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
  const [playerModel, setPlayerModel] = useState<PlayerFlyoutModel | null>(devPlayer ? createHotPlayerModel(hotPlayers[0]) : null);

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
    const fallback = createHotPlayerModel(player);
    setSelectedPlayer(player);
    setPlayerModel(fallback);

    try {
      const model = await fetchPlayerProfileFlyoutModel(player.accountId);
      setPlayerModel((current) => {
        if (current?.accountId !== player.accountId) return current;
        const apiNameIsOnlyAccountId = model?.playerName === String(player.accountId);
        return model
          ? {
              ...fallback,
              ...model,
              playerName: !model.playerName || apiNameIsOnlyAccountId ? fallback.playerName : model.playerName,
              nationality: model.nationality || fallback.nationality,
              teamName: model.teamName || fallback.teamName,
              teamLogoUrl: model.teamLogoUrl || fallback.teamLogoUrl,
              winRate: typeof model.winRate === 'number' ? model.winRate : fallback.winRate,
              signatureHeroes: model.signatureHeroes?.length ? model.signatureHeroes : fallback.signatureHeroes,
              signatureHero: model.signatureHero || fallback.signatureHero,
              mostPlayedHeroes: model.mostPlayedHeroes?.length ? model.mostPlayedHeroes : fallback.mostPlayedHeroes,
              nextMatch: model.nextMatch || fallback.nextMatch,
              recentMatches: model.recentMatches?.length ? model.recentMatches : fallback.recentMatches,
            }
          : fallback;
      });
    } catch {
      setPlayerModel((current) => current?.accountId === player.accountId ? fallback : current);
    }
  };

  const handleOpenPlayerByAccountId = (accountId: number) => {
    const player = hotPlayers.find((candidate) => candidate.accountId === accountId) || {
      name: String(accountId),
      accountId,
      teamName: selectedTeamName || 'Free Agent',
      score: '—',
    };
    void handleOpenPlayer(player);
  };

  return (
    <div className="mx-auto grid max-w-[1480px] gap-4 px-4 pt-20 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-6 lg:pt-24 bg-gradient-to-b from-slate-900/40 via-slate-950 to-slate-950">
      <div className="flex min-w-0 flex-col gap-4">
        <MobileMatchToolbar />
        <FeaturedEventBanner />
        {prototypeMode ? (
          <PrototypeDashboardContent
            onOpenMatch={handleOpenMatch}
            onOpenTeam={handleOpenTeam}
          />
        ) : (
          <>
            <HeroSection
              onOpenMatch={handleOpenMatch}
              onOpenTeam={handleOpenTeam}
              prototypeMode={prototypeMode}
            />
            <TournamentSection prototypeMode={prototypeMode} />
          </>
        )}
      </div>

      <aside className="hidden min-w-0 flex-col gap-4 lg:flex">
        <RailPanel title="热门战队" icon={Shield}>
          <Badge className="mb-2 inline-flex bg-amber-500/15 text-amber-300 border-0 text-[10px]">TOP 5</Badge>
          <div className="flex flex-col gap-2">
            {hotTeams.map((team, index) => (
              <button
                key={team.name}
                type="button"
                className="flex w-full items-center gap-2 rounded-xl border border-white/8 bg-black/15 px-3 py-2 text-left transition-colors hover:border-slate-600 hover:bg-white/[0.06]"
                onClick={() => handleOpenTeam(team.name)}
              >
                <span className="w-4 shrink-0 text-xs font-bold text-amber-300">{index + 1}</span>
                <SafeImg src={teamLogoMap[team.name]} alt={team.name} className="size-6 shrink-0 object-contain" fallback={<div className="size-6 shrink-0 rounded-full bg-slate-700" />} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-100">{team.name}</span>
                <span className="text-xs tabular-nums text-slate-400">{team.rating}</span>
                <span className={team.trend === 'up' ? 'text-xs text-emerald-400' : 'text-xs text-red-400'}>
                  {team.trend === 'up' ? '↑' : '↓'}
                </span>
              </button>
            ))}
          </div>
        </RailPanel>

        <div className="border-t border-white/[0.05] mx-2" />

        <RailPanel title="版本热点" icon={Flame}>
          <div className="flex flex-col gap-2">
            {patchNotes.map((note) => (
              <div key={note.text} className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/15 px-3 py-2">
                <div className={`size-9 shrink-0 rounded-lg flex items-center justify-center text-[10px] font-bold border ${
                  note.category === '英雄' ? 'bg-red-900/70 text-red-200 border-red-600/40' :
                  note.category === '物品' ? 'bg-amber-900/70 text-amber-200 border-amber-600/40' :
                  'bg-emerald-900/70 text-emerald-200 border-emerald-600/40'
                }`}>
                  {note.category}
                </div>
                <span className="text-sm text-slate-300">{note.text}</span>
              </div>
            ))}
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
          <div className="flex flex-col gap-2">
            {hotPlayers.map((player, index) => (
              <button
                key={player.accountId}
                type="button"
                className="flex w-full items-center justify-between rounded-xl border border-white/8 bg-black/15 px-3 py-2 text-left transition-colors hover:border-red-400/30 hover:bg-red-500/10"
                onClick={() => void handleOpenPlayer(player)}
              >
                <div className="flex items-center gap-2">
                  <span className="w-4 shrink-0 text-xs font-bold text-amber-300">{index + 1}</span>
                  <div className="size-7 shrink-0 rounded-full bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center text-[11px] font-bold text-white">
                    {player.name[0].toUpperCase()}
                  </div>
                  <div className="flex min-w-0 flex-col">
                    <span className="text-sm font-semibold text-slate-100">{player.name}</span>
                    <span className="text-xs text-slate-400">{player.teamName}</span>
                  </div>
                </div>
                <span className="shrink-0 text-xs font-semibold text-red-300">{player.score}</span>
              </button>
            ))}
          </div>
        </RailPanel>

        <RailPanel title="直播入口" icon={Radio}>
          <div className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-3 text-sm text-red-100">
            正在聚合 live Series、赛程和赛果数据。
          </div>
        </RailPanel>

        <RailPanel title="资讯" icon={Newspaper}>
          <div className="text-sm leading-6 text-slate-300">赛事资讯保留在主内容流中，右栏只承载快速扫描入口。</div>
        </RailPanel>
      </aside>

      {selectedMatchId !== null && (
        <MatchDetailModal
          matchId={selectedMatchId}
          seriesMaps={selectedSeriesMaps}
          open={selectedMatchId !== null}
          onOpenChange={(open) => { if (!open) { setSelectedMatchId(null); setSelectedSeriesMaps([]); } }}
        />
      )}

      {selectedTeamName && (
        <TeamFlyout
          open={selectedTeamName !== null}
          onOpenChange={(open) => { if (!open) setSelectedTeamName(null); }}
          selectedTeam={prototypeTeams.find((team) => team.name === selectedTeamName) || { name: selectedTeamName }}
          teams={prototypeTeams}
          matches={prototypeMatches}
          upcoming={prototypeUpcoming}
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
