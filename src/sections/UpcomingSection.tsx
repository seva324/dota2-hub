import { useState, useEffect } from 'react';
import { Calendar, Clock } from 'lucide-react';
import { CardContent } from '@/components/ui/card';
import { Card } from '@/components/ui/card';


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

function isChineseTeam(teamName: string | null | undefined): boolean {
  if (!teamName) return false;
  const name = teamName.toLowerCase();
  return ['xg', 'xtreme', 'yb', 'yakult', 'tearlaments', 'vg', 'vici', 'game master', 'tidebound', 'refuser', 'thriving', 'azure'].some(cn => name.includes(cn));
}

// 北京时间
function formatBeijingTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const beijingTime = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const hours = beijingTime.getHours().toString().padStart(2, '0');
  const minutes = beijingTime.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

// 赛事分组
function getMatchSection(startTime: number): string {
  const date = new Date(startTime * 1000);
  const month = date.toLocaleString('en-US', { month: 'short' });
  const day = date.getDate();
  return `${month} ${day}`;
}

// Countdown
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

      const hours = Math.floor(diff / 3600);
      const minutes = Math.floor((diff % 3600) / 60);

      if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}m`);
      } else {
        setTimeLeft(`${minutes}m`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 60000);
    return () => clearInterval(interval);
  }, [targetTime]);

  return <span className="tabular-nums">{timeLeft}</span>;
}

export function UpcomingSection({ upcoming }: { upcoming: Match[] }) {
  // 过滤并排序即将开始的比赛
  const sortedUpcoming = [...upcoming]
    .filter(m => m.start_time * 1000 > Date.now())
    .sort((a, b) => a.start_time - b.start_time)
    .slice(0, 8);

  return (
    <section id="upcoming" className="py-12 bg-slate-950">
      <div className="max-w-4xl mx-auto px-3">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-cyan-600 flex items-center justify-center flex-shrink-0">
            <Calendar className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">赛事预告</h2>
            <p className="text-xs text-slate-400">{sortedUpcoming.length} 场比赛</p>
          </div>
        </div>

        {/* Match Cards - Mobile optimized */}
        <div className="space-y-2">
          {sortedUpcoming.map((match) => {
            const radiantIsCN = isChineseTeam(match.radiant_team_name);
            const direIsCN = isChineseTeam(match.dire_team_name);
            
            const radiantLogo = getTeamLogo(match.radiant_team_name);
            const direLogo = getTeamLogo(match.dire_team_name);
            
            const radiantDisplay = getAbbr(match.radiant_team_name);
            const direDisplay = getAbbr(match.dire_team_name);
            
            return (
              <Card 
                key={match.id} 
                className="bg-slate-900/80 border-slate-800 overflow-hidden"
              >
                <CardContent className="p-0">
                  {/* Top row: Date + Tournament */}
                  <div className="flex items-center justify-between px-3 py-2 bg-slate-800/50 border-b border-slate-800">
                    <span className="text-xs text-slate-400">{getMatchSection(match.start_time)}</span>
                    <span className="text-xs text-slate-500">{match.series_type}</span>
                  </div>
                  
                  {/* Main row: Teams + Countdown */}
                  <div className="flex items-center">
                    {/* Team 1 */}
                    <div className="flex-1 flex items-center justify-end gap-1.5 px-2 py-3">
                      <span className={`font-semibold text-sm ${radiantIsCN ? 'text-red-400' : 'text-white'}`}>
                        {radiantDisplay}
                      </span>
                      {radiantLogo ? (
                        <img 
                          src={radiantLogo} 
                          alt={radiantDisplay}
                          className="w-7 h-7 object-contain"
                        />
                      ) : (
                        <div className="w-7 h-7 bg-slate-700 rounded-full flex items-center justify-center">
                          <span className="text-[10px] text-slate-400">{radiantDisplay.substring(0,2)}</span>
                        </div>
                      )}
                    </div>
                    
                    {/* VS + Countdown */}
                    <div className="flex flex-col items-center px-2 py-2 bg-slate-800/30 min-w-[70px]">
                      <span className="text-[10px] text-slate-500">{match.series_type}</span>
                      <span className="text-sm font-bold text-blue-400">
                        <Countdown targetTime={match.start_time} />
                      </span>
                    </div>
                    
                    {/* Team 2 */}
                    <div className="flex-1 flex items-center justify-start gap-1.5 px-2 py-3">
                      {direLogo ? (
                        <img 
                          src={direLogo} 
                          alt={direDisplay}
                          className="w-7 h-7 object-contain"
                        />
                      ) : (
                        <div className="w-7 h-7 bg-slate-700 rounded-full flex items-center justify-center">
                          <span className="text-[10px] text-slate-400">{direDisplay.substring(0,2)}</span>
                        </div>
                      )}
                      <span className={`font-semibold text-sm ${direIsCN ? 'text-red-400' : 'text-white'}`}>
                        {direDisplay}
                      </span>
                    </div>
                  </div>
                  
                  {/* Bottom row: Beijing Time */}
                  <div className="px-3 py-1.5 bg-slate-800/30 border-t border-slate-800/50 flex items-center justify-center gap-1">
                    <Clock className="w-3 h-3 text-amber-400" />
                    <span className="text-xs text-amber-400">
                      {formatBeijingTime(match.start_time)} 北京时间
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        
        {sortedUpcoming.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            暂无即将开始的比赛
          </div>
        )}
      </div>
    </section>
  );
}
