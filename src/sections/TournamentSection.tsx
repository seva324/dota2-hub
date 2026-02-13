import { useState } from 'react';
import { Trophy, Calendar, MapPin, DollarSign, Medal, Target, Star } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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
  format?: string;
  teams?: string[];
  standings?: Array<{
    position: number;
    team: { id: string; name: string; tag: string; logo?: string };
    wins: number;
    losses: number;
    points?: number;
  }>;
  series?: Array<{
    seriesId: string;
    teamA: { id: string; name: string; tag: string; logo?: string };
    teamB: { id: string; name: string; tag: string; logo?: string };
    scoreA: number;
    scoreB: number;
    format: string;
    stage: string;
    timestamp: string;
    matches?: Array<{
      matchId: string;
      radiantTeam: { name: string };
      direTeam: { name: string };
      radiantScore: number;
      direScore: number;
      duration: string;
      winner: 'radiant' | 'dire';
    }>;
  }>;
}

const statusMap: Record<string, { label: string; color: string }> = {
  upcoming: { label: '即将开始', color: 'bg-blue-600/20 text-blue-400 border-blue-600/30' },
  ongoing: { label: '进行中', color: 'bg-green-600/20 text-green-400 border-green-600/30' },
  completed: { label: '已结束', color: 'bg-slate-600/20 text-slate-400 border-slate-600/30' },
};

const chineseTeamNames = ['xg', 'yb', 'vg', 'xtreme', 'yakult', 'vici', 'azure'];

function isChineseTeam(teamName: string | null | undefined): boolean {
  if (!teamName) return false;
  return chineseTeamNames.some(cn => teamName.toLowerCase().includes(cn));
}

export function TournamentSection({ tournaments }: { tournaments: Tournament[] }) {
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(tournaments[0] || null);

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
          <Badge className="ml-auto bg-red-600/20 text-red-400 border-red-600/30">
            <Star className="w-3 h-3 mr-1" />
            中国战队
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
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
              <div className="relative h-32 overflow-hidden rounded-t-lg">
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
                    <span className="flex items-center gap-1">
                      <DollarSign className="w-4 h-4" />
                      {selectedTournament.prize_pool || 'TBD'}
                    </span>
                  </div>
                </div>
                <Badge className={statusMap[selectedTournament.status]?.color || statusMap.upcoming.color}>
                  {statusMap[selectedTournament.status]?.label || '即将开始'}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="p-6">
              <Tabs defaultValue="matches" className="w-full">
                <TabsList className="bg-slate-800/50 mb-6">
                  <TabsTrigger value="matches" className="data-[state=active]:bg-slate-700">
                    <Target className="w-4 h-4 mr-2" />
                    比赛结果
                  </TabsTrigger>
                  <TabsTrigger value="standings" className="data-[state=active]:bg-slate-700">
                    <Medal className="w-4 h-4 mr-2" />
                    排名
                  </TabsTrigger>
                  <TabsTrigger value="format" className="data-[state=active]:bg-slate-700">
                    赛制
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="standings">
                  {selectedTournament.standings && selectedTournament.standings.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-slate-800">
                            <th className="text-left py-3 px-4 text-slate-400 font-medium">排名</th>
                            <th className="text-left py-3 px-4 text-slate-400 font-medium">战队</th>
                            <th className="text-center py-3 px-4 text-slate-400 font-medium">胜</th>
                            <th className="text-center py-3 px-4 text-slate-400 font-medium">负</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedTournament.standings.map((standing) => {
                            const isCN = isChineseTeam(standing.team.name);
                            return (
                              <tr
                                key={standing.team.id}
                                className={`border-b border-slate-800/50 hover:bg-slate-800/30 ${isCN ? 'bg-red-900/10' : ''}`}
                              >
                                <td className="py-3 px-4">
                                  <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold ${
                                    standing.position === 1 ? 'bg-yellow-600/20 text-yellow-400' :
                                    standing.position === 2 ? 'bg-slate-400/20 text-slate-300' :
                                    standing.position === 3 ? 'bg-orange-700/20 text-orange-400' :
                                    'text-slate-400'
                                  }`}>
                                    {standing.position}
                                  </span>
                                </td>
                                <td className="py-3 px-4">
                                  <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded flex items-center justify-center text-xs font-bold ${
                                      isCN ? 'bg-red-600/30 text-red-400' : 'bg-slate-800 text-slate-400'
                                    }`}>
                                      {standing.team.tag}
                                    </div>
                                    <span className={`font-medium ${isCN ? 'text-red-400' : 'text-white'}`}>
                                      {standing.team.name}
                                    </span>
                                    {isCN && <Badge className="bg-red-600/20 text-red-400 text-xs">中国</Badge>}
                                  </div>
                                </td>
                                <td className="py-3 px-4 text-center text-green-400">{standing.wins}</td>
                                <td className="py-3 px-4 text-center text-red-400">{standing.losses}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-slate-500">
                      <Medal className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>排名数据尚未公布</p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="matches">
                  {selectedTournament.series && selectedTournament.series.length > 0 ? (
                    <div className="space-y-4">
                      {selectedTournament.series.map((series) => {
                        const teamAIsCN = isChineseTeam(series.teamA.name);
                        const teamBIsCN = isChineseTeam(series.teamB.name);
                        const hasCN = teamAIsCN || teamBIsCN;
                        
                        return (
                          <div
                            key={series.seriesId}
                            className={`rounded-lg p-4 border ${hasCN ? 'bg-red-900/10 border-red-600/30' : 'bg-slate-800/30 border-slate-800'}`}
                          >
                            <div className="flex items-center justify-between mb-3">
                              <Badge variant="outline" className="border-slate-700 text-slate-400">{series.stage}</Badge>
                              <div className="flex items-center gap-2">
                                {hasCN && <Badge className="bg-red-600/20 text-red-400"><Star className="w-3 h-3 mr-1" />中国战队</Badge>}
                                <span className="text-sm text-slate-500">{series.format}</span>
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded flex items-center justify-center text-sm font-bold ${teamAIsCN ? 'bg-red-600/30 text-red-400' : 'bg-slate-800 text-slate-400'}`}>
                                  {series.teamA.tag}
                                </div>
                                <span className={`font-medium ${teamAIsCN ? 'text-red-400' : 'text-white'}`}>{series.teamA.name}</span>
                              </div>
                              <div className="flex items-center gap-4">
                                <span className={`text-2xl font-bold ${series.scoreA > series.scoreB ? 'text-green-400' : 'text-slate-400'}`}>{series.scoreA}</span>
                                <span className="text-slate-600">:</span>
                                <span className={`text-2xl font-bold ${series.scoreB > series.scoreA ? 'text-green-400' : 'text-slate-400'}`}>{series.scoreB}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className={`font-medium ${teamBIsCN ? 'text-red-400' : 'text-white'}`}>{series.teamB.name}</span>
                                <div className={`w-10 h-10 rounded flex items-center justify-center text-sm font-bold ${teamBIsCN ? 'bg-red-600/30 text-red-400' : 'bg-slate-800 text-slate-400'}`}>
                                  {series.teamB.tag}
                                </div>
                              </div>
                            </div>
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
                </TabsContent>

                <TabsContent value="format">
                  <div className="bg-slate-800/30 rounded-lg p-6 border border-slate-800">
                    <h4 className="text-lg font-semibold text-white mb-4">赛制说明</h4>
                    <p className="text-slate-300 leading-relaxed">{selectedTournament.format || '赛制详情待定'}</p>
                    <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-slate-800/50 rounded-lg p-4">
                        <div className="text-sm text-slate-400 mb-1">参赛队伍</div>
                        <div className="text-xl font-bold text-white">{selectedTournament.teams?.length || 'TBD'}支</div>
                      </div>
                      <div className="bg-slate-800/50 rounded-lg p-4">
                        <div className="text-sm text-slate-400 mb-1">赛事级别</div>
                        <div className="text-xl font-bold text-white">{selectedTournament.tier || 'TBD'}</div>
                      </div>
                      <div className="bg-slate-800/50 rounded-lg p-4">
                        <div className="text-sm text-slate-400 mb-1">主办方</div>
                        <div className="text-xl font-bold text-white">{selectedTournament.id?.split('-')[0]?.toUpperCase() || 'TBD'}</div>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}
      </div>
    </section>
  );
}
