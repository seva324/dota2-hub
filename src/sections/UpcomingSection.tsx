import { Calendar, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

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

function getTeamLogo(teamName: string | undefined): string {
  if (!teamName) return '';
  const key = teamName.toLowerCase();
  return teamLogoMap[key] || '';
}

function getAbbr(teamName: string | null | undefined): string {
  if (!teamName) return '';
  return teamAbbr[teamName] || teamName;
}

// CST 时间
function formatCSTTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

// 赛事简称
function getTournamentShort(name: string): string {
  if (!name) return '';
  if (name.includes('DreamLeague')) return 'DL28';
  if (name.includes('ESL')) return 'ESL';
  if (name.includes('BLAST')) return 'BLAST';
  if (name.includes('PGL')) return 'PGL';
  if (name.includes('IEP')) return 'IEP';
  return name.substring(0, 12);
}

export function UpcomingSection({ upcoming }: { upcoming: Match[] }) {
  const now = Math.floor(Date.now() / 1000);
  const tomorrow = now + 24 * 3600;
  
  // 未来24小时所有比赛
  const upcomingMatches = upcoming
    .filter(m => m.start_time >= now && m.start_time <= tomorrow)
    .sort((a, b) => a.start_time - b.start_time);

  return (
    <section id="upcoming" className="py-6 bg-slate-950">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-600 flex items-center justify-center shadow-lg">
              <Calendar className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Upcoming Matches</h2>
              <p className="text-xs text-slate-400">{upcomingMatches.length} matches in 24h</p>
            </div>
          </div>
        </div>

        {/* Match List - Apple Style Cards */}
        <div className="space-y-2">
          {upcomingMatches.map((match) => {
            const radiantLogo = getTeamLogo(match.radiant_team_name);
            const direLogo = getTeamLogo(match.dire_team_name);
            
            return (
              <Card 
                key={match.id} 
                className="bg-slate-900/60 border-slate-800/60 backdrop-blur-sm hover:bg-slate-900/80 transition-all cursor-pointer"
              >
                <CardContent className="p-3">
                  {/* Top: Tournament + Time */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] text-blue-400 font-medium">
                      {getTournamentShort(match.tournament_name)}
                    </span>
                    <span className="text-xs font-semibold text-amber-400">
                      {formatCSTTime(match.start_time)}
                    </span>
                  </div>
                  
                  {/* Main: Teams */}
                  <div className="flex items-center">
                    {/* Team 1 */}
                    <div className="flex items-center gap-2 flex-1">
                      {radiantLogo ? (
                        <img src={radiantLogo} alt="" className="w-7 h-7 object-contain" />
                      ) : (
                        <div className="w-7 h-7 bg-slate-700 rounded-full flex items-center justify-center">
                          <span className="text-[10px] text-slate-400">
                            {getAbbr(match.radiant_team_name).substring(0,2)}
                          </span>
                        </div>
                      )}
                      <span className="text-sm font-semibold text-white">
                        {getAbbr(match.radiant_team_name)}
                      </span>
                    </div>
                    
                    {/* VS */}
                    <div className="px-3 flex items-center">
                      <span className="text-xs font-medium text-slate-500">{match.series_type}</span>
                    </div>
                    
                    {/* Team 2 */}
                    <div className="flex items-center gap-2 flex-1 justify-end">
                      <span className="text-sm font-semibold text-white">
                        {getAbbr(match.dire_team_name)}
                      </span>
                      {direLogo ? (
                        <img src={direLogo} alt="" className="w-7 h-7 object-contain" />
                      ) : (
                        <div className="w-7 h-7 bg-slate-700 rounded-full flex items-center justify-center">
                          <span className="text-[10px] text-slate-400">
                            {getAbbr(match.dire_team_name).substring(0,2)}
                          </span>
                        </div>
                      )}
                    </div>
                    
                    {/* Arrow */}
                    <ChevronRight className="w-4 h-4 text-slate-600 ml-2" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        
        {upcomingMatches.length === 0 && (
          <div className="text-center py-8 text-slate-500 text-sm">
            No matches in the next 24 hours
          </div>
        )}
      </div>
    </section>
  );
}
