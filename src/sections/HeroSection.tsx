import { useState } from 'react';
import { ArrowDown, Calendar, Trophy, TrendingUp, Star, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';

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

// 战队Logo映射
const teamLogoMap: Record<string, string> = {
  'xg': '/dota2-hub/images/teams/xg.png',
  'xtreme gaming': '/dota2-hub/images/teams/xg.png',
  'yb': '/dota2-hub/images/teams/yb.png',
  'yakult brothers': '/dota2-hub/images/teams/yb.png',
  'vg': '/dota2-hub/images/teams/vg.png',
  'vici gaming': '/dota2-hub/images/teams/vg.png',
  'lgd': '/dota2-hub/images/teams/lgd.png',
  'psg.lgd': '/dota2-hub/images/teams/lgd.png',
  'aurora gaming': '/dota2-hub/images/teams/aurora.png',
  'natus vincere': '/dota2-hub/images/teams/navi.png',
  'team liquid': '/dota2-hub/images/teams/liquid.png',
  'team falcons': '/dota2-hub/images/teams/falcons.png',
  'og': '/dota2-hub/images/teams/og.png',
  'tundra esports': '/dota2-hub/images/teams/tundra.png',
  'gamerlegion': '/dota2-hub/images/teams/gamerlegion.png',
  'parivision': '/dota2-hub/images/teams/parivision.png',
  'betboom team': '/dota2-hub/images/teams/betboom.png',
  'pain gaming': '/dota2-hub/images/teams/pain.png',
  'team yandex': '/dota2-hub/images/teams/yandex.png',
  'execration': '/dota2-hub/images/teams/execration.png',
  'mouz': '/dota2-hub/images/teams/mouz.png',
  'team spirit': '/dota2-hub/images/teams/spirit.png',
};

// 战队简称
const teamAbbr: Record<string, string> = {
  'Xtreme Gaming': 'XG',
  'Yakult Brothers': 'YB',
  'Team Spirit': 'Spirit',
  'Natus Vincere': 'NAVI',
  'Tundra Esports': 'Tundra',
  'Team Liquid': 'Liquid',
  'Team Falcons': 'Falcons',
  'OG': 'OG',
  'GamerLegion': 'GL',
  'PARIVISION': 'PARI',
  'BetBoom Team': 'BB',
  'paiN Gaming': 'paiN',
  'Aurora Gaming': 'Aurora',
  'Execration': 'XctN',
  'MOUZ': 'MOUZ',
  'Vici Gaming': 'VG',
  'PSG.LGD': 'LGD',
  'Team Yandex': 'Yandex',
};

// 判断是否为中国战队
const cnTeams = ['xg', 'xtreme', 'yb', 'yakult', 'tearlaments', 'vg', 'vici', 'game master', 'tidebound', 'refuser', 'thriving', 'azure'];

function isChineseTeam(teamName: string | undefined): boolean {
  if (!teamName) return false;
  const name = teamName.toLowerCase();
  return cnTeams.some(cn => name.includes(cn));
}

function getTeamLogo(teamName: string | undefined): string {
  if (!teamName) return '';
  const key = teamName.toLowerCase();
  return teamLogoMap[key] || '';
}

function getAbbr(teamName: string | null | undefined): string {
  if (!teamName) return '';
  return teamAbbr[teamName] || teamName;
}

// CST = UTC+8 直接使用 Liquipedia 时间
function formatCSTTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const hours = date.getUTCHours().toString().padStart(2, '0');
  const minutes = date.getUTCMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

// 格式化倒计时
function formatCountdown(targetTime: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = targetTime - now;
  
  if (diff <= 0) return 'Live';
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) {
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    return `${h}h ${m}m`;
  }
  const d = Math.floor(diff / 86400);
  return `${d}d`;
}

// 赛事分组日期
function getMatchSection(match: Match): string {
  const name = match.tournament_name || '';
  const match1 = name.match(/-\s*([A-Za-z]+\s+\d+[A-Z]?)/);
  if (match1) return match1[1];
  
  const date = new Date(match.start_time * 1000);
  const month = date.toLocaleString('en-US', { month: 'short' });
  const day = date.getUTCDate();
  return `${month} ${day}`;
}

export function HeroSection({ upcoming }: { upcoming: Match[] }) {
  const [showCountdown, setShowCountdown] = useState(true);

  const scrollToTournaments = () => {
    const element = document.querySelector('#tournaments');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // 过滤并排序即将开始的比赛 - 取8个
  const nextMatches = upcoming
    .filter(m => m.start_time * 1000 > Date.now())
    .sort((a, b) => a.start_time - b.start_time)
    .slice(0, 8);

  // 判断哪个战队是中国战队，放在上面
  const getMatchLayout = (match: Match) => {
    const radiantIsCN = isChineseTeam(match.radiant_team_name);
    const direIsCN = isChineseTeam(match.dire_team_name);
    
    if (radiantIsCN && !direIsCN) {
      return { top: match.radiant_team_name, bottom: match.dire_team_name, topIsCN: true };
    } else if (direIsCN && !radiantIsCN) {
      return { top: match.dire_team_name, bottom: match.radiant_team_name, topIsCN: true };
    } else {
      return { top: match.radiant_team_name, bottom: match.dire_team_name, topIsCN: radiantIsCN };
    }
  };

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
      <div className="relative z-10 max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-16 text-center">
        {/* Badges */}
        <div className="flex flex-wrap justify-center gap-2 mb-4">
          <Badge 
            variant="secondary" 
            className="px-2 py-1 bg-red-600/20 text-red-400 border-red-600/30 text-xs"
          >
            <TrendingUp className="w-3 h-3 mr-1" />
            2026赛季
          </Badge>
          <Badge 
            variant="secondary" 
            className="px-2 py-1 bg-yellow-600/20 text-yellow-400 border-yellow-600/30 text-xs"
          >
            <Star className="w-3 h-3 mr-1" />
            TI15
          </Badge>
        </div>

        {/* Title */}
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-3">
          DOTA2 <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-500">Pro Hub</span>
        </h1>

        <p className="text-xs sm:text-sm text-slate-300 mb-6 px-4 max-w-xl mx-auto">
          专业的DOTA2战报与赛事预测平台，重点关注XG、YB、VG等中国战队
        </p>

        {/* Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-8">
          <Button 
            size="sm" 
            className="bg-gradient-to-r from-red-600 to-orange-600 text-white"
            onClick={scrollToTournaments}
          >
            <Trophy className="w-4 h-4 mr-2" />
            赛事战报
          </Button>
          <Button 
            size="sm" 
            variant="outline" 
            className="border-slate-600 text-slate-300"
            onClick={() => {
              const element = document.querySelector('#upcoming');
              if (element) element.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            <Calendar className="w-4 h-4 mr-2" />
            赛事预告
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2 max-w-lg mx-auto mb-6">
          <div className="bg-slate-900/60 rounded-lg p-2 border border-slate-800">
            <div className="text-lg font-bold text-white">3</div>
            <div className="text-[10px] text-slate-400">中国战队</div>
          </div>
          <div className="bg-slate-900/60 rounded-lg p-2 border border-slate-800">
            <div className="text-lg font-bold text-white">13+</div>
            <div className="text-[10px] text-slate-400">T1赛事</div>
          </div>
          <div className="bg-slate-900/60 rounded-lg p-2 border border-slate-800">
            <div className="text-lg font-bold text-white">$13M</div>
            <div className="text-[10px] text-slate-400">奖金池</div>
          </div>
          <div className="bg-slate-900/60 rounded-lg p-2 border border-slate-800">
            <div className="text-lg font-bold text-white">实时</div>
            <div className="text-[10px] text-slate-400">更新</div>
          </div>
        </div>

        {/* Upcoming Matches - With Toggle */}
        {nextMatches.length > 0 && (
          <div className="max-w-5xl mx-auto">
            {/* Header with Toggle */}
            <div className="flex items-center justify-center gap-3 mb-3">
              <Clock className="w-4 h-4 text-red-400" />
              <span className="text-xs text-red-400 font-medium">Upcoming Matches</span>
              <div className="flex items-center gap-1.5 ml-2">
                <span className="text-[10px] text-slate-500">{showCountdown ? '倒计时' : '时间'}</span>
                <Switch 
                  checked={showCountdown} 
                  onCheckedChange={setShowCountdown}
                  className="data-[state=checked]:bg-blue-600 h-4 w-7"
                />
              </div>
            </div>

            {/* Grid: 4 cards per row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {nextMatches.map((match) => {
                const layout = getMatchLayout(match);
                const topLogo = getTeamLogo(layout.top);
                const bottomLogo = getTeamLogo(layout.bottom);
                
                return (
                  <Card 
                    key={match.id} 
                    className="bg-slate-900/90 border-slate-800 hover:border-slate-700 transition-all cursor-pointer overflow-hidden"
                  >
                    <CardContent className="p-0">
                      {/* Date section - left side */}
                      <div className="flex">
                        <div className="w-12 bg-slate-800/80 flex flex-col items-center justify-center py-2.5 border-r border-slate-700">
                          <span className="text-[10px] text-slate-400 font-medium">
                            {getMatchSection(match)}
                          </span>
                          <span className="text-xs font-bold text-amber-400 mt-0.5">
                            {showCountdown ? formatCountdown(match.start_time) : formatCSTTime(match.start_time)}
                          </span>
                        </div>
                        
                        {/* Teams - top and bottom rows */}
                        <div className="flex-1">
                          {/* Top row - Chinese team */}
                          <div className="flex items-center justify-between px-2.5 py-2 border-b border-slate-800/50">
                            <div className="flex items-center gap-1.5">
                              {topLogo ? (
                                <img src={topLogo} alt="" className="w-6 h-6 object-contain" />
                              ) : (
                                <div className="w-6 h-6 bg-slate-700 rounded-full" />
                              )}
                              <span className={`text-sm font-bold ${layout.topIsCN ? 'text-red-400' : 'text-white'}`}>
                                {getAbbr(layout.top)}
                              </span>
                            </div>
                          </div>
                          
                          {/* Bottom row - opponent */}
                          <div className="flex items-center justify-between px-2.5 py-2">
                            <div className="flex items-center gap-1.5">
                              {bottomLogo ? (
                                <img src={bottomLogo} alt="" className="w-6 h-6 object-contain" />
                              ) : (
                                <div className="w-6 h-6 bg-slate-700 rounded-full" />
                              )}
                              <span className="text-sm font-bold text-white">
                                {getAbbr(layout.bottom)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Scroll Indicator */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 animate-bounce">
          <ArrowDown className="w-5 h-5 text-slate-500" />
        </div>
      </div>
    </section>
  );
}
