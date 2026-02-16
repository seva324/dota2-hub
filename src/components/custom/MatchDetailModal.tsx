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

// Hero name mapping
const heroNames: Record<number, string> = {
  1: 'Anti-Mage', 2: 'Axe', 3: 'Bane', 4: 'Bloodseeker', 5: 'Crystal Maiden',
  6: 'Drow Ranger', 7: 'Earthshaker', 8: 'Juggernaut', 9: 'Mirana', 10: 'Morphling',
  11: 'Shadow Fiend', 12: 'Phantom Lancer', 13: 'Puck', 14: 'Pudge', 15: 'Razor',
  16: 'Sand King', 17: 'Storm Spirit', 18: 'Sven', 19: 'Tiny', 20: 'Vengeful Spirit',
  21: 'Windranger', 22: 'Zeus', 23: 'Kunkka', 25: 'Lina', 26: 'Lion',
  27: 'Shadow Shaman', 28: 'Slardar', 29: 'Tidehunter', 30: 'Witch Doctor', 31: 'Lich',
  32: 'Riki', 33: 'Enigma', 34: 'Tinker', 35: 'Sniper', 36: 'Necrophos',
  37: 'Warlock', 38: 'Beastmaster', 39: 'Queen of Pain', 40: 'Venomancer', 41: 'Faceless Void',
  42: 'Wraith King', 43: 'Death Prophet', 44: 'Phantom Assassin', 45: 'Pugna', 46: 'Templar Assassin',
  47: 'Viper', 48: 'Luna', 49: 'Dragon Knight', 50: 'Dazzle', 51: 'Clockwerk',
  52: 'Leshrac', 53: "Nature's Prophet", 54: 'Lifestealer', 55: 'Dark Seer', 56: 'Clinkz',
  57: 'Omniknight', 58: 'Enchantress', 59: 'Huskar', 60: 'Night Stalker', 61: 'Broodmother',
  62: 'Bounty Hunter', 63: 'Weaver', 64: 'Jakiro', 65: 'Batrider', 66: 'Chen',
  67: 'Spectre', 68: 'Ancient Apparition', 69: 'Doom', 70: 'Ursa', 71: 'Spirit Breaker',
  72: 'Gyrocopter', 73: 'Alchemist', 74: 'Invoker', 75: 'Silencer', 76: 'Outworld Destroyer',
  77: 'Lycan', 78: 'Brewmaster', 79: 'Shadow Demon', 80: 'Lone Druid', 81: 'Chaos Knight',
  82: 'Meepo', 83: 'Treant Protector', 84: 'Ogre Magi', 85: 'Undying', 86: 'Rubick',
  87: 'Disruptor', 88: 'Nyx Assassin', 89: 'Naga Siren', 90: 'Keeper of the Light', 91: 'Io',
  92: 'Visage', 93: 'Slark', 94: 'Medusa', 95: 'Troll Warlord', 96: 'Centaur Warrunner',
  97: 'Magnus', 98: 'Timbersaw', 99: 'Bristleback', 100: 'Tusk', 101: 'Skywrath Mage',
  102: 'Abaddon', 103: 'Elder Titan', 104: 'Legion Commander', 105: 'Techies', 106: 'Ember Spirit',
  107: 'Earth Spirit', 108: 'Underlord', 109: 'Terrorblade', 110: 'Phoenix', 111: 'Oracle',
  112: 'Winter Wyvern', 113: 'Arc Warden', 114: 'Monkey King', 119: 'Dark Willow', 120: 'Pangolier',
  121: 'Grimstroke', 123: 'Hoodwink', 126: 'Void Spirit', 128: 'Snapfire', 129: 'Mars',
  131: 'Ringmaster', 135: 'Dawnbreaker', 136: 'Marci', 137: 'Primal Beast', 138: 'Muerta', 145: 'Kez', 155: 'Largo'
};

function getHeroName(id: number): string {
  return heroNames[id] || `Hero ${id}`;
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
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-800">
              <div className="flex items-center gap-4">
                <div className={`text-2xl font-bold ${match.radiant_win ? 'text-green-400' : 'text-red-400'}`}>
                  {match.radiant_team_name || 'Radiant'}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-3xl font-bold ${match.radiant_score > match.dire_score ? 'text-green-400' : 'text-slate-400'}`}>
                    {match.radiant_score}
                  </span>
                  <span className="text-slate-600 text-xl">:</span>
                  <span className={`text-3xl font-bold ${match.dire_score > match.radiant_score ? 'text-green-400' : 'text-slate-400'}`}>
                    {match.dire_score}
                  </span>
                </div>
                <div className={`text-2xl font-bold ${!match.radiant_win ? 'text-green-400' : 'text-red-400'}`}>
                  {match.dire_team_name || 'Dire'}
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
                <div className="grid grid-cols-2 gap-6">
                  {/* Radiant */}
                  <div className="space-y-2">
                    <div className="text-center font-bold text-green-400 mb-3">{match.radiant_team_name || 'Radiant'}</div>
                    {radiantPlayers.map((player, idx) => (
                      <PlayerCard key={idx} player={player} isWinner={match.radiant_win} />
                    ))}
                  </div>
                  {/* Dire */}
                  <div className="space-y-2">
                    <div className="text-center font-bold text-red-400 mb-3">{match.dire_team_name || 'Dire'}</div>
                    {direPlayers.map((player, idx) => (
                      <PlayerCard key={idx} player={player} isWinner={!match.radiant_win} />
                    ))}
                  </div>
                </div>
              </TabsContent>

              {/* BP Tab */}
              <TabsContent value="bp">
                <BPSection picksBans={match.picks_bans || []} />
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
        <div className="text-2xl font-bold text-yellow-400">{getHeroName(player.hero_id)}</div>
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

function BPSection({ picksBans }: { picksBans: PicksBans[] }) {
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
        <div className="text-center font-bold text-green-400 mb-3">Radiant</div>
        <div className="space-y-4">
          <div>
            <div className="text-sm text-slate-400 mb-2">Ban</div>
            <div className="flex flex-wrap gap-2">
              {radiantBans.map((heroId, idx) => (
                <div key={idx} className="w-12 h-12 rounded bg-red-900/50 flex items-center justify-center text-xs text-red-300 border border-red-700/50">
                  {getHeroName(heroId).substring(0, 3)}
                </div>
              ))}
              {radiantBans.length === 0 && <span className="text-slate-500 text-sm">-</span>}
            </div>
          </div>
          <div>
            <div className="text-sm text-slate-400 mb-2">Pick</div>
            <div className="flex flex-wrap gap-2">
              {radiantPicks.map((heroId, idx) => (
                <div key={idx} className="w-12 h-12 rounded bg-green-900/50 flex items-center justify-center text-xs text-green-300 border border-green-700/50">
                  {getHeroName(heroId).substring(0, 3)}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Dire */}
      <div>
        <div className="text-center font-bold text-red-400 mb-3">Dire</div>
        <div className="space-y-4">
          <div>
            <div className="text-sm text-slate-400 mb-2">Ban</div>
            <div className="flex flex-wrap gap-2">
              {direBans.map((heroId, idx) => (
                <div key={idx} className="w-12 h-12 rounded bg-red-900/50 flex items-center justify-center text-xs text-red-300 border border-red-700/50">
                  {getHeroName(heroId).substring(0, 3)}
                </div>
              ))}
              {direBans.length === 0 && <span className="text-slate-500 text-sm">-</span>}
            </div>
          </div>
          <div>
            <div className="text-sm text-slate-400 mb-2">Pick</div>
            <div className="flex flex-wrap gap-2">
              {direPicks.map((heroId, idx) => (
                <div key={idx} className="w-12 h-12 rounded bg-green-900/50 flex items-center justify-center text-xs text-green-300 border border-green-700/50">
                  {getHeroName(heroId).substring(0, 3)}
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
