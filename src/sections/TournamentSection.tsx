import { useState } from 'react';
import { Trophy, Calendar, MapPin, DollarSign, Target, Star, ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MatchDetailModal } from '@/components/custom/MatchDetailModal';

interface Tournament {
  id: string;
  name: string;
  name_cn?: string;
  tier: string;
  start_date: string;
  end_date: string;
  status: string;
  prize_pool?: string;
  location?: string;
}

interface Game {
  match_id: string;
  radiant_team_name: string;
  dire_team_name: string;
  radiant_score: number;
  dire_score: number;
  radiant_win: boolean;
  start_time: number;
  duration: number;
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

interface TournamentSectionProps {
  tournaments: Tournament[];
  seriesByTournament?: Record<string, Series[]>;
}

const statusMap: Record<string, { label: string; color: string }> = {
  upcoming: { label: '即将开始', color: 'bg-blue-600/20 text-blue-400 border-blue-600/30' },
  ongoing: { label: '进行中', color: 'bg-green-600/20 text-green-400 border-green-600/30' },
  completed: { label: '已结束', color: 'bg-slate-600/20 text-slate-400 border-slate-600/30' },
};

const chineseTeamNames = ['xg', 'yb', 'vg', 'xtreme', 'yakult', 'vici', 'azure', 'spirit', 'natus'];

function isChineseTeam(teamName: string | null | undefined): boolean {
  if (!teamName) return false;
  return chineseTeamNames.some(cn => teamName.toLowerCase().includes(cn));
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}

export function TournamentSection({ tournaments, seriesByTournament }: TournamentSectionProps) {
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(tournaments[0] || null);
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);
  const [expandedSeries, setExpandedSeries] = useState<Set<string>>(new Set());

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
      <section id="tournaments" className="py-20 bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4 mb-12">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-600 to-orange-600 flex items-center justify-center">
              <Trophy className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-white">赛事战报</h2>
              <p className="text-slate-400">T1级别赛事实时比分与排名</p>
            </div>
          </div>
          <div className="text-center py-12 text-slate-500">
            <Trophy className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>暂无赛事数据</p>
          </div>
        </div>
      </section>
    );
  }

  const currentSeries = selectedTournament ? (seriesByTournament?.[selectedTournament.id] || []) : [];

  return (
    <section id="tournaments" className="py-20 bg-slate-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4 mb-12">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-600 to-orange-600 flex items-center justify-center">
            <Trophy className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-white">赛事战报</h2>
            <p className="text-slate-400">T1级别赛事实时比分与排名</p>
          </div>
        </div>

        {/* Tournament Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
          {tournaments.map((tournament) => (
            <Card
              key={tournament.id}
              className={`cursor-pointer transition-all duration-300 ${
                selectedTournament?.id === tournament.id
                  ? 'border-red-500/50 bg-slate-900'
                  : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
              }`}
              onClick={() => setSelectedTournament(tournament)}
            >
              <div className="relative h-24 overflow-hidden rounded-t-lg">
                <img
                  src={`/dota2-hub/images/${tournament.id}.jpg`}
                  alt={tournament.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/dota2-hub/images/ti14.jpg';
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900 to-transparent" />
                <Badge
                  className={`absolute top-3 right-3 ${statusMap[tournament.status]?.color || statusMap.upcoming.color}`}
                >
                  {statusMap[tournament.status]?.label || '即将开始'}
                </Badge>
              </div>
              <CardContent className="p-4">
                <h3 className="font-bold text-white mb-2">{tournament.name_cn || tournament.name}</h3>
                <div className="flex items-center gap-4 text-sm text-slate-400">
                  <span className="flex items-center gap-1">
                    <DollarSign className="w-4 h-4" />
                    {tournament.prize_pool || 'TBD'}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {tournament.start_date?.slice(5) || '-'}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Series List */}
        {selectedTournament && (
          <Card className="border-slate-800 bg-slate-900/50">
            <CardHeader className="border-b border-slate-800">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <h3 className="text-2xl font-bold text-white">{selectedTournament.name_cn || selectedTournament.name}</h3>
                  <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-slate-400">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-4 h-4" />
                      {selectedTournament.location || 'TBD'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      {selectedTournament.start_date} ~ {selectedTournament.end_date}
                    </span>
                  </div>
                </div>
                <Badge className={statusMap[selectedTournament.status]?.color || statusMap.upcoming.color}>
                  {statusMap[selectedTournament.status]?.label || '即将开始'}
                </Badge>
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
                    const winner = series.radiant_score > series.dire_score ? series.radiant_team_name : series.dire_team_name;

                    return (
                      <div
                        key={series.series_id}
                        className={`rounded-lg border overflow-hidden ${hasCN ? 'bg-red-900/10 border-red-600/30' : 'bg-slate-800/30 border-slate-800'}`}
                      >
                        {/* Series Header - Click to expand */}
                        <div
                          className="p-4 cursor-pointer hover:bg-slate-800/50 transition-colors"
                          onClick={() => toggleSeries(series.series_id)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              {isExpanded ? (
                                <ChevronDown className="w-5 h-5 text-slate-400" />
                              ) : (
                                <ChevronRight className="w-5 h-5 text-slate-400" />
                              )}
                              <Badge variant="outline" className="border-slate-700 text-slate-400">
                                {series.series_type}
                              </Badge>
                              <Badge variant="outline" className="border-slate-700 text-slate-400">
                                {series.stage}
                              </Badge>
                              {hasCN && (
                                <Badge className="bg-red-600/20 text-red-400">
                                  <Star className="w-3 h-3 mr-1" />中国
                                </Badge>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center justify-between mt-3">
                            {/* Team A */}
                            <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                              {series.radiant_team_logo ? (
                                <img 
                                  src={series.radiant_team_logo} 
                                  alt={series.radiant_team_name}
                                  className="w-8 h-8 sm:w-10 sm:h-10 rounded object-contain bg-slate-800 flex-shrink-0"
                                />
                              ) : (
                                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded bg-slate-700 flex items-center justify-center text-slate-400 text-xs font-bold flex-shrink-0">
                                  {series.radiant_team_name.substring(0, 2).toUpperCase()}
                                </div>
                              )}
                              <div className="flex flex-col min-w-0">
                                <span className={`font-medium text-sm sm:text-base truncate ${series.radiant_score > series.dire_score ? 'text-green-400' : 'text-white'}`}>
                                  {series.radiant_team_name}
                                </span>
                                {teamAIsCN && <span className="text-xs text-red-400">中国</span>}
                              </div>
                            </div>

                            {/* Score */}
                            <div className="flex items-center gap-1 sm:gap-3 px-2 sm:px-4">
                              <span className={`text-lg sm:text-2xl font-bold ${series.radiant_score > series.dire_score ? 'text-green-400' : 'text-slate-400'}`}>
                                {series.radiant_score}
                              </span>
                              <span className="text-slate-600 text-sm sm:text-lg">:</span>
                              <span className={`text-lg sm:text-2xl font-bold ${series.dire_score > series.radiant_score ? 'text-green-400' : 'text-slate-400'}`}>
                                {series.dire_score}
                              </span>
                            </div>

                            {/* Team B */}
                            <div className="flex items-center gap-2 sm:gap-3 flex-1 justify-end min-w-0">
                              <div className="flex flex-col items-end min-w-0">
                                <span className={`font-medium text-sm sm:text-base truncate ${series.dire_score > series.radiant_score ? 'text-green-400' : 'text-white'}`}>
                                  {series.dire_team_name}
                                </span>
                                {teamBIsCN && <span className="text-xs text-red-400">中国</span>}
                              </div>
                              {series.dire_team_logo ? (
                                <img 
                                  src={series.dire_team_logo} 
                                  alt={series.dire_team_name}
                                  className="w-8 h-8 sm:w-10 sm:h-10 rounded object-contain bg-slate-800 flex-shrink-0"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded bg-slate-700 flex items-center justify-center text-slate-400 text-xs font-bold">
                                  {series.dire_team_name.substring(0, 2).toUpperCase()}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="text-center text-sm text-slate-500 mt-2">
                            胜者: {winner}
                          </div>
                        </div>

                        {/* Expanded: Show individual games */}
                        {isExpanded && (
                          <div className="border-t border-slate-800 bg-slate-900/50 p-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                              {series.games.map((game, idx) => (
                                <div
                                  key={game.match_id}
                                  className={`p-3 rounded-lg border cursor-pointer hover:border-red-500 transition-colors ${
                                    game.radiant_win ? 'bg-green-900/20 border-green-600/30' : 'bg-red-900/20 border-red-600/30'
                                  }`}
                                  onClick={() => {
                                    const numericId = parseInt(game.match_id.replace(/\D/g, ''));
                                    if (!isNaN(numericId) && numericId > 1000000000) {
                                      setSelectedMatchId(numericId);
                                    }
                                  }}
                                >
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs text-slate-400">第{idx + 1}局</span>
                                    <span className="text-xs text-slate-500">{formatDuration(game.duration)}</span>
                                  </div>
                                  <div className="flex items-center justify-between text-sm">
                                    <span className={game.radiant_win ? 'text-green-400' : 'text-slate-400'}>
                                      {game.radiant_score}
                                    </span>
                                    <span className="text-slate-600">:</span>
                                    <span className={!game.radiant_win ? 'text-green-400' : 'text-slate-400'}>
                                      {game.dire_score}
                                    </span>
                                  </div>
                                  <div className="text-xs text-slate-500 mt-1 text-center">
                                    {formatDate(game.start_time)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12 text-slate-500">
                  <Target className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>比赛数据尚未公布</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Match Detail Modal */}
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
