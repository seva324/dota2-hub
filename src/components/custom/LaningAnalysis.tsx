import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

// Types
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
  lane?: number;
  lane_role?: number;
  gold_t?: number[];
  xp_t?: number[];
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

// Calculate gold at specific minute
function getGoldAtMinute(goldT: number[] | undefined, minute: number): number {
  if (!goldT || goldT.length === 0) return 0;
  const idx = Math.min(minute, goldT.length - 1);
  return goldT[idx] || 0;
}

// Parse player to determine team and position
function parsePlayer(player: Player): {
  isRadiant: boolean;
  position: number;
  lane: number;
  laneRole: number;
} {
  const isRadiant = player.player_slot < 128;
  const position = isRadiant ? player.player_slot : player.player_slot - 128;
  const lane = player.lane || (position === 1 ? 1 : position === 2 ? 2 : 3);
  const laneRole = player.lane_role || position;
  return { isRadiant, position, lane, laneRole };
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
      {/* Header */}
      <div className="text-center mb-4">
        <h3 className="text-lg font-bold text-white">对线分析 (10分钟)</h3>
        <p className="text-sm text-slate-400">Laning Analysis</p>
      </div>

      {/* Lane Matchups */}
      <div className="space-y-3">
        {analysis.lanes.map((lane, idx) => (
          <LaneMatchup key={idx} lane={lane} heroesData={heroesData} />
        ))}
      </div>

      {/* Stats Summary */}
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
  radiant: { player: Player; goldDiff: number; xpDiff: number; ld: number };
  dire: { player: Player; goldDiff: number; xpDiff: number; ld: number };
}

interface LaneAnalysisResult {
  lanes: LaneData[];
  radiantLaneKills: number;
  direLaneKills: number;
  radiantEfficiency: number;
  direEfficiency: number;
}

function LaneMatchup({ lane, heroesData }: { lane: LaneData; heroesData: HeroesData }) {
  const { name, radiant, dire } = lane;
  const goldDiff = radiant.goldDiff - dire.goldDiff;
  
  return (
    <div className="bg-slate-800/30 rounded-lg p-3 border border-slate-700">
      {/* Lane Name */}
      <div className="text-center text-sm font-medium text-slate-300 mb-3">{name}</div>
      
      {/* Matchup */}
      <div className="flex items-center justify-between">
        {/* Radiant */}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <img 
              src={getHeroImg(radiant.player.hero_id, heroesData)} 
              alt={getHeroName(radiant.player.hero_id, heroesData)}
              className="w-8 h-8 rounded"
            />
            <div className="min-w-0">
              <div className="text-sm font-medium text-white truncate">
                {radiant.player.personaname || 'Unknown'}
              </div>
              <div className="text-xs text-yellow-400 truncate">
                {getHeroName(radiant.player.hero_id, heroesData)}
              </div>
            </div>
          </div>
        </div>

        {/* VS Stats */}
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
            {radiant.ld}/{dire.ld} 正/反
          </div>
        </div>

        {/* Dire */}
        <div className="flex-1 flex justify-end">
          <div className="flex items-center gap-2">
            <div className="min-w-0 text-right">
              <div className="text-sm font-medium text-white truncate">
                {dire.player.personaname || 'Unknown'}
              </div>
              <div className="text-xs text-yellow-400 truncate">
                {getHeroName(dire.player.hero_id, heroesData)}
              </div>
            </div>
            <img 
              src={getHeroImg(dire.player.hero_id, heroesData)} 
              alt={getHeroName(dire.player.hero_id, heroesData)}
              className="w-8 h-8 rounded"
            />
          </div>
        </div>
      </div>

      {/* Progress Bars */}
      <div className="mt-3 space-y-1">
        {/* Gold */}
        <div className="flex items-center gap-2 text-xs">
          <div className="w-12 text-green-400 text-right">
            +{radiant.goldDiff.toLocaleString()}
          </div>
          <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-green-500"
              style={{ width: `${Math.min(100, (radiant.goldDiff / (radiant.goldDiff + Math.abs(dire.goldDiff))) * 100)}%` }}
            />
          </div>
          <div className="w-12 text-red-400">
            {dire.goldDiff.toLocaleString()}
          </div>
        </div>
        {/* XP */}
        <div className="flex items-center gap-2 text-xs">
          <div className="w-12 text-green-400 text-right">
            +{radiant.xpDiff.toLocaleString()}
          </div>
          <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-500"
              style={{ width: `${Math.min(100, (radiant.xpDiff / (radiant.xpDiff + Math.abs(dire.xpDiff))) * 100)}%` }}
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
    1: '优势路 (Safe Lane)',
    2: '中路 (Mid Lane)',
    3: '劣势路 (Off Lane)',
  };

  const radiantParsed = radiantPlayers.map(p => ({ player: p, ...parsePlayer(p) }));
  const direParsed = direPlayers.map(p => ({ player: p, ...parsePlayer(p) }));

  for (let lane = 1; lane <= 3; lane++) {
    const rData = radiantParsed.find(p => p.lane === lane);
    const dData = direParsed.find(p => p.lane === lane);
    
    if (rData && dData) {
      const rGold = getGoldAtMinute(rData.player.gold_t, minute);
      const dGold = getGoldAtMinute(dData.player.gold_t, minute);
      const rXp = getGoldAtMinute(rData.player.xp_t, minute);
      const dXp = getGoldAtMinute(dData.player.xp_t, minute);
      
      result.lanes.push({
        name: laneNames[lane],
        radiant: {
          player: rData.player,
          goldDiff: rGold,
          xpDiff: rXp,
          ld: rData.player.last_hits || 0,
        },
        dire: {
          player: dData.player,
          goldDiff: dGold,
          xpDiff: dXp,
          ld: dData.player.last_hits || 0,
        },
      });
    }
  }

  // Lane kills and efficiency
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
