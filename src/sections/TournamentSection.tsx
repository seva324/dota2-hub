import { useState, useEffect, useMemo } from 'react';
import { MapPin, Trophy, ChevronRight, Flame, Clock, Calendar, Award } from 'lucide-react';
import { MatchDetailModal } from '@/components/custom/MatchDetailModal';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { isChineseTeam } from '@/lib/teams';

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
    const res = await fetch('/data/heroes.json');
    const heroesJson = await res.json();
    Object.entries(heroesJson).forEach(([key, value]) => {
      heroesData[parseInt(key)] = value as HeroData;
    });
    console.log('Heroes loaded in TournamentSection:', Object.keys(heroesData).length);
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
  name: string;
  name_cn?: string;
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
  radiant_team_name: string;
  dire_team_name: string;
  radiant_score: number;
  dire_score: number;
  radiant_win: boolean | number;
  start_time: number;
  duration: number;
  picks_bans?: HeroPick[];
}

// Team data type for team abbreviations
interface TeamData {
  id: string;
  name: string;
  name_cn: string;
  tag: string;
  logo_url: string;
}

// Load teams data for team abbreviations
const teamsData: Record<string, TeamData> = {};

async function loadTeamsData() {
  try {
    const res = await fetch('/data/teams.json');
    const teamsJson = await res.json();
    // Create lookup by name (case insensitive)
    teamsJson.forEach((team: TeamData) => {
      teamsData[team.name.toLowerCase()] = team;
      if (team.name_cn) {
        teamsData[team.name_cn.toLowerCase()] = team;
      }
      if (team.tag) {
        teamsData[team.tag.toLowerCase()] = team;
      }
    });
    console.log('Teams loaded in TournamentSection:', Object.keys(teamsData).length);
  } catch (err) {
    console.error('Error loading teams:', err);
  }
}

function getTeamAbbrev(teamName: string | null | undefined): string {
  if (!teamName) return 'TBD';
  const abbr: Record<string, string> = {
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
  return abbr[teamName] || teamName.substring(0, 3).toUpperCase();
}

// Render team name with responsive display: abbrev on mobile, full name on desktop
function renderTeamName(teamName: string, className?: string): React.JSX.Element {
  const abbrev = getTeamAbbrev(teamName);
  return (
    <span className={className}>
      <span className="sm:hidden">{abbrev}</span>
      <span className="hidden sm:inline">{teamName}</span>
    </span>
  );
}

interface TournamentSectionProps {
  tournaments: Tournament[];
  seriesByTournament?: Record<string, Series[]>;
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

export function TournamentSection({ tournaments, seriesByTournament }: TournamentSectionProps) {
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [expandedSeries, setExpandedSeries] = useState<Set<string>>(new Set());
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);
  const [heroesLoaded, setHeroesLoaded] = useState(false);
  const [stageFilter, setStageFilter] = useState<StageFilterKey>('all');

  const sortedTournaments = useMemo(() => {
    return [...(tournaments || [])].sort((a, b) => {
      const aStart = a.start_time ?? 0;
      const bStart = b.start_time ?? 0;
      if (bStart !== aStart) return bStart - aStart;
      const aEnd = a.end_time ?? 0;
      const bEnd = b.end_time ?? 0;
      return bEnd - aEnd;
    });
  }, [tournaments]);

  // Set initial tournament when tournaments are loaded
  useEffect(() => {
    if (sortedTournaments.length > 0 && !selectedTournament) {
      setSelectedTournament(sortedTournaments[0]);
      return;
    }
    if (selectedTournament && sortedTournaments.length > 0) {
      const exists = sortedTournaments.some(t => t.id === selectedTournament.id);
      if (!exists) {
        setSelectedTournament(sortedTournaments[0]);
      }
    }
  }, [sortedTournaments, selectedTournament]);

  useEffect(() => {
    setStageFilter('all');
  }, [selectedTournament?.id]);

  // Load heroes data on mount
  useEffect(() => {
    Promise.all([
      loadHeroesData(),
      loadTeamsData()
    ]).then(() => {
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

  const currentSeries = selectedTournament ? (seriesByTournament?.[selectedTournament.id] || []) : [];
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

  if (!sortedTournaments.length) {
    return (
      <section id="tournaments" className="py-12 sm:py-20 bg-slate-950 relative overflow-hidden">
        {/* 背景光效 */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-red-600/10 rounded-full blur-3xl"></div>

        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 relative z-10">
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
            <p className="text-slate-500 text-lg">暂无赛事数据</p>
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
    isChineseTeam(s.radiant_team_name) || isChineseTeam(s.dire_team_name)
  ).length;

  return (
    <section id="tournaments" className="py-12 sm:py-16 bg-slate-950 relative overflow-hidden">
      {/* 背景装饰 */}
      <div className="absolute top-20 right-0 w-96 h-96 bg-red-600/10 rounded-full blur-3xl"></div>
      <div className="absolute bottom-20 left-0 w-96 h-96 bg-orange-600/10 rounded-full blur-3xl"></div>
      
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 relative z-10">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div className="flex flex-wrap items-center gap-2 sm:gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-600 to-orange-600 flex items-center justify-center shadow-[0_0_30px_rgba(239,68,68,0.4)]">
              <Trophy className="w-7 h-7 text-white" />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-white">赛事战报</h2>
              <p className="text-slate-400 text-sm">Tournament Reports</p>
            </div>
          </div>
          
          {/* 快速统计 */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-4">
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
              <span className="text-lg font-bold text-white">{currentSeries.length}</span>
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
                      flex-shrink-0 relative px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-300
                      ${isSelected 
                        ? `bg-gradient-to-r ${statusInfo.gradient} text-white shadow-[0_0_20px_rgba(239,68,68,0.3)] border border-white/20`
                        : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50 hover:text-white border border-transparent hover:border-white/10'
                      }
                    `}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium">{tournament.name}</span>
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
            <CardHeader className="border-b border-white/10 p-6">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-3">
                    <h3 className="text-xl sm:text-2xl font-bold text-white truncate">{selectedTournament.name}</h3>
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
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-6">
              <div className="mb-4 flex flex-wrap items-center gap-2">
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
                      className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
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

              {filteredSeries.length > 0 ? (
                <div className="space-y-3">
                  {filteredSeries.map((series) => {
                    const teamAIsCN = isChineseTeam(series.radiant_team_name);
                    const teamBIsCN = isChineseTeam(series.dire_team_name);
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
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
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
                            <div className="flex items-center justify-center gap-2 sm:gap-4">
                              {/* Team A Logo - Left */}
                              <div className="flex-shrink-0">
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
                                          fallback.textContent = getTeamAbbrev(series.radiant_team_name);
                                          parent.appendChild(fallback);
                                        }
                                      }} 
                                    />
                                  </div>
                                ) : (
                                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-400">
                                    {getTeamAbbrev(series.radiant_team_name)}
                                  </div>
                                )}
                              </div>

                              {/* Team A Name */}
                              <span className={`text-sm sm:text-base font-bold min-w-[40px] text-center ${series.radiant_score > series.dire_score ? 'text-green-400' : teamAIsCN ? 'text-red-400' : 'text-white'}`}>
                                {renderTeamName(series.radiant_team_name)}
                              </span>

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
                              <span className={`text-sm sm:text-base font-bold min-w-[40px] text-center ${series.dire_score > series.radiant_score ? 'text-green-400' : teamBIsCN ? 'text-red-400' : 'text-white'}`}>
                                {renderTeamName(series.dire_team_name)}
                              </span>

                              {/* Team B Logo - Right */}
                              <div className="flex-shrink-0">
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
                                          fallback.textContent = getTeamAbbrev(series.dire_team_name);
                                          parent.appendChild(fallback);
                                        }
                                      }} 
                                    />
                                  </div>
                                ) : (
                                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-400">
                                    {getTeamAbbrev(series.dire_team_name)}
                                  </div>
                                )}
                              </div>
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
                                  const winnerIsCN = isChineseTeam(winnerName);
                                  
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
                                        {getTeamAbbrev(winnerName)}
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

      <MatchDetailModal 
        matchId={selectedMatchId} 
        open={selectedMatchId !== null} 
        onOpenChange={(open) => {
          if (!open) setSelectedMatchId(null);
        }} 
      />
    </section>
  );
}
