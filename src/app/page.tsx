'use client';

import { useEffect, useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { 
  Trophy, Calendar, MapPin, DollarSign, ChevronRight, Medal, Target, Star,
  ArrowDown, TrendingUp, Clock, Users, Flame, MessageCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Match {
  id: number;
  match_id: number;
  radiant_team_name: string;
  radiant_team_name_cn?: string;
  radiant_logo?: string;
  dire_team_name: string;
  dire_team_name_cn?: string;
  dire_logo?: string;
  radiant_score: number;
  dire_score: number;
  radiant_game_wins: number;
  dire_game_wins: number;
  start_time: number;
  series_type: string;
  status: string;
  tournament_name: string;
  tournament_name_cn?: string;
  tournament_tier?: string;
}

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
  standings?: Standing[];
  series?: Series[];
  image?: string;
}

interface Standing {
  position: number;
  team: {
    id: string;
    name: string;
    tag: string;
    logo?: string;
  };
  wins: number;
  losses: number;
  points?: number;
}

interface Series {
  seriesId: string;
  teamA: {
    id: string;
    name: string;
    tag: string;
    logo?: string;
  };
  teamB: {
    id: string;
    name: string;
    tag: string;
    logo?: string;
  };
  scoreA: number;
  scoreB: number;
  format: string;
  stage: string;
  timestamp: string;
  matches?: GameMatch[];
}

interface GameMatch {
  matchId: string;
  radiantTeam: { name: string };
  direTeam: { name: string };
  radiantScore: number;
  direScore: number;
  duration: string;
  winner: 'radiant' | 'dire';
}

interface News {
  id: string;
  title: string;
  summary?: string;
  source: string;
  url: string;
  published_at: number;
  keywords?: string;
  category: string;
  image?: string;
}

interface CommunityPost {
  id: string;
  title: string;
  author: string;
  source: string;
  upvotes: number;
  comments: number;
  url: string;
  publishedAt: string;
}

interface HomeData {
  upcoming: Match[];
  cnMatches: Match[];
  tournaments: Tournament[];
  news: News[];
  community?: CommunityPost[];
  lastUpdated: string;
}

const chineseTeamIds = ['xg', 'yb', 'vg', 'xtreme-gaming', 'yakult-brother', 'vici-gaming'];
const chineseTeamNames = ['xg', 'yb', 'vg', 'xtreme', 'yakult', 'vici', 'azure', 'azure ray'];

function isChineseTeam(teamName: string): boolean {
  const name = teamName.toLowerCase();
  return chineseTeamNames.some(cn => name.includes(cn));
}

function Countdown({ targetTime }: { targetTime: number }) {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const updateCountdown = () => {
      const now = Math.floor(Date.now() / 1000);
      const diff = targetTime - now;
      
      if (diff <= 0) {
        setTimeLeft('比赛中');
        return;
      }

      const days = Math.floor(diff / 86400);
      const hours = Math.floor((diff % 86400) / 3600);
      const minutes = Math.floor((diff % 3600) / 60);

      if (days > 0) {
        setTimeLeft(`${days}天 ${hours}小时`);
      } else if (hours > 0) {
        setTimeLeft(`${hours}小时 ${minutes}分钟`);
      } else {
        setTimeLeft(`${minutes}分钟`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 60000);
    return () => clearInterval(interval);
  }, [targetTime]);

  return <span className="tabular-nums">{timeLeft}</span>;
}

// Status mapping
const statusMap: Record<string, { label: string; color: string }> = {
  upcoming: { label: '即将开始', color: 'bg-blue-600/20 text-blue-400 border-blue-600/30' },
  ongoing: { label: '进行中', color: 'bg-green-600/20 text-green-400 border-green-600/30' },
  completed: { label: '已结束', color: 'bg-slate-600/20 text-slate-400 border-slate-600/30' },
};

function HeroSection({ upcoming }: { upcoming: Match[] }) {
  const scrollToTournaments = () => {
    const element = document.querySelector('#tournaments');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const nextMatch = upcoming[0];

  return (
    <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden">
      {/* Background Image */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: 'url(/dota2-hub/images/hero-banner.jpg)' }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/70 via-slate-950/50 to-slate-950" />
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-32 text-center">
        <div className="flex justify-center gap-2 mb-6">
          <Badge 
            variant="secondary" 
            className="px-4 py-2 bg-red-600/20 text-red-400 border-red-600/30 text-sm"
          >
            <TrendingUp className="w-4 h-4 mr-2" />
            2026赛季火热进行中
          </Badge>
          <Badge 
            variant="secondary" 
            className="px-4 py-2 bg-yellow-600/20 text-yellow-400 border-yellow-600/30 text-sm"
          >
            <Star className="w-4 h-4 mr-2" />
            TI15上海站
          </Badge>
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-white mb-6 leading-tight">
          DOTA2 <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-500">Pro Hub</span>
        </h1>

        <p className="text-lg sm:text-xl text-slate-300 mb-8 max-w-3xl mx-auto">
          专业的DOTA2战报与赛事预测平台，重点关注XG、YB、VG等中国战队，
          汇集T1级别赛事结果、转会动态、社区热点，为每一位刀友提供最新最全的电竞资讯
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
          <Button 
            size="lg" 
            className="bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white px-8"
            onClick={scrollToTournaments}
          >
            <Trophy className="w-5 h-5 mr-2" />
            查看赛事战报
          </Button>
          <Button 
            size="lg" 
            variant="outline" 
            className="border-slate-600 text-slate-300 hover:bg-slate-800/50 px-8"
            onClick={() => {
              const element = document.querySelector('#upcoming');
              if (element) element.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            <Calendar className="w-5 h-5 mr-2" />
            赛事预告
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto mb-12">
          <div className="bg-slate-900/60 backdrop-blur-sm rounded-xl p-4 border border-slate-800">
            <div className="text-3xl font-bold text-white mb-1">3</div>
            <div className="text-sm text-slate-400">中国战队</div>
          </div>
          <div className="bg-slate-900/60 backdrop-blur-sm rounded-xl p-4 border border-slate-800">
            <div className="text-3xl font-bold text-white mb-1">13+</div>
            <div className="text-sm text-slate-400">T1赛事/年</div>
          </div>
          <div className="bg-slate-900/60 backdrop-blur-sm rounded-xl p-4 border border-slate-800">
            <div className="text-3xl font-bold text-white mb-1">$13M</div>
            <div className="text-sm text-slate-400">年度奖金池</div>
          </div>
          <div className="bg-slate-900/60 backdrop-blur-sm rounded-xl p-4 border border-slate-800">
            <div className="text-3xl font-bold text-white">实时</div>
            <div className="text-sm text-slate-400">数据更新</div>
          </div>
        </div>

        {/* Chinese Teams */}
        <div className="flex flex-wrap justify-center gap-3 mb-8">
          <span className="text-sm text-slate-500">关注中国战队:</span>
          {['XG', 'YB', 'VG'].map((tag) => (
            <Badge key={tag} className="bg-red-600/20 text-red-400 border-red-600/30">
              {tag}
            </Badge>
          ))}
        </div>

        {/* Next Match Countdown */}
        {nextMatch && (
          <div className="bg-slate-900/80 backdrop-blur-md rounded-2xl p-6 max-w-2xl mx-auto border border-red-600/30">
            <p className="text-sm text-red-400 mb-3 flex items-center justify-center gap-2">
              <Clock className="w-4 h-4" />
              下场比赛倒计时
            </p>
            <div className="flex items-center justify-between">
              <div className="text-left">
                <p className="font-bold text-white text-lg">{nextMatch.radiant_team_name_cn || nextMatch.radiant_team_name}</p>
                <p className="text-xs text-slate-400">{nextMatch.radiant_team_name}</p>
              </div>
              <div className="text-center px-6">
                <p className="text-2xl font-bold text-red-500">VS</p>
                <p className="text-sm text-amber-400 font-medium mt-1">
                  <Countdown targetTime={nextMatch.start_time} />
                </p>
              </div>
              <div className="text-right">
                <p className="font-bold text-white text-lg">{nextMatch.dire_team_name_cn || nextMatch.dire_team_name}</p>
                <p className="text-xs text-slate-400">{nextMatch.dire_team_name}</p>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-3">{nextMatch.tournament_name_cn || nextMatch.tournament_name} · {nextMatch.series_type}</p>
          </div>
        )}

        {/* Scroll Indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <ArrowDown className="w-6 h-6 text-slate-500" />
        </div>
      </div>
    </section>
  );
}

function TournamentSection({ tournaments }: { tournaments: Tournament[] }) {
  const [selectedTournament, setSelectedTournament] = useState(tournaments[0]);

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
        {/* Section Header */}
        <div className="flex items-center gap-4 mb-12">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-600 to-orange-600 flex items-center justify-center">
            <Trophy className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-white">赛事战报</h2>
            <p className="text-slate-400">T1级别赛事实时比分与排名</p>
          </div>
          {/* Chinese Teams Badge */}
          <Badge className="ml-auto bg-red-600/20 text-red-400 border-red-600/30">
            <Star className="w-3 h-3 mr-1" />
            中国战队
          </Badge>
        </div>

        {/* Tournament Selector */}
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
                  src={tournament.image || `/dota2-hub/images/${tournament.id}.jpg`}
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

        {/* Tournament Details */}
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
                    <ChevronRight className="w-4 h-4 mr-2" />
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
                            <th className="text-right py-3 px-4 text-slate-400 font-medium">积分</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedTournament.standings.map((standing) => {
                            const isCN = isChineseTeam(standing.team.name);
                            return (
                              <tr
                                key={standing.team.id}
                                className={`border-b border-slate-800/50 hover:bg-slate-800/30 ${
                                  isCN ? 'bg-red-900/10' : ''
                                }`}
                              >
                                <td className="py-3 px-4">
                                  <span
                                    className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold ${
                                      standing.position === 1
                                        ? 'bg-yellow-600/20 text-yellow-400'
                                        : standing.position === 2
                                        ? 'bg-slate-400/20 text-slate-300'
                                        : standing.position === 3
                                        ? 'bg-orange-700/20 text-orange-400'
                                        : 'text-slate-400'
                                    }`}
                                  >
                                    {standing.position}
                                  </span>
                                </td>
                                <td className="py-3 px-4">
                                  <div className="flex items-center gap-3">
                                    {standing.team.logo ? (
                                      <img 
                                        src={standing.team.logo} 
                                        alt={standing.team.tag}
                                        className="w-8 h-8 object-contain"
                                      />
                                    ) : (
                                      <div className={`w-8 h-8 rounded flex items-center justify-center text-xs font-bold ${
                                        isCN ? 'bg-red-600/30 text-red-400' : 'bg-slate-800 text-slate-400'
                                      }`}>
                                        {standing.team.tag}
                                      </div>
                                    )}
                                    <div className="flex items-center gap-2">
                                      <span className={`font-medium ${isCN ? 'text-red-400' : 'text-white'}`}>
                                        {standing.team.name}
                                      </span>
                                      {isCN && (
                                        <Badge className="bg-red-600/20 text-red-400 text-xs">
                                          中国
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td className="py-3 px-4 text-center text-green-400">{standing.wins}</td>
                                <td className="py-3 px-4 text-center text-red-400">{standing.losses}</td>
                                <td className="py-3 px-4 text-right text-white font-medium">
                                  {standing.points || '-'}
                                </td>
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
                            className={`rounded-lg p-4 border ${
                              hasCN ? 'bg-red-900/10 border-red-600/30' : 'bg-slate-800/30 border-slate-800'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-3">
                              <Badge variant="outline" className="border-slate-700 text-slate-400">
                                {series.stage}
                              </Badge>
                              <div className="flex items-center gap-2">
                                {hasCN && (
                                  <Badge className="bg-red-600/20 text-red-400">
                                    <Star className="w-3 h-3 mr-1" />
                                    中国战队
                                  </Badge>
                                )}
                                <span className="text-sm text-slate-500">{series.format}</span>
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                {series.teamA.logo ? (
                                  <img 
                                    src={series.teamA.logo} 
                                    alt={series.teamA.tag}
                                    className="w-10 h-10 object-contain"
                                  />
                                ) : (
                                  <div className={`w-10 h-10 rounded flex items-center justify-center text-sm font-bold ${
                                    teamAIsCN ? 'bg-red-600/30 text-red-400' : 'bg-slate-800 text-slate-400'
                                  }`}>
                                    {series.teamA.tag}
                                  </div>
                                )}
                                <span className={`font-medium ${teamAIsCN ? 'text-red-400' : 'text-white'}`}>
                                  {series.teamA.name}
                                </span>
                              </div>
                              <div className="flex items-center gap-4">
                                <span
                                  className={`text-2xl font-bold ${
                                    series.scoreA > series.scoreB ? 'text-green-400' : 'text-slate-400'
                                  }`}
                                >
                                  {series.scoreA}
                                </span>
                                <span className="text-slate-600">:</span>
                                <span
                                  className={`text-2xl font-bold ${
                                    series.scoreB > series.scoreA ? 'text-green-400' : 'text-slate-400'
                                  }`}
                                >
                                  {series.scoreB}
                                </span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className={`font-medium ${teamBIsCN ? 'text-red-400' : 'text-white'}`}>
                                  {series.teamB.name}
                                </span>
                                {series.teamB.logo ? (
                                  <img 
                                    src={series.teamB.logo} 
                                    alt={series.teamB.tag}
                                    className="w-10 h-10 object-contain"
                                  />
                                ) : (
                                  <div className={`w-10 h-10 rounded flex items-center justify-center text-sm font-bold ${
                                    teamBIsCN ? 'bg-red-600/30 text-red-400' : 'bg-slate-800 text-slate-400'
                                  }`}>
                                    {series.teamB.tag}
                                  </div>
                                )}
                              </div>
                            </div>
                            {series.matches && series.matches.length > 0 && (
                              <div className="mt-4 pt-4 border-t border-slate-800">
                                <p className="text-sm text-slate-400 mb-2">详细比分</p>
                                <div className="flex flex-wrap gap-2">
                                  {series.matches.map((match, idx) => (
                                    <Badge
                                      key={match.matchId}
                                      variant="outline"
                                      className={`${
                                        match.winner === 'radiant'
                                          ? 'border-green-600/30 text-green-400'
                                          : 'border-red-600/30 text-red-400'
                                      }`}
                                    >
                                      局{idx + 1}: {match.radiantScore}-{match.direScore}
                                    </Badge>
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

function UpcomingSection({ upcoming }: { upcoming: Match[] }) {
  return (
    <section id="upcoming" className="py-20 bg-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4 mb-12">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-600 flex items-center justify-center">
            <Calendar className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-white">赛事预告</h2>
            <p className="text-slate-400">即将开始的比赛</p>
          </div>
        </div>

        {upcoming.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {upcoming.slice(0, 6).map((match) => {
              const radiantIsCN = isChineseTeam(match.radiant_team_name);
              const direIsCN = isChineseTeam(match.dire_team_name);
              
              return (
                <Card key={match.id} className="border-slate-800 bg-slate-900/50 hover:border-blue-500/30 transition-all">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <Badge variant="outline" className="border-slate-700 text-slate-400">
                        {match.tournament_name_cn || match.tournament_name}
                      </Badge>
                      <span className="text-xs text-slate-500">{match.series_type}</span>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`font-medium ${radiantIsCN ? 'text-red-400' : 'text-white'}`}>
                          {match.radiant_team_name_cn || match.radiant_team_name}
                        </span>
                        {radiantIsCN && <Badge className="bg-red-600/20 text-red-400 text-xs">CN</Badge>}
                      </div>
                      <div className="text-center px-4">
                        <p className="text-lg font-bold text-blue-400">VS</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {direIsCN && <Badge className="bg-red-600/20 text-red-400 text-xs">CN</Badge>}
                        <span className={`font-medium ${direIsCN ? 'text-red-400' : 'text-white'}`}>
                          {match.dire_team_name_cn || match.dire_team_name}
                        </span>
                      </div>
                    </div>
                    
                    <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between">
                      <span className="text-sm text-amber-400">
                        <Countdown targetTime={match.start_time} />
                      </span>
                      <span className="text-xs text-slate-500">
                        {format(match.start_time * 1000, 'MM月dd日 HH:mm', { locale: zhCN })}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 text-slate-500">
            <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>暂无即将开始的比赛</p>
          </div>
        )}
      </div>
    </section>
  );
}

function NewsSection({ news }: { news: News[] }) {
  const categoryColors: Record<string, string> = {
    transfer: 'bg-purple-500/20 text-purple-400',
    patch: 'bg-green-500/20 text-green-400',
    tournament: 'bg-blue-500/20 text-blue-400',
    default: 'bg-slate-500/20 text-slate-400',
  };

  const categoryLabels: Record<string, string> = {
    transfer: '转会',
    patch: '更新',
    tournament: '赛事',
    default: '资讯',
  };

  return (
    <section className="py-20 bg-slate-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4 mb-12">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-600 to-yellow-600 flex items-center justify-center">
            <Flame className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-white">最新资讯</h2>
            <p className="text-slate-400">DOTA2新闻与更新</p>
          </div>
        </div>

        {news.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {news.slice(0, 6).map((item) => (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group block"
              >
                <Card className="h-full border-slate-800 bg-slate-900/50 hover:border-amber-500/30 transition-all overflow-hidden">
                  <div className="relative h-40 overflow-hidden">
                    <img
                      src={item.image || `/dota2-hub/images/patch-update.jpg`}
                      alt={item.title}
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/dota2-hub/images/patch-update.jpg';
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900 to-transparent" />
                    <Badge className={`absolute top-3 left-3 ${categoryColors[item.category] || categoryColors.default}`}>
                      {categoryLabels[item.category] || categoryLabels.default}
                    </Badge>
                  </div>
                  <CardContent className="p-4">
                    <h3 className="font-semibold text-white mb-2 line-clamp-2 group-hover:text-amber-400 transition-colors">
                      {item.title}
                    </h3>
                    {item.summary && (
                      <p className="text-sm text-slate-400 line-clamp-2 mb-3">{item.summary}</p>
                    )}
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span>{item.source}</span>
                      <span>·</span>
                      <span>{formatDistanceToNow(item.published_at * 1000, { locale: zhCN, addSuffix: true })}</span>
                    </div>
                  </CardContent>
                </Card>
              </a>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-slate-500">
            <Flame className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>暂无新闻数据</p>
          </div>
        )}
      </div>
    </section>
  );
}

function CommunitySection({ posts }: { posts?: CommunityPost[] }) {
  if (!posts || posts.length === 0) return null;

  return (
    <section className="py-20 bg-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4 mb-12">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center">
            <MessageCircle className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-white">社区热点</h2>
            <p className="text-slate-400">Reddit & NGA 热门讨论</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {posts.slice(0, 6).map((post) => (
            <a
              key={post.id}
              href={post.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <Card className="border-slate-800 bg-slate-900/50 hover:border-purple-500/30 transition-all">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      post.source === 'reddit' ? 'bg-orange-600/20' : 'bg-green-600/20'
                    }`}>
                      <span className="text-xs font-bold">
                        {post.source === 'reddit' ? 'R' : 'NGA'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-white line-clamp-2 mb-2">{post.title}</h4>
                      <div className="flex items-center gap-4 text-xs text-slate-500">
                        <span>@{post.author}</span>
                        <span className="flex items-center gap-1">
                          <TrendingUp className="w-3 h-3" />
                          {post.upvotes.toLocaleString()}
                        </span>
                        <span>{post.comments} 评论</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer({ lastUpdated }: { lastUpdated?: string }) {
  return (
    <footer className="bg-slate-950 border-t border-slate-800 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-red-600 to-orange-600 rounded-lg flex items-center justify-center">
              <Trophy className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-white">DOTA2 Pro Hub</h3>
              <p className="text-xs text-slate-400">专注中国战队 · XG YB VG</p>
            </div>
          </div>
          
          <div className="text-sm text-slate-500">
            数据来源: OpenDota API · 每日自动更新
          </div>
          
          {lastUpdated && (
            <div className="text-xs text-slate-600">
              最后更新: {format(new Date(lastUpdated), 'yyyy-MM-dd HH:mm', { locale: zhCN })}
            </div>
          )}
        </div>
        
        <div className="mt-8 pt-8 border-t border-slate-800/50 text-center text-xs text-slate-600">
          © 2026 DOTA2 Pro Hub. Not affiliated with Valve Corporation.
        </div>
      </div>
    </footer>
  );
}

function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass-effect border-b border-slate-800/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-red-600 to-orange-600 rounded-lg flex items-center justify-center">
              <Trophy className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-white text-lg">DOTA2 Pro Hub</span>
          </div>
          
          <div className="hidden md:flex items-center gap-6">
            <a href="#tournaments" className="text-slate-300 hover:text-white transition-colors">赛事</a>
            <a href="#upcoming" className="text-slate-300 hover:text-white transition-colors">预告</a>
            <a href="/dota2-hub/teams.html" className="text-slate-300 hover:text-white transition-colors">战队</a>
          </div>
          
          <div className="flex items-center gap-2">
            {['XG', 'YB', 'VG'].map((tag) => (
              <Badge key={tag} className="bg-red-600/20 text-red-400 border-red-600/30 text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}

// Main Page Component
export default function HomePage() {
  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/dota2-hub/data/home.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const homeData = await response.json();
        setData(homeData);
        setLoading(false);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        setError(`加载数据失败: ${errorMsg}`);
        console.error('Error loading data:', err);
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <div className="text-red-500 text-xl">加载中...</div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-center">
          <div className="text-red-500 text-xl mb-2">{error || '数据加载失败'}</div>
          <button 
            onClick={() => window.location.reload()}
            className="text-slate-400 hover:text-white underline"
          >
            刷新重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <Navbar />
      <main>
        <HeroSection upcoming={data.upcoming} />
        <TournamentSection tournaments={data.tournaments} />
        <UpcomingSection upcoming={data.upcoming} />
        <NewsSection news={data.news} />
        <CommunitySection posts={data.community} />
      </main>
      <Footer lastUpdated={data.lastUpdated} />
    </div>
  );
}
