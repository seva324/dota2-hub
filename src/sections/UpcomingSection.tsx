import { useState, useEffect } from 'react';
import { Calendar, Clock, Flame, Star } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Match {
  id: number;
  match_id: number;
  radiant_team_name: string;
  radiant_team_name_cn?: string;
  radiant_team_logo?: string;
  dire_team_name: string;
  dire_team_name_cn?: string;
  dire_team_logo?: string;
  start_time: number;
  series_type: string;
  tournament_name: string;
  tournament_name_cn?: string;
}

// 战队Logo映射 - 优先使用本地图片
const teamLogoMap: Record<string, string> = {
  'xg': '/images/xg-logo.png',
  'xg-logo': '/images/xg-logo.png',
  'xtreme gaming': '/images/xg-logo.png',
  'yb': '/images/yb-logo.png',
  'yb-logo': '/images/yb-logo.png',
  'yakult brothers': '/images/yb-logo.png',
  'vg': '/images/vg-logo.png',
  'vici gaming': '/images/vg-logo.png',
  'lgd': '/images/lgd-logo.png',
  'psg.lgd': '/images/lgd-logo.png',
};

// 战队简称映射
const teamAbbr: Record<string, string> = {
  'Xtreme Gaming': 'XG',
  'Yakult Brothers': 'YB',
  'Team Spirit': 'Spirit',
  'Natus Vincere': 'NAVI',
  'Tundra Esports': 'Tundra',
  'Team Liquid': 'Liquid',
  'Team Falcons': 'Falcons',
  'OG': 'OG',
  'BetBoom Team': 'BB',
  'Aurora Gaming': 'Aurora',
  'PARIVISION': 'PARI',
  'GamerLegion': 'GL',
  'Execration': 'XctN',
  'MOUZ': 'MOUZ',
  'Gaimin Gladiators': 'GG',
  'paiN Gaming': 'paiN',
  'Team Yandex': 'Yandex',
};

function getTeamLogo(teamName: string, logoUrl: string): string {
  if (!teamName) return '';
  
  // 优先使用本地Logo
  const key = teamName.toLowerCase();
  if (teamLogoMap[key]) {
    return teamLogoMap[key];
  }
  
  // 其次使用传入的URL
  if (logoUrl) {
    return logoUrl;
  }
  
  return '';
}

function getAbbr(teamName: string | null | undefined): string {
  if (!teamName) return '';
  return teamAbbr[teamName] || teamName;
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
        setTimeLeft(`${hours}小时${minutes}分钟`);
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

function isChineseTeam(teamName: string | null | undefined): boolean {
  if (!teamName) return false;
  const name = teamName.toLowerCase();
  return ['xg', 'xtreme', 'yb', 'yakult', 'tearlaments', 'vg', 'vici', 'game master', 'tidebound', 'refuser', 'thriving', 'azure'].some(cn => name.includes(cn));
}

export function UpcomingSection({ upcoming }: { upcoming: Match[] }) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <section id="upcoming" className="py-20 bg-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 mb-8 sm:mb-12">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-600 flex items-center justify-center">
              <Calendar className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white">赛事预告</h2>
              <p className="text-slate-400 text-sm">即将开始的比赛</p>
            </div>
          </div>
          <Badge className="ml-auto bg-red-600/20 text-red-400 border-red-600/30 text-xs">
            <Star className="w-3 h-3 mr-1" />
            关注中国战队
          </Badge>
        </div>

        {upcoming.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {upcoming.slice(0, 6).map((match) => {
              const radiantIsCN = isChineseTeam(match.radiant_team_name);
              const direIsCN = isChineseTeam(match.dire_team_name);
              
              // 移动端用缩写，PC用全名
              const radiantDisplay = isMobile ? getAbbr(match.radiant_team_name || '') : (match.radiant_team_name_cn || match.radiant_team_name);
              const direDisplay = isMobile ? getAbbr(match.dire_team_name || '') : (match.dire_team_name_cn || match.dire_team_name);
              
              // 获取Logo
              const radiantLogo = getTeamLogo(match.radiant_team_name || "", match.radiant_team_logo || "");
              const direLogo = getTeamLogo(match.dire_team_name || "", match.dire_team_logo || "");
              
              return (
                <Card key={match.id} className="border-slate-800 bg-slate-950/50 hover:border-blue-500/30 transition-all">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <Badge variant="outline" className="border-slate-700 text-slate-400 text-xs">
                        {match.tournament_name_cn || match.tournament_name || '待定赛事'}
                      </Badge>
                      <span className="text-xs text-slate-500">{match.series_type}</span>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        {radiantLogo ? (
                          <img 
                            src={radiantLogo} 
                            alt={radiantDisplay}
                            className="w-8 h-8 sm:w-10 sm:h-10 object-contain flex-shrink-0 bg-slate-800 rounded-full p-1"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-slate-700 rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="text-xs text-slate-400">{radiantDisplay?.charAt(0)}</span>
                          </div>
                        )}
                        <span className={`font-bold text-sm sm:text-lg truncate ${radiantIsCN ? 'text-red-400' : 'text-white'}`}>
                          {radiantDisplay}
                        </span>
                        {radiantIsCN && <Badge className="bg-red-600/20 text-red-400 text-xs flex-shrink-0">CN</Badge>}
                      </div>
                      <div className="text-center px-2 sm:px-4 flex-shrink-0">
                        <p className="text-sm sm:text-lg font-bold text-blue-400">VS</p>
                      </div>
                      <div className="flex items-center gap-2 min-w-0 flex-row-reverse">
                        {direIsCN && <Badge className="bg-red-600/20 text-red-400 text-xs flex-shrink-0">CN</Badge>}
                        <span className={`font-bold text-sm sm:text-lg truncate ${direIsCN ? 'text-red-400' : 'text-white'}`}>
                          {direDisplay}
                        </span>
                        {direLogo ? (
                          <img 
                            src={direLogo} 
                            alt={direDisplay}
                            className="w-8 h-8 sm:w-10 sm:h-10 object-contain flex-shrink-0 bg-slate-800 rounded-full p-1"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-slate-700 rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="text-xs text-slate-400">{direDisplay?.charAt(0)}</span>
                          </div>
                        )}
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
