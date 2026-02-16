import { useState, useEffect } from 'react';
import { Sword, Users, Target, Clock } from 'lucide-react';
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
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 pb-4 border-b border-slate-800 gap-4">
              <div className="flex items-center gap-2 md:gap-4 flex-wrap">
                <div className={`text-lg md:text-2xl font-bold ${match.radiant_win ? 'text-green-400' : 'text-red-400'}`}>
                  {radiantTeamName}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-2xl md:text-3xl font-bold ${match.radiant_score > match.dire_score ? 'text-green-400' : 'text-slate-400'}`}>
                    {match.radiant_score}
                  </span>
                  <span className="text-slate-600 text-lg md:text-xl">:</span>
                  <span className={`text-2xl md:text-3xl font-bold ${match.dire_score > match.radiant_score ? 'text-green-400' : 'text-slate-400'}`}>
                    {match.dire_score}
                  </span>
                </div>
                <div className={`text-lg md:text-2xl font-bold ${!match.radiant_win ? 'text-green-400' : 'text-red-400'}`}>
                  {direTeamName}
                </div>
              </div>
              <div className="text-right text-sm text-slate-400">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  {formatDuration(match.duration)}
                </div>
                <div>{formatDate(match.start_time)}</div>
                <Badge variant="outline" className="border-slate-700 text-slate-400 mt-1">
                  {match.league_name || 'Professional Match'}
                </Badge>
              </div>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="players" className="w-full">
              <TabsList className="bg-slate-800/50 mb-4">
                <TabsTrigger value="players" className="data-[state=active]:bg-slate-700">
                  <Users className="w-4 h-4 mr-2" />
                  选手数据
                </TabsTrigger>
                <TabsTrigger value="bp" className="data-[state=active]:bg-slate-700">
                  <Target className="w-4 h-4 mr-2" />
                  BP 阵容
                </TabsTrigger>
                <TabsTrigger value="overview" className="data-[state=active]:bg-slate-700">
                  <Sword className="w-4 h-4 mr-2" />
                  概览
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
  const displayName = proInfo?.name || player.personaname || (player.account_id ? `ID: ${player.account_id}` : 'Unknown');
  const teamName = proInfo?.team_name || '';

  return (
    <div className={`p-3 rounded-lg border ${isWinner ? 'bg-green-900/20 border-green-600/30' : 'bg-slate-800/30 border-slate-800'}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg font-medium text-white">{displayName}</span>
          {teamName && <Badge className="bg-slate-700 text-slate-300 text-xs">{teamName}</Badge>}
        </div>
        <Badge className={isWinner ? 'bg-green-600/20 text-green-400' : 'bg-slate-700 text-slate-400'}>
          Lv.{player.level}
        </Badge>
      </div>
      <div className="flex items-center gap-3">
        <HeroIcon heroId={player.hero_id} size="lg" />
        <div className="text-xl font-bold text-yellow-400">{getHeroName(player.hero_id)}</div>
        <div className="flex-1 text-center">
          <span className={`text-xl font-bold ${player.kills > player.deaths ? 'text-green-400' : player.kills < player.deaths ? 'text-red-400' : 'text-slate-400'}`}>
            {player.kills} / {player.deaths} / {player.assists}
          </span>
        </div>
      </div>
      <div className="mt-2 text-xs text-slate-400 flex justify-between">
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
