import { useState } from 'react';
import { MapPin, Trophy, ChevronRight, Flame, Clock, Calendar, Award } from 'lucide-react';
import { MatchDetailModal } from '@/components/custom/MatchDetailModal';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Tournament {
  id: string;
  name: string;
  name_cn?: string;
  prize_pool?: string;
  location?: string;
  start_date?: string;
  end_date?: string;
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

const chineseTeamNames = [
  'xg', 'xtreme', 
  'yb', 'yakult', 'tearlaments', 
  'vg', 'vici', 'game master', 'tidebound', 
  'refuser', 'thriving', 'azure'
];

function isChineseTeam(teamName: string | undefined): boolean {
  if (!teamName) return false;
  const name = teamName.toLowerCase();
  return chineseTeamNames.some(cn => name.includes(cn));
}

function getTeamAbbrev(teamName: string): string {
  const abbr: Record<string, string> = {
    'Xtreme Gaming': 'XG', 'Yakult Brothers': 'YB',
    'Team Spirit': 'Spirit', 'Natus Vincere': 'NAVI',
    'Tundra Esports': 'Tundra', 'Team Liquid': 'Liquid',
    'Team Falcons': 'Falcons', 'OG': 'OG',
    'GamerLegion': 'GL', 'PARIVISION': 'PARI',
    'BetBoom Team': 'BB', 'paiN Gaming': 'paiN',
    'Aurora Gaming': 'Aurora', 'Execration': 'XctN',
    'MOUZ': 'MOUZ', 'Vici Gaming': 'VG', 'PSG.LGD': 'LGD',
    'Team Yandex': 'Yandex', 'Tidebound': 'Tidebound',
    'Team Nemesis': 'Nemesis', '1w Team': '1w',
    'Nigma Galaxy': 'Nigma', 'Virtus.pro': 'VP',
  };
  return abbr[teamName] || teamName.substring(0, 3).toUpperCase();
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

export function TournamentSection({ tournaments, seriesByTournament }: TournamentSectionProps) {
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(tournaments[0] || null);
  
  const [expandedSeries, setExpandedSeries] = useState<Set<string>>(new Set());
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);

  const toggleSeries = (seriesId: string) => {
    const newExpanded = new Set(expandedSeries);
    if (newExpanded.has(seriesId)) {
      newExpanded.delete(seriesId);
    } else {
      newExpanded.add(seriesId);
    }
    setExpandedSeries(newExpanded);
  };

  if (!tournaments.length) {
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

  const currentSeries = selectedTournament ? (seriesByTournament?.[selectedTournament.id] || []) : [];

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
              {tournaments.map((tournament) => {
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
                      <span>{selectedTournament.start_date} ~ {selectedTournament.end_date}</span>
                    </div>
                    {selectedTournament.prize_pool && (
                      <div className="flex items-center gap-2 min-w-0 text-amber-400">
                        <Award className="w-4 h-4" />
                        <span className="font-bold">{selectedTournament.prize_pool}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-6">
              {currentSeries.length > 0 ? (
                <div className="space-y-3">
                  {currentSeries.map((series) => {
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
                                  {series.stage}
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
                                    <img src={series.radiant_team_logo} alt={series.radiant_team_name} className="w-6 h-6 sm:w-8 sm:h-8 object-contain" onError={(e) => (e.target as HTMLImageElement).style.display = 'none'} />
                                  </div>
                                ) : (
                                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-400">
                                    {getTeamAbbrev(series.radiant_team_name).substring(0,2)}
                                  </div>
                                )}
                              </div>

                              {/* Team A Name */}
                              <span className={`text-sm sm:text-base font-bold min-w-[40px] text-center ${series.radiant_score > series.dire_score ? 'text-green-400' : teamAIsCN ? 'text-red-400' : 'text-white'}`}>
                                {getTeamAbbrev(series.radiant_team_name)}
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
                                {getTeamAbbrev(series.dire_team_name)}
                              </span>

                              {/* Team B Logo - Right */}
                              <div className="flex-shrink-0">
                                {series.dire_team_logo ? (
                                  <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center ${teamBIsCN ? 'bg-gradient-to-br from-red-500/20 to-orange-500/10 border border-red-500/30' : 'bg-slate-800 border border-slate-700'}`}>
                                    <img src={series.dire_team_logo} alt={series.dire_team_name} className="w-6 h-6 sm:w-8 sm:h-8 object-contain" onError={(e) => (e.target as HTMLImageElement).style.display = 'none'} />
                                  </div>
                                ) : (
                                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-400">
                                    {getTeamAbbrev(series.dire_team_name).substring(0,2)}
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
                                      
                                      {/* 游戏时长 */}
                                      {game.duration > 0 && (
                                        <div className="flex items-center justify-center gap-1 text-[10px] text-slate-500">
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
