import { useState } from 'react';
import { ArrowDown, Calendar, Trophy, TrendingUp, Star, Flame } from 'lucide-react';
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

const cnTeams = ['xg', 'xtreme', 'yb', 'yakult', 'tearlaments', 'vg', 'vici', 'game master', 'tidebound', 'refuser', 'thriving', 'azure'];

const teamAbbr: Record<string, string> = {
  'Xtreme Gaming': 'XG', 'Yakult Brothers': 'YB',
  'Team Spirit': 'Spirit', 'Natus Vincere': 'NAVI',
  'Tundra Esports': 'Tundra', 'Team Liquid': 'Liquid',
  'Team Falcons': 'Falcons', 'OG': 'OG',
  'GamerLegion': 'GL', 'PARIVISION': 'PARI',
  'BetBoom Team': 'BB', 'paiN Gaming': 'paiN',
  'Aurora Gaming': 'Aurora', 'Execration': 'XctN',
  'MOUZ': 'MOUZ', 'Vici Gaming': 'VG', 'PSG.LGD': 'LGD',
  'Team Yandex': 'Yandex', 'Team Nemesis': 'Nemesis',
};

function isChineseTeam(teamName: string | undefined): boolean {
  if (!teamName) return false;
  const name = teamName.toLowerCase();
  return cnTeams.some(cn => name.includes(cn));
}

function getAbbr(teamName: string | null | undefined): string {
  if (!teamName) return '';
  return teamAbbr[teamName] || teamName;
}

function formatCSTTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

function formatCountdown(targetTime: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = targetTime - now;
  if (diff <= 0) return 'Live';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  return `${h}h ${m}m`;
}

function getMatchSection(match: Match): string {
  const date = new Date(match.start_time * 1000);
  return `${date.toLocaleString('en-US', { month: 'short' })} ${date.getUTCDate()}`;
}

export function HeroSection({ upcoming }: { upcoming: Match[] }) {
  const [showCountdown, setShowCountdown] = useState(true);

  const scrollToTournaments = () => {
    document.querySelector('#tournaments')?.scrollIntoView({ behavior: 'smooth' });
  };

  const now = Math.floor(Date.now() / 1000);
  const tomorrow = now + 24 * 3600;
  
  const cnMatches = upcoming
    .filter(m => m.start_time >= now && m.start_time <= tomorrow && (isChineseTeam(m.radiant_team_name) || isChineseTeam(m.dire_team_name)))
    .sort((a, b) => a.start_time - b.start_time)
    .slice(0, 4);

  const getMatchLayout = (match: Match) => {
    const radiantIsCN = isChineseTeam(match.radiant_team_name);
    const direIsCN = isChineseTeam(match.dire_team_name);
    if (radiantIsCN && !direIsCN) return { top: match.radiant_team_name, bottom: match.dire_team_name, topIsCN: true };
    if (direIsCN && !radiantIsCN) return { top: match.dire_team_name, bottom: match.radiant_team_name, topIsCN: true };
    return { top: match.radiant_team_name, bottom: match.dire_team_name, topIsCN: radiantIsCN };
  };

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Cyberpunk Background */}
      <div className="absolute inset-0 bg-slate-950">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-red-900/30 via-slate-950 to-slate-950" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-600/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-orange-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-16 text-center">
        {/* Neon Badge */}
        <div className="flex flex-wrap justify-center gap-2 mb-4">
          <Badge className="px-3 py-1.5 bg-gradient-to-r from-red-600/20 to-orange-500/20 text-red-400 border border-red-500/30 text-xs font-bold shadow-[0_0_20px_rgba(239,68,68,0.3)]">
            <TrendingUp className="w-3 h-3 mr-1" />2026赛季
          </Badge>
          <Badge className="px-3 py-1.5 bg-gradient-to-r from-yellow-600/20 to-amber-500/20 text-yellow-400 border border-yellow-500/30 text-xs font-bold">
            <Star className="w-3 h-3 mr-1" />TI15
          </Badge>
        </div>

        {/* Gradient Title with Glow */}
        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-4">
          <span className="text-white">DOTA2 </span>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-orange-500 to-amber-500 drop-shadow-[0_0_30px_rgba(239,68,68,0.5)]">Pro Hub</span>
        </h1>

        <p className="text-sm text-slate-300 mb-8 px-4 max-w-xl mx-auto">专业的DOTA2战报与赛事预测平台</p>

        {/* Glass CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-10">
          <Button size="sm" className="bg-gradient-to-r from-red-600 to-orange-600 text-white shadow-[0_0_20px_rgba(239,68,68,0.3)] hover:shadow-[0_0_30px_rgba(239,68,68,0.5)] transition-all" onClick={scrollToTournaments}>
            <Trophy className="w-4 h-4 mr-2" />赛事战报
          </Button>
          <Button size="sm" variant="outline" className="border-white/20 text-slate-300 hover:bg-white/10" onClick={() => document.querySelector('#upcoming')?.scrollIntoView({ behavior: 'smooth' })}>
            <Calendar className="w-4 h-4 mr-2" />赛事预告
          </Button>
        </div>

        {/* Glass Stats Cards */}
        <div className="grid grid-cols-4 gap-3 max-w-lg mx-auto mb-8">
          {[
            { value: '3', label: '中国战队', color: 'from-red-500 to-orange-500' },
            { value: '13+', label: 'T1赛事', color: 'from-purple-500 to-pink-500' },
            { value: '$13M', label: '奖金池', color: 'from-yellow-500 to-amber-500' },
            { value: '实时', label: '更新', color: 'from-green-500 to-emerald-500' },
          ].map((stat, i) => (
            <div key={i} className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-3 hover:border-white/20 hover:shadow-[0_0_20px_rgba(255,255,255,0.1)] transition-all">
              <div className={`text-xl font-bold bg-gradient-to-r ${stat.color} bg-clip-text text-transparent`}>{stat.value}</div>
              <div className="text-[10px] text-slate-400">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* CN Team Matches with Neon Effect */}
        {cnMatches.length > 0 && (
          <div className="max-w-5xl mx-auto">
            {/* Header with Toggle */}
            <div className="flex items-center justify-center gap-3 mb-4">
              <Flame className="w-5 h-5 text-red-400 animate-pulse" />
              <span className="text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-orange-400">中国战队</span>
              <div className="flex items-center gap-2 ml-2">
                <span className="text-xs text-slate-500">{showCountdown ? '倒计时' : '时间'}</span>
                <Switch checked={showCountdown} onCheckedChange={setShowCountdown} className="data-[state=checked]:bg-red-600 h-4 w-7" />
              </div>
            </div>

            {/* Match Cards Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {cnMatches.map((match) => {
                const layout = getMatchLayout(match);
                return (
                  <Card key={match.id} className="bg-gradient-to-br from-slate-900/80 to-slate-900/60 backdrop-blur-xl border border-white/10 hover:border-red-500/40 hover:shadow-[0_0_30px_rgba(239,68,68,0.2)] hover:-translate-y-1 transition-all duration-300 overflow-hidden">
                    <CardContent className="p-0">
                      {/* Red Glow Header */}
                      <div className="relative">
                        <div className="absolute inset-0 bg-gradient-to-r from-red-600/10 to-orange-600/5" />
                        <div className="relative flex items-center justify-between px-3 py-2">
                          <span className="text-[10px] text-slate-400 font-medium">{getMatchSection(match)}</span>
                          <span className={`text-xs font-bold ${showCountdown ? 'text-amber-400' : 'text-blue-400'}`}>
                            {showCountdown ? formatCountdown(match.start_time) : formatCSTTime(match.start_time)}
                          </span>
                        </div>
                      </div>
                      
                      {/* Teams */}
                      <div className="px-3 py-2">
                        <div className={`flex items-center gap-2 py-1.5 border-b border-white/5 ${layout.topIsCN ? 'text-red-400' : ''}`}>
                          <Flame className={`w-3 h-3 ${layout.topIsCN ? 'text-red-400' : 'text-slate-600'}`} />
                          <span className="text-sm font-bold">{getAbbr(layout.top)}</span>
                        </div>
                        <div className="flex items-center gap-2 py-1.5">
                          <span className="text-sm font-bold text-white">{getAbbr(layout.bottom)}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 animate-bounce">
          <ArrowDown className="w-5 h-5 text-slate-500" />
        </div>
      </div>
    </section>
  );
}
