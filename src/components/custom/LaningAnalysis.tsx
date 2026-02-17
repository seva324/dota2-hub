import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Minus, Crown } from 'lucide-react';

// Types
interface Player {
  player_slot: number;
  account_id: number;
  personaname?: string;
  name?: string;
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
  lane?: number;
  lane_role?: number;
  gold_t?: number[];
  xp_t?: number[];
  lh_t?: number[];
  dn_t?: number[];
  lane_pos?: Record<string, Record<string, number>>;
  lane_kills?: number;
  lane_efficiency?: number;
  is_roaming?: number;
}

interface MatchData {
  match_id: number;
  radiant_team_name: string;
  dire_team_name: string;
  radiant_win: boolean;
  players: Player[];
}

interface HeroesData {
  [key: number]: { name: string; img: string };
}

interface LaningAnalysisProps {
  matchId: number;
  radiantTeamName: string;
  direTeamName: string;
  heroesData: HeroesData;
}

function getHeroName(id: number, heroesData: HeroesData): string {
  return heroesData[id]?.name || `Hero ${id}`;
}

function getHeroImg(id: number, heroesData: HeroesData): string {
  const img = heroesData[id]?.img || `hero_${id}`;
  return `https://steamcdn-a.akamaihd.net/apps/dota2/images/heroes/${img}_lg.png`;
}

function getValueAtMinute(arr: number[] | undefined, minute: number): number {
  if (!arr || arr.length === 0) return 0;
  const idx = Math.min(minute, arr.length - 1);
  return arr[idx] || 0;
}

function parsePlayer(player: Player): {
  isRadiant: boolean;
  position: number;
  lane: number;
  laneRole: number;
} {
  const isRadiant = player.player_slot < 128;
  const position = isRadiant ? player.player_slot : player.player_slot - 128;
  const lane = player.lane || (position === 1 ? 1 : position === 2 ? 2 : 3);
  const laneRole = player.lane_role || (position + 1);
  return { isRadiant, position, lane, laneRole };
}

function getLaneRoleName(role: number): string {
  const names: Record<number, string> = {
    1: '一号位',
    2: '二号位',
    3: '三号位',
    4: '四号位',
    5: '五号位',
  };
  return names[role] || `${role}号位`;
}

export function LaningAnalysis({ matchId, radiantTeamName, direTeamName, heroesData }: LaningAnalysisProps) {
  const [match, setMatch] = useState<MatchData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`https://api.opendota.com/api/matches/${matchId}`)
      .then(res => res.json())
      .then(data => {
        if (!data.error) {
          setMatch(data);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [matchId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!match) {
    return <div className="text-center py-8 text-slate-500">加载失败</div>;
  }

  const radiantPlayers = match.players.filter(p => p.player_slot < 128);
  const direPlayers = match.players.filter(p => p.player_slot >= 128);
  const analysis = analyzeLanes(radiantPlayers, direPlayers);

  return (
    <div className="space-y-4">
      <div className="text-center mb-4">
        <h3 className="text-lg font-bold text-white">对线分析 (10分钟)</h3>
        <p className="text-sm text-slate-400">Laning Analysis</p>
      </div>

      <div className="space-y-3">
        {analysis.lanes.map((lane, idx) => (
          <LaneMatchup key={idx} lane={lane} heroesData={heroesData} />
        ))}
      </div>

      <div className="mt-6 pt-4 border-t border-slate-700">
        <h4 className="text-sm font-semibold text-slate-300 mb-3">线优统计</h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-xs text-slate-400 mb-2">{radiantTeamName}</div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-green-400" />
                <span className="text-green-400 font-bold">{analysis.radiantLaneKills}</span>
                <span className="text-slate-500 text-xs">线杀</span>
              </div>
              <span className={analysis.radiantEfficiency >= 0.5 ? 'text-green-400' : 'text-red-400'}>
                {(analysis.radiantEfficiency * 100).toFixed(1)}% 效率
              </span>
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-xs text-slate-400 mb-2">{direTeamName}</div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-green-400" />
                <span className="text-green-400 font-bold">{analysis.direLaneKills}</span>
                <span className="text-slate-500 text-xs">线杀</span>
              </div>
              <span className={analysis.direEfficiency >= 0.5 ? 'text-green-400' : 'text-red-400'}>
                {(analysis.direEfficiency * 100).toFixed(1)}% 效率
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface LaneData {
  name: string;
  roleName: string;
  radiant: { player: Player; goldDiff: number; xpDiff: number; lh: number; dn: number };
  dire: { player: Player; goldDiff: number; xpDiff: number; lh: number; dn: number };
  advantage: 'radiant' | 'dire' | 'even';
}

interface LaneAnalysisResult {
  lanes: LaneData[];
  radiantLaneKills: number;
  direLaneKills: number;
  radiantEfficiency: number;
  direEfficiency: number;
}

function LaneMatchup({ lane, heroesData }: { lane: LaneData; heroesData: HeroesData }) {
  const { name, roleName, radiant, dire, advantage } = lane;
  const goldDiff = radiant.goldDiff - dire.goldDiff;
  
  return (
    <div className="bg-slate-800/30 rounded-lg p-3 border border-slate-700">
      <div className="flex items-center justify-center gap-2 mb-3">
        <span className="text-sm font-medium text-slate-300">{name}</span>
        <span className="text-xs text-slate-500">({roleName})</span>
        {advantage === 'radiant' && <Crown className="w-4 h-4 text-green-400" />}
        {advantage === 'dire' && <Crown className="w-4 h-4 text-red-400" />}
        {advantage === 'even' && <Minus className="w-4 h-4 text-slate-500" />}
      </div>
      
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <img 
              src={getHeroImg(radiant.player.hero_id, heroesData)} 
              alt={getHeroName(radiant.player.hero_id, heroesData)}
              className="w-10 h-10 rounded object-cover"
            />
            <div className="min-w-0">
              <div className="text-sm font-medium text-white truncate">
                {radiant.player.name || radiant.player.personaname || 'Unknown'}
              </div>
              <div className="text-xs text-yellow-400 truncate">
                {getHeroName(radiant.player.hero_id, heroesData)}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center px-3">
          <div className="flex items-center gap-1 text-sm">
            {goldDiff > 0 ? (
              <TrendingUp className="w-4 h-4 text-green-400" />
            ) : goldDiff < 0 ? (
              <TrendingDown className="w-4 h-4 text-red-400" />
            ) : (
              <Minus className="w-4 h-4 text-slate-400" />
            )}
            <span className={goldDiff > 0 ? 'text-green-400' : goldDiff < 0 ? 'text-red-400' : 'text-slate-400'}>
              {Math.abs(goldDiff).toLocaleString()}
            </span>
          </div>
          <div className="text-xs text-slate-500">
            {radiant.lh}/{radiant.dn} vs {dire.lh}/{dire.dn}
          </div>
        </div>

        <div className="flex-1 flex justify-end">
          <div className="flex items-center gap-2">
            <div className="min-w-0 text-right">
              <div className="text-sm font-medium text-white truncate">
                {dire.player.name || dire.player.personaname || 'Unknown'}
              </div>
              <div className="text-xs text-yellow-400 truncate">
                {getHeroName(dire.player.hero_id, heroesData)}
              </div>
            </div>
            <img 
              src={getHeroImg(dire.player.hero_id, heroesData)} 
              alt={getHeroName(dire.player.hero_id, heroesData)}
              className="w-10 h-10 rounded object-cover"
            />
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-1">
        <div className="flex items-center gap-2 text-xs">
          <div className="w-12 text-green-400 text-right">
            +{radiant.goldDiff.toLocaleString()}
          </div>
          <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-green-500"
              style={{ width: `${Math.min(100, (radiant.goldDiff / (radiant.goldDiff + Math.abs(dire.goldDiff) + 1)) * 100)}%` }}
            />
          </div>
          <div className="w-12 text-red-400">
            {dire.goldDiff.toLocaleString()}
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <div className="w-12 text-green-400 text-right">
            +{radiant.xpDiff.toLocaleString()}
          </div>
          <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-500"
              style={{ width: `${Math.min(100, (radiant.xpDiff / (radiant.xpDiff + Math.abs(dire.xpDiff) + 1)) * 100)}%` }}
            />
          </div>
          <div className="w-12 text-red-400">
            {dire.xpDiff.toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
}

function analyzeLanes(radiantPlayers: Player[], direPlayers: Player[]): LaneAnalysisResult {
  const result: LaneAnalysisResult = {
    lanes: [],
    radiantLaneKills: 0,
    direLaneKills: 0,
    radiantEfficiency: 0,
    direEfficiency: 0,
  };

  const minute = 10;
  const laneNames: Record<number, string> = {
    1: '优势路',
    2: '中路',
    3: '劣势路',
  };

  const radiantParsed = radiantPlayers.map(p => ({ player: p, ...parsePlayer(p) }));
  const direParsed = direPlayers.map(p => ({ player: p, ...parsePlayer(p) }));

  const matchups = [
    { lane: 1, name: laneNames[1] + ' (Safe)', roles: [1, 4] },
    { lane: 2, name: laneNames[2] + ' (Mid)', roles: [2] },
    { lane: 3, name: laneNames[3] + ' (Off)', roles: [3, 5] },
  ];

  for (const matchup of matchups) {
    const rPlayers = radiantParsed.filter(p => matchup.roles.includes(p.laneRole));
    const dPlayers = direParsed.filter(p => matchup.roles.includes(p.laneRole));
    
    for (let i = 0; i < Math.max(rPlayers.length, dPlayers.length); i++) {
      const rData = rPlayers[i];
      const dData = dPlayers[i];
      
      if (rData && dData) {
        const rGold = getValueAtMinute(rData.player.gold_t, minute);
        const dGold = getValueAtMinute(dData.player.gold_t, minute);
        const rXp = getValueAtMinute(rData.player.xp_t, minute);
        const dXp = getValueAtMinute(dData.player.xp_t, minute);
        const rLh = getValueAtMinute(rData.player.lh_t, minute);
        const dLh = getValueAtMinute(dData.player.lh_t, minute);
        const rDn = getValueAtMinute(rData.player.dn_t, minute);
        const dDn = getValueAtMinute(dData.player.dn_t, minute);
        
        const advantage = rGold > dGold ? 'radiant' : dGold > rGold ? 'dire' : 'even';
        const roleName = getLaneRoleName(rData.laneRole) + ' vs ' + getLaneRoleName(dData.laneRole);
        
        result.lanes.push({
          name: matchup.name,
          roleName,
          radiant: { player: rData.player, goldDiff: rGold, xpDiff: rXp, lh: rLh, dn: rDn },
          dire: { player: dData.player, goldDiff: dGold, xpDiff: dXp, lh: dLh, dn: dDn },
          advantage,
        });
      }
    }
  }

  radiantPlayers.forEach(p => {
    result.radiantLaneKills += p.lane_kills || 0;
    result.radiantEfficiency += p.lane_efficiency || 0;
  });
  
  direPlayers.forEach(p => {
    result.direLaneKills += p.lane_kills || 0;
    result.direEfficiency += p.lane_efficiency || 0;
  });
  
  result.radiantEfficiency /= radiantPlayers.length || 1;
  result.direEfficiency /= direPlayers.length || 1;

  return result;
}

export default LaningAnalysis;
