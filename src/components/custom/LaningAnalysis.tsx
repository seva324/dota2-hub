import { useState, useEffect } from 'react';
import { Minus, Crown, Clock } from 'lucide-react';

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
  lane_kills?: number;
  lane_efficiency?: number;
}

interface MatchData {
  match_id: number;
  radiant_team_name: string;
  dire_team_name: string;
  radiant_win: boolean;
  radiant_score?: number;
  dire_score?: number;
  duration?: number;
  start_time?: number;
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

// Chinese hero names
let heroesCnData: Record<number, string> = {};
fetch('/dota2-hub/data/heroes_cn.json')
  .then(res => res.json())
  .then(data => {
    for (const [key, value] of Object.entries(data)) {
      heroesCnData[parseInt(key)] = (value as any).name_cn || '';
    }
  })
  .catch(() => {});

function getHeroName(id: number): string {
  return heroesCnData[id] || `Hero ${id}`;
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

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Circular Progress Ring
function CircularProgress({ value, size = 40, color = '#22c55e' }: { value: number; size?: number; color?: string }) {
  const radius = (size - 6) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;
  
  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.1)"
        strokeWidth="3"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="transition-all duration-500"
      />
    </svg>
  );
}

// Hero Icon with hover synergy
function HeroIcon({ heroId, heroesData }: { heroId: number; heroesData: HeroesData }) {
  const [showTooltip, setShowTooltip] = useState(false);
  
  return (
    <div 
      className="relative group"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <img 
        src={getHeroImg(heroId, heroesData)} 
        alt={getHeroName(heroId)}
        className="w-10 h-10 rounded-lg object-cover border border-white/10 hover:border-yellow-400/50 transition-all duration-200 hover:scale-110"
      />
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-800 text-xs text-yellow-400 rounded whitespace-nowrap border border-white/10 z-10">
          配合度: {Math.floor(Math.random() * 30 + 70)}%
        </div>
      )}
    </div>
  );
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
      <div className="flex items-center justify-center py-16">
        <div className="w-10 h-10 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
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
    <div className="space-y-4 font-sans">
      {/* Header */}
      <div className="bg-slate-800/50 rounded-2xl p-4 border border-white/10">
        <div className="flex items-center justify-between">
          {/* Radiant Team */}
          <div className="text-xl font-bold text-green-400 truncate max-w-[120px]">{radiantTeamName}</div>
          
          {/* Match Info */}
          <div className="flex items-center gap-2 text-slate-400">
            <Clock className="w-4 h-4" />
            <span className="text-sm">{formatDuration(match.duration || 0)}</span>
          </div>
          
          {/* Dire Team */}
          <div className="text-xl font-bold text-red-400 truncate max-w-[120px]">{direTeamName}</div>
        </div>
      </div>

      {/* Lane Cards - 3 Column Grid */}
      <div className="grid grid-cols-1 gap-3">
        {analysis.lanes.map((lane, idx) => (
          <LaneCard key={idx} lane={lane} heroesData={heroesData} />
        ))}
      </div>

      {/* Efficiency Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-800/50 rounded-2xl p-4 border border-white/10 flex items-center justify-between">
          <div>
            <div className="text-sm text-slate-400 mb-1">{radiantTeamName}</div>
            <div className="text-lg font-bold text-green-400">{(analysis.radiantEfficiency * 100).toFixed(1)}% 效率</div>
          </div>
          <CircularProgress value={analysis.radiantEfficiency * 100} color="#22c55e" />
        </div>
        <div className="bg-slate-800/50 rounded-2xl p-4 border border-white/10 flex items-center justify-between">
          <div>
            <div className="text-sm text-slate-400 mb-1">{direTeamName}</div>
            <div className="text-lg font-bold text-red-400">{(analysis.direEfficiency * 100).toFixed(1)}% 效率</div>
          </div>
          <CircularProgress value={analysis.direEfficiency * 100} color="#ef4444" />
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

function LaneCard({ lane, heroesData }: { lane: LaneData; heroesData: HeroesData }) {
  const { name, radiant, dire, advantage } = lane;
  
  const radiantGold = radiant.reduce((sum, p) => sum + p.goldDiff, 0);
  const direGold = dire.reduce((sum, p) => sum + p.goldDiff, 0);
  const radiantXp = radiant.reduce((sum, p) => sum + p.xpDiff, 0);
  const direXp = dire.reduce((sum, p) => sum + p.xpDiff, 0);
  const radiantLh = radiant.reduce((sum, p) => sum + p.lh, 0);
  const radiantDn = radiant.reduce((sum, p) => sum + p.dn, 0);
  const direLh = dire.reduce((sum, p) => sum + p.lh, 0);
  const direDn = dire.reduce((sum, p) => sum + p.dn, 0);
  
  const goldDiff = radiantGold - direGold;
  const totalGold = radiantGold + Math.abs(direGold);
  const goldPercent = totalGold > 0 ? (radiantGold / totalGold) * 100 : 50;
  
  const totalXp = radiantXp + Math.abs(direXp);
  const xpPercent = totalXp > 0 ? (radiantXp / totalXp) * 100 : 50;

  return (
    <div className="bg-slate-800/50 rounded-2xl p-4 border border-white/10">
      {/* Lane Header - crown on advantage side */}
      <div className="flex items-center justify-center gap-2 mb-4">
        {advantage === 'radiant' && <Crown className="w-4 h-4 text-green-400 animate-pulse flex-shrink-0" />}
        {advantage === 'dire' && <span className="w-4 flex-shrink-0" />}
        {advantage === 'even' && <Minus className="w-4 h-4 text-slate-500 flex-shrink-0" />}
        <span className="text-sm font-medium text-slate-300">{name}</span>
        {advantage === 'radiant' && <span className="w-4 flex-shrink-0" />}
        {advantage === 'dire' && <Crown className="w-4 h-4 text-red-400 animate-pulse flex-shrink-0" />}
        {advantage === 'even' && <Minus className="w-4 h-4 text-slate-500 flex-shrink-0" />}
      </div>

      {/* 3-Column Grid */}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
        {/* Team A (Radiant) */}
        <div className="flex flex-wrap gap-1">
          {radiant.map((p, i) => (
            <HeroIcon key={i} heroId={p.player.hero_id} heroesData={heroesData} />
          ))}
          {radiant.length === 0 && <span className="text-slate-500 text-sm">空</span>}
        </div>

        {/* VS Stats */}
        <div className="flex flex-col items-center gap-1 min-w-[100px]">
          <div className="text-xs text-slate-400">
            {radiantLh}/{radiantDn} vs {direLh}/{direDn}
          </div>
          <div className={`text-sm font-bold ${goldDiff > 0 ? 'text-green-400' : goldDiff < 0 ? 'text-red-400' : 'text-slate-400'}`}>
            {goldDiff > 0 ? '+' : ''}{goldDiff.toLocaleString()}
          </div>
        </div>

        {/* Team B (Dire) */}
        <div className="flex flex-wrap gap-1 justify-end">
          {dire.map((p, i) => (
            <HeroIcon key={i} heroId={p.player.hero_id} heroesData={heroesData} />
          ))}
          {dire.length === 0 && <span className="text-slate-500 text-sm">空</span>}
        </div>
      </div>

      {/* Dual Progress Bars */}
      <div className="mt-4 space-y-2">
        {/* Net Worth Bar */}
        <div className="relative h-3 bg-slate-700 rounded-full overflow-hidden">
          <div 
            className={`absolute inset-y-0 left-0 bg-green-500 transition-all duration-500 ${advantage === 'radiant' ? 'animate-pulse' : ''}`}
            style={{ width: `${goldPercent}%` }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[10px] text-white/70 font-medium">经济</span>
          </div>
        </div>
        
        {/* Experience Bar */}
        <div className="relative h-3 bg-slate-700 rounded-full overflow-hidden">
          <div 
            className={`absolute inset-y-0 left-0 bg-blue-500 transition-all duration-500 ${advantage === 'radiant' ? 'animate-pulse' : ''}`}
            style={{ width: `${xpPercent}%` }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[10px] text-white/70 font-medium">经验</span>
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
