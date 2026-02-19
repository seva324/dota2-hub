import { Clock, Zap } from 'lucide-react';
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

const teamAbbr: Record<string, string> = {
  'Xtreme Gaming': 'XG', 'Yakult Brothers': 'YB',
  'Team Spirit': 'Spirit', 'Natus Vincere': 'NAVI',
  'Tundra Esports': 'Tundra', 'Team Liquid': 'Liquid',
  'Team Falcons': 'Falcons', 'OG': 'OG',
  'GamerLegion': 'GL', 'PARIVISION': 'PARI',
  'BetBoom Team': 'BB', 'paiN Gaming': 'paiN',
  'Aurora Gaming': 'Aurora', 'Execration': 'XctN',
  'MOUZ': 'MOUZ', 'Vici Gaming': 'VG', 'PSG.LGD': 'LGD',
  'Team Yandex': 'Yandex',
};

function getTeamLogo(teamName: string | undefined): string {
  if (!teamName) return '';
  return teamLogoMap[teamName.toLowerCase()] || '';
}

function getAbbr(teamName: string | null | undefined): string {
  if (!teamName) return '';
  return teamAbbr[teamName] || teamName;
}

function formatCSTTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

function getTournamentShort(name: string): string {
  if (!name) return '';
  if (name.includes('DreamLeague')) return 'DL28';
  if (name.includes('ESL')) return 'ESL';
  if (name.includes('BLAST')) return 'BLAST';
  if (name.includes('PGL')) return 'PGL';
  return name.substring(0, 10);
}

export function UpcomingSection({ upcoming }: { upcoming: Match[] }) {
  const now = Math.floor(Date.now() / 1000);
  const tomorrow = now + 24 * 3600;
  
  const upcomingMatches = upcoming
    .filter(m => m.start_time >= now && m.start_time <= tomorrow)
    .sort((a, b) => a.start_time - b.start_time);

  return (
    <section id="upcoming" className="py-6 bg-slate-950">
      <div className="max-w-6xl mx-auto px-3">
        {/* Neon Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-[0_0_20px_rgba(6,182,212,0.3)]">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">Upcoming Matches</h2>
            <p className="text-xs text-slate-400">{upcomingMatches.length} 场比赛</p>
          </div>
        </div>

        {/* Match Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
          {upcomingMatches.map((match) => {
            const radiantLogo = getTeamLogo(match.radiant_team_name);
            const direLogo = getTeamLogo(match.dire_team_name);
            
            return (
              <Card 
                key={match.id} 
                className="bg-gradient-to-br from-slate-900/90 to-slate-900/60 border border-white/10 hover:border-cyan-500/30 hover:shadow-[0_0_20px_rgba(6,182,212,0.15)] transition-all duration-300 group"
              >
                <CardContent className="p-3">
                  {/* Tournament Tag */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-medium text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded">
                      {getTournamentShort(match.tournament_name)}
                    </span>
                    <span className="text-[9px] text-slate-500">{match.series_type}</span>
                  </div>
                  
                  {/* Teams */}
                  <div className="space-y-1.5">
                    {/* Team 1 */}
                    <div className="flex items-center gap-2">
                      {radiantLogo ? (
                        <img src={radiantLogo} alt="" className="w-5 h-5 object-contain" />
                      ) : (
                        <div className="w-5 h-5 bg-slate-700 rounded" />
                      )}
                      <span className="text-xs font-bold text-white truncate">{getAbbr(match.radiant_team_name)}</span>
                    </div>
                    
                    {/* Team 2 */}
                    <div className="flex items-center gap-2">
                      {direLogo ? (
                        <img src={direLogo} alt="" className="w-5 h-5 object-contain" />
                      ) : (
                        <div className="w-5 h-5 bg-slate-700 rounded" />
                      )}
                      <span className="text-xs font-bold text-white truncate">{getAbbr(match.dire_team_name)}</span>
                    </div>
                  </div>
                  
                  {/* Time */}
                  <div className="mt-2 pt-2 border-t border-white/5 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-amber-400" />
                    <span className="text-[10px] font-medium text-amber-400">{formatCSTTime(match.start_time)}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        
        {upcomingMatches.length === 0 && (
          <div className="text-center py-8 text-slate-500 text-sm">No matches in 24h</div>
        )}
      </div>
    </section>
  );
}
