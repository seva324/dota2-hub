import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { MapPin, Trophy, ChevronRight, Flame, Clock, Calendar, Award, Loader2 } from 'lucide-react';
import { MatchDetailModal } from '@/components/custom/MatchDetailModal';
import { PlayerProfileFlyout } from '@/components/custom/PlayerProfileFlyout';
import { TeamFlyout } from '@/components/custom/TeamFlyout';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { createMinimalPlayerFlyoutModel, fetchPlayerProfileFlyoutModel } from '@/lib/playerProfile';
import type { PlayerFlyoutModel } from '@/lib/playerProfile';
import { isChineseTeam as isChineseTeamFromTeams, resolveTeamLogo } from '@/lib/teams';

// Hero data type
interface HeroData {
  id: number;
  name: string;
  name_cn: string;
  img: string;
  img_url: string;
}

// Hero picks for a game
interface HeroPick {
  hero_id: number;
  team: 'radiant' | 'dire';
  is_pick: boolean;
  order: number;
}

// Load heroes data
const heroesData: Record<number, HeroData> = {};

async function loadHeroesData() {
  try {
    const res = await fetch('/api/heroes');
    const heroesJson = await res.json();
    Object.entries(heroesJson).forEach(([key, value]) => {
      heroesData[parseInt(key)] = value as HeroData;
    });
  } catch (err) {
    console.error('Error loading heroes:', err);
  }
}

// Create hero lookup functions
function getHeroNameCn(id: number): string {
  const hero = heroesData[id];
  return hero?.name_cn || hero?.name || `英雄 ${id}`;
}

function getHeroImgUrl(id: number): string {
  const hero = heroesData[id];
  return hero?.img_url || '';
}

interface Tournament {
  id: string;
  league_id?: string | number | null;
  name: string;
  name_cn?: string;
  tier?: string | null;
  prize_pool?: string;
  prize_pool_usd?: number;
  location?: string;
  start_date?: string;
  end_date?: string;
  start_time?: number;
  end_time?: number;
  status: string;
  image?: string;
}

interface Series {
  series_id: string;
  series_type: string;
  radiant_team_id?: string | null;
  dire_team_id?: string | null;
  radiant_team_name: string;
  dire_team_name: string;
  radiant_team_logo?: string;
  dire_team_logo?: string;
  radiant_score: number;
  dire_score: number;
  games: Game[];
  stage: string;
  stage_kind?: string | null;
}

interface Game {
  match_id: string;
  radiant_team_id?: string | null;
  dire_team_id?: string | null;
  radiant_team_name: string;
  dire_team_name: string;
  radiant_score: number;
  dire_score: number;
  radiant_win: boolean | number;
  start_time: number;
  duration: number;
  picks_bans?: HeroPick[];
}

interface TournamentSeriesResponse {
  tournament?: Tournament;
  series?: Series[];
  pagination?: {
    limit?: number;
    offset?: number;
    total?: number;
    hasMore?: boolean;
  };
}

interface TournamentSeriesState {
  items: Series[];
  total: number;
  hasMore: boolean;
  loading: boolean;
  error: string;
}

interface FeaturedEventRoundCell {
  roundLabel: string;
  pending: boolean;
  href?: string | null;
  matchId?: string | null;
  siteSeriesId?: string | null;
  opponentName?: string | null;
  opponentTeamId?: string | null;
  opponentLogoUrl?: string | null;
  opponentIsCnTeam?: boolean;
  score?: string | null;
}

interface FeaturedEventStandingRow {
  rank: number;
  teamId?: string | null;
  teamName: string;
  country?: string | null;
  record?: string | null;
  mapRecord?: string | null;
  logoUrl?: string | null;
  teamHref?: string | null;
  isCnTeam?: boolean;
  advancement?: 'playoff' | 'upper' | 'lower' | 'eliminated' | string | null;
  rounds: FeaturedEventRoundCell[];
}

interface FeaturedEventGroup {
  name: string;
  standings: FeaturedEventStandingRow[];
}

interface FeaturedEventPlayoffMatch {
  href?: string | null;
  matchId?: string | null;
  siteSeriesId?: string | null;
  startTime?: string | null;
  teams: Array<{
    teamId?: string | null;
    name: string;
    logoUrl?: string | null;
    isCnTeam?: boolean;
    score?: string | null;
  }>;
}

interface FeaturedEventPlayoffRound {
  roundName: string;
  matches: FeaturedEventPlayoffMatch[];
}

interface FeaturedEventMatchRow {
  href?: string | null;
  matchId?: string | null;
  siteSeriesId?: string | null;
  startTime?: string | null;
  score?: string | null;
  teams: Array<{
    teamId?: string | null;
    name: string;
    shortName?: string | null;
    logoUrl?: string | null;
    isCnTeam?: boolean;
  }>;
}

interface FeaturedTournamentPayload {
  tournamentId: string;
  title: string;
  sourceLabel: string;
  sourceUrl: string;
  fetchedAt: string;
  groupStage: {
    title: string;
    format?: 'swiss' | 'round-robin' | string;
    rounds: string[];
    groups?: FeaturedEventGroup[];
    standings: FeaturedEventStandingRow[];
  };
  playoffs: {
    title: string;
    rounds: FeaturedEventPlayoffRound[];
  };
  matches: {
    title: string;
    upcoming: FeaturedEventMatchRow[];
    finished: FeaturedEventMatchRow[];
  };
}

interface FeaturedTournamentState {
  data: FeaturedTournamentPayload | null;
  loading: boolean;
  error: string;
}

const DEFAULT_SERIES_PAGE_SIZE = 10;
const FEATURED_TOURNAMENT_KEYS = new Set([
  'pgl-wallachia-s7',
  '19435',
  'pgl wallachia season 7',
  'esl-one-birmingham-2026',
  '19669',
  'esl one birmingham 2026',
  'esl one season birmingham',
]);

// Team data type for team abbreviations
const FALLBACK_TEAM_ABBR: Record<string, string> = {
  'Xtreme Gaming': 'XG', 'Yakult Brothers': 'YB',
  'Team Spirit': 'Spirit', 'Natus Vincere': "Na'Vi",
  'Tundra Esports': 'Tundra', 'Team Liquid': 'Liquid',
  'Team Falcons': 'Falcons', 'OG': 'OG',
  'GamerLegion': 'GL', 'PARIVISION': 'PARI',
  'BetBoom Team': 'BB', 'paiN Gaming': 'paiN',
  'Aurora Gaming': 'Aurora', 'Execration': 'XctN',
  'MOUZ': 'MOUZ', 'Vici Gaming': 'VG', 'PSG.LGD': 'LGD',
  'Team Yandex': 'Yandex', 'Tidebound': 'Tidebound',
  'Team Nemesis': 'Nemesis', '1w Team': '1w',
  'Nigma Galaxy': 'Nigma', 'Virtus.pro': 'VP',
  'Gaimin Gladiators': 'GG', 'HEROIC': 'HEROIC',
};

function normalizeTeamAlias(name?: string | null): string {
  return String(name || '').trim().toLowerCase();
}

function getTeamAbbrev(teamName: string | null | undefined, aliasToTag: Map<string, string>): string {
  if (!teamName) return 'TBD';
  const fromTeamsTable = aliasToTag.get(normalizeTeamAlias(teamName));
  if (fromTeamsTable) return fromTeamsTable;
  return FALLBACK_TEAM_ABBR[teamName] || teamName.substring(0, 3).toUpperCase();
}

// Render team name with responsive display: abbrev on mobile, full name on desktop
function renderTeamName(teamName: string, aliasToTag: Map<string, string>, className?: string): React.JSX.Element {
  const abbrev = getTeamAbbrev(teamName, aliasToTag);
  return (
    <span className={className}>
      <span className="sm:hidden">{abbrev}</span>
      <span className="hidden sm:inline">{teamName}</span>
    </span>
  );
}

interface TournamentSectionProps {
  tournaments?: Tournament[];
  seriesByTournament?: Record<string, Series[]>;
  allMatches?: Array<{
    match_id: string | number;
    start_time: number;
    series_type?: string | null;
    status?: string | null;
    league_id?: number | null;
    radiant_team_id?: string | null;
    dire_team_id?: string | null;
    radiant_team_name?: string | null;
    dire_team_name?: string | null;
    radiant_score?: number | null;
    dire_score?: number | null;
    radiant_win?: number | boolean | null;
    tournament_name?: string | null;
  }>;
  upcoming?: Array<{
    id: string | number;
    start_time: number;
    series_type?: string | null;
    league_id?: number | null;
    radiant_team_id?: string | null;
    dire_team_id?: string | null;
    radiant_team_name?: string | null;
    dire_team_name?: string | null;
    tournament_name?: string | null;
  }>;
  teams?: Array<{
    team_id?: string | null;
    id?: string | null;
    name?: string | null;
    name_cn?: string | null;
    tag?: string | null;
    logo_url?: string | null;
    region?: string | null;
    is_cn_team?: number | boolean;
  }>;
}

const statusMap: Record<string, { label: string; color: string; gradient: string }> = {
  upcoming: { 
    label: '即将开始', 
    color: 'bg-blue-600/20 text-blue-400 border-blue-600/30',
    gradient: 'from-blue-500 to-cyan-500'
  },
  ongoing: { 
    label: '直播中', 
    color: 'bg-red-600/20 text-red-400 border-red-600/30',
    gradient: 'from-red-500 to-orange-500'
  },
  completed: { 
    label: '已结束', 
    color: 'bg-slate-600/20 text-slate-400 border-slate-600/30',
    gradient: 'from-slate-500 to-slate-600'
  },
};


function useInView<T extends HTMLElement>(options?: IntersectionObserverInit) {
  const ref = useRef<T | null>(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    if (isInView || typeof IntersectionObserver === 'undefined') {
      if (typeof IntersectionObserver === 'undefined') {
        setIsInView(true);
      }
      return;
    }

    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setIsInView(true);
        observer.disconnect();
      }
    }, options);

    observer.observe(node);
    return () => observer.disconnect();
  }, [isInView, options]);

  return { ref, isInView };
}

function TournamentSeriesSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="rounded-2xl border border-white/10 bg-slate-800/40 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-slate-700/70 animate-pulse" />
              <div className="h-6 w-28 rounded-lg bg-slate-700/70 animate-pulse" />
            </div>
            <div className="h-10 w-full rounded-xl bg-slate-700/70 animate-pulse sm:w-72" />
          </div>
        </div>
      ))}
    </div>
  );
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  if (hours > 0) {
    return `${hours}h ${remainingMins}m`;
  }
  return `${remainingMins}m`;
}

function formatDate(value?: string | number): string {
  if (!value) return 'TBD';
  const date = typeof value === 'number' ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return 'TBD';
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

function formatPrizeUsd(value?: number, fallback?: string): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(value);
  }
  return fallback || 'TBD';
}

function parseEventDateTime(value?: string | null): Date | null {
  if (!value) return null;
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatEventDateTime(value?: string | null, options?: Intl.DateTimeFormatOptions): string {
  const date = parseEventDateTime(value);
  if (!date) return 'TBD';
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  });
}

function formatFeaturedFetchTime(value?: string | null): string {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'TBD';
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isFeaturedTournament(tournament: Tournament | null): boolean {
  if (!tournament) return false;
  const keys = [tournament.id, tournament.league_id, tournament.name]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);
  return keys.some((key) => FEATURED_TOURNAMENT_KEYS.has(key));
}

function getFeaturedTournamentRequestId(tournament: Tournament | null): string | null {
  if (!tournament) return null;

  const normalizedName = String(tournament.name || '').trim().toLowerCase();
  const normalizedLeagueId = String(tournament.league_id || '').trim().toLowerCase();

  if (normalizedLeagueId === '19435' || normalizedName === 'pgl wallachia season 7') {
    return 'pgl-wallachia-s7';
  }

  if (
    normalizedLeagueId === '19669'
    || normalizedName === 'esl one birmingham 2026'
    || normalizedName === 'esl one season birmingham'
  ) {
    return 'esl-one-birmingham-2026';
  }

  return String(tournament.id || tournament.league_id || tournament.name || '').trim() || null;
}

function FeaturedTeamChip({
  teamId,
  name,
  logoUrl,
  isCnTeam = false,
  aliasToTag,
  teams,
  emphasize = false,
  preferFullName = false,
}: {
  teamId?: string | null;
  name: string;
  logoUrl?: string | null;
  isCnTeam?: boolean;
  aliasToTag: Map<string, string>;
  teams: NonNullable<TournamentSectionProps['teams']>;
  emphasize?: boolean;
  preferFullName?: boolean;
}) {
  const resolvedLogo = resolveTeamLogo({ teamId, name }, teams, logoUrl);
  const highlighted = isCnTeam || isChineseTeamFromTeams({ teamId, name }, teams);

  return (
    <div className="flex min-w-0 items-center gap-2">
      {resolvedLogo ? (
        <img
          src={resolvedLogo}
          alt={name}
          className={`h-6 w-6 rounded-full object-contain p-0.5 ${highlighted ? 'border border-red-400/50 bg-red-500/10' : 'border border-white/10 bg-slate-900'}`}
        />
      ) : (
        <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold ${highlighted ? 'border border-red-400/50 bg-red-500/10 text-red-100' : 'border border-white/10 bg-slate-800 text-slate-300'}`}>
          {getTeamAbbrev(name, aliasToTag)}
        </div>
      )}
      <span className={`min-w-0 truncate text-sm ${highlighted ? 'font-semibold text-red-100' : emphasize ? 'font-semibold text-white' : 'text-slate-300'}`}>
        {preferFullName ? name : renderTeamName(name, aliasToTag)}
      </span>
      {highlighted ? (
        <span className="rounded-full border border-red-400/30 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-200">
          CN
        </span>
      ) : null}
    </div>
  );
}

function FeaturedMatchSurface({
  href,
  matchId,
  onOpenMatch,
  className,
  children,
}: {
  href?: string | null;
  matchId?: string | null;
  onOpenMatch: (matchId: string) => void;
  className: string;
  children: React.ReactNode;
}) {
  if (matchId) {
    return (
      <button
        type="button"
        onClick={() => onOpenMatch(matchId)}
        className={className}
      >
        {children}
      </button>
    );
  }

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={className}
      >
        {children}
      </a>
    );
  }

  return <div className={className}>{children}</div>;
}

function getFeaturedAdvancementTone(advancement?: string | null) {
  if (advancement === 'playoff' || advancement === 'upper') {
    return {
      row: 'bg-emerald-500/[0.08]',
      sticky: 'bg-slate-950/96',
      badge: 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100',
    };
  }

  if (advancement === 'lower') {
    return {
      row: 'bg-amber-500/[0.08]',
      sticky: 'bg-slate-950/96',
      badge: 'border-amber-400/20 bg-amber-500/10 text-amber-100',
    };
  }

  return {
    row: 'bg-rose-500/[0.07]',
    sticky: 'bg-slate-950/96',
    badge: 'border-rose-400/20 bg-rose-500/10 text-rose-100',
  };
}

function getFeaturedRoundTone(round: FeaturedEventRoundCell) {
  if (round.pending) {
    return 'border-white/10 bg-slate-950/50 text-slate-500';
  }

  if (round.matchId) {
    return 'border-emerald-400/20 bg-emerald-500/[0.08] text-white';
  }

  return 'border-white/10 bg-slate-900/70 text-white';
}

function getFeaturedAdvancementLabel(advancement?: string | null) {
  if (advancement === 'playoff') return 'Playoffs';
  if (advancement === 'upper') return 'UB Seed';
  if (advancement === 'lower') return 'LB Seed';
  return 'Out';
}

function FeaturedGroupCards({
  groups,
  aliasToTag,
  teams,
}: {
  groups: FeaturedEventGroup[];
  aliasToTag: Map<string, string>;
  teams: NonNullable<TournamentSectionProps['teams']>;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {groups.map((group) => (
        <div key={group.name} className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/70">
          <div className="flex items-center justify-between border-b border-white/10 bg-[linear-gradient(135deg,rgba(245,158,11,0.12),rgba(15,23,42,0.94))] px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-white">{group.name}</div>
              <div className="text-[11px] text-slate-400">Round-robin standings</div>
            </div>
            <div className="rounded-full border border-amber-400/20 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-100">
              BO2 League
            </div>
          </div>
          <div className="grid grid-cols-[52px_minmax(0,1fr)_88px_80px_86px] border-b border-white/10 px-4 py-2 text-[11px] uppercase tracking-wide text-slate-400">
            <span>Rank</span>
            <span>Team</span>
            <span className="text-center">Series</span>
            <span className="text-center">Maps</span>
            <span className="text-right">Seed</span>
          </div>
          <div className="divide-y divide-white/10">
            {group.standings.map((row) => {
              const tone = getFeaturedAdvancementTone(row.advancement);
              return (
                <div key={`${group.name}-${row.rank}-${row.teamName}`} className={`grid grid-cols-[52px_minmax(0,1fr)_88px_80px_86px] items-center gap-2 px-4 py-3 ${tone.row}`}>
                  <div className="text-sm font-semibold text-white">#{row.rank}</div>
                  <div className="min-w-0">
                    <FeaturedTeamChip
                      teamId={row.teamId}
                      name={row.teamName}
                      logoUrl={row.logoUrl}
                      isCnTeam={row.isCnTeam}
                      aliasToTag={aliasToTag}
                      teams={teams}
                      emphasize
                    />
                    {row.country ? <div className="pl-8 text-xs text-slate-500">{row.country}</div> : null}
                  </div>
                  <div className="text-center text-sm font-semibold text-white">{row.record || 'TBD'}</div>
                  <div className="text-center text-sm text-slate-300">{row.mapRecord || '—'}</div>
                  <div className="text-right">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone.badge}`}>
                      {getFeaturedAdvancementLabel(row.advancement)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function getFeaturedPlayoffTone(roundName: string) {
  if (/Upper Bracket/i.test(roundName)) {
    return 'border-emerald-400/20 bg-emerald-500/[0.06]';
  }
  if (/Lower Bracket/i.test(roundName)) {
    return 'border-amber-400/20 bg-amber-500/[0.06]';
  }
  return 'border-fuchsia-400/20 bg-fuchsia-500/[0.06]';
}

function FeaturedCompactPlayoffMatch({
  match,
  aliasToTag,
  teams,
  onOpenMatch,
  className,
}: {
  match: FeaturedEventPlayoffMatch;
  aliasToTag: Map<string, string>;
  teams: NonNullable<TournamentSectionProps['teams']>;
  onOpenMatch: (matchId: string) => void;
  className: string;
}) {
  const resolvedTeams = match.teams.length
    ? match.teams
    : [
        { name: 'TBD', score: '-', teamId: null, logoUrl: null, isCnTeam: false },
        { name: 'TBD', score: '-', teamId: null, logoUrl: null, isCnTeam: false },
      ];

  return (
    <FeaturedMatchSurface
      href={match.href}
      matchId={match.matchId}
      onOpenMatch={onOpenMatch}
      className={`block rounded-xl border p-3 text-left transition-colors hover:border-white/20 ${className}`}
    >
      <div className="space-y-2">
        {resolvedTeams.map((team, index) => (
          <div key={`${team.name}-${index}`} className="flex items-center justify-between gap-3">
            <FeaturedTeamChip
              teamId={team.teamId}
              name={team.name}
              logoUrl={team.logoUrl}
              isCnTeam={team.isCnTeam}
              aliasToTag={aliasToTag}
              teams={teams}
              preferFullName
            />
            <span className="min-w-[18px] text-right text-sm font-semibold text-white">{team.score ?? '-'}</span>
          </div>
        ))}
      </div>
    </FeaturedMatchSurface>
  );
}

function FeaturedCompactPlayoffRound({
  round,
  aliasToTag,
  teams,
  onOpenMatch,
}: {
  round: FeaturedEventPlayoffRound;
  aliasToTag: Map<string, string>;
  teams: NonNullable<TournamentSectionProps['teams']>;
  onOpenMatch: (matchId: string) => void;
}) {
  const toneClass = getFeaturedPlayoffTone(round.roundName);
  const matches = round.matches.length
    ? round.matches
    : [{ href: null, matchId: null, startTime: null, teams: [] }];

  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{round.roundName}</div>
      <div className="space-y-2">
        {matches.map((match, index) => (
          <FeaturedCompactPlayoffMatch
            key={`${round.roundName}-${match.href || match.matchId || index}`}
            match={match}
            aliasToTag={aliasToTag}
            teams={teams}
            onOpenMatch={onOpenMatch}
            className={toneClass}
          />
        ))}
      </div>
    </div>
  );
}

const ESL_BIRMINGHAM_PLAYOFF_ORDER = [
  'upper-r1',
  'upper-semis',
  'upper-finals',
  'grand-finals',
  'lower-r1',
  'lower-r2',
  'lower-r3',
  'lower-finals',
] as const;

function normalizeFeaturedPlayoffRoundKey(roundName: string) {
  const normalized = String(roundName || '').trim().toLowerCase();
  if (normalized.includes('grand final')) return 'grand-finals';
  if (normalized.includes('upper bracket') && normalized.includes('r1')) return 'upper-r1';
  if (normalized.includes('upper bracket') && normalized.includes('semi')) return 'upper-semis';
  if (normalized.includes('upper bracket') && normalized.includes('final')) return 'upper-finals';
  if (normalized.includes('lower bracket') && normalized.includes('r1')) return 'lower-r1';
  if (normalized.includes('lower bracket') && normalized.includes('r2')) return 'lower-r2';
  if (normalized.includes('lower bracket') && normalized.includes('r3')) return 'lower-r3';
  if (normalized.includes('lower bracket') && normalized.includes('final')) return 'lower-finals';
  return normalized;
}

function getFeaturedPlayoffRoundOrder(roundName: string) {
  const key = normalizeFeaturedPlayoffRoundKey(roundName);
  const index = ESL_BIRMINGHAM_PLAYOFF_ORDER.indexOf(key as typeof ESL_BIRMINGHAM_PLAYOFF_ORDER[number]);
  return index === -1 ? ESL_BIRMINGHAM_PLAYOFF_ORDER.length + 1 : index;
}

function formatBracketDateLabel(startTime?: string | null) {
  const raw = String(startTime || '').trim();
  if (!raw) return { month: '', day: '' };
  const parsed = new Date(raw.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) {
    const matched = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!matched) return { month: '', day: '' };
    const month = Number(matched[2]);
    const day = matched[3];
    return {
      month: ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][month - 1] || '',
      day,
    };
  }

  return {
    month: parsed.toLocaleString('en-US', { month: 'short' }).toUpperCase(),
    day: String(parsed.getDate()).padStart(2, '0'),
  };
}

function FeaturedDltvPlayoffMatch({
  match,
  aliasToTag,
  teams,
  onOpenMatch,
}: {
  match: FeaturedEventPlayoffMatch;
  aliasToTag: Map<string, string>;
  teams: NonNullable<TournamentSectionProps['teams']>;
  onOpenMatch: (matchId: string) => void;
}) {
  const resolvedTeams = match.teams.length
    ? match.teams
    : [
        { name: 'TBD', score: '-', teamId: null, logoUrl: null, isCnTeam: false },
        { name: 'TBD', score: '-', teamId: null, logoUrl: null, isCnTeam: false },
      ];

  return (
    <FeaturedMatchSurface
      href={match.href}
      matchId={match.matchId}
      onOpenMatch={onOpenMatch}
      className="relative block rounded-none border border-white/10 bg-slate-900/90 text-left shadow-[0_8px_18px_rgba(2,6,23,0.24)] transition-colors hover:border-white/20 hover:bg-slate-900"
    >
      <div className="absolute inset-y-0 left-[34px] w-px bg-white/10" />
      <div className="absolute inset-y-0 left-0 flex w-[34px] flex-col items-center justify-center border-r border-white/10 bg-slate-950/30 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-300">
        {(() => {
          const { month, day } = formatBracketDateLabel(match.startTime);
          return month && day ? (
            <>
              <span>{month}</span>
              <span className="text-[11px] font-bold text-white">{day}</span>
            </>
          ) : null;
        })()}
      </div>
      <div className="relative min-h-[120px] pl-9">
        {resolvedTeams.map((team, index) => {
          const logoUrl = resolveTeamLogo({ teamId: team.teamId, name: team.name }, teams, team.logoUrl);
          const isTop = index === 0;
          return (
            <div
              key={`${team.name}-${index}`}
              className={`flex h-[59px] items-center gap-3 px-3 ${isTop ? 'border-b border-white/10' : ''}`}
            >
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={team.name || 'Team'}
                  className={`h-8 w-8 shrink-0 object-contain opacity-90 ${team.isCnTeam ? 'border border-red-400/35 bg-red-500/10 p-0.5' : 'border border-white/10 bg-slate-950/80 p-0.5'}`}
                />
              ) : (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-white/10 bg-slate-950/80 text-[10px] font-semibold text-slate-300">
                  {team.name === 'TBD' ? '' : getTeamAbbrev(team.name, aliasToTag)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                {renderTeamName(
                  team.name || 'TBD',
                  aliasToTag,
                  `block truncate text-base leading-none ${team.isCnTeam ? 'font-semibold text-red-100' : 'font-semibold text-slate-100'}`
                )}
              </div>
              <span className="min-w-[18px] text-right text-xl font-semibold leading-none text-slate-300">{team.score ?? '-'}</span>
            </div>
          );
        })}
        <div className="pointer-events-none absolute left-[73px] top-1/2 z-10 -translate-y-1/2 bg-slate-900 px-2 text-xl font-black tracking-tight text-white">
          VS
        </div>
      </div>
    </FeaturedMatchSurface>
  );
}

function FeaturedPlayoffColumnHeader({ title }: { title: string }) {
  const displayTitle = title
    .replace('Upper Bracket ', 'Upper Bracket\n')
    .replace('Lower Bracket ', 'Lower Bracket\n')
    .replace('Grand Finals', 'Grand Finals');
  return (
    <div className="mb-7 inline-flex h-[54px] min-w-[144px] items-center justify-center border border-white/10 bg-slate-900/82 px-5 py-2 text-center text-[16px] font-medium leading-[1.15] text-slate-100">
      <span className="whitespace-pre-line">{displayTitle}</span>
    </div>
  );
}

function FeaturedPlayoffConnector({ className }: { className: string }) {
  return <div className={`pointer-events-none absolute border-white/10 ${className}`} />;
}

function FeaturedPlacementBadge({
  placement,
  prize,
  className,
}: {
  placement: string;
  prize: string;
  className: string;
}) {
  return (
    <div className={`absolute flex items-start gap-2 text-slate-300 ${className}`}>
      <Trophy className="mt-0.5 h-5 w-5 text-amber-300/80" />
      <div className="leading-none">
        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-400">{placement}</div>
        <div className="mt-1 text-[15px] font-bold text-white">{prize}</div>
      </div>
    </div>
  );
}

function FeaturedESLBirminghamPlayoffBracket({
  payload,
  onOpenMatch,
  aliasToTag,
  teams,
}: {
  payload: FeaturedTournamentPayload;
  onOpenMatch: (matchId: string) => void;
  aliasToTag: Map<string, string>;
  teams: NonNullable<TournamentSectionProps['teams']>;
}) {
  const sortedRounds = payload.playoffs.rounds.length
    ? [...payload.playoffs.rounds].sort((a, b) => getFeaturedPlayoffRoundOrder(a.roundName) - getFeaturedPlayoffRoundOrder(b.roundName))
    : [{ roundName: 'Grand Finals', matches: [] }];
  const roundByKey = new Map(sortedRounds.map((round) => [normalizeFeaturedPlayoffRoundKey(round.roundName), round]));
  const upperR1 = roundByKey.get('upper-r1') || { roundName: 'Upper Bracket R1', matches: [] };
  const upperFinals = roundByKey.get('upper-finals') || { roundName: 'Upper Bracket Finals', matches: [] };
  const grandFinals = roundByKey.get('grand-finals') || { roundName: 'Grand Finals', matches: [] };
  const lowerR1 = roundByKey.get('lower-r1') || { roundName: 'Lower Bracket R1', matches: [] };
  const lowerR2 = roundByKey.get('lower-r2') || { roundName: 'Lower Bracket R2', matches: [] };
  const lowerR3 = roundByKey.get('lower-r3') || { roundName: 'Lower Bracket R3', matches: [] };
  const lowerFinals = roundByKey.get('lower-finals') || { roundName: 'Lower Bracket Finals', matches: [] };

  const renderMatch = (round: FeaturedEventPlayoffRound, index: number) => (
    <FeaturedDltvPlayoffMatch
      key={`${round.roundName}-${round.matches[index]?.href || round.matches[index]?.matchId || index}`}
      match={round.matches[index] || { href: null, matchId: null, startTime: null, teams: [] }}
      aliasToTag={aliasToTag}
      teams={teams}
      onOpenMatch={onOpenMatch}
    />
  );

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/75 p-3 md:p-4">
      <div className="mb-3 flex items-center justify-between gap-3 border-b border-white/10 pb-3">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">Compact view</div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="font-semibold uppercase tracking-[0.14em] text-slate-200">Compact View</span>
          <span className="rounded-md border border-emerald-400/20 bg-emerald-500/10 px-2 py-1 text-emerald-100">Yes</span>
          <span className="rounded-md border border-white/10 px-2 py-1">No</span>
        </div>
      </div>

      <div className="grid gap-3 md:hidden">
        {sortedRounds.map((round) => (
          <div key={round.roundName} className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{round.roundName}</div>
            <div className="space-y-2">
              {(round.matches.length ? round.matches : [{ href: null, matchId: null, startTime: null, teams: [] }]).map((match, index) => (
                <FeaturedDltvPlayoffMatch
                  key={`${round.roundName}-${match.href || match.matchId || index}`}
                  match={match}
                  aliasToTag={aliasToTag}
                  teams={teams}
                  onOpenMatch={onOpenMatch}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <div className="min-w-[1336px] pb-2">
          <div className="grid grid-cols-[184px_184px_184px_184px_184px] gap-x-32">
            <div className="col-start-2"><FeaturedPlayoffColumnHeader title={upperR1.roundName} /></div>
            <div className="col-start-4"><FeaturedPlayoffColumnHeader title={upperFinals.roundName} /></div>
            <div className="col-start-5"><FeaturedPlayoffColumnHeader title={grandFinals.roundName} /></div>
          </div>

          <div className="relative mt-0 grid grid-cols-[184px_184px_184px_184px_184px] gap-x-32">
            <div className="col-start-2 space-y-10">
              {renderMatch(upperR1, 0)}
              {renderMatch(upperR1, 1)}
            </div>
            <div className="col-start-4 pt-[78px]">
              {renderMatch(upperFinals, 0)}
            </div>
            <div className="col-start-5 pt-[288px]">
              {renderMatch(grandFinals, 0)}
            </div>

            <FeaturedPlayoffConnector className="left-[373px] top-[60px] h-[118px] w-[145px] border-r border-t" />
            <FeaturedPlayoffConnector className="left-[373px] top-[222px] h-[46px] w-[145px] border-r border-b" />
            <FeaturedPlayoffConnector className="left-[773px] top-[138px] h-[188px] w-[166px] border-r border-b" />
            <FeaturedPlayoffConnector className="left-[939px] top-[326px] h-[82px] w-[0px] border-r" />
          </div>

          <div className="mt-14 grid grid-cols-[184px_184px_184px_184px_184px] gap-x-32">
            <div className="col-start-1"><FeaturedPlayoffColumnHeader title={lowerR1.roundName} /></div>
            <div className="col-start-2"><FeaturedPlayoffColumnHeader title={lowerR2.roundName} /></div>
            <div className="col-start-3"><FeaturedPlayoffColumnHeader title={lowerR3.roundName} /></div>
            <div className="col-start-4"><FeaturedPlayoffColumnHeader title={lowerFinals.roundName} /></div>
          </div>

          <div className="relative mt-0 grid grid-cols-[184px_184px_184px_184px_184px] gap-x-32">
            <div className="col-start-1 space-y-10 pt-[34px]">
              {renderMatch(lowerR1, 0)}
              {renderMatch(lowerR1, 1)}
            </div>
            <div className="col-start-2 space-y-10">
              {renderMatch(lowerR2, 0)}
              {renderMatch(lowerR2, 1)}
            </div>
            <div className="col-start-3 pt-[84px]">
              {renderMatch(lowerR3, 0)}
            </div>
            <div className="col-start-4 pt-[34px]">
              {renderMatch(lowerFinals, 0)}
            </div>

            <FeaturedPlayoffConnector className="left-[0px] top-[113px] h-[60px] w-[144px] border-r border-t" />
            <FeaturedPlayoffConnector className="left-[0px] top-[281px] h-[60px] w-[144px] border-r border-b" />
            <FeaturedPlayoffConnector className="left-[373px] top-[113px] h-[110px] w-[144px] border-r border-t" />
            <FeaturedPlayoffConnector className="left-[373px] top-[281px] h-[54px] w-[144px] border-r border-b" />
            <FeaturedPlayoffConnector className="left-[746px] top-[196px] h-[112px] w-[144px] border-r border-t" />
            <FeaturedPlayoffConnector className="left-[746px] top-[308px] h-[54px] w-[144px] border-r border-b" />
            <FeaturedPlayoffConnector className="left-[1117px] top-[118px] h-[74px] w-[0px] border-r" />
          </div>
        </div>
      </div>
    </div>
  );
}

function FeaturedPglWallachiaPlayoffBracket({
  payload,
  onOpenMatch,
  aliasToTag,
  teams,
}: {
  payload: FeaturedTournamentPayload;
  onOpenMatch: (matchId: string) => void;
  aliasToTag: Map<string, string>;
  teams: NonNullable<TournamentSectionProps['teams']>;
}) {
  const sortedRounds = payload.playoffs.rounds.length
    ? [...payload.playoffs.rounds].sort((a, b) => getFeaturedPlayoffRoundOrder(a.roundName) - getFeaturedPlayoffRoundOrder(b.roundName))
    : [{ roundName: 'Grand Final (bo5)', matches: [] }];
  const roundByKey = new Map(sortedRounds.map((round) => [normalizeFeaturedPlayoffRoundKey(round.roundName), round]));
  const upperR1 = roundByKey.get('upper-r1') || { roundName: 'Upper Bracket R1 (bo3)', matches: [] };
  const upperSemis = roundByKey.get('upper-semis') || { roundName: 'Upper Bracket Semifinal (bo3)', matches: [] };
  const upperFinals = roundByKey.get('upper-finals') || { roundName: 'Upper Bracket Final (bo3)', matches: [] };
  const grandFinals = roundByKey.get('grand-finals') || { roundName: 'Grand Final (bo5)', matches: [] };
  const lowerR1 = roundByKey.get('lower-r1') || { roundName: 'Lower Bracket R1 (bo3)', matches: [] };
  const lowerR2 = roundByKey.get('lower-r2') || { roundName: 'Lower Bracket R2 (bo3)', matches: [] };
  const lowerR3 = roundByKey.get('lower-r3') || { roundName: 'Lower Bracket R3 (bo3)', matches: [] };
  const lowerFinals = roundByKey.get('lower-finals') || { roundName: 'Lower Bracket Final (bo3)', matches: [] };

  const renderMatch = (round: FeaturedEventPlayoffRound, index: number) => (
    <FeaturedDltvPlayoffMatch
      key={`${round.roundName}-${round.matches[index]?.href || round.matches[index]?.matchId || index}`}
      match={round.matches[index] || { href: null, matchId: null, startTime: null, teams: [] }}
      aliasToTag={aliasToTag}
      teams={teams}
      onOpenMatch={onOpenMatch}
    />
  );

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/75 p-3 md:p-4">
      <div className="mb-3 flex items-center justify-between gap-3 border-b border-white/10 pb-3">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">Compact view</div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="font-semibold uppercase tracking-[0.14em] text-slate-200">Compact View</span>
          <span className="rounded-md border border-emerald-400/20 bg-emerald-500/10 px-2 py-1 text-emerald-100">Yes</span>
          <span className="rounded-md border border-white/10 px-2 py-1">No</span>
        </div>
      </div>

      <div className="grid gap-3 md:hidden">
        {sortedRounds.map((round) => (
          <div key={round.roundName} className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{round.roundName}</div>
            <div className="space-y-2">
              {(round.matches.length ? round.matches : [{ href: null, matchId: null, startTime: null, teams: [] }]).map((match, index) => (
                <FeaturedDltvPlayoffMatch
                  key={`${round.roundName}-${match.href || match.matchId || index}`}
                  match={match}
                  aliasToTag={aliasToTag}
                  teams={teams}
                  onOpenMatch={onOpenMatch}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <div className="relative min-w-[1510px] pb-6">
          <div className="grid grid-cols-[170px_170px_170px_170px_170px] gap-x-24">
            <div className="col-start-1"><FeaturedPlayoffColumnHeader title={upperR1.roundName} /></div>
            <div className="col-start-2"><FeaturedPlayoffColumnHeader title={upperSemis.roundName} /></div>
            <div className="col-start-4"><FeaturedPlayoffColumnHeader title={upperFinals.roundName} /></div>
            <div className="col-start-5"><FeaturedPlayoffColumnHeader title={grandFinals.roundName} /></div>
          </div>

          <div className="relative mt-0 grid grid-cols-[170px_170px_170px_170px_170px] gap-x-24">
            <div className="col-start-1 space-y-9 pt-[12px]">
              {renderMatch(upperR1, 0)}
              {renderMatch(upperR1, 1)}
              {renderMatch(upperR1, 2)}
              {renderMatch(upperR1, 3)}
            </div>
            <div className="col-start-2 space-y-9 pt-[91px]">
              {renderMatch(upperSemis, 0)}
              {renderMatch(upperSemis, 1)}
            </div>
            <div className="col-start-4 pt-[249px]">
              {renderMatch(upperFinals, 0)}
            </div>
            <div className="col-start-5 pt-[560px]">
              {renderMatch(grandFinals, 0)}
            </div>

            <FeaturedPlayoffConnector className="left-[170px] top-[88px] h-[48px] w-[107px] border-r border-t" />
            <FeaturedPlayoffConnector className="left-[170px] top-[245px] h-[48px] w-[107px] border-r border-b" />
            <FeaturedPlayoffConnector className="left-[170px] top-[406px] h-[48px] w-[107px] border-r border-t" />
            <FeaturedPlayoffConnector className="left-[170px] top-[563px] h-[48px] w-[107px] border-r border-b" />
            <FeaturedPlayoffConnector className="left-[447px] top-[166px] h-[126px] w-[228px] border-r border-t" />
            <FeaturedPlayoffConnector className="left-[447px] top-[486px] h-[46px] w-[228px] border-r border-b" />
            <FeaturedPlayoffConnector className="left-[903px] top-[309px] h-[311px] w-[168px] border-r border-b" />
          </div>

          <div className="mt-16 grid grid-cols-[170px_170px_170px_170px_170px] gap-x-24">
            <div className="col-start-1"><FeaturedPlayoffColumnHeader title={lowerR1.roundName} /></div>
            <div className="col-start-2"><FeaturedPlayoffColumnHeader title={lowerR2.roundName} /></div>
            <div className="col-start-3"><FeaturedPlayoffColumnHeader title={lowerR3.roundName} /></div>
            <div className="col-start-4"><FeaturedPlayoffColumnHeader title={lowerFinals.roundName} /></div>
          </div>

          <div className="relative mt-0 grid grid-cols-[170px_170px_170px_170px_170px] gap-x-24">
            <div className="col-start-1 space-y-9 pt-[12px]">
              {renderMatch(lowerR1, 0)}
              {renderMatch(lowerR1, 1)}
            </div>
            <div className="col-start-2 space-y-9 pt-[91px]">
              {renderMatch(lowerR2, 0)}
              {renderMatch(lowerR2, 1)}
            </div>
            <div className="col-start-3 pt-[251px]">
              {renderMatch(lowerR3, 0)}
            </div>
            <div className="col-start-4 pt-[251px]">
              {renderMatch(lowerFinals, 0)}
            </div>

            <FeaturedPlayoffConnector className="left-[170px] top-[166px] h-[46px] w-[107px] border-r border-t" />
            <FeaturedPlayoffConnector className="left-[170px] top-[486px] h-[46px] w-[107px] border-r border-b" />
            <FeaturedPlayoffConnector className="left-[447px] top-[330px] h-[46px] w-[108px] border-r border-b" />
            <FeaturedPlayoffConnector className="left-[725px] top-[330px] h-[46px] w-[107px] border-r border-t" />
            <FeaturedPlayoffConnector className="left-[1002px] top-[330px] h-[64px] w-[69px] border-r border-t" />
            <FeaturedPlayoffConnector className="left-[1002px] top-[643px] h-[46px] w-[69px] border-r border-b" />
          </div>

          <FeaturedPlacementBadge placement="1st Place" prize="$300,000" className="left-[1270px] top-[888px]" />
          <FeaturedPlacementBadge placement="2nd Place" prize="$175,000" className="left-[1270px] top-[936px]" />
          <FeaturedPlacementBadge placement="3rd Place" prize="$120,000" className="left-[690px] top-[1002px]" />
          <FeaturedPlacementBadge placement="4th Place" prize="$80,000" className="left-[510px] top-[1046px]" />
          <FeaturedPlacementBadge placement="5th - 6th Place" prize="$60,000" className="left-[273px] top-[1136px]" />
          <FeaturedPlacementBadge placement="7th - 8th Place" prize="$40,000" className="left-[0px] top-[1182px]" />
        </div>
      </div>
    </div>
  );
}

function FeaturedPlayoffBracket({
  payload,
  onOpenMatch,
  aliasToTag,
  teams,
}: {
  payload: FeaturedTournamentPayload;
  onOpenMatch: (matchId: string) => void;
  aliasToTag: Map<string, string>;
  teams: NonNullable<TournamentSectionProps['teams']>;
}) {
  if (payload.tournamentId === 'esl-one-birmingham-2026') {
    return (
      <FeaturedESLBirminghamPlayoffBracket
        payload={payload}
        onOpenMatch={onOpenMatch}
        aliasToTag={aliasToTag}
        teams={teams}
      />
    );
  }

  if (payload.tournamentId === 'pgl-wallachia-s7') {
    return (
      <FeaturedPglWallachiaPlayoffBracket
        payload={payload}
        onOpenMatch={onOpenMatch}
        aliasToTag={aliasToTag}
        teams={teams}
      />
    );
  }

  const rounds = payload.playoffs.rounds.length
    ? payload.playoffs.rounds
    : [{ roundName: 'Grand Finals', matches: [] }];

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/75 p-3 md:p-4">
      <div className="mb-3 flex items-center justify-between gap-3 border-b border-white/10 pb-3">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">Compact view</div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="rounded-md border border-emerald-400/20 bg-emerald-500/10 px-2 py-1 text-emerald-100">Yes</span>
          <span className="rounded-md border border-white/10 px-2 py-1">No</span>
        </div>
      </div>

      <div className="grid gap-3 md:hidden">
        {rounds.map((round) => (
          <FeaturedCompactPlayoffRound
            key={round.roundName}
            round={round}
            aliasToTag={aliasToTag}
            teams={teams}
            onOpenMatch={onOpenMatch}
          />
        ))}
      </div>

      <div className="hidden md:block overflow-x-auto">
        <div className="flex min-w-max items-start gap-3 pb-1">
          {rounds.map((round) => (
            <div key={round.roundName} className="w-[240px] shrink-0">
              <FeaturedCompactPlayoffRound
                round={round}
                aliasToTag={aliasToTag}
                teams={teams}
                onOpenMatch={onOpenMatch}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FeaturedMobileStageTable({
  payload,
  onOpenMatch,
  aliasToTag,
  teams,
}: {
  payload: FeaturedTournamentPayload;
  onOpenMatch: (matchId: string) => void;
  aliasToTag: Map<string, string>;
  teams: NonNullable<TournamentSectionProps['teams']>;
}) {
  const rankWidth = 56;
  const teamWidth = 212;
  const recordWidth = 92;
  const roundWidth = 92;
  const leftStickyWidth = rankWidth + teamWidth + recordWidth;
  const template = `${rankWidth}px ${teamWidth}px ${recordWidth}px repeat(${payload.groupStage.rounds.length}, ${roundWidth}px)`;
  const minWidth = leftStickyWidth + payload.groupStage.rounds.length * roundWidth;

  return (
    <div className="md:hidden">
      <div className="mb-2 flex items-start justify-between gap-3 px-3 pt-3">
        <div>
          <h5 className="text-sm font-semibold uppercase tracking-[0.12em] text-white">{payload.groupStage.title}</h5>
          <p className="mt-1 text-[11px] text-slate-400">Swipe horizontally to view all round results.</p>
        </div>
        <div className="rounded-md border border-emerald-400/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-emerald-100">
          Top 8
        </div>
      </div>

      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 right-0 z-30 w-7 bg-gradient-to-l from-slate-950 via-slate-950/85 to-transparent" />
        <div className="overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="min-w-max" style={{ minWidth: `${minWidth}px` }}>
            <div
              className="grid border-y border-white/10 bg-slate-950/80 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400"
              style={{ gridTemplateColumns: template }}
            >
              <div className="sticky left-0 z-20 border-r border-white/10 bg-slate-950/96 px-3 py-2">Rank</div>
              <div className="sticky z-20 border-r border-white/10 bg-slate-950/96 px-3 py-2" style={{ left: `${rankWidth}px` }}>Team</div>
              <div className="sticky z-20 border-r border-white/10 bg-slate-950/96 px-3 py-2 text-center" style={{ left: `${rankWidth + teamWidth}px` }}>Record</div>
              {payload.groupStage.rounds.map((round) => (
                <div key={round} className="border-r border-white/10 px-2 py-2 text-center last:border-r-0">
                  {round}
                </div>
              ))}
            </div>

            {payload.groupStage.standings.map((row) => {
              const tone = getFeaturedAdvancementTone(row.advancement);
              return (
                <div
                  key={`mobile-stage-${row.rank}-${row.teamName}`}
                  className="grid border-b border-white/10 text-sm"
                  style={{ gridTemplateColumns: template }}
                >
                  <div className={`sticky left-0 z-10 flex items-center border-r border-white/10 px-3 py-3 ${tone.sticky}`}>
                    <span className="text-base font-semibold text-white">{row.rank}</span>
                  </div>

                  <div className={`sticky z-10 flex min-w-0 items-center border-r border-white/10 px-3 py-3 ${tone.sticky} ${row.isCnTeam ? 'shadow-[inset_2px_0_0_rgba(248,113,113,0.45)]' : ''}`} style={{ left: `${rankWidth}px` }}>
                    <div className="min-w-0">
                      <FeaturedTeamChip
                        teamId={row.teamId}
                        name={row.teamName}
                        logoUrl={row.logoUrl}
                        isCnTeam={row.isCnTeam}
                        aliasToTag={aliasToTag}
                        teams={teams}
                        emphasize
                        preferFullName
                      />
                      {row.country ? <div className="pl-8 text-[11px] text-slate-500">{row.country}</div> : null}
                    </div>
                  </div>

                  <div className={`sticky z-10 flex flex-col items-center justify-center border-r border-white/10 px-2 py-3 ${tone.sticky}`} style={{ left: `${rankWidth + teamWidth}px` }}>
                    <span className="text-sm font-semibold text-white">{row.record || 'TBD'}</span>
                    <span className={`mt-1 rounded-md border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide ${tone.badge}`}>
                      {row.advancement === 'playoff' ? 'Advance' : 'Out'}
                    </span>
                  </div>

                  {row.rounds.map((round) => (
                    <FeaturedMatchSurface
                      key={`mobile-${row.teamName}-${round.roundLabel}`}
                      href={round.href}
                      matchId={round.matchId}
                      onOpenMatch={onOpenMatch}
                      className={`flex h-full min-h-[72px] flex-col items-center justify-center gap-1 border-r px-2 py-2 text-center last:border-r-0 ${getFeaturedRoundTone(round)}`}
                    >
                      {round.pending ? (
                        <span className="text-[11px] font-medium text-slate-500">TBD</span>
                      ) : (
                        <>
                          {resolveTeamLogo({ teamId: round.opponentTeamId, name: round.opponentName }, teams, round.opponentLogoUrl) ? (
                            <img
                              src={resolveTeamLogo({ teamId: round.opponentTeamId, name: round.opponentName }, teams, round.opponentLogoUrl)}
                              alt={round.opponentName || 'Opponent'}
                              className={`h-7 w-7 rounded-full object-contain p-0.5 ${round.opponentIsCnTeam ? 'border border-red-400/40 bg-red-500/10' : 'border border-white/10 bg-slate-950/80'}`}
                            />
                          ) : (
                            <div className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-slate-950/80 text-[10px] font-semibold text-slate-300">
                              {getTeamAbbrev(round.opponentName, aliasToTag)}
                            </div>
                          )}
                          <span className={`max-w-[72px] truncate text-[11px] font-semibold ${round.opponentIsCnTeam ? 'text-red-100' : 'text-slate-100'}`}>
                            {getTeamAbbrev(round.opponentName, aliasToTag)}
                          </span>
                          <span className="text-xs font-semibold text-white">{round.score || 'TBD'}</span>
                        </>
                      )}
                    </FeaturedMatchSurface>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function FeaturedTournamentPanel({
  payload,
  loading,
  error,
  onRetry,
  onOpenMatch,
  aliasToTag,
  teams,
}: {
  payload: FeaturedTournamentPayload | null;
  loading: boolean;
  error: string;
  onRetry: () => void;
  onOpenMatch: (matchId: string) => void;
  aliasToTag: Map<string, string>;
  teams: NonNullable<TournamentSectionProps['teams']>;
}) {
  if (loading && !payload) {
    return (
      <div className="mb-6 rounded-2xl border border-white/10 bg-slate-950/50 p-4 sm:p-5">
        <div className="mb-4 h-6 w-40 animate-pulse rounded bg-slate-800/80" />
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="h-64 animate-pulse rounded-2xl bg-slate-800/60" />
          <div className="h-64 animate-pulse rounded-2xl bg-slate-800/60" />
        </div>
      </div>
    );
  }

  if (error && !payload) {
    return (
      <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-950/20 p-4 sm:p-5">
        <div className="mb-2 text-sm font-semibold text-red-300">主赛事数据加载失败</div>
        <p className="mb-4 text-sm text-red-200/80">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm text-red-100 transition-colors hover:bg-red-500/20"
        >
          重试
        </button>
      </div>
    );
  }

  if (!payload) return null;

  return (
    <div className="mb-5 rounded-xl border border-white/10 bg-slate-950/88 p-3 shadow-[0_10px_24px_rgba(2,6,23,0.22)] sm:p-4 md:mb-6 md:rounded-2xl md:border-amber-500/20 md:bg-gradient-to-br md:from-amber-500/10 md:via-slate-900/80 md:to-slate-950/90 md:p-5 md:shadow-none">
      <div className="mb-4 flex flex-col gap-2 border-b border-white/10 pb-3 md:mb-5 md:flex-row md:items-end md:justify-between md:gap-3 md:pb-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300/80 md:text-xs md:tracking-[0.2em]">Main Event</div>
          <h4 className="mt-1 text-base font-semibold text-white md:text-lg">主赛事定制视图</h4>
          <p className="mt-1 text-xs text-slate-400 md:text-sm">
            数据源 {payload.sourceLabel} · 更新于 {formatFeaturedFetchTime(payload.fetchedAt)}
          </p>
        </div>
        <a
          href={payload.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-xs text-slate-200 transition-colors hover:border-amber-400/40 hover:text-white md:rounded-xl md:px-4 md:text-sm"
        >
          查看来源页面
        </a>
      </div>

      <div className="space-y-4 md:space-y-5">
        <section className="rounded-xl border border-white/10 bg-slate-950/70 p-3 md:rounded-2xl md:bg-slate-950/60 md:p-4">
          {payload.groupStage.format === 'round-robin' ? (
            <>
              <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <h5 className="text-sm font-semibold text-white md:text-base">{payload.groupStage.title}</h5>
                  <p className="text-xs text-slate-400">双小组循环赛排名 · 前二进胜者组，三四名进败者组</p>
                </div>
                <div className="flex flex-wrap gap-2 text-[11px]">
                  <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-emerald-100">Top 2 → Upper Bracket</span>
                  <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-2.5 py-1 text-amber-100">3rd-4th → Lower Bracket</span>
                  <span className="rounded-full border border-rose-400/20 bg-rose-500/10 px-2.5 py-1 text-rose-100">5th-8th Out</span>
                </div>
              </div>
              <FeaturedGroupCards groups={payload.groupStage.groups || []} aliasToTag={aliasToTag} teams={teams} />
            </>
          ) : (
            <>
              <FeaturedMobileStageTable
                payload={payload}
                onOpenMatch={onOpenMatch}
                aliasToTag={aliasToTag}
                teams={teams}
              />
              <div className="hidden md:block">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h5 className="text-base font-semibold text-white">{payload.groupStage.title}</h5>
                    <p className="text-xs text-slate-400">小组排名和轮次对阵</p>
                  </div>
                  <div className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
                    Top 8 advance
                  </div>
                </div>
                <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)]">
                  <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/70">
                    <div className="grid grid-cols-[56px_minmax(0,1fr)_88px_86px] border-b border-white/10 px-3 py-2 text-[11px] uppercase tracking-wide text-slate-400">
                      <span>Rank</span>
                      <span>Team</span>
                      <span className="text-center">Record</span>
                      <span className="text-right">Status</span>
                    </div>
                    <div className="divide-y divide-white/10">
                      {payload.groupStage.standings.map((row) => (
                        <div
                          key={`${row.rank}-${row.teamName}`}
                          className={`grid grid-cols-[56px_minmax(0,1fr)_88px_86px] items-center gap-2 px-3 py-2.5 ${row.isCnTeam ? 'bg-red-500/5' : ''}`}
                        >
                          <div className="text-sm font-semibold text-white">#{row.rank}</div>
                          <div className="min-w-0">
                            <FeaturedTeamChip
                              teamId={row.teamId}
                              name={row.teamName}
                              logoUrl={row.logoUrl}
                              isCnTeam={row.isCnTeam}
                              aliasToTag={aliasToTag}
                              teams={teams}
                              emphasize
                            />
                            {row.country ? <div className="pl-8 text-xs text-slate-500">{row.country}</div> : null}
                          </div>
                          <div className="text-center text-sm font-medium text-slate-200">{row.record || 'TBD'}</div>
                          <div className="text-right">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              row.advancement === 'playoff'
                                ? 'bg-emerald-500/15 text-emerald-200'
                                : 'bg-red-500/15 text-red-200'
                            }`}>
                              {row.advancement === 'playoff' ? 'Playoffs' : 'Out'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/70">
                    <div className="overflow-x-auto">
                      <div className="min-w-[720px]">
                        <div
                          className="grid border-b border-white/10 px-3 py-2 text-[11px] uppercase tracking-wide text-slate-400"
                          style={{ gridTemplateColumns: `minmax(180px,1.3fr) repeat(${payload.groupStage.rounds.length}, minmax(98px,1fr))` }}
                        >
                          <span>Team</span>
                          {payload.groupStage.rounds.map((round) => (
                            <span key={round} className="text-center">{round}</span>
                          ))}
                        </div>
                        <div className="divide-y divide-white/10">
                          {payload.groupStage.standings.map((row) => (
                            <div
                              key={`rounds-${row.rank}-${row.teamName}`}
                              className="grid items-center gap-2 px-3 py-2.5"
                              style={{ gridTemplateColumns: `minmax(180px,1.3fr) repeat(${payload.groupStage.rounds.length}, minmax(98px,1fr))` }}
                            >
                              <FeaturedTeamChip
                                teamId={row.teamId}
                                name={row.teamName}
                                logoUrl={row.logoUrl}
                                isCnTeam={row.isCnTeam}
                                aliasToTag={aliasToTag}
                                teams={teams}
                              />
                              {row.rounds.map((round) => (
                                <FeaturedMatchSurface
                                  key={`${row.teamName}-${round.roundLabel}`}
                                  href={round.href}
                                  matchId={round.matchId}
                                  onOpenMatch={onOpenMatch}
                                  className={`rounded-xl border px-2 py-2 text-center transition-colors ${
                                    round.pending
                                      ? 'cursor-default border-dashed border-white/10 bg-slate-950/40 text-slate-500'
                                      : round.matchId
                                        ? 'border-emerald-400/20 bg-emerald-500/5 hover:border-emerald-300/40 hover:bg-emerald-500/10'
                                        : 'border-white/10 bg-slate-950/60 hover:border-amber-400/30 hover:bg-slate-900'
                                  }`}
                                >
                                  {round.pending ? (
                                    <div className="text-xs text-slate-500">TBD</div>
                                  ) : (
                                    <div className="space-y-1">
                                      <div className="flex items-center justify-center gap-1">
                                        {resolveTeamLogo({ teamId: round.opponentTeamId, name: round.opponentName }, teams, round.opponentLogoUrl) ? (
                                          <img
                                            src={resolveTeamLogo({ teamId: round.opponentTeamId, name: round.opponentName }, teams, round.opponentLogoUrl)}
                                            alt={round.opponentName || 'Opponent'}
                                            className={`h-5 w-5 rounded-full object-contain ${round.opponentIsCnTeam ? 'border border-red-400/50 bg-red-500/10 p-0.5' : ''}`}
                                          />
                                        ) : null}
                                        <span className={`max-w-[54px] truncate text-xs ${round.opponentIsCnTeam ? 'font-semibold text-red-100' : 'text-slate-200'}`}>
                                          {getTeamAbbrev(round.opponentName, aliasToTag)}
                                        </span>
                                      </div>
                                      <div className="text-xs font-semibold text-white">{round.score || 'TBD'}</div>
                                    </div>
                                  )}
                                </FeaturedMatchSurface>
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>

        <section className="rounded-xl border border-white/10 bg-slate-950/70 p-3 md:rounded-2xl md:bg-slate-950/60 md:p-4">
          <div className="mb-3 md:mb-4">
            <h5 className="text-sm font-semibold text-white md:text-base">{payload.playoffs.title}</h5>
            <p className="text-xs text-slate-400">淘汰赛对阵信息</p>
            <p className="text-[11px] text-slate-400 md:text-xs">Bracket rounds and pairings</p>
          </div>
          <FeaturedPlayoffBracket payload={payload} onOpenMatch={onOpenMatch} aliasToTag={aliasToTag} teams={teams} />
        </section>

        <section className="hidden rounded-xl border border-white/10 bg-slate-950/70 p-3 md:rounded-2xl md:bg-slate-950/60 md:p-4">
          <div className="mb-3 md:mb-4">
            <h5 className="text-sm font-semibold text-white md:text-base">{payload.matches.title}</h5>
            <p className="text-xs text-slate-400">Upcoming 和 finished 比赛</p>
            <p className="text-[11px] text-slate-400 md:text-xs">Upcoming and finished matches</p>
          </div>
          <div className="grid gap-3 md:gap-4 xl:grid-cols-2">
            {[
              { title: 'Upcoming', items: payload.matches.upcoming, accent: 'text-cyan-200 bg-cyan-500/10 border-cyan-400/20' },
              { title: 'Finished', items: payload.matches.finished, accent: 'text-rose-200 bg-rose-500/10 border-rose-400/20' },
            ].map((section) => (
              <div key={section.title} className="rounded-lg border border-white/10 bg-slate-900/60 p-2.5 md:rounded-2xl md:bg-slate-900/70 md:p-3">
                <div className="mb-2 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium text-white md:mb-3 md:px-3 md:text-xs">
                  <span className={`rounded-full border px-2 py-0.5 ${section.accent}`}>{section.title}</span>
                </div>
                <div className="space-y-2 md:space-y-3">
                  {section.items.map((match) => (
                    <FeaturedMatchSurface
                      key={`${section.title}-${match.href}-${match.startTime}-${match.score}`}
                      href={match.href}
                      matchId={match.matchId}
                      onOpenMatch={onOpenMatch}
                      className={`block rounded-lg border p-2.5 text-left transition-colors md:rounded-xl md:p-3 ${
                        match.matchId
                          ? 'border-emerald-400/20 bg-emerald-500/5 hover:border-emerald-300/40'
                          : 'border-white/10 bg-slate-950/70 hover:border-amber-400/30'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 md:gap-3">
                        <FeaturedTeamChip
                          teamId={match.teams[0]?.teamId}
                          name={match.teams[0]?.name || 'TBD'}
                          logoUrl={match.teams[0]?.logoUrl}
                          isCnTeam={match.teams[0]?.isCnTeam}
                          aliasToTag={aliasToTag}
                          teams={teams}
                          preferFullName
                        />
                        <div className="rounded-md border border-white/10 bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white md:rounded-lg md:px-3 md:py-1.5 md:text-xs">
                          {match.score || formatEventDateTime(match.startTime, { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <FeaturedTeamChip
                          teamId={match.teams[1]?.teamId}
                          name={match.teams[1]?.name || 'TBD'}
                          logoUrl={match.teams[1]?.logoUrl}
                          isCnTeam={match.teams[1]?.isCnTeam}
                          aliasToTag={aliasToTag}
                          teams={teams}
                          preferFullName
                        />
                      </div>
                    </FeaturedMatchSurface>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

const STAGE_KIND_META = {
  all: { label: '全部', labelEn: 'All' },
  group: { label: '小组赛', labelEn: 'Group' },
  playin: { label: '入围赛', labelEn: 'Play-In' },
  playoff: { label: '淘汰赛', labelEn: 'Playoff' },
  final: { label: '总决赛', labelEn: 'Final' },
  other: { label: '其他', labelEn: 'Other' }
} as const;

type StageFilterKey = keyof typeof STAGE_KIND_META;

const STAGE_CN_BY_LABEL: Record<string, string> = {
  'Group Stage': '小组赛',
  'Group Stage 1': '小组赛第一阶段',
  'Group Stage 2': '小组赛第二阶段',
  'Playoffs': '淘汰赛',
  'Grand Final': '总决赛',
  'Upper Bracket Semifinals': '胜者组半决赛',
  'Upper Bracket Final': '胜者组决赛',
  'Lower Bracket Round 1': '败者组第一轮',
  'Lower Bracket Quarterfinals': '败者组四分之一决赛',
  'Lower Bracket Semifinal': '败者组半决赛',
  'Lower Bracket Final': '败者组决赛',
  'Last Chance / Play-In': '最后机会赛 / 入围赛',
  'Main Stage': '主赛事阶段'
};

const STAGE_CN_BY_KIND: Record<string, string> = {
  group: '小组赛',
  playin: '入围赛',
  playoff: '淘汰赛',
  final: '总决赛',
  other: '其他'
};

function getSeriesStageLabel(series: Series): string {
  const stageEn = series.stage || 'Main Stage';
  const stageKind = series.stage_kind || 'other';
  const stageCn = STAGE_CN_BY_LABEL[stageEn] || STAGE_CN_BY_KIND[stageKind] || '主赛事阶段';
  return `${stageCn} · ${stageEn}`;
}

function getSeriesStartTime(series: Series): number {
  return series.games?.[0]?.start_time || 0;
}

export function TournamentSection({
  tournaments = [],
  seriesByTournament,
  allMatches = [],
  upcoming = [],
  teams = []
}: TournamentSectionProps) {
  const [showT1Only, setShowT1Only] = useState(true);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [expandedFeaturedTournamentId, setExpandedFeaturedTournamentId] = useState<string | null>(null);
  const [expandedSeries, setExpandedSeries] = useState<Set<string>>(new Set());
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);
  const [heroesLoaded, setHeroesLoaded] = useState(false);
  const [stageFilter, setStageFilter] = useState<StageFilterKey>('all');
  const [flyoutOpen, setFlyoutOpen] = useState(false);
  const [flyoutTeam, setFlyoutTeam] = useState<{ team_id?: string | null; name: string; logo_url?: string | null } | null>(null);
  const [playerFlyoutOpen, setPlayerFlyoutOpen] = useState(false);
  const [playerFlyoutModel, setPlayerFlyoutModel] = useState<PlayerFlyoutModel | null>(null);
  const [seriesStateByTournament, setSeriesStateByTournament] = useState<Record<string, TournamentSeriesState>>({});
  const [featuredStateByTournament, setFeaturedStateByTournament] = useState<Record<string, FeaturedTournamentState>>({});
  const [lazyTournaments, setLazyTournaments] = useState<Tournament[]>([]);
  const [lazyTeams, setLazyTeams] = useState<NonNullable<TournamentSectionProps['teams']>>([]);
  const [hasBootstrapped, setHasBootstrapped] = useState(false);
  const { ref: sectionRef, isInView } = useInView<HTMLElement>({ rootMargin: '200px 0px' });
  const effectiveTournaments = lazyTournaments.length > 0 ? lazyTournaments : tournaments;
  const effectiveTeams = lazyTeams.length > 0 ? lazyTeams : teams;
  const isChineseTeam = (team?: { teamId?: string | null; name?: string | null } | string | null) =>
    isChineseTeamFromTeams(team || null, effectiveTeams);
  const teamAliasToTag = useMemo(() => {
    const aliasMap = new Map<string, string>();
    for (const team of effectiveTeams) {
      const tag = String(team.tag || '').trim();
      if (!tag) continue;
      const aliases = [team.name, team.name_cn, team.tag];
      for (const alias of aliases) {
        const key = normalizeTeamAlias(alias);
        if (key && !aliasMap.has(key)) {
          aliasMap.set(key, tag);
        }
      }
    }
    return aliasMap;
  }, [effectiveTeams]);

  const allSortedTournaments = useMemo(() => {
    return [...(effectiveTournaments || [])].sort((a, b) => {
      const aStart = a.start_time ?? 0;
      const bStart = b.start_time ?? 0;
      if (bStart !== aStart) return bStart - aStart;
      const aEnd = a.end_time ?? 0;
      const bEnd = b.end_time ?? 0;
      return bEnd - aEnd;
    });
  }, [effectiveTournaments]);

  const sortedTournaments = useMemo(() => {
    return allSortedTournaments.filter((t) => {
      const tier = String(t.tier || '').toUpperCase();
      if (showT1Only) return tier === 'S';
      return tier !== 'S';
    });
  }, [allSortedTournaments, showT1Only]);

  // Keep the selected tournament stable by id so rerenders do not loop on new object instances.
  useEffect(() => {
    const nextTournament = sortedTournaments[0] || null;
    if (!nextTournament) {
      if (selectedTournament !== null) {
        setSelectedTournament(null);
      }
      return;
    }

    if (!selectedTournament) {
      setSelectedTournament(nextTournament);
      return;
    }

    const selectedStillExists = sortedTournaments.some((t) => t.id === selectedTournament.id);
    if (!selectedStillExists) {
      setSelectedTournament(nextTournament);
    }
  }, [sortedTournaments, selectedTournament]);

  useEffect(() => {
    if (!isInView || hasBootstrapped || tournaments.length > 0 || teams.length > 0) return;

    let cancelled = false;

    const bootstrapSection = async () => {
      try {
        const [tournamentsResponse, teamsResponse] = await Promise.all([
          fetch('/api/tournaments'),
          fetch('/api/teams')
        ]);

        if (!tournamentsResponse.ok) {
          throw new Error(`tournaments_http_${tournamentsResponse.status}`);
        }
        if (!teamsResponse.ok) {
          throw new Error(`teams_http_${teamsResponse.status}`);
        }

        const tournamentsPayload = await tournamentsResponse.json();
        const teamsPayload = await teamsResponse.json();
        if (cancelled) return;

        setLazyTournaments(Array.isArray(tournamentsPayload?.tournaments) ? tournamentsPayload.tournaments : []);
        setLazyTeams(Array.isArray(teamsPayload) ? teamsPayload : []);
        setHasBootstrapped(true);
      } catch (error) {
        if (cancelled) return;
        console.error('[TournamentSection] Failed to bootstrap lazy data:', error);
        setHasBootstrapped(true);
      }
    };

    void bootstrapSection();

    return () => {
      cancelled = true;
    };
  }, [hasBootstrapped, isInView, teams.length, tournaments.length]);

  /*
  const fetchFeaturedTournament = useCallback(async (tournament: Tournament) => {
    const tournamentKey = tournament.id;
    setFeaturedStateByTournament((prev) => ({
      ...prev,
      [tournamentKey]: {
        data: prev[tournamentKey]?.data || null,
        loading: true,
        error: '',
      },
    }));

    try {
      const response = await fetch(`/api/tournaments?tournamentId=${encodeURIComponent(tournament.id)}&featured=1`);
      const payload = await response.json();

      if (!response.ok) {
        if (response.status === 404) {
          setFeaturedStateByTournament((prev) => ({
            ...prev,
            [tournamentKey]: {
              data: null,
              loading: false,
              error: '',
            },
          }));
          return;
        }
        //
        throw new Error((payload as { error?: string })?.error || '涓昏禌浜嬫暟鎹姞杞藉け璐?);
        //
        throw new Error((payload as { error?: string })?.error || 'Failed to load main event data');
      }

      setFeaturedStateByTournament((prev) => ({
        ...prev,
        [tournamentKey]: {
          data: payload as FeaturedTournamentPayload,
          loading: false,
          error: '',
        },
      }));
    } catch (error) {
      setFeaturedStateByTournament((prev) => ({
        ...prev,
        [tournamentKey]: {
          data: prev[tournamentKey]?.data || null,
          loading: false,
          //
          error: error instanceof Error ? error.message : '涓昏禌浜嬫暟鎹姞杞藉け璐?',
        },
      }));
    }
  }, []);
  */

  const fetchFeaturedTournament = useCallback(async (tournament: Tournament) => {
    const tournamentKey = tournament.id;
    setFeaturedStateByTournament((prev) => ({
      ...prev,
      [tournamentKey]: {
        data: prev[tournamentKey]?.data || null,
        loading: true,
        error: '',
      },
    }));

    try {
      const featuredRequestId = getFeaturedTournamentRequestId(tournament);
      if (!featuredRequestId) {
        throw new Error('featured_tournament_missing_request_id');
      }

      const response = await fetch(`/api/tournaments?tournamentId=${encodeURIComponent(featuredRequestId)}&featured=1`);
      const payload = await response.json();

      if (!response.ok) {
        if (response.status === 404) {
          setFeaturedStateByTournament((prev) => ({
            ...prev,
            [tournamentKey]: {
              data: null,
              loading: false,
              error: '',
            },
          }));
          return;
        }

        throw new Error((payload as { error?: string })?.error || 'Failed to load main event data');
      }

      setFeaturedStateByTournament((prev) => ({
        ...prev,
        [tournamentKey]: {
          data: payload as FeaturedTournamentPayload,
          loading: false,
          error: '',
        },
      }));
    } catch (error) {
      setFeaturedStateByTournament((prev) => ({
        ...prev,
        [tournamentKey]: {
          data: prev[tournamentKey]?.data || null,
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to load main event data',
        },
      }));
    }
  }, []);

  const fetchTournamentSeries = useCallback(async (tournamentId: string, offset = 0) => {
    setSeriesStateByTournament((prev) => {
      const current = prev[tournamentId] || {
        items: seriesByTournament?.[tournamentId] || [],
        total: (seriesByTournament?.[tournamentId] || []).length,
        hasMore: false,
        loading: false,
        error: ''
      };

      return {
        ...prev,
        [tournamentId]: {
          ...current,
          loading: true,
          error: ''
        }
      };
    });

    try {
      const params = new URLSearchParams({
        tournamentId,
        limit: String(DEFAULT_SERIES_PAGE_SIZE),
        offset: String(offset)
      });
      const res = await fetch(`/api/tournaments?${params.toString()}`);
      const payload = (await res.json()) as TournamentSeriesResponse;

      if (!res.ok) {
        throw new Error((payload as { error?: string })?.error || '赛事详情加载失败');
      }

      const nextItems = Array.isArray(payload.series) ? payload.series : [];
      const total = Number(payload.pagination?.total || 0);
      const hasMore = Boolean(payload.pagination?.hasMore);

      setSeriesStateByTournament((prev) => {
        const current = prev[tournamentId];
        const mergedItems = offset > 0 ? [...(current?.items || []), ...nextItems] : nextItems;

        return {
          ...prev,
          [tournamentId]: {
            items: mergedItems,
            total: total || mergedItems.length,
            hasMore,
            loading: false,
            error: ''
          }
        };
      });
    } catch (error) {
      setSeriesStateByTournament((prev) => {
        const current = prev[tournamentId] || {
          items: [],
          total: 0,
          hasMore: false,
          loading: false,
          error: ''
        };

        return {
          ...prev,
          [tournamentId]: {
            ...current,
            loading: false,
            error: error instanceof Error ? error.message : '赛事详情加载失败'
          }
        };
      });
    }
  }, [seriesByTournament]);

  useEffect(() => {
    if (!isInView || !selectedTournament?.id) return;
    const currentState = seriesStateByTournament[selectedTournament.id];
    if (currentState?.items?.length || currentState?.loading) return;
    void fetchTournamentSeries(selectedTournament.id, 0);
  }, [fetchTournamentSeries, isInView, selectedTournament?.id, seriesStateByTournament]);

  useEffect(() => {
    if (
      !isInView
      || !selectedTournament
      || !isFeaturedTournament(selectedTournament)
      || expandedFeaturedTournamentId !== selectedTournament.id
    ) return;
    const currentFeaturedState = featuredStateByTournament[selectedTournament.id];
    if (currentFeaturedState?.data || currentFeaturedState?.loading || currentFeaturedState?.error) return;
    void fetchFeaturedTournament(selectedTournament);
  }, [expandedFeaturedTournamentId, fetchFeaturedTournament, featuredStateByTournament, isInView, selectedTournament]);

  // Load heroes data on mount
  useEffect(() => {
    loadHeroesData().then(() => {
      setHeroesLoaded(true);
    });
  }, []);

  const toggleSeries = (seriesId: string) => {
    const newExpanded = new Set(expandedSeries);
    if (newExpanded.has(seriesId)) {
      newExpanded.delete(seriesId);
    } else {
      newExpanded.add(seriesId);
    }
    setExpandedSeries(newExpanded);
  };

  const openTeamFlyout = (team: { team_id?: string | null; name?: string | null; logo_url?: string | null }) => {
    if (!team?.name) return;
    setFlyoutTeam({
      team_id: team.team_id ? String(team.team_id) : null,
      name: team.name,
      logo_url: team.logo_url || null
    });
    setFlyoutOpen(true);
  };

  const openPlayerFlyout = async (accountId: number) => {
    if (!Number.isFinite(accountId) || accountId <= 0) return;
    setPlayerFlyoutModel(createMinimalPlayerFlyoutModel(accountId));
    setPlayerFlyoutOpen(true);
    try {
      const model = await fetchPlayerProfileFlyoutModel(accountId, {
        onHydrated: (hydrated) => {
          setPlayerFlyoutModel((current) => (current?.accountId === accountId ? hydrated : current));
        },
      });
      if (model) {
        setPlayerFlyoutModel(model);
      }
    } catch (error) {
      console.error('[TournamentSection] Failed to load player profile:', error);
    }
  };

  const currentSeriesState = selectedTournament ? seriesStateByTournament[selectedTournament.id] : undefined;
  const currentSeries = selectedTournament
    ? (currentSeriesState?.items || seriesByTournament?.[selectedTournament.id] || [])
    : [];
  const currentSeriesTotal = currentSeriesState?.total || currentSeries.length;
  const currentSeriesLoading = Boolean(currentSeriesState?.loading);
  const currentSeriesError = currentSeriesState?.error || '';
  const currentFeaturedState = selectedTournament ? featuredStateByTournament[selectedTournament.id] : undefined;
  const currentFeaturedData = currentFeaturedState?.data || null;
  const currentFeaturedLoading = Boolean(currentFeaturedState?.loading);
  const currentFeaturedError = currentFeaturedState?.error || '';
  const isFeaturedSelectedTournamentExpanded = Boolean(
    selectedTournament
    && isFeaturedTournament(selectedTournament)
    && expandedFeaturedTournamentId === selectedTournament.id
  );
  const seriesByStageKind = useMemo(() => {
    const map = new Map<StageFilterKey, Series[]>();
    for (const s of currentSeries) {
      const kind = (s.stage_kind || 'other') as StageFilterKey;
      if (!map.has(kind)) map.set(kind, []);
      map.get(kind)?.push(s);
    }
    return map;
  }, [currentSeries]);

  const availableStageKinds = useMemo<StageFilterKey[]>(() => {
    const kinds = Array.from(seriesByStageKind.keys());
    kinds.sort((a, b) => {
      const aLatest = Math.max(...(seriesByStageKind.get(a) || []).map(getSeriesStartTime), 0);
      const bLatest = Math.max(...(seriesByStageKind.get(b) || []).map(getSeriesStartTime), 0);
      return bLatest - aLatest;
    });
    return kinds;
  }, [seriesByStageKind]);

  const stageFilterOptions = useMemo<StageFilterKey[]>(() => {
    const opts: StageFilterKey[] = ['all'];
    for (const kind of availableStageKinds) {
      if (!opts.includes(kind)) opts.push(kind);
    }
    return opts;
  }, [availableStageKinds]);

  useEffect(() => {
    if (!stageFilterOptions.includes(stageFilter)) {
      setStageFilter('all');
    }
  }, [stageFilterOptions, stageFilter]);

  useEffect(() => {
    if (!selectedTournament || !isFeaturedTournament(selectedTournament)) {
      setExpandedFeaturedTournamentId(null);
      return;
    }
    if (expandedFeaturedTournamentId && expandedFeaturedTournamentId !== selectedTournament.id) {
      setExpandedFeaturedTournamentId(null);
    }
  }, [expandedFeaturedTournamentId, selectedTournament]);

  if (!sortedTournaments.length) {
    return (
      <section ref={sectionRef} id="tournaments" className="py-12 sm:py-20 bg-slate-950 relative overflow-hidden">
        {/* 背景光效 */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-red-600/10 rounded-full blur-3xl"></div>

        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 relative z-10">
          <div className="mb-4 inline-flex items-center rounded-xl border border-white/10 bg-slate-900/70 p-1">
            <button
              type="button"
              onClick={() => setShowT1Only(true)}
              className={`rounded-lg px-3 py-1.5 text-xs sm:text-sm transition-colors ${
                showT1Only ? 'bg-red-600/20 text-red-300 border border-red-500/30' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              T1 赛事
            </button>
            <button
              type="button"
              onClick={() => setShowT1Only(false)}
              className={`rounded-lg px-3 py-1.5 text-xs sm:text-sm transition-colors ${
                !showT1Only ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              小型比赛
            </button>
          </div>
          <div className="flex items-center gap-4 mb-8">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-600 to-orange-600 flex items-center justify-center shadow-[0_0_30px_rgba(239,68,68,0.4)]">
              <Trophy className="w-7 h-7 text-white" />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-white">赛事战报</h2>
              <p className="text-slate-400 text-sm">Tournament Reports</p>
            </div>
          </div>
          <div className="text-center py-20">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-slate-800/50 mb-4">
              <Trophy className="w-10 h-10 text-slate-600" />
            </div>
            <p className="text-slate-500 text-lg">{showT1Only ? '暂无 T1 赛事数据' : '暂无小型赛事数据'}</p>
          </div>
        </div>
      </section>
    );
  }

  const filteredSeries = currentSeries.filter((s) => {
    const kind = (s.stage_kind || 'other') as StageFilterKey;
    if (stageFilter === 'all') return true;
    if (stageFilter === 'other') return !s.stage_kind || !['group', 'playin', 'playoff', 'final'].includes(kind);
    return kind === stageFilter;
  }).sort((a, b) => getSeriesStartTime(b) - getSeriesStartTime(a));

  // 统计中国战队参与的比赛
  const cnSeriesCount = currentSeries.filter(s => 
    isChineseTeam({ teamId: s.radiant_team_id, name: s.radiant_team_name }) ||
    isChineseTeam({ teamId: s.dire_team_id, name: s.dire_team_name })
  ).length;

  return (
    <section ref={sectionRef} id="tournaments" className="py-12 sm:py-16 bg-slate-950 relative overflow-hidden">
      {/* 背景装饰 */}
      <div className="absolute top-20 right-0 w-96 h-96 bg-red-600/10 rounded-full blur-3xl"></div>
      <div className="absolute bottom-20 left-0 w-96 h-96 bg-orange-600/10 rounded-full blur-3xl"></div>
      
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 relative z-10">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-6 sm:mb-8">
          <div className="flex flex-wrap items-center gap-2 sm:gap-4">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-red-600 to-orange-600 flex items-center justify-center shadow-[0_0_30px_rgba(239,68,68,0.4)]">
              <Trophy className="w-7 h-7 text-white" />
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white">赛事战报</h2>
              <p className="text-slate-400 text-sm">Tournament Reports</p>
            </div>
          </div>
          
          {/* 快速统计 */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-4">
            <div className="inline-flex items-center rounded-xl border border-white/10 bg-slate-900/70 p-1">
              <button
                type="button"
                onClick={() => setShowT1Only(true)}
                className={`rounded-lg px-3 py-1.5 text-xs sm:text-sm transition-colors ${
                  showT1Only ? 'bg-red-600/20 text-red-300 border border-red-500/30' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                T1 赛事
              </button>
              <button
                type="button"
                onClick={() => setShowT1Only(false)}
                className={`rounded-lg px-3 py-1.5 text-xs sm:text-sm transition-colors ${
                  !showT1Only ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                小型比赛
              </button>
            </div>
            <div className="flex items-center gap-2 min-w-0 bg-slate-800/60 backdrop-blur-sm px-2 sm:px-4 py-1 sm:py-2 rounded-xl border border-white/10">
              <Flame className="w-4 h-4 text-red-400" />
              <span className="text-sm text-slate-300">中国战队</span>
              <span className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-orange-400">
                {cnSeriesCount}
              </span>
            </div>
            <div className="flex items-center gap-2 min-w-0 bg-slate-800/60 backdrop-blur-sm px-2 sm:px-4 py-1 sm:py-2 rounded-xl border border-white/10">
              <Trophy className="w-4 h-4 text-amber-400" />
              <span className="text-sm text-slate-300">总场次</span>
              <span className="text-lg font-bold text-white">{currentSeriesTotal}</span>
            </div>
          </div>
        </div>

        {/* Tournament Tabs - 玻璃态卡片 */}
        <div className="mb-6">
          <Card className="bg-slate-900/60 backdrop-blur-xl border border-white/10 overflow-hidden">
            <div className="flex gap-1 overflow-x-auto p-2 scrollbar-thin">
              {sortedTournaments.map((tournament) => {
                const isSelected = selectedTournament?.id === tournament.id;
                const statusInfo = statusMap[tournament.status] || statusMap.upcoming;
                
                return (
                  <button
                    key={tournament.id}
                    onClick={() => setSelectedTournament(tournament)}
                    className={`
                      flex-shrink-0 relative px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-300 max-w-[190px] sm:max-w-none
                      ${isSelected 
                        ? `bg-gradient-to-r ${statusInfo.gradient} text-white shadow-[0_0_20px_rgba(239,68,68,0.3)] border border-white/20`
                        : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50 hover:text-white border border-transparent hover:border-white/10'
                      }
                    `}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium truncate">{tournament.name}</span>
                      {tournament.status === 'ongoing' && (
                        <span className="flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-red-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Selected Tournament Detail */}
        {selectedTournament && (
          <Card className="bg-slate-900/60 backdrop-blur-xl border border-white/10 overflow-hidden">
            {/* Tournament Header */}
            <CardHeader className="border-b border-white/10 p-4 sm:p-6">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-3">
                    {isFeaturedTournament(selectedTournament) ? (
                      <button
                        type="button"
                        onClick={() => setExpandedFeaturedTournamentId((current) => current === selectedTournament.id ? null : selectedTournament.id)}
                        className="truncate text-left text-xl font-bold text-white underline-offset-4 transition hover:text-amber-200 hover:underline sm:text-2xl"
                      >
                        {selectedTournament.name}
                      </button>
                    ) : (
                      <h3 className="text-xl sm:text-2xl font-bold text-white truncate">{selectedTournament.name}</h3>
                    )}
                    <Badge className={statusMap[selectedTournament.status]?.color || statusMap.upcoming.color}>
                      {selectedTournament.status === 'ongoing' && (
                        <span className="inline-block w-2 h-2 bg-red-500 rounded-full mr-2 animate-pulse"></span>
                      )}
                      {statusMap[selectedTournament.status]?.label || '即将开始'}
                    </Badge>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    <div className="flex items-center gap-2 min-w-0 text-slate-400">
                      <MapPin className="w-4 h-4" />
                      <span>{selectedTournament.location || 'TBD'}</span>
                    </div>
                    <div className="flex items-center gap-2 min-w-0 text-slate-400">
                      <Calendar className="w-4 h-4" />
                      <span>{formatDate(selectedTournament.start_time || selectedTournament.start_date)} ~ {formatDate(selectedTournament.end_time || selectedTournament.end_date)}</span>
                    </div>
                      <div className="flex items-center gap-2 min-w-0 text-amber-400">
                        <Award className="w-4 h-4" />
                        <span className="font-bold">{formatPrizeUsd(selectedTournament.prize_pool_usd, selectedTournament.prize_pool)}</span>
                      </div>
                  </div>
                  {isFeaturedTournament(selectedTournament) ? (
                    <div className="mt-3 text-xs text-amber-200/80">
                      点击赛事标题可{isFeaturedSelectedTournamentExpanded ? '收起' : '展开'}主赛事定制视图
                    </div>
                  ) : null}
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-6">
              {isFeaturedSelectedTournamentExpanded ? (
                <FeaturedTournamentPanel
                  payload={currentFeaturedData}
                  loading={currentFeaturedLoading}
                  error={currentFeaturedError}
                  onRetry={() => void fetchFeaturedTournament(selectedTournament)}
                  onOpenMatch={(matchId) => setSelectedMatchId(Number(matchId))}
                  aliasToTag={teamAliasToTag}
                  teams={effectiveTeams}
                />
              ) : null}

              <div className="mb-4 flex flex-wrap items-center gap-1.5 sm:gap-2">
                {stageFilterOptions.map((key) => {
                  const meta = STAGE_KIND_META[key];
                  const count = key === 'all'
                    ? currentSeries.length
                    : currentSeries.filter((s) => {
                        const kind = (s.stage_kind || 'other') as StageFilterKey;
                        if (key === 'other') {
                          return !s.stage_kind || !['group', 'playin', 'playoff', 'final'].includes(kind);
                        }
                        return kind === key;
                      }).length;
                  const active = stageFilter === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setStageFilter(key)}
                      className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs border transition-colors ${
                        active
                          ? 'bg-red-600/20 text-red-300 border-red-500/40'
                          : 'bg-slate-800/60 text-slate-300 border-slate-700 hover:border-slate-500'
                      }`}
                    >
                      {meta.label} ({meta.labelEn}) · {count}
                    </button>
                  );
                })}
              </div>

              {!isInView && currentSeries.length === 0 ? (
                <TournamentSeriesSkeleton />
              ) : currentSeriesLoading && currentSeries.length === 0 ? (
                <div className="py-12 flex items-center justify-center gap-3 text-slate-300">
                  <Loader2 className="w-5 h-5 animate-spin text-red-400" />
                  <span>正在加载赛事系列...</span>
                </div>
              ) : currentSeriesError && currentSeries.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-red-400 text-sm sm:text-base mb-4">{currentSeriesError}</p>
                  {selectedTournament && (
                    <button
                      type="button"
                      onClick={() => void fetchTournamentSeries(selectedTournament.id, 0)}
                      className="inline-flex items-center rounded-xl border border-red-500/30 bg-red-600/10 px-4 py-2 text-sm text-red-300 hover:bg-red-600/20 transition-colors"
                    >
                      重试加载
                    </button>
                  )}
                </div>
              ) : filteredSeries.length > 0 ? (
                <div className="space-y-3">
                  {filteredSeries.map((series) => {
                    const teamAIsCN = isChineseTeam({ teamId: series.radiant_team_id, name: series.radiant_team_name });
                    const teamBIsCN = isChineseTeam({ teamId: series.dire_team_id, name: series.dire_team_name });
                    const hasCN = teamAIsCN || teamBIsCN;
                    const isExpanded = expandedSeries.has(series.series_id);
                    
                    return (
                      <div
                        key={series.series_id}
                        className={`
                          group relative overflow-hidden rounded-2xl border transition-all duration-300
                          ${hasCN 
                            ? 'bg-gradient-to-br from-red-900/20 to-orange-900/10 border-red-600/40 hover:border-red-500/60 hover:shadow-[0_0_30px_rgba(239,68,68,0.2)]' 
                            : 'bg-slate-800/40 border-slate-700 hover:border-slate-600 hover:shadow-lg'
                          }
                        `}
                      >
                        {/* 背景光效 - 仅中国战队比赛 */}
                        {hasCN && (
                          <div className="absolute inset-0 bg-gradient-to-br from-red-600/5 to-orange-600/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
                        )}
                        
                        {/* Series Summary */}
                        <div
                          className="relative p-4 cursor-pointer hover:bg-white/5 transition-colors"
                          onClick={() => toggleSeries(series.series_id)}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
                            <div className="flex items-center gap-2 sm:gap-3">
                              <div className={`
                                w-8 h-8 rounded-lg flex items-center justify-center transition-transform duration-300
                                ${isExpanded ? 'rotate-90 bg-slate-700' : 'bg-slate-800'}
                              `}>
                                <ChevronRight className="w-4 h-4 text-slate-400" />
                              </div>
                              
                              <div className="flex items-center gap-2 min-w-0">
                                <Badge variant="outline" className="border-slate-600 text-slate-300 text-xs font-medium px-3 py-1">
                                  {series.series_type}
                                </Badge>
                                <Badge variant="outline" className="hidden sm:inline-block border-slate-600 text-slate-400 text-xs">
                                  {getSeriesStageLabel(series)}
                                </Badge>
                                {hasCN && (
                                  <Badge className="bg-gradient-to-r from-red-600/30 to-orange-600/30 text-red-400 text-xs font-bold border border-red-500/30">
                                    <Flame className="w-3 h-3 mr-1" />
                                    CN
                                  </Badge>
                                )}
                              </div>
                            </div>

                            {/* 对阵展示 - Logo | Team A | Score | Team B | Logo */}
                            <div className="w-full sm:w-auto flex items-center justify-center gap-1.5 sm:gap-4">
                              {/* Team A Logo - Left */}
                              <button
                                type="button"
                                className="flex-shrink-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openTeamFlyout({
                                    team_id: series.radiant_team_id,
                                    name: series.radiant_team_name,
                                    logo_url: series.radiant_team_logo
                                  });
                                }}
                              >
                                {series.radiant_team_logo ? (
                                  <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center ${teamAIsCN ? 'bg-gradient-to-br from-red-500/20 to-orange-500/10 border border-red-500/30' : 'bg-slate-800 border border-slate-700'}`}>
                                    <img 
                                      src={series.radiant_team_logo} 
                                      alt={series.radiant_team_name} 
                                      className="w-6 h-6 sm:w-8 sm:h-8 object-contain"
                                      onError={(e) => {
                                        const target = e.target as HTMLImageElement;
                                        target.style.display = 'none';
                                        const parent = target.parentElement;
                                        if (parent) {
                                          const fallback = document.createElement('span');
                                          fallback.className = 'text-xs sm:text-sm font-bold text-slate-400';
                                          fallback.textContent = getTeamAbbrev(series.radiant_team_name, teamAliasToTag);
                                          parent.appendChild(fallback);
                                        }
                                      }} 
                                    />
                                  </div>
                                ) : (
                                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-400">
                                    {getTeamAbbrev(series.radiant_team_name, teamAliasToTag)}
                                  </div>
                                )}
                              </button>

                              {/* Team A Name */}
                              <button
                                type="button"
                                className={`text-sm sm:text-base font-bold min-w-[40px] text-center ${series.radiant_score > series.dire_score ? 'text-green-400' : teamAIsCN ? 'text-red-400' : 'text-white'}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openTeamFlyout({
                                    team_id: series.radiant_team_id,
                                    name: series.radiant_team_name,
                                    logo_url: series.radiant_team_logo
                                  });
                                }}
                              >
                                {renderTeamName(series.radiant_team_name, teamAliasToTag)}
                              </button>

                              {/* Score - Center */}
                              <div className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 bg-slate-800/80 rounded-lg border border-white/10">
                                <span className={`text-base sm:text-xl font-bold ${series.radiant_score > series.dire_score ? 'text-green-400' : 'text-slate-400'}`}>
                                  {series.radiant_score}
                                </span>
                                <span className="text-slate-500">:</span>
                                <span className={`text-base sm:text-xl font-bold ${series.dire_score > series.radiant_score ? 'text-green-400' : 'text-slate-400'}`}>
                                  {series.dire_score}
                                </span>
                              </div>

                              {/* Team B Name */}
                              <button
                                type="button"
                                className={`text-sm sm:text-base font-bold min-w-[40px] text-center ${series.dire_score > series.radiant_score ? 'text-green-400' : teamBIsCN ? 'text-red-400' : 'text-white'}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openTeamFlyout({
                                    team_id: series.dire_team_id,
                                    name: series.dire_team_name,
                                    logo_url: series.dire_team_logo
                                  });
                                }}
                              >
                                {renderTeamName(series.dire_team_name, teamAliasToTag)}
                              </button>

                              {/* Team B Logo - Right */}
                              <button
                                type="button"
                                className="flex-shrink-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openTeamFlyout({
                                    team_id: series.dire_team_id,
                                    name: series.dire_team_name,
                                    logo_url: series.dire_team_logo
                                  });
                                }}
                              >
                                {series.dire_team_logo ? (
                                  <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center ${teamBIsCN ? 'bg-gradient-to-br from-red-500/20 to-orange-500/10 border border-red-500/30' : 'bg-slate-800 border border-slate-700'}`}>
                                    <img 
                                      src={series.dire_team_logo} 
                                      alt={series.dire_team_name} 
                                      className="w-6 h-6 sm:w-8 sm:h-8 object-contain"
                                      onError={(e) => {
                                        const target = e.target as HTMLImageElement;
                                        target.style.display = 'none';
                                        const parent = target.parentElement;
                                        if (parent) {
                                          const fallback = document.createElement('span');
                                          fallback.className = 'text-xs sm:text-sm font-bold text-slate-400';
                                          fallback.textContent = getTeamAbbrev(series.dire_team_name, teamAliasToTag);
                                          parent.appendChild(fallback);
                                        }
                                      }} 
                                    />
                                  </div>
                                ) : (
                                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-400">
                                    {getTeamAbbrev(series.dire_team_name, teamAliasToTag)}
                                  </div>
                                )}
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Expanded Games */}
                        {isExpanded && series.games.length > 0 && (
                          <div className="relative px-4 pb-4">
                            <div className="border-t border-white/10 pt-3">
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {series.games.map((game, idx) => {
                                  const winnerName = game.radiant_win ? game.radiant_team_name : game.dire_team_name;
                                  const winnerTeamId = game.radiant_win ? game.radiant_team_id : game.dire_team_id;
                                  const winnerIsCN = isChineseTeam({ teamId: winnerTeamId, name: winnerName });
                                  
                                  // Get hero picks for this game
                                  const picks = game.picks_bans || [];
                                  const radiantPicks = picks.filter(p => p.team === 'radiant' && p.is_pick).sort((a, b) => a.order - b.order);
                                  const direPicks = picks.filter(p => p.team === 'dire' && p.is_pick).sort((a, b) => a.order - b.order);
                                  
                                  return (
                                    <div 
                                      key={game.match_id} 
                                      onClick={() => setSelectedMatchId(Number(game.match_id))}
                                      className={`
                                        relative group/game
                                        rounded-xl p-3 text-center cursor-pointer
                                        transition-all duration-300
                                        ${winnerIsCN 
                                          ? 'bg-gradient-to-br from-red-900/30 to-orange-900/20 border border-red-500/30 hover:shadow-[0_0_20px_rgba(239,68,68,0.3)] hover:border-red-500/50' 
                                          : 'bg-slate-800/50 border border-slate-700 hover:bg-slate-700/70 hover:border-slate-600'
                                        }
                                      `}
                                    >
                                      {/* 游戏编号 */}
                                      <div className="text-[10px] text-slate-500 mb-2">Game {idx + 1}</div>
                                      
                                      {/* 比分 */}
                                      <div className="flex items-center justify-center gap-2 mb-2">
                                        <span className={`text-lg font-bold transition-colors ${game.radiant_win ? 'text-green-400' : 'text-slate-400'}`}>
                                          {game.radiant_score}
                                        </span>
                                        <span className="text-slate-600">-</span>
                                        <span className={`text-lg font-bold transition-colors ${!game.radiant_win ? 'text-green-400' : 'text-slate-400'}`}>
                                          {game.dire_score}
                                        </span>
                                      </div>
                                      
                                      {/* 获胜者 */}
                                      <div className={`text-xs font-bold mb-2 ${winnerIsCN ? 'text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-orange-400' : 'text-slate-300'}`}>
                                        {getTeamAbbrev(winnerName, teamAliasToTag)}
                                      </div>
                                      
                                      {/* Hero Picks Display */}
                                      {heroesLoaded && picks.length > 0 && (
                                        <div className="mt-2 pt-2 border-t border-white/10">
                                          {/* Radiant Heroes */}
                                          <div className="flex flex-wrap justify-center gap-0.5 mb-1">
                                            {radiantPicks.slice(0, 5).map((pick, i) => {
                                              const heroImg = getHeroImgUrl(pick.hero_id);
                                              return heroImg ? (
                                                <img 
                                                  key={`r-${i}`}
                                                  src={heroImg} 
                                                  alt={getHeroNameCn(pick.hero_id)}
                                                  className="w-5 h-3 object-contain"
                                                  title={getHeroNameCn(pick.hero_id)}
                                                />
                                              ) : null;
                                            })}
                                          </div>
                                          {/* Dire Heroes */}
                                          <div className="flex flex-wrap justify-center gap-0.5">
                                            {direPicks.slice(0, 5).map((pick, i) => {
                                              const heroImg = getHeroImgUrl(pick.hero_id);
                                              return heroImg ? (
                                                <img 
                                                  key={`d-${i}`}
                                                  src={heroImg} 
                                                  alt={getHeroNameCn(pick.hero_id)}
                                                  className="w-5 h-3 object-contain"
                                                  title={getHeroNameCn(pick.hero_id)}
                                                />
                                              ) : null;
                                            })}
                                          </div>
                                          {/* Hero Names */}
                                          <div className="mt-1 text-[8px] text-slate-500 truncate px-1">
                                            {radiantPicks.slice(0, 3).map(p => getHeroNameCn(p.hero_id)).join(' · ')}
                                          </div>
                                        </div>
                                      )}
                                      
                                      {/* 游戏时长 */}
                                      {game.duration > 0 && (
                                        <div className="flex items-center justify-center gap-1 text-[10px] text-slate-500 mt-1">
                                          <Clock className="w-3 h-3" />
                                          <span>{formatDuration(game.duration)}</span>
                                        </div>
                                      )}
                                      
                                      {/* 悬浮效果指示 */}
                                      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover/game:opacity-100 transition-opacity pointer-events-none"></div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {selectedTournament && (currentSeriesState?.hasMore || currentSeriesLoading) && (
                    <div className="pt-2 flex justify-center">
                      <button
                        type="button"
                        onClick={() => void fetchTournamentSeries(selectedTournament.id, currentSeries.length)}
                        disabled={currentSeriesLoading}
                        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-800/80 px-4 py-2 text-sm text-slate-200 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {currentSeriesLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        {currentSeriesLoading ? '加载中...' : '加载更多'}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-800/50 mb-4">
                    <Trophy className="w-8 h-8 text-slate-600" />
                  </div>
                  <p className="text-slate-500 text-lg">暂无比赛数据</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <TeamFlyout
        open={flyoutOpen}
        onOpenChange={setFlyoutOpen}
        selectedTeam={flyoutTeam}
        teams={effectiveTeams}
        matches={allMatches}
        upcoming={upcoming}
        onTeamSelect={(team) => openTeamFlyout(team)}
        onPlayerClick={openPlayerFlyout}
      />

      <MatchDetailModal 
        matchId={selectedMatchId} 
        open={selectedMatchId !== null} 
        onOpenChange={(open) => {
          if (!open) setSelectedMatchId(null);
        }}
        onTeamClick={(team) => {
          openTeamFlyout(team);
        }}
        onPlayerClick={openPlayerFlyout}
      />

      <PlayerProfileFlyout
        open={playerFlyoutOpen}
        onOpenChange={setPlayerFlyoutOpen}
        player={playerFlyoutModel}
        onTeamSelect={(team) => openTeamFlyout(team)}
      />
    </section>
  );
}
