import { useState, useEffect } from 'react';
import { Sword, Users, Target, Clock, TrendingUp } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';

// Pro player mapping (loaded from data file)
let proPlayersMap: Record<number, { name: string; team_name: string; realname: string }> = {};

// Load pro players
fetch('/dota2-hub/data/pro_players.json')
  .then(res => res.json())
  .then(data => { proPlayersMap = data; })
  .catch(() => {});

interface Player {
  player_slot: number;
  account_id: number;
  personaname?: string;
  hero_id: number;
  level: number;
  kills: number;
  deaths: number;
  assists: number;
  gold?: number;
  gold_per_min: number;
  xp_per_min: number;
  last_hits: number;
  denies: number;
  hero_damage: number;
  tower_damage: number;
  hero_healing: number;
  items: number[];
  neutral_item?: number;
}

interface PicksBans {
  is_pick: boolean;
  hero_id: number;
  team: number;
  order: number;
}

interface MatchDetail {
  match_id: number;
  radiant_team_id: number;
  radiant_team_name: string;
  dire_team_id: number;
  dire_team_name: string;
  radiant_team?: { team_id: number; name: string; tag: string; logo_url: string };
  dire_team?: { team_id: number; name: string; tag: string; logo_url: string };
  radiant_score: number;
  dire_score: number;
  radiant_win: boolean;
  duration: number;
  start_time: number;
  league_name: string;
  series_id: number;
  series_type: number;
  players: Player[];
  picks_bans: PicksBans[];
  radiant_gold_adv?: number[];
  radiant_xp_adv?: number[];
}

// Hero data - loaded from data file
let heroesData: Record<number, { name: string; img: string }> = {};

// Load heroes data
fetch('/dota2-hub/data/heroes.json')
  .then(res => res.json())
  .then(data => { heroesData = data; })
  .catch(() => {});

function getHeroName(id: number): string {
  return heroesData[id]?.name || `Hero ${id}`;
}

function getHeroImg(id: number): string {
  const img = heroesData[id]?.img || `hero_${id}`;
  return `https://steamcdn-a.akamaihd.net/apps/dota2/images/heroes/${img}_lg.png`;
}

function HeroIcon({ heroId, size = 'md' }: { heroId: number; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16'
  };
  
  return (
    <div className={`${sizeClasses[size]} rounded bg-slate-800 overflow-hidden flex-shrink-0`}>
      <img 
        src={getHeroImg(heroId)} 
        alt={getHeroName(heroId)}
        className="w-full h-full object-cover"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
    </div>
  );
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

interface MatchDetailModalProps {
  matchId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MatchDetailModal({ matchId, open, onOpenChange }: MatchDetailModalProps) {
  const [match, setMatch] = useState<MatchDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (matchId && open) {
      setLoading(true);
      setError(null);
      
      fetch(`https://api.opendota.com/api/matches/${matchId}`)
        .then(res => res.json())
        .then(data => {
          if (data.error) {
            throw new Error(data.error);
          }
          setMatch(data);
        })
        .catch(err => {
          console.error('Failed to fetch match:', err);
          setError(err.message || '加载失败');
        })
        .finally(() => setLoading(false));
    }
  }, [matchId, open]);

  if (!matchId) return null;

  const radiantPlayers = match?.players.filter(p => p.player_slot < 128) || [];
  const direPlayers = match?.players.filter(p => p.player_slot >= 128) || [];

  // Get team names from nested object or direct field
  const getTeamName = (match: MatchDetail | null, side: 'radiant' | 'dire'): string => {
    if (!match) return side === 'radiant' ? 'Radiant' : 'Dire';
    if (side === 'radiant') {
      return match.radiant_team?.name || match.radiant_team_name || 'Radiant';
    }
    return match.dire_team?.name || match.dire_team_name || 'Dire';
  };

  const radiantTeamName = getTeamName(match, 'radiant');
  const direTeamName = getTeamName(match, 'dire');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto bg-slate-900 border-slate-800">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}

        {error && (
          <div className="text-center py-20 text-red-400">
            <p>{error}</p>
          </div>
        )}

        {match && !loading && (
          <>
            {/* Header */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-4 sm:mb-6 pb-3 sm:pb-4 border-b border-slate-800 gap-2 sm:gap-4">
              <div className="flex items-center gap-1 sm:gap-2 md:gap-4 flex-wrap w-full justify-center md:justify-start">
                <div className={`text-base sm:text-lg md:text-2xl font-bold ${match.radiant_win ? 'text-green-400' : 'text-red-400'} truncate max-w-[80px] sm:max-w-[120px] md:max-w-none`}>
                  {radiantTeamName}
                </div>
                <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                  <span className={`text-xl sm:text-2xl md:text-3xl font-bold ${match.radiant_score > match.dire_score ? 'text-green-400' : 'text-slate-400'}`}>
                    {match.radiant_score}
                  </span>
                  <span className="text-slate-600 text-base sm:text-lg md:text-xl">:</span>
                  <span className={`text-xl sm:text-2xl md:text-3xl font-bold ${match.dire_score > match.radiant_score ? 'text-green-400' : 'text-slate-400'}`}>
                    {match.dire_score}
                  </span>
                </div>
                <div className={`text-base sm:text-lg md:text-2xl font-bold ${!match.radiant_win ? 'text-green-400' : 'text-red-400'} truncate max-w-[80px] sm:max-w-[120px] md:max-w-none`}>
                  {direTeamName}
                </div>
              </div>
              <div className="text-right text-xs sm:text-sm text-slate-400 w-full md:w-auto">
                <div className="flex items-center gap-1 sm:gap-2 justify-center md:justify-end">
                  <Clock className="w-3 h-3 sm:w-4 sm:h-4" />
                  {formatDuration(match.duration)}
                </div>
                <div className="hidden xs:block">{formatDate(match.start_time)}</div>
                <Badge variant="outline" className="border-slate-700 text-slate-400 mt-1 text-xs">
                  {match.league_name || 'Professional Match'}
                </Badge>
              </div>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="players" className="w-full">
              <TabsList className="bg-slate-800/50 mb-4 grid grid-cols-3">
                <TabsTrigger value="players" className="data-[state=active]:bg-slate-700 text-xs sm:text-sm">
                  <Users className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                  <span className="hidden xs:inline">选手数据</span>
                </TabsTrigger>
                <TabsTrigger value="bp" className="data-[state=active]:bg-slate-700 text-xs sm:text-sm">
                  <Target className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                  <span className="hidden xs:inline">BP</span>
                </TabsTrigger>
                <TabsTrigger value="overview" className="data-[state=active]:bg-slate-700 text-xs sm:text-sm">
                  <Sword className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                  <span className="hidden xs:inline">概览</span>
                </TabsTrigger>
                <TabsTrigger value="economy" className="data-[state=active]:bg-slate-700 text-xs sm:text-sm">
                  <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                  <span className="hidden xs:inline">经济</span>
                </TabsTrigger>
              </TabsList>

              {/* Players Tab */}
              <TabsContent value="players">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                  {/* Radiant */}
                  <div className="space-y-2">
                    <div className="text-center font-bold text-green-400 mb-3">{radiantTeamName}</div>
                    {radiantPlayers.map((player, idx) => (
                      <PlayerCard key={idx} player={player} isWinner={match.radiant_win} />
                    ))}
                  </div>
                  {/* Dire */}
                  <div className="space-y-2">
                    <div className="text-center font-bold text-red-400 mb-3">{direTeamName}</div>
                    {direPlayers.map((player, idx) => (
                      <PlayerCard key={idx} player={player} isWinner={!match.radiant_win} />
                    ))}
                  </div>
                </div>
              </TabsContent>

              {/* BP Tab */}
              <TabsContent value="bp">
                <BPSection picksBans={match.picks_bans || []} radiantTeamName={radiantTeamName} direTeamName={direTeamName} />
              </TabsContent>

              {/* Overview Tab */}
              <TabsContent value="overview">
                <OverviewSection match={match} />
              </TabsContent>
              <TabsContent value="economy">
                <EconomySection match={match} radiantTeamName={radiantTeamName} direTeamName={direTeamName} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PlayerCard({ player, isWinner }: { player: Player; isWinner: boolean }) {
  // Try to get pro player name
  const proInfo = player.account_id ? proPlayersMap[player.account_id] : null;
  const displayName = proInfo?.name || player.personaname || (player.account_id ? `${player.account_id}` : 'Unknown');

  return (
    <div className={`p-2 sm:p-3 rounded-lg border ${isWinner ? 'bg-green-900/20 border-green-600/30' : 'bg-slate-800/30 border-slate-800'}`}>
      <div className="flex items-center justify-between mb-1 sm:mb-2">
        <div className="flex items-center gap-1 sm:gap-2 min-w-0">
          <span className="text-sm sm:text-base font-medium text-white truncate">{displayName}</span>
        </div>
        <Badge className={`flex-shrink-0 ${isWinner ? 'bg-green-600/20 text-green-400' : 'bg-slate-700 text-slate-400'} text-xs`}>
          Lv.{player.level}
        </Badge>
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <HeroIcon heroId={player.hero_id} size="sm" />
        <span className="text-xs sm:text-sm md:text-base font-bold text-yellow-400 truncate flex-1 min-w-0">{getHeroName(player.hero_id)}</span>
        <div className="flex-shrink-0 text-right">
          <span className={`text-sm sm:text-xl font-bold ${player.kills > player.deaths ? 'text-green-400' : player.kills < player.deaths ? 'text-red-400' : 'text-slate-400'}`}>
            {player.kills} / {player.deaths} / {player.assists}
          </span>
        </div>
      </div>
      <div className="mt-1 sm:mt-2 text-[10px] sm:text-xs text-slate-400 flex flex-wrap justify-between gap-x-2">
        <span>GPM: {player.gold_per_min}</span>
        <span>XPM: {player.xp_per_min}</span>
        <span>HD: {player.hero_damage}</span>
        <span>TD: {player.tower_damage}</span>
      </div>
    </div>
  );
}

function BPSection({ picksBans, radiantTeamName, direTeamName }: { picksBans: PicksBans[]; radiantTeamName: string; direTeamName: string }) {
  const radiantBans = picksBans.filter(pb => pb.team === 0 && !pb.is_pick).map(pb => pb.hero_id);
  const radiantPicks = picksBans.filter(pb => pb.team === 0 && pb.is_pick).map(pb => pb.hero_id);
  const direBans = picksBans.filter(pb => pb.team === 1 && !pb.is_pick).map(pb => pb.hero_id);
  const direPicks = picksBans.filter(pb => pb.team === 1 && pb.is_pick).map(pb => pb.hero_id);

  if (picksBans.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        <Target className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>暂无 BP 数据</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* Radiant */}
      <div>
        <div className="text-center font-bold text-green-400 mb-3">{radiantTeamName}</div>
        <div className="space-y-4">
          <div>
            <div className="text-sm text-slate-400 mb-2">Ban</div>
            <div className="flex flex-wrap gap-2">
              {radiantBans.map((heroId, idx) => (
                <div key={idx} className="relative group">
                  <HeroIcon heroId={heroId} size="md" />
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-slate-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-10">
                    {getHeroName(heroId)}
                  </div>
                </div>
              ))}
              {radiantBans.length === 0 && <span className="text-slate-500 text-sm">-</span>}
            </div>
          </div>
          <div>
            <div className="text-sm text-slate-400 mb-2">Pick</div>
            <div className="flex flex-wrap gap-2">
              {radiantPicks.map((heroId, idx) => (
                <div key={idx} className="relative group">
                  <HeroIcon heroId={heroId} size="md" />
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-slate-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-10">
                    {getHeroName(heroId)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Dire */}
      <div>
        <div className="text-center font-bold text-red-400 mb-3">{direTeamName}</div>
        <div className="space-y-4">
          <div>
            <div className="text-sm text-slate-400 mb-2">Ban</div>
            <div className="flex flex-wrap gap-2">
              {direBans.map((heroId, idx) => (
                <div key={idx} className="relative group">
                  <HeroIcon heroId={heroId} size="md" />
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-slate-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-10">
                    {getHeroName(heroId)}
                  </div>
                </div>
              ))}
              {direBans.length === 0 && <span className="text-slate-500 text-sm">-</span>}
            </div>
          </div>
          <div>
            <div className="text-sm text-slate-400 mb-2">Pick</div>
            <div className="flex flex-wrap gap-2">
              {direPicks.map((heroId, idx) => (
                <div key={idx} className="relative group">
                  <HeroIcon heroId={heroId} size="md" />
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-slate-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-10">
                    {getHeroName(heroId)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OverviewSection({ match }: { match: MatchDetail }) {
  const seriesTypes: Record<number, string> = {
    0: 'BO1', 1: 'BO3', 2: 'BO5', 3: 'BO2'
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-800">
        <div className="text-sm text-slate-400 mb-1">比赛时长</div>
        <div className="text-xl font-bold text-white">{formatDuration(match.duration)}</div>
      </div>
      <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-800">
        <div className="text-sm text-slate-400 mb-1">赛制</div>
        <div className="text-xl font-bold text-white">{seriesTypes[match.series_type] || 'Unknown'}</div>
      </div>
      <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-800">
        <div className="text-sm text-slate-400 mb-1">系列赛 ID</div>
        <div className="text-xl font-bold text-white">{match.series_id || '-'}</div>
      </div>
      <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-800">
        <div className="text-sm text-slate-400 mb-1">Match ID</div>
        <div className="text-xl font-bold text-white">{match.match_id}</div>
      </div>
    </div>
  );
}

function EconomySection({ match, radiantTeamName, direTeamName }: { match: MatchDetail; radiantTeamName: string; direTeamName: string }) {
  const goldAdv = match.radiant_gold_adv || [];
  const xpAdv = match.radiant_xp_adv || [];
  
  const maxGold = Math.max(...goldAdv.map(Math.abs), 1);
  const maxXP = Math.max(...xpAdv.map(Math.abs), 1);
  
  // Generate SVG area path for the graph (fills from center)
  const generateAreaPath = (data: number[], maxVal: number) => {
    if (data.length === 0) return { positive: '', negative: '' };
    const width = 100;
    const height = 50;
    const step = width / (data.length - 1);
    
    let positivePath = '';
    let negativePath = '';
    
    data.forEach((val, i) => {
      const x = i * step;
      const y = height / 2 - (val / maxVal) * (height / 2);
      const centerY = height / 2;
      
      if (val >= 0) {
        positivePath += i === 0 ? `M ${x} ${centerY} L ${x} ${y}` : ` L ${x} ${y}`;
      } else {
        negativePath += i === 0 ? `M ${x} ${centerY} L ${x} ${y}` : ` L ${x} ${y}`;
      }
    });
    
    // Close paths
    if (positivePath) {
      positivePath += ` L ${width} ${height / 2} L 0 ${height / 2} Z`;
    }
    if (negativePath) {
      negativePath += ` L ${width} ${height / 2} L 0 ${height / 2} Z`;
    }
    
    return { positive: positivePath, negative: negativePath };
  };
  
  const goldArea = generateAreaPath(goldAdv, maxGold);
  const xpArea = generateAreaPath(xpAdv, maxXP);
  
  const radiantColor = "#4ade80";
  const direColor = "#f87171";
  
  // Player gold data for graph
  const radiantPlayers = match.players.filter(p => p.player_slot < 128);
  const direPlayers = match.players.filter(p => p.player_slot >= 128);
  
  const getPlayerGold = (player: typeof match.players[0]) => {
    return (player as any).gold_t || [];
  };
  
  const maxPlayerGold = Math.max(
    ...match.players.map(p => Math.max(...(getPlayerGold(p) || [0])))
  );
  
  return (
    <div className="space-y-4">
      {/* Team Gold Advantage */}
      <div className="bg-slate-800/30 rounded-lg p-3 sm:p-4 border border-slate-800">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-slate-300">团队经济曲线</span>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-green-400">{radiantTeamName || 'Radiant'}</span>
            <span className="text-red-400">{direTeamName || 'Dire'}</span>
          </div>
        </div>
        <div className="relative h-28 bg-slate-900/50 rounded overflow-hidden">
          {/* Zero line */}
          <div className="absolute top-1/2 left-0 right-0 border-t border-slate-600"></div>
          {/* Gold advantage - green for radiant lead, red for dire lead */}
          <svg className="w-full h-full" viewBox="0 0 100 50" preserveAspectRatio="none">
            <path d={goldArea.positive} fill={radiantColor} fillOpacity="0.3" stroke={radiantColor} strokeWidth="1.5" />
            <path d={goldArea.negative} fill={direColor} fillOpacity="0.3" stroke={direColor} strokeWidth="1.5" />
          </svg>
          {/* Y-axis labels */}
          <div className="absolute top-1 left-1 text-[8px] text-green-400">+{maxGold.toLocaleString()}</div>
          <div className="absolute bottom-1 left-1 text-[8px] text-red-400">-{maxGold.toLocaleString()}</div>
        </div>
        <div className="flex justify-between mt-1 text-[10px] text-slate-500">
          <span>0:00</span>
          <span>{formatDuration(match.duration)}</span>
        </div>
        <div className="flex justify-center mt-1">
          {goldAdv.length > 0 && (
            <span className={`text-sm font-medium ${goldAdv[goldAdv.length - 1] > 0 ? 'text-green-400' : 'text-red-400'}`}>
              {goldAdv[goldAdv.length - 1] > 0 ? '+' : ''}{goldAdv[goldAdv.length - 1].toLocaleString()} Gold
            </span>
          )}
        </div>
      </div>
      
      {/* Team XP Advantage */}
      <div className="bg-slate-800/30 rounded-lg p-3 sm:p-4 border border-slate-800">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-slate-300">团队经验曲线</span>
        </div>
        <div className="relative h-28 bg-slate-900/50 rounded overflow-hidden">
          <div className="absolute top-1/2 left-0 right-0 border-t border-slate-600"></div>
          <svg className="w-full h-full" viewBox="0 0 100 50" preserveAspectRatio="none">
            <path d={xpArea.positive} fill={radiantColor} fillOpacity="0.3" stroke={radiantColor} strokeWidth="1.5" />
            <path d={xpArea.negative} fill={direColor} fillOpacity="0.3" stroke={direColor} strokeWidth="1.5" />
          </svg>
          <div className="absolute top-1 left-1 text-[8px] text-green-400">+{maxXP.toLocaleString()}</div>
          <div className="absolute bottom-1 left-1 text-[8px] text-red-400">-{maxXP.toLocaleString()}</div>
        </div>
        <div className="flex justify-between mt-1 text-[10px] text-slate-500">
          <span>0:00</span>
          <span>{formatDuration(match.duration)}</span>
        </div>
        <div className="flex justify-center mt-1">
          {xpAdv.length > 0 && (
            <span className={`text-sm font-medium ${xpAdv[xpAdv.length - 1] > 0 ? 'text-green-400' : 'text-red-400'}`}>
              {xpAdv[xpAdv.length - 1] > 0 ? '+' : ''}{xpAdv[xpAdv.length - 1].toLocaleString()} XP
            </span>
          )}
        </div>
      </div>
      
      {/* Player Net Worth Graph */}
      <div className="bg-slate-800/30 rounded-lg p-3 sm:p-4 border border-slate-800">
        <div className="text-sm font-medium text-slate-300 mb-2">选手经济曲线</div>
        <div className="relative h-40 bg-slate-900/50 rounded overflow-hidden">
          <svg className="w-full h-full" viewBox="0 0 100 50" preserveAspectRatio="none">
            {/* Radiant players - green shades */}
            {radiantPlayers.map((p, i) => {
              const data = getPlayerGold(p);
              if (!data || data.length === 0) return null;
              const path = data.map((val: number, idx: number) => {
                const x = (idx / (data.length - 1)) * 100;
                const y = 50 - (val / maxPlayerGold) * 50;
                return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
              }).join(' ');
              return <path key={p.player_slot} d={path} fill="none" stroke={radiantColor} strokeWidth="1" strokeOpacity={0.9 - i * 0.15} />;
            })}
            {/* Dire players - red shades */}
            {direPlayers.map((p, i) => {
              const data = getPlayerGold(p);
              if (!data || data.length === 0) return null;
              const path = data.map((val: number, idx: number) => {
                const x = (idx / (data.length - 1)) * 100;
                const y = 50 - (val / maxPlayerGold) * 50;
                return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
              }).join(' ');
              return <path key={p.player_slot} d={path} fill="none" stroke={direColor} strokeWidth="1" strokeOpacity={0.9 - i * 0.15} />;
            })}
          </svg>
          {/* Legend */}
          <div className="absolute top-1 right-1 text-[8px] space-y-0.5">
            <div className="flex items-center gap-1">
              <div className="w-2 h-0.5 bg-green-400"></div>
              <span className="text-green-400">{radiantTeamName?.substring(0, 6) || 'Radiant'}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-0.5 bg-red-400"></div>
              <span className="text-red-400">{direTeamName?.substring(0, 6) || 'Dire'}</span>
            </div>
          </div>
        </div>
        <div className="flex justify-between mt-1 text-[10px] text-slate-500">
          <span>0:00</span>
          <span>{formatDuration(match.duration)}</span>
        </div>
      </div>
      
      {/* Net Worth by Player */}
      <div className="bg-slate-800/30 rounded-lg p-3 sm:p-4 border border-slate-800">
        <div className="text-sm font-medium text-slate-300 mb-2">选手经济排行</div>
        <div className="grid grid-cols-2 gap-2">
          {/* Radiant */}
          <div className="space-y-1">
            <div className="text-xs text-green-400 font-medium">{radiantTeamName || 'Radiant'}</div>
            {[...radiantPlayers]
              .sort((a, b) => (b.gold || 0) - (a.gold || 0))
              .map((p) => (
                <div key={p.player_slot} className="flex items-center gap-1 text-xs">
                  <HeroIcon heroId={p.hero_id} size="sm" />
                  <span className="flex-1 truncate text-green-400">{p.personaname?.substring(0, 10) || p.account_id?.toString() || '?'}</span>
                  <span className="text-yellow-400">{((p.gold || 0) / 1000).toFixed(1)}k</span>
                </div>
              ))}
          </div>
          {/* Dire */}
          <div className="space-y-1">
            <div className="text-xs text-red-400 font-medium">{direTeamName || 'Dire'}</div>
            {[...direPlayers]
              .sort((a, b) => (b.gold || 0) - (a.gold || 0))
              .map((p) => (
                <div key={p.player_slot} className="flex items-center gap-1 text-xs">
                  <HeroIcon heroId={p.hero_id} size="sm" />
                  <span className="flex-1 truncate text-red-400">{p.personaname?.substring(0, 10) || p.account_id?.toString() || '?'}</span>
                  <span className="text-yellow-400">{((p.gold || 0) / 1000).toFixed(1)}k</span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
