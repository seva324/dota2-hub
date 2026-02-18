import { Calendar } from 'lucide-react';
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
  return name.substring(0, 10);
}

export function UpcomingSection({ upcoming }: { upcoming: Match[] }) {
  const now = Math.floor(Date.now() / 1000);
  const tomorrow = now + 24 * 3600;
  
  // 未来24小时所有比赛
  const upcomingMatches = upcoming
    .filter(m => m.start_time >= now && m.start_time <= tomorrow)
    .sort((a, b) => a.start_time - b.start_time);

  return (
    <section id="upcoming" className="py-4 bg-slate-950">
      <div className="max-w-5xl mx-auto px-2">
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-cyan-600 flex items-center justify-center">
            <Calendar className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-semibold text-white">Upcoming</span>
          <span className="text-xs text-slate-400">({upcomingMatches.length})</span>
        </div>

        {/* Compact Grid - 4 per row, teams on separate lines */}
        <div className="grid grid-cols-4 gap-1">
          {upcomingMatches.map((match) => {
            const radiantLogo = getTeamLogo(match.radiant_team_name);
            const direLogo = getTeamLogo(match.dire_team_name);
            
            return (
              <Card 
                key={match.id} 
                className="bg-slate-900/80 border-slate-800"
              >
                <CardContent className="p-1.5">
                  {/* Tournament */}
                  <div className="text-[8px] text-blue-400 truncate mb-0.5">
                    {getTournamentShort(match.tournament_name)}
                  </div>
                  
                  {/* Team 1 */}
                  <div className="flex items-center gap-1 mb-0.5">
                    {radiantLogo ? (
                      <img src={radiantLogo} alt="" className="w-4 h-4 object-contain" />
                    ) : (
                      <div className="w-4 h-4 bg-slate-700 rounded-full" />
                    )}
                    <span className="text-[10px] font-medium text-white truncate">
                      {getAbbr(match.radiant_team_name)}
                    </span>
                  </div>
                  
                  {/* Team 2 */}
                  <div className="flex items-center gap-1 mb-0.5">
                    {direLogo ? (
                      <img src={direLogo} alt="" className="w-4 h-4 object-contain" />
                    ) : (
                      <div className="w-4 h-4 bg-slate-700 rounded-full" />
                    )}
                    <span className="text-[10px] font-medium text-white truncate">
                      {getAbbr(match.dire_team_name)}
                    </span>
                  </div>
                  
                  {/* Time */}
                  <div className="text-[9px] text-amber-400 font-medium">
                    {formatCSTTime(match.start_time)} {match.series_type}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        
        {upcomingMatches.length === 0 && (
          <div className="text-center py-6 text-slate-500 text-xs">
            No matches in 24h
          </div>
        )}
      </div>
    </section>
  );
}
