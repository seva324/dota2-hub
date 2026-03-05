import { useState } from 'react';
import { Calendar, Clock, Flame, Trophy } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PlayerProfileFlyout } from '@/components/custom/PlayerProfileFlyout';
import { TeamFlyout } from '@/components/custom/TeamFlyout';
import { createMinimalPlayerFlyoutModel, fetchPlayerProfileFlyoutModel } from '@/lib/playerProfile';
import type { PlayerFlyoutModel } from '@/lib/playerProfile';
import { isTeamInRegion } from '@/lib/teams';



interface Match {
  id: number;
  match_id: number;
  radiant_team_id?: string;
  dire_team_id?: string;
  radiant_team_name: string;
  radiant_team_name_cn?: string;
  radiant_team_logo?: string;
  dire_team_name: string;
  dire_team_name_cn?: string;
  dire_team_logo?: string;
  start_time: number;
  series_type: string;
  league_id?: number;
  status?: string;
  tournament_name: string;
  tournament_name_cn?: string;
}

interface UpcomingSectionProps {
  upcoming: Match[];
  allMatches?: Array<{
    match_id: string | number;
    start_time: number;
    series_type?: string | null;
    status?: string | null;
    league_id?: number | null;
    radiant_team_id?: string | null;
    dire_team_id?: string | null;
    radiant_team_name?: string | null;
    dire_team_name?: string | null;
    radiant_score?: number | null;
    dire_score?: number | null;
    radiant_win?: number | boolean | null;
    tournament_name?: string | null;
  }>;
  teams?: Array<{
    team_id?: string | null;
    id?: string | null;
    name?: string | null;
    name_cn?: string | null;
    tag?: string | null;
    logo_url?: string | null;
    region?: string | null;
    is_cn_team?: number | boolean;
  }>;
}

// 战队Logo fallback 映射
const teamLogoFallbackMap: Record<string, string> = {
  'xg': 'https://cdn.steamstatic.com/apps/dota2/images/team_logos/8261502.png',
  'xtreme gaming': 'https://cdn.steamstatic.com/apps/dota2/images/team_logos/8261502.png',
  'yb': 'https://cdn.steamstatic.com/apps/dota2/images/team_logos/8255888.png',
  'yakult brothers': 'https://cdn.steamstatic.com/apps/dota2/images/team_logos/8255888.png',
  'vg': 'https://cdn.steamstatic.com/apps/dota2/images/team_logos/7391077.png',
  'vici gaming': 'https://cdn.steamstatic.com/apps/dota2/images/team_logos/7391077.png',
  'lgd': 'https://cdn.steamstatic.com/apps/dota2/images/team_logos/5014976.png',
  'psg.lgd': 'https://cdn.steamstatic.com/apps/dota2/images/team_logos/5014976.png',
  'aurora gaming': 'https://cdn.steamstatic.com/apps/dota2/images/team_logos/1163959.png',
  'natus vincere': 'https://cdn.steamstatic.com/apps/dota2/images/team_logos/36.png',
  'team liquid': 'https://cdn.steamstatic.com/apps/dota2/images/team_logos/2163.png',
  'team falcons': 'https://cdn.steamstatic.com/apps/dota2/images/team_logos/4972334.png',
  'og': 'https://cdn.steamstatic.com/apps/dota2/images/team_logos/2587576.png',
  'tundra esports': 'https://cdn.steamstatic.com/apps/dota2/images/team_logos/104958.png',
  'gamerlegion': 'https://cdn.steamstatic.com/apps/dota2/images/team_logos/9756454.png',
  'parivision': 'https://cdn.steamstatic.com/apps/dota2/images/team_logos/9717246.png',
  'betboom team': 'https://cdn.steamstatic.com/apps/dota2/images/team_logos/1371884.png',
  'pain gaming': 'https://cdn.steamstatic.com/apps/dota2/images/team_logos/67.png',
  'team yandex': 'https://cdn.steamstatic.com/apps/dota2/images/team_logos/7481929.png',
  'execration': 'https://cdn.steamstatic.com/apps/dota2/images/team_logos/8317125.png',
  'mouz': 'https://cdn.steamstatic.com/apps/dota2/images/team_logos/104918.png',
  'team spirit': 'https://cdn.steamstatic.com/apps/dota2/images/team_logos/1371884.png',
};

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

function getTeamLogo(apiLogoUrl: string | undefined, teamName: string | undefined): string {
  // 优先使用 API 返回的 logo URL
  if (apiLogoUrl) return apiLogoUrl;
  // 否则使用 fallback 映射
  if (!teamName) return '';
  const key = teamName.toLowerCase();
  return teamLogoFallbackMap[key] || '';
}

function getAbbr(teamName: string | null | undefined): string {
  if (!teamName) return '';
  return teamAbbr[teamName] || teamName || '';
}

// Render team name with responsive display: abbrev on mobile, full name on desktop
function renderTeamName(teamName: string | null | undefined): React.JSX.Element {
  const abbrev = getAbbr(teamName);
  return (
    <>
      <span className="sm:hidden">{abbrev}</span>
      <span className="hidden sm:inline">{teamName}</span>
    </>
  );
}

function formatCSTTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

function formatCountdown(targetTime: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = targetTime - now;
  if (diff <= 0) return 'Live';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) {
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    return `${h}h ${m}m`;
  }
  return `${Math.floor(diff / 86400)}d`;
}

function getMatchDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  if (date.toDateString() === today.toDateString()) return '今天';
  if (date.toDateString() === tomorrow.toDateString()) return '明天';
  
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function getMatchPeriod(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const hours = date.getHours();
  if (hours >= 6 && hours < 12) return '上午';
  if (hours >= 12 && hours < 18) return '下午';
  return '晚上';
}

export function UpcomingSection({ upcoming, allMatches = [], teams = [] }: UpcomingSectionProps) {
  const [filter, setFilter] = useState<'all' | 'cn'>('all');
  const [flyoutOpen, setFlyoutOpen] = useState(false);
  const [flyoutTeam, setFlyoutTeam] = useState<{ team_id?: string | null; name: string; logo_url?: string | null } | null>(null);
  const [playerFlyoutOpen, setPlayerFlyoutOpen] = useState(false);
  const [playerFlyoutModel, setPlayerFlyoutModel] = useState<PlayerFlyoutModel | null>(null);
  const isChineseTeam = (team?: { teamId?: string | null; name?: string | null } | string | null) =>
    isTeamInRegion(team || null, teams, ['China']);
  // viewMode removed

  const now = Math.floor(Date.now() / 1000);
  const weekLater = now + 7 * 86400;

  // 筛选和排序比赛
  const filteredMatches = upcoming
    .filter(m => m.start_time >= now && m.start_time <= weekLater)
    .sort((a, b) => a.start_time - b.start_time);

  // 按日期分组
  const matchesByDate: Record<string, Match[]> = {};
  filteredMatches.forEach(match => {
    const date = getMatchDate(match.start_time);
    if (!matchesByDate[date]) matchesByDate[date] = [];
    matchesByDate[date].push(match);
  });

  // 按照日期排序
  const sortedDates = Object.keys(matchesByDate).sort((a, b) => {
    const matchesA = matchesByDate[a];
    const matchesB = matchesByDate[b];
    return matchesA[0].start_time - matchesB[0].start_time;
  });

  // 过滤中国战队比赛
  const cnMatches = filteredMatches.filter(m => 
    isChineseTeam({ teamId: m.radiant_team_id, name: m.radiant_team_name }) ||
    isChineseTeam({ teamId: m.dire_team_id, name: m.dire_team_name })
  );

  const displayMatches = filter === 'cn' ? cnMatches : filteredMatches;

  const openTeamFlyout = (team: { team_id?: string | null; name?: string | null; logo_url?: string | null }) => {
    if (!team?.name) return;
    setFlyoutTeam({
      team_id: team.team_id ? String(team.team_id) : null,
      name: team.name,
      logo_url: team.logo_url || null
    });
    setFlyoutOpen(true);
  };

  const openPlayerFlyout = async (accountId: number) => {
    if (!Number.isFinite(accountId) || accountId <= 0) return;
    setPlayerFlyoutModel(createMinimalPlayerFlyoutModel(accountId));
    setPlayerFlyoutOpen(true);
    try {
      const model = await fetchPlayerProfileFlyoutModel(accountId);
      if (model) {
        setPlayerFlyoutModel(model);
      }
    } catch (error) {
      console.error('[UpcomingSection] Failed to load player profile:', error);
    }
  };

  return (
    <section id="upcoming" className="py-12 sm:py-16 bg-slate-950 relative overflow-hidden">
      {/* 背景装饰 */}
      <div className="absolute top-0 left-0 w-full h-full">
        <div className="absolute top-20 left-20 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-20 right-20 w-80 h-80 bg-purple-600/10 rounded-full blur-3xl"></div>
      </div>

      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 relative z-10">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4 mb-6 sm:mb-8">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center shadow-[0_0_30px_rgba(59,130,246,0.4)]">
              <Calendar className="w-7 h-7 text-white" />
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white">赛事预告</h2>
              <p className="text-slate-400 text-sm">Upcoming Matches</p>
            </div>
          </div>

          {/* 快速统计和筛选 */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* 中国战队数量 */}
            <div className="flex items-center gap-2 bg-slate-800/60 backdrop-blur-sm px-3 sm:px-4 py-2 rounded-xl border border-white/10">
              <Flame className="w-4 h-4 text-red-400" />
              <span className="text-sm text-slate-300">中国战队</span>
              <span className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-orange-400">
                {cnMatches.length}
              </span>
            </div>

            {/* 总场次 */}
            <div className="flex items-center gap-2 bg-slate-800/60 backdrop-blur-sm px-3 sm:px-4 py-2 rounded-xl border border-white/10">
              <Calendar className="w-4 h-4 text-blue-400" />
              <span className="text-sm text-slate-300">本周场次</span>
              <span className="text-sm sm:text-base font-bold text-white">{filteredMatches.length}</span>
            </div>

            {/* 筛选按钮 */}
            <div className="flex bg-slate-800/60 backdrop-blur-sm rounded-xl border border-white/10 p-1">
              <button
                onClick={() => setFilter('all')}
                className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
                  filter === 'all'
                    ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-lg'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                全部
              </button>
              <button
                onClick={() => setFilter('cn')}
                className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
                  filter === 'cn'
                    ? 'bg-gradient-to-r from-red-600 to-orange-500 text-white shadow-lg'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Flame className="w-3 h-3 mr-1 inline" />
                CN
              </button>
            </div>
          </div>
        </div>

        {/* 赛事预告列表 */}
        {displayMatches.length > 0 ? (
          <div className="space-y-6">
            {sortedDates.map((date) => {
              const dateMatches = matchesByDate[date];
              const filteredDateMatches = filter === 'cn' 
                ? dateMatches.filter((m) =>
                    isChineseTeam({ teamId: m.radiant_team_id, name: m.radiant_team_name }) ||
                    isChineseTeam({ teamId: m.dire_team_id, name: m.dire_team_name })
                  )
                : dateMatches;

              if (filteredDateMatches.length === 0) return null;

              return (
                <div key={date} className="space-y-3">
                  {/* 日期标题 */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
                    <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/60 backdrop-blur-sm rounded-full border border-white/10">
                      <Calendar className="w-4 h-4 text-blue-400" />
                      <span className="text-sm font-bold text-white">{date}</span>
                    </div>
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
                  </div>

                  {/* 比赛卡片网格 */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                    {filteredDateMatches.map((match) => {
                      const radiantIsCN = isChineseTeam({ teamId: match.radiant_team_id, name: match.radiant_team_name });
                      const direIsCN = isChineseTeam({ teamId: match.dire_team_id, name: match.dire_team_name });
                      const hasCN = radiantIsCN || direIsCN;
                      const countdown = formatCountdown(match.start_time);
                      const period = getMatchPeriod(match.start_time);

                      return (
                        <Card
                          key={match.id}
                          className={`
                            group relative overflow-hidden rounded-2xl transition-all duration-300
                            ${hasCN
                              ? 'bg-gradient-to-br from-red-900/20 to-orange-900/10 border-red-600/40 hover:border-red-500/60 hover:shadow-[0_0_40px_rgba(239,68,68,0.3)]'
                              : 'bg-slate-900/60 backdrop-blur-xl border-white/10 hover:border-blue-500/40 hover:shadow-[0_0_30px_rgba(59,130,246,0.2)]'
                            }
                            hover:-translate-y-1 cursor-pointer
                          `}
                        >
                          {/* 背景光效 */}
                          {hasCN && (
                            <div className="absolute inset-0 bg-gradient-to-br from-red-600/5 to-orange-600/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
                          )}

                          <CardContent className="p-3 sm:p-5 relative">
                            {/* 赛事信息头部 */}
                            <div className="flex items-center justify-between mb-3 sm:mb-4">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${hasCN ? 'bg-gradient-to-br from-red-600/30 to-orange-600/30' : 'bg-slate-800/60'} border ${hasCN ? 'border-red-500/30' : 'border-slate-700'}`}>
                                  <Trophy className={`w-4 h-4 ${hasCN ? 'text-red-400' : 'text-blue-400'}`} />
                                </div>
                                <div className="min-w-0">
                                  <div className="text-sm font-medium text-slate-200 truncate">{match.tournament_name}</div>
                                  <div className="text-xs text-slate-500">{match.series_type}</div>
                                </div>
                              </div>

                              {/* CN标识 */}
                              {hasCN && (
                                <Badge className="bg-gradient-to-r from-red-600/30 to-orange-600/30 text-red-400 text-xs font-bold border border-red-500/30">
                                  <Flame className="w-3 h-3 mr-1" />
                                  CN
                                </Badge>
                              )}
                            </div>

                            {/* 时间信息 */}
                            <div className="flex items-center justify-between mb-3 sm:mb-4 p-2.5 sm:p-3 bg-slate-800/40 rounded-xl border border-white/5">
                              <div className="flex items-center gap-2">
                                <Clock className={`w-4 h-4 ${countdown === 'Live' ? 'text-green-400 animate-pulse' : 'text-slate-400'}`} />
                                <span className={`text-sm font-bold ${countdown === 'Live' ? 'text-green-400' : 'text-white'}`}>
                                  {countdown}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-slate-400" />
                                <span className="text-sm text-slate-300">{period} {formatCSTTime(match.start_time)}</span>
                              </div>
                            </div>

                            {/* 对阵展示 */}
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-4">
                              {/* Radiant 队 */}
                              <button
                                type="button"
                                className={`flex-1 flex items-center gap-2 sm:gap-3 text-left ${radiantIsCN ? 'group/team-a' : ''}`}
                                onClick={() => openTeamFlyout({
                                  team_id: match.radiant_team_id ? String(match.radiant_team_id) : null,
                                  name: match.radiant_team_name,
                                  logo_url: match.radiant_team_logo
                                })}
                              >
                                <div className={`
                                  w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center border transition-all duration-300
                                  ${radiantIsCN
                                    ? 'bg-gradient-to-br from-red-500 to-orange-500 border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.3)] group-hover/team-a:scale-110'
                                    : 'bg-slate-800 border-slate-700 hover:border-slate-600'
                                  }
                                `}>
                                  {getTeamLogo(match.radiant_team_logo, match.radiant_team_name) ? (
                                    <img src={getTeamLogo(match.radiant_team_logo, match.radiant_team_name)} alt="" className="w-8 h-8 sm:w-10 sm:h-10 object-contain" onError={(e) => (e.target as HTMLImageElement).style.display = 'none'} />
                                  ) : (
                                    <span className="text-sm sm:text-base font-bold text-white">{getAbbr(match.radiant_team_name).substring(0, 2)}</span>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className={`text-sm font-bold truncate ${radiantIsCN ? 'text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-orange-400' : 'text-white'}`}>
                                    {renderTeamName(match.radiant_team_name)}
                                  </div>
                                  {match.radiant_team_name_cn && (
                                    <div className="text-xs text-slate-500 truncate hidden sm:block">{match.radiant_team_name_cn}</div>
                                  )}
                                </div>
                              </button>

                              {/* VS */}
                              <div className="hidden sm:flex items-center justify-center">
                                <div className="px-3 py-1 bg-slate-800/60 rounded-full border border-white/10">
                                  <span className="text-xs font-bold text-slate-400">VS</span>
                                </div>
                              </div>

                              {/* Dire 队 */}
                              <button
                                type="button"
                                className={`flex-1 flex items-center gap-2 sm:gap-3 justify-end text-right ${direIsCN ? 'group/team-b' : ''}`}
                                onClick={() => openTeamFlyout({
                                  team_id: match.dire_team_id ? String(match.dire_team_id) : null,
                                  name: match.dire_team_name,
                                  logo_url: match.dire_team_logo
                                })}
                              >
                                <div className="flex-1 min-w-0 text-right">
                                  <div className={`text-sm font-bold truncate ${direIsCN ? 'text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-orange-400' : 'text-white'}`}>
                                    {renderTeamName(match.dire_team_name)}
                                  </div>
                                  {match.dire_team_name_cn && (
                                    <div className="text-xs text-slate-500 truncate hidden sm:block">{match.dire_team_name_cn}</div>
                                  )}
                                </div>
                                <div className={`
                                  w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center border transition-all duration-300
                                  ${direIsCN
                                    ? 'bg-gradient-to-br from-red-500 to-orange-500 border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.3)] group-hover/team-b:scale-110'
                                    : 'bg-slate-800 border-slate-700 hover:border-slate-600'
                                  }
                                `}>
                                  {getTeamLogo(match.dire_team_logo, match.dire_team_name) ? (
                                    <img src={getTeamLogo(match.dire_team_logo, match.dire_team_name)} alt="" className="w-8 h-8 sm:w-10 sm:h-10 object-contain" onError={(e) => (e.target as HTMLImageElement).style.display = 'none'} />
                                  ) : (
                                    <span className="text-sm sm:text-base font-bold text-white">{getAbbr(match.dire_team_name).substring(0, 2)}</span>
                                  )}
                                </div>
                              </button>
                            </div>

                            {/* 悬浮指示 */}
                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* 空状态 */
          <Card className="bg-slate-900/60 backdrop-blur-xl border border-white/10 overflow-hidden">
            <CardContent className="p-12 text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-slate-800/50 mb-4">
                <Calendar className="w-10 h-10 text-slate-600" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">
                {filter === 'cn' ? '暂无中国战队比赛' : '暂无即将开始的比赛'}
              </h3>
              <p className="text-slate-500 text-sm">
                {filter === 'cn' ? '敬请期待更多精彩对决' : '请稍后再来查看'}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <TeamFlyout
        open={flyoutOpen}
        onOpenChange={setFlyoutOpen}
        selectedTeam={flyoutTeam}
        teams={teams}
        matches={allMatches}
        upcoming={upcoming}
        onTeamSelect={(team) => openTeamFlyout(team)}
        onPlayerClick={openPlayerFlyout}
      />

      <PlayerProfileFlyout
        open={playerFlyoutOpen}
        onOpenChange={setPlayerFlyoutOpen}
        player={playerFlyoutModel}
      />
    </section>
  );
}
