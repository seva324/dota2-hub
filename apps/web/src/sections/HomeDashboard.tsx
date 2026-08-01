import { useEffect, useMemo, useState } from 'react';
import { Eye, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MatchDetailModal } from '@/components/custom/MatchDetailModal';
import { PlayerProfileFlyout } from '@/components/custom/PlayerProfileFlyout';
import { SafeImg } from '@/components/custom/SafeImg';
import { TeamFlyout } from '@/components/custom/TeamFlyout';
import { aggregateMatchesBySeries } from '@/lib/seriesAggregation';
import { createMinimalPlayerFlyoutModel, fetchPlayerProfileFlyoutModel } from '@/lib/playerProfile';
import type { PlayerFlyoutModel } from '@/lib/playerProfile';
import type { RouteState } from '@/lib/hashRouter';

interface LiveHeroPayload {
  source?: string;
  sourceUrl?: string | null;
  leagueName: string;
  stage?: string | null;
  bestOf?: string | number | null;
  seriesScore: string;
  live?: boolean;
  startedAt?: string | number | null;
  viewerCount?: number | null;
  teams?: Array<{
    side?: 'team1' | 'team2';
    name: string;
    logo?: string | null;
  }>;
  maps?: Array<{
    matchId?: string | number | null;
    label: string;
    score?: string | null;
    status?: 'completed' | 'live' | 'upcoming';
    result?: 'team1' | 'team2' | null;
    team1Score?: number | null;
    team2Score?: number | null;
    gameTime?: number | null;
  }>;
  liveMap?: {
    matchId?: string | number | null;
    label: string;
    score?: string | null;
    status?: 'live';
    gameTime?: number | null;
    team1Score?: number | null;
    team2Score?: number | null;
  } | null;
}

const nowTs = () => Math.floor(Date.now() / 1000);

const teamLogoMap: Record<string, string> = {
  XG: '/images/mirror/teams/xtreme-gaming-ranking-dark.webp',
  'Team Spirit': '/images/mirror/teams/team-spirit-white.svg',
  Falcons: '/images/mirror/teams/team-falcons-ranking-dark.webp',
  Tundra: '/images/mirror/teams/tundra-esports-white.svg',
  Liquid: '/images/mirror/teams/team-liquid-white.svg',
  Aurora: '/images/mirror/teams/aurora-ranking-dark.png',
  YB: '/images/mirror/teams/yakult-brothers.webp',
  'Yakult Brothers': '/images/mirror/teams/yakult-brothers.webp',
  GG: '/images/mirror/teams/gaimin-gladiators.webp',
  Spirit: '/images/mirror/teams/team-spirit-white.svg',
  'Xtreme Gaming': '/images/mirror/teams/xtreme-gaming-ranking-dark.webp',
  'Team Falcons': '/images/mirror/teams/team-falcons-ranking-dark.webp',
  'Tundra Esports': '/images/mirror/teams/tundra-esports-white.svg',
};

const design = {
  bg: '#0f1115',
  card: '#1a1d24',
  blue: '#2b55e8',
  red: '#ff3b30',
};

function resolveTeamLogo(name?: string | null, explicitLogo?: string | null): string {
  if (explicitLogo) return explicitLogo;
  if (name && teamLogoMap[name]) return teamLogoMap[name];
  return '';
}

function formatCSTTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

function formatBestOf(value?: string | number | null): string {
  if (value === null || value === undefined || value === '') return 'BO3';
  if (typeof value === 'number' && Number.isFinite(value)) return `BO${value}`;
  const normalized = String(value).trim().toUpperCase();
  if (!normalized) return 'BO3';
  if (normalized.startsWith('BO')) return normalized;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? `BO${parsed}` : normalized;
}

function formatViewers(viewers?: number | null): string {
  if (!viewers || viewers <= 0) return '0';
  if (viewers >= 1000) return `${(viewers / 1000).toFixed(1)}K`;
  return String(viewers);
}

const hotPlayersSeed: TopPlayer[] = [
  { name: 'Ame', accountId: 898754153, teamName: 'XG', nationality: 'CN' },
  { name: 'Yatoro', accountId: 321580662, teamName: 'Team Spirit', nationality: 'UA' },
  { name: '23savage', accountId: 185437126, teamName: 'Aurora', nationality: 'TH' },
  { name: 'Collapse', accountId: 302214028, teamName: 'Team Spirit', nationality: 'RU' },
];

const topTeamsSeed = [
  { rank: 1, name: 'Team Spirit', logo: teamLogoMap['Team Spirit'] || null, points: 1987 },
  { rank: 2, name: 'XG', logo: teamLogoMap.XG || null, points: 1899 },
  { rank: 3, name: 'Team Falcons', logo: teamLogoMap['Team Falcons'] || null, points: 1880 },
  { rank: 4, name: 'Team Liquid', logo: teamLogoMap.Liquid || null, points: 1790 },
  { rank: 5, name: 'Tundra Esports', logo: teamLogoMap['Tundra Esports'] || null, points: 1750 },
];

function formatTimeAgo(timestamp: number): string {
  const diff = Math.max(0, nowTs() - timestamp);
  const minutes = Math.floor(diff / 60);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
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

/* ------------------------------------------------------------------ */
/* 数据模型                                                             */
/* ------------------------------------------------------------------ */

interface UpcomingMatch {
  id?: string | number;
  match_id?: string | number;
  start_time: number;
  series_type?: string | null;
  radiant_team_id?: string | null;
  dire_team_id?: string | null;
  radiant_team_name?: string | null;
  dire_team_name?: string | null;
  radiant_team_logo?: string | null;
  dire_team_logo?: string | null;
  tournament_name?: string | null;
  tournament_name_cn?: string | null;
}

interface FinishedMatch {
  match_id: string | number;
  series_id?: string | number | null;
  radiant_team_id?: string | number | null;
  dire_team_id?: string | number | null;
  radiant_team_name: string;
  dire_team_name: string;
  radiant_team_logo?: string | null;
  dire_team_logo?: string | null;
  radiant_score?: number | null;
  dire_score?: number | null;
  radiant_win?: boolean | number | null;
  start_time: number;
  duration?: number | null;
  tournament_name?: string | null;
  series_type?: string | null;
}

interface FinishedSeries {
  match_id: string | number;
  radiant_team_name: string;
  dire_team_name: string;
  radiant_team_logo?: string | null;
  dire_team_logo?: string | null;
  radiant_score: number;
  dire_score: number;
  start_time: number;
  tournament_name?: string | null;
  series_type?: string | null;
}

function resolveSeriesWins(series: readonly FinishedMatch[], team: 'radiant' | 'dire') {
  const primaryMatch = series[0];
  const targetId = String(team === 'radiant' ? primaryMatch?.radiant_team_id ?? '' : primaryMatch?.dire_team_id ?? '');
  const targetName = team === 'radiant' ? primaryMatch?.radiant_team_name : primaryMatch?.dire_team_name;

  return series.reduce((wins, match) => {
    if (match.radiant_win === null || match.radiant_win === undefined) return wins;
    const radiantWon = match.radiant_win === true || match.radiant_win === 1;
    const winnerId = String((radiantWon ? match.radiant_team_id : match.dire_team_id) ?? '');
    const winnerName = radiantWon ? match.radiant_team_name : match.dire_team_name;
    if ((targetId && winnerId === targetId) || (!targetId && winnerName === targetName)) return wins + 1;
    return wins;
  }, 0);
}

function toFinishedSeries(matches: FinishedMatch[]): FinishedSeries[] {
  return aggregateMatchesBySeries(matches)
    .map((series) => {
      const orderedMatches = series.maps.map((map) => map.match);
      const primaryMatch = series.primaryMatch;
      const latestMatch = orderedMatches[orderedMatches.length - 1] ?? primaryMatch;
      const detailMatchId = [...series.maps]
        .reverse()
        .map((map) => map.matchId)
        .find((matchId) => matchId !== null) || primaryMatch.match_id;
      return {
        match_id: detailMatchId,
        radiant_team_name: primaryMatch.radiant_team_name,
        dire_team_name: primaryMatch.dire_team_name,
        radiant_team_logo: primaryMatch.radiant_team_logo,
        dire_team_logo: primaryMatch.dire_team_logo,
        radiant_score: resolveSeriesWins(orderedMatches, 'radiant'),
        dire_score: resolveSeriesWins(orderedMatches, 'dire'),
        start_time: latestMatch.start_time,
        tournament_name: primaryMatch.tournament_name || null,
        series_type: primaryMatch.series_type || null,
      };
    })
    .filter((series) => series.radiant_score > 0 || series.dire_score > 0)
    .sort((left, right) => right.start_time - left.start_time);
}

/* ------------------------------------------------------------------ */
/* 区块头                                                               */
/* ------------------------------------------------------------------ */

function EmptyState({ label }: { label: string }) {
  return (
    <div
      className="flex h-24 items-center justify-center rounded-xl border border-dashed border-white/10 text-sm"
      style={{ color: '#71717a', backgroundColor: 'rgba(255,255,255,0.02)' }}
    >
      {label}
    </div>
  );
}

function SectionHeader({ title, accent, linkLabel, onClick }: {
  title: string;
  accent?: { text: string; count: string };
  linkLabel: string;
  onClick?: () => void;
}) {
  return (
    <div className="mb-5 flex items-center justify-between">
      <h2 className="flex items-center gap-2.5 text-xl font-extrabold tracking-tight text-white">
        {title}
        {accent && (
          <span className="rounded-md px-2 py-0.5 text-xs font-bold" style={{ color: accent.text, backgroundColor: `${accent.text}1f` }}>
            {accent.count}
          </span>
        )}
      </h2>
      <button
        type="button"
        onClick={onClick}
        className="text-sm font-semibold transition-opacity hover:opacity-80"
        style={{ color: design.blue }}
      >
        {linkLabel} <span aria-hidden>→</span>
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hero                                                                 */
/* ------------------------------------------------------------------ */

function HeroBanner({ liveCount, upcomingCount, resultsCount }: {
  liveCount: number;
  upcomingCount: number;
  resultsCount: number;
}) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-white/[0.06]" style={{ backgroundColor: '#0a0e14' }}>
      {/* 背景占位：后续替换为赛事现场背景图 */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'linear-gradient(120deg, rgba(43,85,232,0.16) 0%, rgba(43,85,232,0.04) 40%, rgba(10,14,20,0) 70%), radial-gradient(ellipse at 85% 90%, rgba(255,59,48,0.1) 0%, transparent 55%)',
        }}
      />
      {/* 装饰网格线 */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
      <div className="relative z-10 flex min-h-[440px] flex-col justify-center px-8 py-14 lg:px-14">
        <h1 className="text-5xl font-black leading-[1.05] tracking-tight text-white lg:text-6xl">
          LIVE.
        </h1>
        <h2 className="mt-1 text-3xl font-bold leading-tight tracking-tight text-white lg:text-4xl">
          Dota Never Stops.
        </h2>
        <p className="mt-5 max-w-md text-base leading-6" style={{ color: '#a1a1aa' }}>
          Your home for live matches, real-time stats, and everything Dota.
        </p>

        <div className="mt-8 flex items-center gap-10">
          <div className="flex flex-col">
            <span className="text-3xl font-black tabular-nums" style={{ color: design.red }}>{liveCount}</span>
            <span className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Live Matches</span>
          </div>
          <div className="flex flex-col">
            <span className="text-3xl font-black tabular-nums text-white">{upcomingCount}</span>
            <span className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Upcoming</span>
          </div>
          <div className="flex flex-col">
            <span className="text-3xl font-black tabular-nums text-white">{resultsCount}</span>            <span className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Results</span>
          </div>
        </div>

        <Button
          size="lg"
          className="mt-10 w-fit rounded-lg px-6 text-sm font-semibold text-white hover:opacity-90"
          style={{ backgroundColor: design.blue }}
        >
          <Play className="size-4 fill-white" />
          Watch Live Matches
        </Button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Schedule 卡片                                                         */
/* ------------------------------------------------------------------ */

function ScheduleCard({ match, isLive, onOpen }: {
  match: UpcomingMatch;
  isLive: boolean;
  onOpen?: () => void;
}) {
  const left = match.radiant_team_name || 'TBD';
  const right = match.dire_team_name || 'TBD';
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex flex-col rounded-xl p-4 text-left transition-transform hover:-translate-y-0.5"
      style={{ backgroundColor: design.card }}
    >
      <div className="flex items-center justify-between">
        <span
          className="rounded px-2 py-0.5 text-[11px] font-bold"
          style={isLive
            ? { color: '#fff', backgroundColor: design.red }
            : { color: '#fff', backgroundColor: '#2a2d35' }}
        >
          {isLive ? 'LIVE' : formatCSTTime(match.start_time)}
        </span>
        <span className="rounded px-2 py-0.5 text-[11px] font-semibold" style={{ color: '#a1a1aa', backgroundColor: '#2a2d35' }}>
          {formatBestOf(match.series_type)}
        </span>
      </div>

      <div className="mt-6 flex items-center justify-center gap-4">
        <div className="flex flex-1 items-center justify-end gap-2.5">
          <SafeImg
            src={resolveTeamLogo(left, match.radiant_team_logo)}
            alt={left}
            className="h-10 w-10 object-contain"
            fallback={<div className="flex size-10 items-center justify-center rounded-full text-xs font-bold" style={{ backgroundColor: '#2a2d35', color: '#a1a1aa' }}>{left.substring(0, 2).toUpperCase()}</div>}
          />
          <span className="truncate text-sm font-semibold text-white group-hover:opacity-90">{left}</span>
        </div>
        <span className="text-xs font-bold" style={{ color: '#71717a' }}>VS</span>
        <div className="flex flex-1 items-center gap-2.5">
          <span className="truncate text-sm font-semibold text-white group-hover:opacity-90">{right}</span>
          <SafeImg
            src={resolveTeamLogo(right, match.dire_team_logo)}
            alt={right}
            className="h-10 w-10 object-contain"
            fallback={<div className="flex size-10 items-center justify-center rounded-full text-xs font-bold" style={{ backgroundColor: '#2a2d35', color: '#a1a1aa' }}>{right.substring(0, 2).toUpperCase()}</div>}
          />
        </div>
      </div>

      <div className="mt-5 truncate text-center text-[11px]" style={{ color: '#71717a' }}>
        {match.tournament_name_cn || match.tournament_name || ''}
      </div>

      <Button
        size="sm"
        className="mt-3 w-full rounded-md text-xs font-semibold"
        style={isLive
          ? { backgroundColor: design.red, color: '#fff' }
          : { backgroundColor: '#2a2d35', color: '#d4d4d8', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        {isLive ? 'Watch Live' : 'View Match'}
      </Button>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Live Match 卡片                                                       */
/* ------------------------------------------------------------------ */

function LiveMatchCard({ hero, onOpen }: {
  hero: LiveHeroPayload;
  onOpen?: () => void;
}) {
  const team1 = hero.teams?.[0]?.name || 'TBD';
  const team2 = hero.teams?.[1]?.name || 'TBD';
  const score = parseSeriesScore(hero.seriesScore);
  const liveMap = hero.liveMap;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex flex-col overflow-hidden rounded-xl p-4 text-left transition-transform hover:-translate-y-0.5"
      style={{ backgroundColor: design.card }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/[0.05] to-transparent" />

      <div className="relative flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-bold text-white" style={{ backgroundColor: design.red }}>
          <span className="size-1.5 animate-pulse rounded-full bg-white" />
          LIVE
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: '#a1a1aa' }}>
          <Eye className="size-3.5" />
          {formatViewers(hero.viewerCount)}
        </span>
      </div>

      <div className="relative mt-5 flex items-center justify-center gap-2">
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <SafeImg
            src={resolveTeamLogo(team1, hero.teams?.[0]?.logo)}
            alt={team1}
            className="h-9 w-9 shrink-0 object-contain"
            fallback={<div className="flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ backgroundColor: '#2a2d35', color: '#a1a1aa' }}>{team1.substring(0, 2).toUpperCase()}</div>}
          />
          <span className="min-w-0 text-right text-[13px] font-semibold leading-tight text-white line-clamp-2">{team1}</span>
        </div>
        <div className="flex shrink-0 items-baseline gap-1.5">
          <span className="text-xl font-black tabular-nums text-white">{score.team1}</span>
          <span className="text-sm font-bold" style={{ color: '#71717a' }}>:</span>
          <span className="text-xl font-black tabular-nums text-white">{score.team2}</span>
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="min-w-0 text-[13px] font-semibold leading-tight text-white line-clamp-2">{team2}</span>
          <SafeImg
            src={resolveTeamLogo(team2, hero.teams?.[1]?.logo)}
            alt={team2}
            className="h-9 w-9 shrink-0 object-contain"
            fallback={<div className="flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ backgroundColor: '#2a2d35', color: '#a1a1aa' }}>{team2.substring(0, 2).toUpperCase()}</div>}
          />
        </div>
      </div>

      <div className="relative mt-4 flex items-center justify-between">
        <span className="truncate text-[11px]" style={{ color: '#71717a' }}>
          {hero.leagueName}
          {hero.stage ? ` · ${hero.stage}` : ''}
        </span>
        <span className="text-[11px] font-semibold" style={{ color: liveMap?.status === 'live' ? design.red : '#a1a1aa' }}>
          {liveMap?.label ? liveMap.label.replace(/Map\s*(\d+)/i, 'Game $1') : 'Game 1'}
        </span>
      </div>

      <div className="relative mt-3 flex items-center justify-end gap-1.5 text-xs font-semibold" style={{ color: design.blue }}>
        <Play className="size-3.5 fill-current" />
        观看
      </div>
    </button>
  );
}

function parseSeriesScore(value: string) {
  const match = String(value || '').match(/(\d+)\s*[:-]\s*(\d+)/);
  if (!match) return { team1: 0, team2: 0 };
  return { team1: Number(match[1]) || 0, team2: Number(match[2]) || 0 };
}

/* ------------------------------------------------------------------ */
/* Result 卡片                                                           */
/* ------------------------------------------------------------------ */

function ResultCard({ match, onOpen }: {
  match: FinishedSeries;
  onOpen?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex flex-col rounded-xl p-4 text-left transition-transform hover:-translate-y-0.5"
      style={{ backgroundColor: design.card }}
    >
      <div className="flex items-center justify-between">
        <span className="rounded px-2 py-0.5 text-[11px] font-bold" style={{ color: '#a1a1aa', backgroundColor: '#2a2d35' }}>
          COMPLETED
        </span>
        <span className="text-[11px] font-semibold" style={{ color: '#71717a' }}>
          {formatBestOf(match.series_type)}
        </span>
      </div>

      <div className="mt-5 flex items-center justify-center gap-3">
        <SafeImg
          src={resolveTeamLogo(match.radiant_team_name, match.radiant_team_logo)}
          alt={match.radiant_team_name}
          className="h-9 w-9 object-contain"
          fallback={<div className="flex size-9 items-center justify-center rounded-full text-[10px] font-bold" style={{ backgroundColor: '#2a2d35', color: '#a1a1aa' }}>{match.radiant_team_name.substring(0, 2).toUpperCase()}</div>}
        />
        <div className="flex items-baseline gap-1.5">
          <span className={`text-2xl font-black tabular-nums ${match.radiant_score > match.dire_score ? 'text-white' : ''}`} style={{ color: match.radiant_score > match.dire_score ? '#fff' : '#71717a' }}>
            {match.radiant_score}
          </span>
          <span className="text-sm font-bold" style={{ color: '#71717a' }}>:</span>
          <span className={`text-2xl font-black tabular-nums ${match.dire_score > match.radiant_score ? 'text-white' : ''}`} style={{ color: match.dire_score > match.radiant_score ? '#fff' : '#71717a' }}>
            {match.dire_score}
          </span>
        </div>
        <SafeImg
          src={resolveTeamLogo(match.dire_team_name, match.dire_team_logo)}
          alt={match.dire_team_name}
          className="h-9 w-9 object-contain"
          fallback={<div className="flex size-9 items-center justify-center rounded-full text-[10px] font-bold" style={{ backgroundColor: '#2a2d35', color: '#a1a1aa' }}>{match.dire_team_name.substring(0, 2).toUpperCase()}</div>}
        />
      </div>

      <div className="mt-4 flex items-center justify-between text-[11px]">
        <span className="truncate font-semibold text-white">{match.radiant_team_name} vs {match.dire_team_name}</span>
        <span className="shrink-0 pl-2" style={{ color: '#71717a' }}>{formatTimeAgo(match.start_time)}</span>
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Tournament Spotlight                                                  */
/* ------------------------------------------------------------------ */

function TournamentSpotlight() {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-white/[0.06]" style={{ backgroundColor: '#0a0e14' }}>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at 15% 50%, rgba(43,85,232,0.16) 0%, transparent 55%), radial-gradient(ellipse at 85% 60%, rgba(255,59,48,0.08) 0%, transparent 50%)',
        }}
      />
      <div className="relative z-10 grid min-h-[280px] items-center gap-8 px-8 py-12 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-14">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: '#8ca6ff' }}>
            Tournament Spotlight
          </div>
          <h3 className="mt-3 text-4xl font-black tracking-tight text-white">
            Riyadh Masters 2024
          </h3>
          <p className="mt-2 text-sm" style={{ color: '#a1a1aa' }}>
            The world's best teams. One crown.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-x-10 gap-y-4">
            <div className="flex flex-col">
              <span className="text-xl font-black tabular-nums text-white">$5,000,000</span>
              <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Prize Pool</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-black tabular-nums text-white">24</span>
              <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Teams</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-black tabular-nums" style={{ color: design.red }}>LIVE NOW</span>
              <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Playoffs</span>
            </div>
          </div>

          <Button
            size="lg"
            className="mt-8 w-fit rounded-lg px-6 text-sm font-semibold text-white hover:opacity-90"
            style={{ backgroundColor: design.blue }}
          >
            Explore Tournament
          </Button>
        </div>

        {/* 右侧金色赛事 Logo 占位：后续替换 */}
        <div className="hidden lg:flex items-center justify-center">
          <div className="relative flex size-56 items-center justify-center overflow-hidden rounded-2xl border border-amber-300/20">
            <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(212,164,74,0.14) 0%, rgba(10,14,20,0) 70%)' }} />
            <div className="absolute inset-3 rounded-xl border border-amber-300/10" />
            <span className="relative text-center text-sm font-bold leading-6 tracking-[0.2em] text-amber-300/90">
              RIYADH<br />MASTERS
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Latest News                                                          */
/* ------------------------------------------------------------------ */

interface NewsItem {
  id: string;
  title: string;
  url: string;
  image_url?: string;
  published_at: number;
  category?: string;
  source?: string;
}

const newsCategoryLabels: Record<string, string> = {
  patch: '版本',
  gameplay: '版本',
  esports: '赛事',
  tournament: '赛事',
  community: '社区',
  news: '新闻',
  takes: '观点',
};

function formatNewsDate(timestamp: number): string {
  const diff = Math.max(0, nowTs() - timestamp);
  const minutes = Math.floor(diff / 60);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

function getNewsCategory(category?: string): string {
  return newsCategoryLabels[String(category || '').toLowerCase()] || '新闻';
}

function LatestNewsSection({ items, onMore }: { items: NewsItem[]; onMore?: () => void }) {
  const featured = items[0];
  const rest = items.slice(1, 4);
  return (
    <section>
      <SectionHeader title="Latest News" linkLabel="View All News" onClick={onMore} />
      <div className="grid gap-4 lg:grid-cols-2">
        {featured && (
          <a
            href={featured.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex min-h-[220px] flex-col justify-end overflow-hidden rounded-xl p-5 transition-transform hover:-translate-y-0.5"
            style={{ backgroundColor: design.card }}
          >
            <div className="mb-3 flex items-center gap-2">
              <span className="rounded px-2 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: design.red }}>
                {getNewsCategory(featured.category)}
              </span>
              <span className="text-[11px]" style={{ color: '#71717a' }}>{formatNewsDate(featured.published_at)}</span>
            </div>
            <h3 className="text-lg font-bold leading-snug text-white group-hover:opacity-90">{featured.title}</h3>
          </a>
        )}
        <div className="flex flex-col justify-between gap-2">
          {rest.map((item) => (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-white/[0.04]"
            >
              <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10" style={{ backgroundColor: '#2a2d35' }}>
                <SafeImg
                  src={item.image_url || ''}
                  alt={item.title}
                  className="h-full w-full object-cover"
                  fallback={<span className="text-[10px] font-bold" style={{ color: '#f0f0f5' }}>{getNewsCategory(item.category)}</span>}
                />
              </div>
              <div className="min-w-0 flex-1">
                <span className="block text-[11px]" style={{ color: '#71717a' }}>
                  {formatNewsDate(item.published_at)} · {getNewsCategory(item.category)}
                </span>
                <span className="mt-0.5 block line-clamp-2 text-sm font-medium text-white group-hover:opacity-90">{item.title}</span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Rankings                                                             */
/* ------------------------------------------------------------------ */

function RankingsSection({ teams, onMore }: {
  teams: Array<{ rank: number; name: string; logo: string | null; points: number }>;
  onMore?: () => void;
}) {
  return (
    <section>
      <SectionHeader title="Rankings" linkLabel="View Full Rankings" onClick={onMore} />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {teams.slice(0, 5).map((team) => (
          <button
            key={String(team.rank)}
            type="button"
            onClick={onMore}
            className="group flex flex-col items-center rounded-xl p-4 text-center transition-transform hover:-translate-y-0.5"
            style={{ backgroundColor: design.card }}
          >
            <span className="text-xs font-bold" style={{ color: '#71717a' }}>#{team.rank}</span>
            <SafeImg
              src={resolveTeamLogo(team.name, team.logo)}
              alt={team.name}
              className="my-3 h-12 w-12 object-contain"
              fallback={<div className="my-3 flex size-12 items-center justify-center rounded-full text-xs font-bold" style={{ backgroundColor: '#2a2d35', color: '#a1a1aa' }}>{team.name.substring(0, 2).toUpperCase()}</div>}
            />
            <span className="truncate text-sm font-semibold text-white group-hover:opacity-90">{team.name}</span>
            <span className="mt-0.5 text-xs tabular-nums" style={{ color: '#71717a' }}>{team.points.toLocaleString()} PTS</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Top Players / Top Teams                                              */
/* ------------------------------------------------------------------ */

interface TopPlayer {
  name: string;
  accountId: number;
  teamName?: string | null;
  nationality?: string | null;
  avatarUrl?: string | null;
}

function TopPlayersTeamsSection({ players, teams, onMore }: {
  players: TopPlayer[];
  teams: Array<{ rank: number; name: string; logo: string | null; points: number }>;
  onMore?: () => void;
}) {
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <div>
        <SectionHeader title="Top Players" linkLabel="View All Players" onClick={onMore} />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {players.slice(0, 4).map((player) => (
            <button
              key={player.accountId}
              type="button"
              onClick={onMore}
              className="group flex flex-col items-center rounded-xl p-4 text-center transition-transform hover:-translate-y-0.5"
              style={{ backgroundColor: design.card }}
            >
              <div className="flex size-12 items-center justify-center overflow-hidden rounded-full border border-white/10" style={{ backgroundColor: '#2a2d35' }}>
                <SafeImg
                  src={player.avatarUrl || ''}
                  alt={player.name}
                  className="h-full w-full object-cover"
                  fallback={<span className="text-sm font-bold text-white">{player.name[0].toUpperCase()}</span>}
                />
              </div>
              <span className="mt-2.5 truncate text-sm font-semibold text-white group-hover:opacity-90">{player.name}</span>
              <span className="mt-0.5 truncate text-[11px] font-medium text-amber-300/90">{player.teamName || 'PRO'}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <SectionHeader title="Top Teams" linkLabel="View All Teams" onClick={onMore} />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {teams.slice(0, 5).map((team) => (
            <button
              key={String(team.rank)}
              type="button"
              onClick={onMore}
              className="group flex items-center gap-3 rounded-xl p-3.5 text-left transition-transform hover:-translate-y-0.5"
              style={{ backgroundColor: design.card }}
            >
              <SafeImg
                src={resolveTeamLogo(team.name, team.logo)}
                alt={team.name}
                className="h-9 w-9 shrink-0 object-contain"
                fallback={<div className="flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ backgroundColor: '#2a2d35', color: '#a1a1aa' }}>{team.name.substring(0, 2).toUpperCase()}</div>}
              />
              <div className="min-w-0">
                <span className="block truncate text-sm font-semibold text-white group-hover:opacity-90">{team.name}</span>
                <span className="block text-[11px] tabular-nums" style={{ color: '#71717a' }}>{team.points.toLocaleString()} PTS</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Upcoming Events                                                      */
/* ------------------------------------------------------------------ */

function formatEventMonth(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
}

function UpcomingEventsSection({ matches, onMore }: {
  matches: UpcomingMatch[];
  onMore?: () => void;
}) {
  // 按赛事聚合，取最早开始时间
  const events = new Map<string, { name: string; start: number; count: number }>();
  for (const match of matches) {
    const name = match.tournament_name_cn || match.tournament_name || 'Upcoming';
    const existing = events.get(name);
    if (existing) {
      existing.start = Math.min(existing.start, match.start_time);
      existing.count += 1;
    } else {
      events.set(name, { name, start: match.start_time, count: 1 });
    }
  }
  const eventList = [...events.values()]
    .sort((a, b) => a.start - b.start)
    .slice(0, 4);

  if (eventList.length === 0) return <EmptyState label="暂无赛事安排" />;

  return (
    <section>
      <SectionHeader title="Upcoming Events" linkLabel="View Calendar" onClick={onMore} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {eventList.map((event) => (
          <button
            key={event.name}
            type="button"
            onClick={onMore}
            className="group flex items-center gap-4 rounded-xl p-4 text-left transition-transform hover:-translate-y-0.5"
            style={{ backgroundColor: design.card }}
          >
            <div className="flex h-16 w-14 shrink-0 flex-col items-center justify-center rounded-lg" style={{ backgroundColor: '#2a2d35' }}>
              <span className="text-sm font-black text-white">{formatEventMonth(event.start)}</span>
              <span className="text-xs font-bold" style={{ color: '#71717a' }}>
                {new Date(event.start * 1000).getDate()}
              </span>
            </div>
            <div className="min-w-0">
              <span className="block truncate text-sm font-semibold text-white group-hover:opacity-90">{event.name}</span>
              <span className="mt-0.5 block text-[11px]" style={{ color: '#71717a' }}>
                {event.count} 场比赛
              </span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 主组件                                                               */
/* ------------------------------------------------------------------ */

interface HomeDashboardProps {
  route: RouteState;
  navigate: (route: RouteState, options?: { replace?: boolean }) => void;
  closeOverlay: () => void;
}

export function HomeDashboard({ route, navigate, closeOverlay }: HomeDashboardProps) {
  const [playerModel, setPlayerModel] = useState<PlayerFlyoutModel | null>(null);

  const [upcoming, setUpcoming] = useState<UpcomingMatch[]>([]);
  const [liveHeroes, setLiveHeroes] = useState<LiveHeroPayload[]>([]);
  const [results, setResults] = useState<FinishedSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [news, setNews] = useState<Array<{
    id: string;
    title: string;
    url: string;
    image_url?: string;
    published_at: number;
    category?: string;
    source?: string;
  }>>([]);
  const [rankings, setRankings] = useState<Array<{ rank: number; name: string; logo: string | null; points: number }>>([]);
  const [topPlayers, setTopPlayers] = useState<TopPlayer[]>(hotPlayersSeed);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      const [upcomingRes, liveRes, matchesRes, newsRes, rankRes] = await Promise.allSettled([
        fetch('/api/upcoming?limit=12&days=2'),
        fetch('/api/live-hero', { cache: 'no-store' }),
        fetch('/api/matches?limit=24'),
        fetch('/api/news'),
        fetch('/api/ept-ranking'),
      ]);

      // Top players: enrich seeds from pro-players API (avatar, team, name)
      if (!cancelled) {
        const playerRequests = hotPlayersSeed.map(async (seed) => {
          try {
            const response = await fetch(`/api/pro-players?account_id=${seed.accountId}`);
            if (!response.ok) return seed;
            const payload = await response.json();
            if (!payload || typeof payload !== 'object') return seed;
            return {
              name: payload.name || seed.name,
              accountId: seed.accountId,
              teamName: payload.team_name || seed.teamName,
              nationality: payload.country_code ? String(payload.country_code).toUpperCase() : seed.nationality,
              avatarUrl: payload.avatar_url || null,
            } satisfies TopPlayer;
          } catch {
            return seed;
          }
        });
        Promise.all(playerRequests).then((results) => {
          if (!cancelled) setTopPlayers(results);
        });
      }

      if (!cancelled && upcomingRes.status === 'fulfilled' && upcomingRes.value.ok) {
        try {
          const data = await upcomingRes.value.json();
          setUpcoming(Array.isArray(data?.upcoming) ? data.upcoming : []);
        } catch { /* 保留空态 */ }
      }

      if (!cancelled && liveRes.status === 'fulfilled' && liveRes.value.ok) {
        try {
          const data = await liveRes.value.json();
          const liveMatches = Array.isArray(data?.liveMatches)
            ? data.liveMatches
            : data?.live
              ? [data.live]
              : [];
          setLiveHeroes(liveMatches);
        } catch { /* 保留空态 */ }
      }

      if (!cancelled && matchesRes.status === 'fulfilled' && matchesRes.value.ok) {
        try {
          const data = await matchesRes.value.json();
          const matches: FinishedMatch[] = Array.isArray(data) ? data : (data.matches || []);
          setResults(toFinishedSeries(
            matches.filter((m) => m.radiant_team_name && m.dire_team_name)
          ));
        } catch { /* 保留空态 */ }
      }

      if (!cancelled && newsRes.status === 'fulfilled' && newsRes.value.ok) {
        try {
          const data = await newsRes.value.json();
          setNews((Array.isArray(data) ? data : []).slice(0, 4));
        } catch { /* 保留空态 */ }
      }

      if (!cancelled && rankRes.status === 'fulfilled' && rankRes.value.ok) {
        try {
          const data = await rankRes.value.json();
          setRankings(Array.isArray(data?.teams) ? data.teams.slice(0, 5) : []);
        } catch { /* 保留空态 */ }
      }

      if (!cancelled) setLoading(false);
    };
    void fetchData();
    return () => { cancelled = true; };
  }, []);

  const overlay = route.overlay;
  const activeMatchId = overlay?.type === 'match' ? Number(overlay.matchId) : null;
  const activeTeamName = overlay?.type === 'team' ? overlay.teamName : null;
  const activePlayerId = overlay?.type === 'player' ? Number(overlay.accountId) : null;

  const openOverlay = (next: Extract<RouteState['overlay'], NonNullable<RouteState['overlay']>>) => {
    navigate({ page: 'home', overlay: next }, { replace: overlay !== null });
  };

  const [seriesMaps, setSeriesMaps] = useState<Array<{
    label: string;
    matchId: string;
    radiantScore?: number;
    direScore?: number;
    duration?: number;
  }>>([]);

  useEffect(() => {
    if (activeMatchId === null || !Number.isFinite(activeMatchId)) setSeriesMaps([]);
  }, [activeMatchId]);

  useEffect(() => {
    if (activePlayerId === null || !Number.isFinite(activePlayerId)) return;
    let cancelled = false;
    setPlayerModel((current) =>
      current?.accountId === activePlayerId ? current : createMinimalPlayerFlyoutModel(activePlayerId),
    );
    void fetchPlayerProfileFlyoutModel(activePlayerId, {
      onHydrated: (fullModel) => {
        if (cancelled) return;
        setPlayerModel((current) =>
          current?.accountId === activePlayerId ? mergePlayerModel(current, fullModel) : current,
        );
      },
    })
      .then((model) => {
        if (cancelled) return;
        setPlayerModel((current) => (current?.accountId !== activePlayerId ? current : mergePlayerModel(current, model)));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activePlayerId]);

  const handleOpenMatch = (matchId: number | string, maps: Array<{
    label: string;
    matchId: string;
    radiantScore?: number;
    direScore?: number;
    duration?: number;
  }> = []) => {
    const numericId = typeof matchId === 'string' ? Number(matchId) : matchId;
    if (!Number.isFinite(numericId)) return;
    setSeriesMaps(maps);
    openOverlay({ type: 'match', matchId: String(numericId) });
  };

  const handleOpenTeam = (teamName: string) => {
    openOverlay({ type: 'team', teamName });
  };

  const handleOpenPlayerByAccountId = (accountId: number) => {
    setPlayerModel(null);
    openOverlay({ type: 'player', accountId: String(accountId) });
  };

  const liveCount = liveHeroes.length;
  const scheduleUpcoming = upcoming.filter((m) => m.start_time >= nowTs()).slice(0, 4);
  const liveUpcomingCount = upcoming.filter((m) => m.start_time >= nowTs()).length;
  const resultsCount = results.length;

  // 每张卡片打开比赛详情时携带系列赛信息
  const buildSeriesMaps = (hero: LiveHeroPayload) =>
    hero.maps
      ?.filter((m) => m.matchId !== null && m.matchId !== undefined)
      .map((m) => ({
        label: m.label,
        matchId: String(m.matchId),
        radiantScore: m.team1Score ?? undefined,
        direScore: m.team2Score ?? undefined,
        duration: m.gameTime ?? undefined,
      })) || [];

  const scheduleCards = useMemo(() => {
    return scheduleUpcoming.map((match) => ({
      match,
      isLive: match.start_time <= nowTs(),
      onClick: () => handleOpenMatch(match.match_id || match.id || ''),
    }));
  }, [scheduleUpcoming]);

  return (
    <div className="relative mx-auto w-full max-w-[1280px] px-4 pt-24 lg:px-6" style={{ backgroundColor: design.bg }}>
      <div className="flex flex-col gap-12 pb-16">
        <HeroBanner
          liveCount={liveCount}
          upcomingCount={liveUpcomingCount}
          resultsCount={resultsCount}
        />

        {/* Today's Schedule */}
        <section>
          <SectionHeader
            title="Today's Schedule"
            linkLabel="View Full Schedule"
            onClick={() => navigate({ page: 'matches', overlay: null })}
          />
          {loading || scheduleCards.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {scheduleCards.length > 0
                ? scheduleCards.map(({ match, isLive, onClick }) => (
                    <ScheduleCard key={String(match.match_id || match.id || `${match.start_time}-${match.radiant_team_name}`)} match={match} isLive={isLive} onOpen={onClick} />
                  ))
                : Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-[172px] animate-pulse rounded-xl" style={{ backgroundColor: design.card }} />
                  ))}
            </div>
          ) : (
            <EmptyState label="今日暂无赛程安排" />
          )}
        </section>

        {/* Live Matches */}
        <section>
          <SectionHeader
            title="Live Matches"
            accent={{ text: design.red, count: `${liveCount} LIVE` }}
            linkLabel="View All Live"
            onClick={() => navigate({ page: 'matches', overlay: null })}
          />
          {liveHeroes.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {liveHeroes.slice(0, 4).map((hero) => (
                <LiveMatchCard
                  key={`${hero.leagueName}-${hero.teams?.[0]?.name}-${hero.teams?.[1]?.name}`}
                  hero={hero}
                  onOpen={() => handleOpenMatch(hero.liveMap?.matchId ?? hero.maps?.[0]?.matchId ?? '', buildSeriesMaps(hero))}
                />
              ))}
            </div>
          ) : (
            <EmptyState label="当前没有进行中的比赛" />
          )}
        </section>

        {/* Recent Results */}
        <section>
          <SectionHeader
            title="Recent Results"
            linkLabel="View All Results"
            onClick={() => navigate({ page: 'matches', overlay: null })}
          />
          {results.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {results.slice(0, 4).map((match) => (
                <ResultCard
                  key={String(match.match_id)}
                  match={match}
                  onOpen={() => handleOpenMatch(match.match_id)}
                />
              ))}
            </div>
          ) : (
            <EmptyState label="暂无比赛结果" />
          )}
        </section>

        {/* Tournament Spotlight */}
        <TournamentSpotlight />

        {/* Latest News */}
        <LatestNewsSection
          items={news}
          onMore={() => navigate({ page: 'home', overlay: null })}
        />

        {/* Rankings */}
        <RankingsSection
          teams={rankings.length > 0 ? rankings : topTeamsSeed}
          onMore={() => navigate({ page: 'home', overlay: null })}
        />

        {/* Top Players / Top Teams */}
        <TopPlayersTeamsSection
          players={topPlayers}
          teams={rankings.length > 0 ? rankings : topTeamsSeed}
          onMore={() => navigate({ page: 'home', overlay: null })}
        />

        {/* Upcoming Events */}
        <UpcomingEventsSection
          matches={upcoming}
          onMore={() => navigate({ page: 'matches', overlay: null })}
        />
      </div>

      {activeTeamName !== null && (
        <TeamFlyout
          open
          onOpenChange={(open) => { if (!open) closeOverlay(); }}
          selectedTeam={{ name: activeTeamName }}
          teams={[]}
          matches={[]}
          upcoming={[]}
          onPlayerClick={handleOpenPlayerByAccountId}
          onTeamSelect={(team) => { if (team.name) handleOpenTeam(team.name); }}
        />
      )}

      {activePlayerId !== null && Number.isFinite(activePlayerId) && (
        <PlayerProfileFlyout
          open
          onOpenChange={(open) => { if (!open) closeOverlay(); }}
          player={playerModel}
          onTeamSelect={(team) => { if (team.name) handleOpenTeam(team.name); }}
        />
      )}

      {activeMatchId !== null && Number.isFinite(activeMatchId) && (
        <MatchDetailModal
          matchId={activeMatchId}
          seriesMaps={seriesMaps}
          open
          onOpenChange={(open) => { if (!open) closeOverlay(); }}
          fullPage
          onTeamClick={(team) => { if (team.name) handleOpenTeam(team.name); }}
          onPlayerClick={handleOpenPlayerByAccountId}
        />
      )}
    </div>
  );
}
