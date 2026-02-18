import { useState } from 'react';
import { MapPin, Trophy, ChevronDown, ChevronRight } from 'lucide-react';
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

const statusMap: Record<string, { label: string; color: string }> = {
  upcoming: { label: 'Upcoming', color: 'bg-blue-600/20 text-blue-400 border-blue-600/30' },
  ongoing: { label: 'Live', color: 'bg-green-600/20 text-green-400 border-green-600/30' },
  completed: { label: 'Completed', color: 'bg-slate-600/20 text-slate-400 border-slate-600/30' },
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
      <section id="tournaments" className="py-12 sm:py-20 bg-slate-950">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 sm:gap-4 mb-8 sm:mb-12">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-red-600 to-orange-600 flex items-center justify-center">
              <Trophy className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white">赛事战报</h2>
              <p className="text-slate-400 text-sm">Tournament Reports</p>
            </div>
          </div>
          <div className="text-center py-20 text-slate-500">No tournament data</div>
        </div>
      </section>
    );
  }

  const currentSeries = selectedTournament ? (seriesByTournament?.[selectedTournament.id] || []) : [];

  return (
    <section id="tournaments" className="py-8 sm:py-12 bg-slate-950">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-600 to-orange-600 flex items-center justify-center">
            <Trophy className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">赛事战报</h2>
            <p className="text-sm text-slate-400">Tournament Reports</p>
          </div>
        </div>

        {/* Tournament Tabs - Horizontal Scroll */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-thin">
          {tournaments.map((tournament) => (
            <button
              key={tournament.id}
              onClick={() => setSelectedTournament(tournament)}
              className={`flex-shrink-0 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                selectedTournament?.id === tournament.id
                  ? 'bg-red-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {tournament.name}
            </button>
          ))}
        </div>

        {/* Selected Tournament Matches */}
        {selectedTournament && (
          <Card className="border-slate-800 bg-slate-900/50">
            <CardHeader className="border-b border-slate-800 p-3">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-white truncate">{selectedTournament.name}</h3>
                  <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {selectedTournament.location || 'TBD'}
                    </span>
                    <span>{selectedTournament.start_date} ~ {selectedTournament.end_date}</span>
                  </div>
                </div>
                <Badge className={statusMap[selectedTournament.status]?.color || statusMap.upcoming.color}>
                  {statusMap[selectedTournament.status]?.label || 'Upcoming'}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="p-3">
              {currentSeries.length > 0 ? (
                <div className="space-y-2">
                  {currentSeries.map((series) => {
                    const teamAIsCN = isChineseTeam(series.radiant_team_name);
                    const teamBIsCN = isChineseTeam(series.dire_team_name);
                    const hasCN = teamAIsCN || teamBIsCN;
                    const isExpanded = expandedSeries.has(series.series_id);
                    

                    return (
                      <div
                        key={series.series_id}
                        className={`rounded-lg border overflow-hidden ${hasCN ? 'bg-red-900/10 border-red-600/30' : 'bg-slate-800/30 border-slate-800'}`}
                      >
                        <div
                          className="p-3 cursor-pointer hover:bg-slate-800/50 transition-colors"
                          onClick={() => toggleSeries(series.series_id)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                              <Badge variant="outline" className="border-slate-700 text-slate-400 text-xs">{series.series_type}</Badge>
                              <Badge variant="outline" className="border-slate-700 text-slate-400 text-xs">{series.stage}</Badge>
                              {hasCN && <Badge className="bg-red-600/20 text-red-400 text-xs">CN</Badge>}
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              {series.radiant_team_logo ? (
                                <img src={series.radiant_team_logo} alt={series.radiant_team_name} className="w-5 h-5 sm:w-8 sm:h-8 object-contain bg-slate-800 rounded" onError={(e) => (e.target as HTMLImageElement).style.display = 'none'} />
                              ) : (
                                <div className="w-8 h-8 bg-slate-700 rounded flex items-center justify-center text-xs">{getTeamAbbrev(series.radiant_team_name).substring(0,2)}</div>
                              )}
                              <span className={series.radiant_score > series.dire_score ? 'text-green-400 font-bold' : 'text-white'}>
                                {getTeamAbbrev(series.radiant_team_name)}
                              </span>
                              <span className="text-slate-500">{series.radiant_score} - {series.dire_score}</span>
                              <span className={series.dire_score > series.radiant_score ? 'text-green-400 font-bold' : 'text-white'}>
                                {getTeamAbbrev(series.dire_team_name)}
                              </span>
                              {series.dire_team_logo ? (
                                <img src={series.dire_team_logo} alt={series.dire_team_name} className="w-5 h-5 sm:w-8 sm:h-8 object-contain bg-slate-800 rounded" onError={(e) => (e.target as HTMLImageElement).style.display = 'none'} />
                              ) : (
                                <div className="w-8 h-8 bg-slate-700 rounded flex items-center justify-center text-xs">{getTeamAbbrev(series.dire_team_name).substring(0,2)}</div>
                              )}
                            </div>
                          </div>
                        </div>

                        {isExpanded && series.games.length > 0 && (
                          <div className="px-3 pb-3 border-t border-slate-800/50">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                              {series.games.map((game, idx) => {
                                const winnerName = game.radiant_win ? series.radiant_team_name : series.dire_team_name;
                                return (
                                  <div key={game.match_id} onClick={() => setSelectedMatchId(Number(game.match_id))} className="bg-slate-800/50 rounded p-2 text-center cursor-pointer hover:bg-slate-700">
                                    <div className="text-[10px] text-slate-500">Game {idx + 1}</div>
                                    <div className="flex items-center justify-center gap-1 mt-1">
                                      <span className={game.radiant_win ? 'text-green-400 font-bold' : 'text-slate-400'}>{game.radiant_score}</span>
                                      <span className="text-slate-600">-</span>
                                      <span className={!game.radiant_win ? 'text-green-400 font-bold' : 'text-slate-400'}>{game.dire_score}</span>
                                    </div>
                                    <div className="text-[10px] text-green-400 mt-1">{getTeamAbbrev(winnerName)}</div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-500">No match data</div>
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
