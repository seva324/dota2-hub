import { useState, useEffect } from 'react';
import { ArrowDown, Calendar, Trophy, TrendingUp, Star, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

export function HeroSection({ upcoming }: { upcoming: Match[] }) {
  const scrollToTournaments = () => {
    const element = document.querySelector('#tournaments');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const nextMatch = upcoming[0];

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background Image */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: 'url(/dota2-hub/images/hero-banner.jpg)' }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/70 via-slate-950/50 to-slate-950" />
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-32 text-center">
        <div className="flex flex-wrap justify-center gap-2 mb-4 sm:mb-6 px-2 sm:px-0">
          <Badge 
            variant="secondary" 
            className="px-2 sm:px-4 py-1 sm:py-2 bg-red-600/20 text-red-400 border-red-600/30 text-xs sm:text-sm"
          >
            <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
            <span className="hidden xs:inline">2026赛季火热进行中</span>
            <span className="xs:hidden">2026赛季</span>
          </Badge>
          <Badge 
            variant="secondary" 
            className="px-2 sm:px-4 py-1 sm:py-2 bg-yellow-600/20 text-yellow-400 border-yellow-600/30 text-xs sm:text-sm"
          >
            <Star className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
            <span className="hidden xs:inline">TI15上海站</span>
            <span className="xs:hidden">TI15</span>
          </Badge>
        </div>

        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold text-white mb-4 sm:mb-6 leading-tight">
          DOTA2 <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-500">Pro Hub</span>
        </h1>

        <p className="text-sm sm:text-base md:text-lg text-slate-300 mb-6 sm:mb-8 px-2 sm:px-0 max-w-2xl mx-auto">
          专业的DOTA2战报与赛事预测平台，重点关注XG、YB、VG等中国战队，
          汇集T1级别赛事结果
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 sm:gap-6 max-w-3xl mx-auto mb-8 sm:mb-12 px-2 sm:px-0">
          <div className="bg-slate-900/60 backdrop-blur-sm rounded-lg sm:rounded-xl p-3 sm:p-4 border border-slate-800">
            <div className="text-2xl sm:text-3xl font-bold text-white mb-1">3</div>
            <div className="text-xs sm:text-sm text-slate-400">中国战队</div>
          </div>
          <div className="bg-slate-900/60 backdrop-blur-sm rounded-lg sm:rounded-xl p-3 sm:p-4 border border-slate-800">
            <div className="text-2xl sm:text-3xl font-bold text-white mb-1">13+</div>
            <div className="text-xs sm:text-sm text-slate-400">T1赛事/年</div>
          </div>
          <div className="bg-slate-900/60 backdrop-blur-sm rounded-lg sm:rounded-xl p-3 sm:p-4 border border-slate-800">
            <div className="text-2xl sm:text-3xl font-bold text-white mb-1">$13M</div>
            <div className="text-xs sm:text-sm text-slate-400">年度奖金池</div>
          </div>
          <div className="bg-slate-900/60 backdrop-blur-sm rounded-lg sm:rounded-xl p-3 sm:p-4 border border-slate-800">
            <div className="text-2xl sm:text-3xl font-bold text-white mb-1">实时</div>
            <div className="text-xs sm:text-sm text-slate-400">数据更新</div>
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
        {nextMatch && nextMatch.radiant_team_name && nextMatch.dire_team_name && (
          <div className="bg-slate-900/80 backdrop-blur-md rounded-xl sm:rounded-2xl p-3 sm:p-6 max-w-xl mx-auto border border-red-600/30 mx-2 sm:mx-0">
            <p className="text-xs sm:text-sm text-red-400 mb-2 sm:mb-3 flex items-center justify-center gap-1 sm:gap-2">
              <Clock className="w-3 h-4" />
              下场比赛倒计时
            </p>
            <div className="flex items-center justify-between gap-2">
              <div className="text-left flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                {nextMatch.radiant_team_logo && (
                  <img 
                    src={nextMatch.radiant_team_logo} 
                    alt={nextMatch.radiant_team_name}
                    className="w-8 h-8 sm:w-12 sm:h-12 object-contain flex-shrink-0"
                    style={{
                      filter: nextMatch.radiant_team_name?.toLowerCase().includes('tundra') || nextMatch.radiant_team_name?.toLowerCase().includes('spirit') 
                        ? 'invert(1) brightness(2)' : 'none'
                    }}
                  />
                )}
                <div className="min-w-0">
                  <p className="font-bold text-white text-sm sm:text-lg truncate">{nextMatch.radiant_team_name}</p>
                  <p className="text-xs text-slate-400 hidden sm:block">{nextMatch.radiant_team_name_cn}</p>
                </div>
              </div>
              <div className="text-center px-2 sm:px-6 flex-shrink-0">
                <p className="text-base sm:text-2xl font-bold text-red-500">VS</p>
                <p className="text-xs sm:text-sm text-amber-400 font-medium mt-1">
                  <Countdown targetTime={nextMatch.start_time} />
                </p>
              </div>
              <div className="text-right flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                <div className="min-w-0 text-right">
                  <p className="font-bold text-white text-sm sm:text-lg truncate">{nextMatch.dire_team_name}</p>
                  <p className="text-xs text-slate-400 hidden sm:block">{nextMatch.dire_team_name_cn}</p>
                </div>
                {nextMatch.dire_team_logo && (
                  <img 
                    src={nextMatch.dire_team_logo} 
                    alt={nextMatch.dire_team_name}
                    className="w-8 h-8 sm:w-12 sm:h-12 object-contain flex-shrink-0"
                    style={{
                      filter: nextMatch.dire_team_name?.toLowerCase().includes('tundra') || nextMatch.dire_team_name?.toLowerCase().includes('spirit') 
                        ? 'invert(1) brightness(2)' : 'none'
                    }}
                  />
                )}
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-2 sm:mt-3 truncate px-2">{nextMatch.tournament_name_cn || nextMatch.tournament_name || '待定赛事'} · {nextMatch.series_type}</p>
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
