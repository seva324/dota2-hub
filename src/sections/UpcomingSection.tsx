import { useState } from 'react';
import { Calendar, ChevronRight } from 'lucide-react';
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
  'xg': '/images/teams/xg.png',
  'xtreme gaming': '/images/teams/xg.png',
  'yb': '/images/teams/yb.png',
  'yakult brothers': '/images/teams/yb.png',
  'vg': '/images/teams/vg.png',
  'vici gaming': '/images/teams/vg.png',
  'lgd': '/images/teams/lgd.png',
  'psg.lgd': '/images/teams/lgd.png',
  'aurora gaming': '/images/teams/aurora.png',
  'natus vincere': '/images/teams/navi.png',
  'team liquid': '/images/teams/liquid.png',
  'team falcons': '/images/teams/falcons.png',
  'og': '/images/teams/og.png',
  'tundra esports': '/images/teams/tundra.png',
  'gamerlegion': '/images/teams/gamerlegion.png',
  'parivision': '/images/teams/parivision.png',
  'betboom team': '/images/teams/betboom.png',
  'pain gaming': '/images/teams/pain.png',
  'team yandex': '/images/teams/yandex.png',
  'execration': '/images/teams/execration.png',
  'mouz': '/images/teams/mouz.png',
  'team spirit': '/images/teams/spirit.png',
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

function getTeamLogo(teamName: string | undefined): string {
  if (!teamName) return '';
  const key = teamName.toLowerCase();
  return teamLogoMap[key] || '';
}

function getAbbr(teamName: string | null | undefined): string {
  if (!teamName) return '';
  return teamAbbr[teamName] || teamName;
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

// 获取赛事分组/日期
function getMatchSection(startTime: number): string {
  const date = new Date(startTime * 1000);
  const month = date.toLocaleString('en-US', { month: 'short' });
  const day = date.getDate();
  // 根据时间判断是 A/B/C 赛区
  const hours = date.getUTCHours();
  const group = hours < 12 ? 'A' : hours < 18 ? 'B' : 'C';
  return `${month} ${day} - ${group}`;
}

export function UpcomingSection({ upcoming }: { upcoming: Match[] }) {
  const [showCountdown, setShowCountdown] = useState(true);

  // 排序：即将开始的在前
  const sortedUpcoming = [...upcoming]
    .filter(m => m.start_time * 1000 > Date.now())
    .sort((a, b) => a.start_time - b.start_time);

  return (
    <section id="upcoming" className="py-12 bg-slate-950">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-cyan-600 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Upcoming Matches</h2>
              <p className="text-sm text-slate-400">{sortedUpcoming.length} matches scheduled</p>
            </div>
          </div>
          
          {/* Countdown Toggle */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">Show countdown</span>
            <Switch 
              checked={showCountdown} 
              onCheckedChange={setShowCountdown}
              className="data-[state=checked]:bg-blue-600"
            />
          </div>
        </div>

        {/* Match Cards */}
        <div className="space-y-3">
          {sortedUpcoming.slice(0, 10).map((match) => {
            const radiantLogo = getTeamLogo(match.radiant_team_name);
            const direLogo = getTeamLogo(match.dire_team_name);
            
            return (
              <Card 
                key={match.id} 
                className="bg-slate-900/80 border-slate-800 hover:border-slate-700 transition-all cursor-pointer"
              >
                <CardContent className="p-0">
                  <div className="flex items-center">
                    {/* Tournament/Date */}
                    <div className="w-24 sm:w-28 p-3 bg-slate-800/50 border-r border-slate-800 flex flex-col items-center justify-center">
                      <span className="text-xs text-slate-400">
                        {getMatchSection(match.start_time)}
                      </span>
                      {showCountdown && (
                        <span className="text-sm font-bold text-blue-400 mt-1">
                          {formatCountdown(match.start_time)}
                        </span>
                      )}
                    </div>
                    
                    {/* Match Info */}
                    <div className="flex-1 flex items-center justify-between px-4 py-3">
                      {/* Radiant Team */}
                      <div className="flex items-center gap-2 min-w-0">
                        {radiantLogo ? (
                          <img 
                            src={radiantLogo} 
                            alt={match.radiant_team_name}
                            className="w-8 h-8 sm:w-10 sm:h-10 object-contain"
                          />
                        ) : (
                          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-slate-700 rounded-full flex items-center justify-center">
                            <span className="text-xs text-slate-400">
                              {getAbbr(match.radiant_team_name).substring(0, 2)}
                            </span>
                          </div>
                        )}
                        <span className="font-semibold text-white text-sm sm:text-base">
                          {getAbbr(match.radiant_team_name)}
                        </span>
                      </div>
                      
                      {/* VS */}
                      <div className="flex flex-col items-center px-3">
                        <span className="text-xs text-slate-500">{match.series_type}</span>
                        <span className="text-sm font-bold text-slate-600">VS</span>
                      </div>
                      
                      {/* Dire Team */}
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold text-white text-sm sm:text-base">
                          {getAbbr(match.dire_team_name)}
                        </span>
                        {direLogo ? (
                          <img 
                            src={direLogo} 
                            alt={match.dire_team_name}
                            className="w-8 h-8 sm:w-10 sm:h-10 object-contain"
                          />
                        ) : (
                          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-slate-700 rounded-full flex items-center justify-center">
                            <span className="text-xs text-slate-400">
                              {getAbbr(match.dire_team_name).substring(0, 2)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Arrow */}
                    <div className="p-3">
                      <ChevronRight className="w-5 h-5 text-blue-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        
        {sortedUpcoming.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            No upcoming matches
          </div>
        )}
      </div>
    </section>
  );
}
