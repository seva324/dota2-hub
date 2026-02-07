import { useState, useEffect } from 'react';
import { Calendar, Clock, Flame, Star } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Match {
  id: number;
  match_id: number;
  radiant_team_name: string;
  radiant_team_name_cn?: string;
  dire_team_name: string;
  dire_team_name_cn?: string;
  start_time: number;
  series_type: string;
  tournament_name: string;
  tournament_name_cn?: string;
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

function isChineseTeam(teamName: string): boolean {
  const name = teamName.toLowerCase();
  return ['xg', 'yb', 'vg', 'xtreme', 'yakult', 'vici', 'azure'].some(cn => name.includes(cn));
}

export function UpcomingSection({ upcoming }: { upcoming: Match[] }) {
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

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
          <Badge className="ml-auto bg-red-600/20 text-red-400 border-red-600/30">
            <Star className="w-3 h-3 mr-1" />
            关注中国战队
          </Badge>
        </div>

        {upcoming.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {upcoming.slice(0, 6).map((match) => {
              const radiantIsCN = isChineseTeam(match.radiant_team_name);
              const direIsCN = isChineseTeam(match.dire_team_name);
              
              return (
                <Card key={match.id} className="border-slate-800 bg-slate-950/50 hover:border-blue-500/30 transition-all">
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
                      <span className="text-sm text-amber-400 flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        <Countdown targetTime={match.start_time} />
                      </span>
                      <span className="text-xs text-slate-500">{formatDate(match.start_time)}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 text-slate-500">
            <Flame className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>暂无即将开始的比赛</p>
          </div>
        )}
      </div>
    </section>
  );
}
