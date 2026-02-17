import { useState, useEffect } from 'react';
import { TrendingUp, Minus, Crown } from 'lucide-react';

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

// Chinese hero names - loaded from public data
let heroesCnData: Record<number, string> = {};
fetch('/dota2-hub/data/heroes_cn.json')
  .then(res => res.json())
  .then(data => {
    for (const [key, value] of Object.entries(data)) {
      heroesCnData[parseInt(key)] = (value as any).name_cn || '';
    }
  })
  .catch(() => {});

function getHeroName(id: number, heroesData: HeroesData): string {
  // Try Chinese name first, then English
  return heroesCnData[id] || heroesData[id]?.name || `Hero ${id}`;
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
  radiant: { player: Player; goldDiff: number; xpDiff: number; lh: number; dn: number }[];
  dire: { player: Player; goldDiff: number; xpDiff: number; lh: number; dn: number }[];
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
  const { name, radiant, dire, advantage } = lane;
  
  const radiantGold = radiant.reduce((sum, p) => sum + p.goldDiff, 0);
  const direGold = dire.reduce((sum, p) => sum + p.goldDiff, 0);
  const radiantLh = radiant.reduce((sum, p) => sum + p.lh, 0);
  const radiantDn = radiant.reduce((sum, p) => sum + p.dn, 0);
  const direLh = dire.reduce((sum, p) => sum + p.lh, 0);
  const direDn = dire.reduce((sum, p) => sum + p.dn, 0);
  
  return (
    <div className="bg-slate-800/30 rounded-lg p-3 border border-slate-700">
      {/* Header with crown on left */}
      <div className="flex items-center gap-2 mb-3">
        {advantage === 'radiant' && <Crown className="w-4 h-4 text-green-400 flex-shrink-0" />}
        {advantage === 'dire' && <Crown className="w-4 h-4 text-red-400 flex-shrink-0" />}
        {advantage === 'even' && <Minus className="w-4 h-4 text-slate-500 flex-shrink-0" />}
        <span className="text-sm font-medium text-slate-300">{name}</span>
      </div>
      
      {/* Radiant Heroes - stacked vertically */}
      <div className="mb-2 space-y-1">
        {radiant.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <img 
              src={getHeroImg(p.player.hero_id, heroesData)} 
              alt={getHeroName(p.player.hero_id, heroesData)}
              className="w-6 h-6 rounded object-cover flex-shrink-0"
            />
            <span className="text-xs text-yellow-400 truncate">{getHeroName(p.player.hero_id, heroesData)}</span>
          </div>
        ))}
      </div>
      
      {/* Stats row */}
      <div className="text-center text-xs text-slate-500 mb-2">
        正补/反补: {radiantLh}/{radiantDn} vs {direLh}/{direDn}
      </div>
      
      {/* Dire Heroes - stacked vertically */}
      <div className="mb-3 space-y-1">
        {dire.map((p, i) => (
          <div key={i} className="flex items-center justify-end gap-2">
            <span className="text-xs text-yellow-400 truncate">{getHeroName(p.player.hero_id, heroesData)}</span>
            <img 
              src={getHeroImg(p.player.hero_id, heroesData)} 
              alt={getHeroName(p.player.hero_id, heroesData)}
              className="w-6 h-6 rounded object-cover flex-shrink-0"
            />
          </div>
        ))}
      </div>

      {/* Gold/XP Bars */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-xs">
          <div className="w-14 text-green-400 text-right flex-shrink-0">
            +{radiantGold.toLocaleString()}
          </div>
          <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-green-500"
              style={{ width: `${Math.min(100, (radiantGold / (radiantGold + Math.abs(direGold) + 1)) * 100)}%` }}
            />
          </div>
          <div className="w-14 text-red-400 flex-shrink-0">
            {direGold.toLocaleString()}
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <div className="w-14 text-green-400 text-right flex-shrink-0">
            +{(radiant.reduce((s, p) => s + p.xpDiff, 0)).toLocaleString()}
          </div>
          <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-500"
              style={{ width: `${Math.min(100, (radiant.reduce((s, p) => s + p.xpDiff, 0) / (radiant.reduce((s, p) => s + p.xpDiff, 0) + Math.abs(dire.reduce((s, p) => s + p.xpDiff, 0)) + 1)) * 100)}%` }}
            />
          </div>
          <div className="w-14 text-red-400 flex-shrink-0">
            {(dire.reduce((s, p) => s + p.xpDiff, 0)).toLocaleString()}
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

  // Group players by lane
  const radiantByLane: Record<number, Player[]> = { 1: [], 2: [], 3: [] };
  const direByLane: Record<number, Player[]> = { 1: [], 2: [], 3: [] };

  radiantPlayers.forEach(p => {
    const lane = p.lane || 1;
    if (radiantByLane[lane]) radiantByLane[lane].push(p);
  });

  direPlayers.forEach(p => {
    const lane = p.lane || 1;
    if (direByLane[lane]) direByLane[lane].push(p);
  });

  // lane 1 = safe lane (from team's perspective)
  // lane 2 = mid
  // lane 3 = offlane
  
  // Matchup: Radiant safe vs Dire off, Radiant off vs Dire safe, Mid vs Mid
  const matchups = [
    { rLane: 1, dLane: 3, name: '优势路 vs 劣势路' },
    { rLane: 2, dLane: 2, name: '中路 vs 中路' },
    { rLane: 3, dLane: 1, name: '劣势路 vs 优势路' },
  ];

  for (const matchup of matchups) {
    const rPlayers = radiantByLane[matchup.rLane] || [];
    const dPlayers = direByLane[matchup.dLane] || [];
    
    if (rPlayers.length > 0 && dPlayers.length > 0) {
      const radiantData = rPlayers.map(p => ({
        player: p,
        goldDiff: getValueAtMinute(p.gold_t, minute),
        xpDiff: getValueAtMinute(p.xp_t, minute),
        lh: getValueAtMinute(p.lh_t, minute),
        dn: getValueAtMinute(p.dn_t, minute),
      }));
      
      const direData = dPlayers.map(p => ({
        player: p,
        goldDiff: getValueAtMinute(p.gold_t, minute),
        xpDiff: getValueAtMinute(p.xp_t, minute),
        lh: getValueAtMinute(p.lh_t, minute),
        dn: getValueAtMinute(p.dn_t, minute),
      }));
      
      const rTotalGold = radiantData.reduce((s, p) => s + p.goldDiff, 0);
      const dTotalGold = direData.reduce((s, p) => s + p.goldDiff, 0);
      
      result.lanes.push({
        name: matchup.name,
        radiant: radiantData,
        dire: direData,
        advantage: rTotalGold > dTotalGold ? 'radiant' : dTotalGold > rTotalGold ? 'dire' : 'even',
      });
    } else if (rPlayers.length > 0) {
      // Solo lane
      const radiantData = rPlayers.map(p => ({
        player: p,
        goldDiff: getValueAtMinute(p.gold_t, minute),
        xpDiff: getValueAtMinute(p.xp_t, minute),
        lh: getValueAtMinute(p.lh_t, minute),
        dn: getValueAtMinute(p.dn_t, minute),
      }));
      
      result.lanes.push({
        name: matchup.name,
        radiant: radiantData,
        dire: [],
        advantage: 'radiant',
      });
    } else if (dPlayers.length > 0) {
      const direData = dPlayers.map(p => ({
        player: p,
        goldDiff: getValueAtMinute(p.gold_t, minute),
        xpDiff: getValueAtMinute(p.xp_t, minute),
        lh: getValueAtMinute(p.lh_t, minute),
        dn: getValueAtMinute(p.dn_t, minute),
      }));
      
      result.lanes.push({
        name: matchup.name,
        radiant: [],
        dire: direData,
        advantage: 'dire',
      });
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
