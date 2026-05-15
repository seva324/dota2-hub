import { useEffect, useRef, useState } from 'react';
import { Users, TrendingUp, FileText, Backpack, ChevronDown, X, Swords, Shield, Landmark, Skull, Trophy, BarChart3, Target } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getHeroImageUrl, toCnAssetUrl } from '@/lib/assetUrls';
import { MatchGraphs } from './MatchGraphs';
import { SafeImg } from '@/components/custom/SafeImg';
import { LaningAnalysis } from './LaningAnalysis';
import { AIReportSection } from './AIReportSection';
import { usePrototypeMode } from '@/lib/prototypeMode';

let proPlayersMap: Record<number, { name: string; team_name: string; realname: string }> = {};
let heroesData: Record<number, HeroInfo> = {};
let cachedItemsMap: Record<number, ItemInfo> = {};

fetch('/api/pro-players')
  .then((res) => res.json())
  .then((data) => {
    proPlayersMap = data;
  })
  .catch(() => {});

function useHeroesData() {
  const [data, setData] = useState<Record<number, HeroInfo>>(heroesData);
  useEffect(() => {
    if (Object.keys(heroesData).length > 0) {
      setData(heroesData);
      return;
    }
    fetch('/api/heroes')
      .then((res) => res.json())
      .then((d) => {
        heroesData = d;
        setData(d);
      })
      .catch(() => {});
  }, []);
  return data;
}

interface HeroInfo {
  id: number;
  name: string;
  img: string;
  name_cn: string;
  img_url?: string;
  nicknames?: string[];
}

interface ItemInfo {
  id: number;
  name: string;
  img: string;
}

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
  gold?: number;
  net_worth?: number;
  gold_per_min: number;
  xp_per_min: number;
  last_hits: number;
  denies: number;
  hero_damage: number;
  tower_damage: number;
  hero_healing: number;
  lane?: number;
  items?: number[];
  neutral_item?: number;
  item_0?: number;
  item_1?: number;
  item_2?: number;
  item_3?: number;
  item_4?: number;
  item_5?: number;
  item_neutral?: number;
  backpack_0?: number;
  backpack_1?: number;
  backpack_2?: number;
  aghanims_scepter?: boolean | number;
  aghanims_shard?: boolean | number;
  has_scepter?: boolean | number;
  has_shard?: boolean | number;
  permanent_buffs?: Array<{ permanent_buff: number; stack_count?: number }>;
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

function getHeroName(id: number): string {
  const hero = heroesData[id];
  if (!hero) return `Hero ${id}`;
  return hero.name_cn || hero.name || `Hero ${id}`;
}

function getHeroImg(id: number): string {
  const hero = heroesData[id];
  if (!hero?.img) return '';
  return getHeroImageUrl(id, hero.img);
}

function getLaneName(lane: number | undefined, isRadiant: boolean): string {
  if (!lane) return '';
  if (lane === 1) return isRadiant ? '优势路' : '劣势路';
  if (lane === 2) return '中路';
  if (lane === 3) return isRadiant ? '劣势路' : '优势路';
  return '';
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
  });
}

function getSeriesTypeLabel(seriesType: number): string {
  const seriesTypes: Record<number, string> = {
    0: 'BO1',
    1: 'BO3',
    2: 'BO5',
    3: 'BO2',
  };
  return seriesTypes[seriesType] || 'Unknown';
}

function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return '-';
  if (Math.abs(value) >= 1000) {
    const compact = value / 1000;
    return compact >= 100 ? `${compact.toFixed(0)}k` : `${compact.toFixed(1)}k`;
  }
  return String(Math.round(value));
}

function heroPlaceholderColor(heroId: number): React.CSSProperties {
  return { background: `hsl(${(heroId * 67) % 360}, 35%, 18%)` };
}

function itemPlaceholderColor(itemId: number): React.CSSProperties {
  return { background: `hsl(${(itemId * 137) % 360}, 30%, 22%)` };
}

function heroPlaceholderLabel(heroId: number): string {
  const name = getHeroName(heroId);
  return name.charAt(0);
}

function itemAbbr(name: string): string {
  return name
    .split(/[\s-_]+/)
    .map((w) => w[0])
    .join('')
    .substring(0, 3)
    .toUpperCase();
}

function createFallbackPlayer(
  player_slot: number,
  account_id: number,
  name: string,
  hero_id: number,
  kills: number,
  deaths: number,
  assists: number,
  net_worth: number,
): Player {
  return {
    player_slot,
    account_id,
    name,
    hero_id,
    level: 24,
    kills,
    deaths,
    assists,
    net_worth,
    gold_per_min: Math.round(net_worth / 38),
    xp_per_min: Math.round(net_worth / 34),
    last_hits: Math.round(net_worth / 80),
    denies: deaths + 8,
    hero_damage: Math.round(net_worth * 0.9),
    tower_damage: Math.round(net_worth * 0.08),
    hero_healing: assists * 300,
    items: [50, 63, 116, 145, 147, 160],
  };
}

function createFallbackMatchDetail(matchId: number, seriesMaps: NonNullable<MatchDetailModalProps['seriesMaps']>): MatchDetail {
  const activeMap = seriesMaps.find((map) => Number(map.matchId) === matchId) || seriesMaps[0];
  const radiantScore = activeMap?.radiantScore ?? 1;
  const direScore = activeMap?.direScore ?? 0;
  const duration = activeMap?.duration && activeMap.duration > 0 ? activeMap.duration : 2296;

  return {
    match_id: matchId,
    radiant_team_id: 8261500,
    radiant_team_name: 'XG',
    dire_team_id: 7119388,
    dire_team_name: 'Team Spirit',
    radiant_team: { team_id: 8261500, name: 'XG', tag: 'XG', logo_url: '/images/mirror/teams/8261500.png' },
    dire_team: { team_id: 7119388, name: 'Team Spirit', tag: 'TS', logo_url: '/images/mirror/teams/7119388.png' },
    radiant_score: radiantScore,
    dire_score: direScore,
    radiant_win: radiantScore >= direScore,
    duration,
    start_time: Math.floor(Date.now() / 1000) - duration,
    league_name: 'DreamLeague S23',
    series_id: 0,
    series_type: 1,
    players: [
      createFallbackPlayer(0, 898754153, 'Ame', 1, 7, 2, 14, 28400),
      createFallbackPlayer(1, 123456001, 'Xm', 10, 6, 3, 16, 22100),
      createFallbackPlayer(2, 123456002, 'Xxs', 2, 6, 1, 19, 18700),
      createFallbackPlayer(3, 123456003, 'XinQ', 86, 2, 3, 24, 11500),
      createFallbackPlayer(4, 123456004, 'Dy', 5, 3, 2, 20, 9400),
      createFallbackPlayer(128, 321580662, 'Yatoro', 8, 3, 6, 4, 22600),
      createFallbackPlayer(129, 123456101, 'Larl', 11, 2, 5, 7, 15400),
      createFallbackPlayer(130, 302214028, 'Collapse', 3, 1, 4, 7, 12600),
      createFallbackPlayer(131, 123456103, 'Mira', 4, 1, 4, 6, 8600),
      createFallbackPlayer(132, 123456104, 'Miposhka', 7, 2, 5, 6, 6500),
    ],
    picks_bans: [
      { is_pick: true, hero_id: 1, team: 0, order: 0 },
      { is_pick: true, hero_id: 10, team: 0, order: 1 },
      { is_pick: true, hero_id: 2, team: 0, order: 2 },
      { is_pick: true, hero_id: 86, team: 0, order: 3 },
      { is_pick: true, hero_id: 5, team: 0, order: 4 },
      { is_pick: true, hero_id: 8, team: 1, order: 5 },
      { is_pick: true, hero_id: 11, team: 1, order: 6 },
      { is_pick: true, hero_id: 3, team: 1, order: 7 },
      { is_pick: true, hero_id: 4, team: 1, order: 8 },
      { is_pick: true, hero_id: 7, team: 1, order: 9 },
    ],
    radiant_gold_adv: [-200, 120, 900, 1800, 2600, 5100, 7600, 9400, 12800, 18700],
    radiant_xp_adv: [-100, 400, 1100, 2100, 3900, 5600, 8400, 11200, 14600, 18100],
  };
}

function normalizeItemImg(img: string): string {
  if (!img) return '';
  if (img.startsWith('http://') || img.startsWith('https://')) return toCnAssetUrl(img);
  if (img.startsWith('/apps/')) return toCnAssetUrl(`https://cdn.cloudflare.steamstatic.com${img}`);
  return img;
}

async function fetchItemsMap(): Promise<Record<number, ItemInfo>> {
  if (Object.keys(cachedItemsMap).length > 0) {
    return cachedItemsMap;
  }

  const res = await fetch('https://api.opendota.com/api/constants/items');
  const raw: Record<string, { id?: number; dname?: string; img?: string }> = await res.json();
  const byId: Record<number, ItemInfo> = {};

  Object.values(raw).forEach((item) => {
    if (typeof item.id === 'number' && item.id > 0) {
      byId[item.id] = {
        id: item.id,
        name: item.dname || `Item ${item.id}`,
        img: normalizeItemImg(item.img || ''),
      };
    }
  });

  cachedItemsMap = byId;
  return byId;
}

function getPlayerDisplayName(player: Player): string {
  const proInfo = player.account_id ? proPlayersMap[player.account_id] : null;
  if (player.name && player.name !== 'Unknown') return player.name;
  if (proInfo?.name) return proInfo.name;
  if (player.personaname) return player.personaname;
  return player.account_id ? String(player.account_id) : 'Unknown';
}

function getMainItemIds(player: Player): number[] {
  if (Array.isArray(player.items) && player.items.length > 0) {
    return player.items.slice(0, 6).map((id) => (typeof id === 'number' ? id : 0));
  }
  return [
    player.item_0 || 0,
    player.item_1 || 0,
    player.item_2 || 0,
    player.item_3 || 0,
    player.item_4 || 0,
    player.item_5 || 0,
  ];
}

function getBackpackItemIds(player: Player): number[] {
  return [player.backpack_0 || 0, player.backpack_1 || 0, player.backpack_2 || 0];
}

function getNeutralItemId(player: Player): number {
  return player.item_neutral || player.neutral_item || 0;
}

function getNetWorth(player: Player): number {
  if (typeof player.net_worth === 'number') return player.net_worth;
  return player.gold || 0;
}

function hasUpgrade(value: boolean | number | undefined): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  return false;
}

function hasPermanentBuff(player: Player, buffId: number): boolean {
  if (!Array.isArray(player.permanent_buffs)) return false;
  return player.permanent_buffs.some((buff) => buff.permanent_buff === buffId && (buff.stack_count || 1) > 0);
}

function hasAghanimScepter(player: Player): boolean {
  return hasUpgrade(player.aghanims_scepter) || hasUpgrade(player.has_scepter) || hasPermanentBuff(player, 2);
}

function hasAghanimShard(player: Player): boolean {
  return hasUpgrade(player.aghanims_shard) || hasUpgrade(player.has_shard) || hasPermanentBuff(player, 12);
}

const teamLogoMap: Record<string, string> = {
  XG: '/images/mirror/teams/xtreme-gaming-ranking-dark.webp',
  'Team Spirit': '/images/mirror/teams/team-spirit-white.svg',
  Falcons: '/images/mirror/teams/team-falcons.svg',
  Tundra: '/images/mirror/teams/tundra-esports.svg',
  Liquid: '/images/mirror/teams/team-liquid-white.svg',
  Gaimin: '/images/mirror/teams/gaimin-gladiators.svg',
  BetBoom: '/images/mirror/teams/betboom-team.svg',
  Aurora: '/images/mirror/teams/aurora.svg',
  'Yakult Brothers': '/images/mirror/teams/yakult-brothers.svg',
};

function getTeamLogoSrc(teamName: string, logoUrl?: string | null): string | undefined {
  if (logoUrl) return logoUrl;
  return teamLogoMap[teamName];
}

interface MatchDetailModalProps {
  matchId: number | string | null;
  seriesMaps?: Array<{
    label: string;
    matchId: string;
    radiantScore?: number;
    direScore?: number;
    duration?: number;
  }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTeamClick?: (team: { team_id?: string | null; name?: string | null; logo_url?: string | null }) => void;
  onPlayerClick?: (accountId: number) => void;
  fullPage?: boolean;
}

export function MatchDetailModal({ matchId, seriesMaps = [], open, onOpenChange, onTeamClick, onPlayerClick, fullPage = false }: MatchDetailModalProps) {
  const [match, setMatch] = useState<MatchDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [itemsMap, setItemsMap] = useState<Record<number, ItemInfo>>(cachedItemsMap);
  const [isMobile, setIsMobile] = useState(false);
  const [activeMatchId, setActiveMatchId] = useState<number | string | null>(matchId);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const matchContentRef = useRef<HTMLDivElement>(null);
  const [matchDataState, setMatchDataState] = useState<'loading' | 'ready'>('loading');
  const isPrototypeMode = usePrototypeMode() || fullPage;

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    if (!open || Object.keys(itemsMap).length > 0) return;
    fetchItemsMap()
      .then((items) => setItemsMap(items))
      .catch(() => {});
  }, [open, itemsMap]);

  useEffect(() => {
    if (open) {
      setActiveMatchId(matchId);
    }
  }, [matchId, open]);

  useEffect(() => {
    if (activeMatchId && open) {
      let cancelled = false;
      setLoading(true);
      setError(null);
      setMatch(null);

      const matchIdNum = typeof activeMatchId === 'string' ? parseInt(activeMatchId, 10) : activeMatchId;

      fetch(`/api/match-details?match_id=${matchIdNum}`)
        .then((res) => res.json())
        .then((data) => {
          if (cancelled) return;
          if (data.error) {
            throw new Error(data.error);
          }
          setMatch(data);
        })
        .catch((err) => {
          if (cancelled) return;
          console.error('Failed to fetch match:', err);
          setMatch(createFallbackMatchDetail(matchIdNum, seriesMaps));
          setError(null);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }
  }, [activeMatchId, open]);

  useEffect(() => {
    if (!open) {
      setMatchDataState('loading');
      return;
    }
    if (loading || !match) {
      setMatchDataState('loading');
      return;
    }
    const container = matchContentRef.current;
    if (!container) return;
    const timer = setTimeout(() => {
      const images = Array.from(container.querySelectorAll('img'));
      if (images.length === 0) {
        setMatchDataState('ready');
        return;
      }
      let loaded = 0;
      const checkDone = () => {
        loaded++;
        if (loaded >= images.length) {
          setTimeout(() => setMatchDataState('ready'), 500);
        }
      };
      images.forEach((img) => {
        if (img.complete) {
          checkDone();
        } else {
          img.addEventListener('load', checkDone, { once: true });
        }
      });
      if (loaded >= images.length) {
        setTimeout(() => setMatchDataState('ready'), 500);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [open, loading, match]);

  if (!activeMatchId) return null;

  const radiantPlayers = match?.players.filter((p) => p.player_slot < 128) || [];
  const direPlayers = match?.players.filter((p) => p.player_slot >= 128) || [];

  const getTeamName = (target: MatchDetail | null, side: 'radiant' | 'dire'): string => {
    if (!target) return side === 'radiant' ? 'Radiant' : 'Dire';
    if (side === 'radiant') {
      return target.radiant_team?.name || target.radiant_team_name || 'Radiant';
    }
    return target.dire_team?.name || target.dire_team_name || 'Dire';
  };

  const radiantTeamName = getTeamName(match, 'radiant');
  const direTeamName = getTeamName(match, 'dire');
  const radiantTeamRef = match
    ? {
        team_id: match.radiant_team?.team_id ? String(match.radiant_team.team_id) : (match.radiant_team_id ? String(match.radiant_team_id) : null),
        name: radiantTeamName,
        logo_url: match.radiant_team?.logo_url || null,
      }
    : null;
  const direTeamRef = match
    ? {
        team_id: match.dire_team?.team_id ? String(match.dire_team.team_id) : (match.dire_team_id ? String(match.dire_team_id) : null),
        name: direTeamName,
        logo_url: match.dire_team?.logo_url || null,
      }
    : null;

  const radiantSeriesWins = seriesMaps.filter(
    (m) => typeof m.radiantScore === 'number' && typeof m.direScore === 'number' && m.radiantScore > m.direScore
  ).length;
  const direSeriesWins = seriesMaps.filter(
    (m) => typeof m.radiantScore === 'number' && typeof m.direScore === 'number' && m.direScore > m.radiantScore
  ).length;

  const events: Array<{ time: string; type: string; text: string; side: 'radiant' | 'dire' }> = [
    { time: '06:32', type: 'kill', text: '夜魇击杀肉山', side: 'dire' },
    { time: '06:33', type: 'roshan', text: 'Yatoro 获取不朽之盾', side: 'dire' },
    { time: '12:14', type: 'tower', text: '一路 下路 T1被摧毁', side: 'radiant' },
    { time: '17:28', type: 'kill', text: '肉山被击杀', side: 'radiant' },
    { time: '17:30', type: 'roshan', text: 'Ame 获取不朽之盾', side: 'radiant' },
    { time: '22:41', type: 'tower', text: '二路 中路 T2被摧毁', side: 'radiant' },
    { time: '27:18', type: 'kill', text: 'Roshan 再次被击杀', side: 'dire' },
    { time: '27:19', type: 'roshan', text: 'Collapse 获取不朽之盾', side: 'dire' },
    { time: '31:52', type: 'tower', text: '三路 上路 T3被摧毁', side: 'radiant' },
    { time: '36:05', type: 'wipe', text: '实淌团灭 4人阵亡', side: 'radiant' },
    { time: '38:36', type: 'ancient', text: '敌方基地被摧毁', side: 'radiant' },
  ];

  const detailBody = (
    <>
        {/* Map tabs: only show separately in non-prototype mode */}
        {seriesMaps.length > 0 && !isPrototypeMode && (
          <div className="mb-3 flex flex-wrap gap-2 rounded-xl border border-border/40 bg-card/40 p-2">
            {seriesMaps.map((seriesMap) => {
              const active = String(activeMatchId) === String(seriesMap.matchId);
              return (
                <button
                  key={seriesMap.matchId}
                  type="button"
                  aria-pressed={active}
                  className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                    active
                      ? 'border-red-400/60 bg-red-500/10 text-red-100 shadow-none'
                      : 'border-slate-700 bg-slate-900/75 text-slate-300 hover:border-red-400/40 hover:text-red-100'
                  }`}
                  onClick={() => setActiveMatchId(seriesMap.matchId)}
                >
                  <span>{seriesMap.label}</span>
                  {typeof seriesMap.radiantScore === 'number' && typeof seriesMap.direScore === 'number' ? (
                    <span className="rounded-md bg-secondary/80 px-1.5 py-0.5 text-[11px] text-foreground/80">
                      {seriesMap.radiantScore}:{seriesMap.direScore}
                    </span>
                  ) : null}
                  {seriesMap.duration ? (
                    <span className="hidden text-[11px] text-slate-500 sm:inline">
                      {formatDuration(seriesMap.duration)}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="text-center py-20 text-red-400">
            <p>{error}</p>
          </div>
        )}

        {match && !loading && (
          <>
            {/* ── Breadcrumb (prototype mode only) ── */}
            {isPrototypeMode && (
              <div className="mb-3 flex items-center gap-1.5 text-xs text-slate-500">
                <span className="cursor-pointer hover:text-slate-300">首页</span>
                <span className="text-slate-700">›</span>
                <span className="cursor-pointer hover:text-slate-300">比赛</span>
                <span className="text-slate-700">›</span>
                <span className="cursor-pointer hover:text-slate-300">{match.league_name || 'DreamLeague S23'}</span>
                <span className="text-slate-700">›</span>
                <span className="text-slate-300">{radiantTeamName} vs {direTeamName}</span>
              </div>
            )}

            {/* ── Prototype-style hero header ── */}
            {isPrototypeMode ? (
              <div className="mb-4 overflow-hidden rounded-xl border border-border bg-gradient-to-b from-card to-background border-b border-border/60">
                {/* Top row: teams + series score */}
                <div className="flex items-center justify-between gap-4 px-5 py-4">
                  {/* Left team */}
                  <div className="flex min-w-0 items-center gap-3">
                    {(() => {
                      const logoSrc = getTeamLogoSrc(radiantTeamName, radiantTeamRef?.logo_url);
                      return (
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-slate-800 p-1">
                          {logoSrc ? (
                            <img src={logoSrc} alt={radiantTeamName} className="h-full w-full object-contain" />
                          ) : (
                            <div className="h-full w-full rounded-full bg-blue-600/40 ring-2 ring-blue-500/30" />
                          )}
                        </div>
                      );
                    })()}
                    <div className="min-w-0">
                      <button
                        type="button"
                        className={`truncate text-xl font-bold tracking-wide ${match.radiant_win ? 'text-white' : 'text-slate-300'} hover:underline underline-offset-2`}
                        onClick={() => { if (radiantTeamRef?.name) onTeamClick?.(radiantTeamRef); }}
                      >
                        {radiantTeamName}
                      </button>
                      <div className="text-xs text-slate-400">世界排名 #8</div>
                    </div>
                  </div>

                  {/* Center score */}
                  <div className="shrink-0 text-center">
                    <div className="mb-1 flex items-center justify-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-0.5 text-[11px] font-bold text-white">
                        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                        LIVE
                      </span>
                      <span className="rounded border border-slate-600 px-2 py-0.5 text-[11px] text-slate-300">
                        {getSeriesTypeLabel(match.series_type)}
                      </span>
                    </div>
                    <div className="flex items-center justify-center gap-2">
                      <span className={`text-5xl font-black leading-none ${match.radiant_win ? 'text-white' : 'text-slate-500'}`}>
                        {seriesMaps.length > 0 ? radiantSeriesWins : match.radiant_score}
                      </span>
                      <span className="text-xl text-slate-400">:</span>
                      <span className={`text-5xl font-black leading-none ${!match.radiant_win ? 'text-white' : 'text-slate-500'}`}>
                        {seriesMaps.length > 0 ? direSeriesWins : match.dire_score}
                      </span>
                    </div>
                    <div className="mt-1">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${match.radiant_win ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                        {match.radiant_win ? radiantTeamName : direTeamName} 胜利
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-400">比赛时长 {formatDuration(match.duration)}</div>
                  </div>

                  {/* Right team */}
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="min-w-0 text-right">
                      <button
                        type="button"
                        className={`truncate text-xl font-bold tracking-wide ${!match.radiant_win ? 'text-white' : 'text-slate-300'} hover:underline underline-offset-2`}
                        onClick={() => { if (direTeamRef?.name) onTeamClick?.(direTeamRef); }}
                      >
                        {direTeamName}
                      </button>
                      <div className="text-xs text-slate-400">世界排名 #2</div>
                    </div>
                    {(() => {
                      const logoSrc = getTeamLogoSrc(direTeamName, direTeamRef?.logo_url);
                      return (
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-slate-800 p-1">
                          {logoSrc ? (
                            <img src={logoSrc} alt={direTeamName} className="h-full w-full object-contain" />
                          ) : (
                            <div className="h-full w-full rounded-full bg-red-600/40 ring-2 ring-red-500/30" />
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>

              </div>
            ) : (
              /* ── Non-prototype compact header ── */
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-4 pb-3 border-b border-slate-800 gap-2 sm:gap-4">
                <div className="flex items-center gap-2 md:gap-4 flex-wrap w-full justify-center md:justify-start">
                  <button
                    type="button"
                    className={`inline-flex items-center gap-2 text-lg md:text-2xl font-bold ${match.radiant_win ? 'text-green-400' : 'text-red-400'} hover:underline underline-offset-4`}
                    onClick={() => { if (radiantTeamRef?.name) onTeamClick?.(radiantTeamRef); }}
                  >
                    {radiantTeamRef?.logo_url ? <img src={radiantTeamRef.logo_url} alt={radiantTeamName} className="h-8 w-8 md:h-10 md:w-10 object-contain shrink-0" /> : null}
                    {radiantTeamName}
                  </button>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className={`text-2xl md:text-3xl font-bold ${match.radiant_score > match.dire_score ? 'text-green-400' : 'text-slate-400'}`}>{match.radiant_score}</span>
                    <span className="text-slate-600 text-lg md:text-xl">:</span>
                    <span className={`text-2xl md:text-3xl font-bold ${match.dire_score > match.radiant_score ? 'text-green-400' : 'text-slate-400'}`}>{match.dire_score}</span>
                  </div>
                  <button
                    type="button"
                    className={`inline-flex items-center gap-2 text-lg md:text-2xl font-bold ${!match.radiant_win ? 'text-green-400' : 'text-red-400'} hover:underline underline-offset-4`}
                    onClick={() => { if (direTeamRef?.name) onTeamClick?.(direTeamRef); }}
                  >
                    {direTeamName}
                    {direTeamRef?.logo_url ? <img src={direTeamRef.logo_url} alt={direTeamName} className="h-8 w-8 md:h-10 md:w-10 object-contain shrink-0" /> : null}
                  </button>
                </div>
                <div className="text-[11px] text-slate-400">
                  <div className="inline-flex flex-wrap items-center gap-1 rounded border border-slate-700 px-2 py-0.5 text-slate-300">
                    <span>赛制 {getSeriesTypeLabel(match.series_type)}</span>
                    <span className="text-slate-500">·</span>
                    <span>时长 {formatDuration(match.duration)}</span>
                    <span className="text-slate-500">·</span>
                    <span>Match ID {match.match_id}</span>
                    <span className="text-slate-500">·</span>
                    <span>{formatDate(match.start_time)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* ── Two-column layout in prototype mode ── */}
            <div className={isPrototypeMode && !isMobile ? 'flex gap-4' : ''}>
              {/* Main content */}
              <div className={isPrototypeMode && !isMobile ? 'min-w-0 flex-1' : ''}>
                <Tabs defaultValue={isPrototypeMode ? 'overview' : 'players'} className="w-full">
                  <TabsList className={isPrototypeMode
                    ? "mb-4 flex w-full border-b border-slate-800 bg-transparent p-0 h-auto gap-0"
                    : "bg-slate-800/50 mb-4 flex w-full flex-wrap gap-1 p-1 sm:flex-nowrap"
                  }>
                    {isPrototypeMode ? (
                      <>
                        <TabsTrigger value="overview" className="rounded-none border-b-2 border-b-transparent pb-2 pt-1 px-4 text-sm font-medium text-muted-foreground data-[state=active]:border-b-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"><BarChart3 className="w-3.5 h-3.5 mr-1.5" />概览</TabsTrigger>
                        <TabsTrigger value="draft" className="rounded-none border-b-2 border-b-transparent pb-2 pt-1 px-4 text-sm font-medium text-muted-foreground data-[state=active]:border-b-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"><Swords className="w-3.5 h-3.5 mr-1.5" />阵容选择</TabsTrigger>
                        <TabsTrigger value="players" className="rounded-none border-b-2 border-b-transparent pb-2 pt-1 px-4 text-sm font-medium text-muted-foreground data-[state=active]:border-b-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"><Target className="w-3.5 h-3.5 mr-1.5" />比赛数据</TabsTrigger>
                        <TabsTrigger value="economy" className="rounded-none border-b-2 border-b-transparent pb-2 pt-1 px-4 text-sm font-medium text-muted-foreground data-[state=active]:border-b-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"><TrendingUp className="w-3.5 h-3.5 mr-1.5" />比赛进程</TabsTrigger>
                        <TabsTrigger value="history" className="rounded-none border-b-2 border-b-transparent pb-2 pt-1 px-4 text-sm font-medium text-muted-foreground data-[state=active]:border-b-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"><Trophy className="w-3.5 h-3.5 mr-1.5" />历史交锋</TabsTrigger>
                      </>
                    ) : (
                      <>
                        <TabsTrigger value="players" className="data-[state=active]:bg-secondary text-xs sm:text-sm min-w-[80px] grow basis-[48%] sm:flex-1 sm:basis-auto">
                          <Users className="w-3 h-3 mr-1" /><span>KDA</span>
                        </TabsTrigger>
                        <TabsTrigger value="economy" className="data-[state=active]:bg-secondary text-xs sm:text-sm min-w-[80px] grow basis-[48%] sm:flex-1 sm:basis-auto">
                          <TrendingUp className="w-3 h-3 mr-1" /><span>经济</span>
                        </TabsTrigger>
                        <TabsTrigger value="laning" className="data-[state=active]:bg-secondary text-xs sm:text-sm min-w-[80px] grow basis-[48%] sm:flex-1 sm:basis-auto">
                          <Users className="w-3 h-3 mr-1" /><span>对线</span>
                        </TabsTrigger>
                        <TabsTrigger value="aireport" className="data-[state=active]:bg-secondary text-xs sm:text-sm min-w-[80px] grow basis-[48%] sm:flex-1 sm:basis-auto">
                          <FileText className="w-3 h-3 mr-1" /><span>AI战报</span>
                        </TabsTrigger>
                      </>
                    )}
                  </TabsList>

                  {/* Overview tab (prototype mode) */}
                  <TabsContent value="overview">
                    <div className="space-y-6">
                      {/* Map tabs row — between nav tabs and content */}
                      {seriesMaps.length > 0 && (
                        <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                          <div className="flex gap-1.5">
                            {seriesMaps.map((seriesMap) => {
                              const active = String(activeMatchId) === String(seriesMap.matchId);
                              return (
                                <button
                                  key={seriesMap.matchId}
                                  type="button"
                                  aria-pressed={active}
                                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                                    active
                                      ? 'border-red-400/60 bg-red-500/10 text-red-100 shadow-none'
                                      : 'border-slate-700/60 bg-transparent text-slate-400 hover:border-red-400/30 hover:text-red-100'
                                  }`}
                                  onClick={() => setActiveMatchId(seriesMap.matchId)}
                                >
                                  <span>{seriesMap.label}</span>
                                </button>
                              );
                            })}
                          </div>
                          {/* Right: duration + map winner */}
                          {(() => {
                            const activeMap = seriesMaps.find((m) => String(m.matchId) === String(activeMatchId));
                            if (!activeMap || typeof activeMap.radiantScore !== 'number') return null;
                            const mapWinner = activeMap.radiantScore > (activeMap.direScore ?? 0) ? radiantTeamName : direTeamName;
                            const mapWinnerIsRadiant = activeMap.radiantScore > (activeMap.direScore ?? 0);
                            return (
                              <div className="flex items-center gap-2 text-xs text-slate-500">
                                <span>比赛时长 {formatDuration(match.duration)}</span>
                                <span className="text-slate-600">|</span>
                                <span className={`font-semibold ${mapWinnerIsRadiant ? 'text-green-400' : 'text-red-400'}`}>
                                  {mapWinner} 胜利
                                </span>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                      {/* Draft section */}
                      <div className="border-t border-slate-800/60 pt-5" />
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">阵容选择</div>
                      <PrototypeOverview match={match} radiantTeamName={radiantTeamName} direTeamName={direTeamName} />
                      <div className="border-t border-slate-800/60 pt-5" />
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">经济优势</div>
                      {(() => {
                        const radiantNw = match.players.filter(p => p.player_slot < 128).reduce((s, p) => s + getNetWorth(p), 0);
                        const direNw = match.players.filter(p => p.player_slot >= 128).reduce((s, p) => s + getNetWorth(p), 0);
                        const totalNw = radiantNw + direNw || 1;
                        const radiantPct = Math.round((radiantNw / totalNw) * 100);
                        const direPct = 100 - radiantPct;
                        const goldAdv = match.radiant_gold_adv?.length ? match.radiant_gold_adv[match.radiant_gold_adv.length - 1] : 0;
                        const advTeam = goldAdv >= 0 ? radiantTeamName : direTeamName;
                        const advAmount = formatCompact(Math.abs(goldAdv));
                        const advLabel = `${advTeam} +${advAmount}`;

                        // Sample gold advantage at 5-min intervals (0, 5, 10, 15, 20, 25, 30, 35)
                        const goldSamples = (match.radiant_gold_adv || []).filter((_, i) => i % 5 === 0);
                        const xpSamples = (match.radiant_xp_adv || []).filter((_, i) => i % 5 === 0);

                        return (
                          <div className="space-y-4">
                            {/* Net worth comparison bars */}
                            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                              <div className="mb-3 flex items-center justify-between">
                                <span className="text-xs font-semibold text-slate-300">团队净值对比</span>
                                <span className={`text-xs font-bold ${goldAdv >= 0 ? 'text-blue-400' : 'text-red-400'}`}>{advLabel}</span>
                              </div>
                              <div className="flex gap-3 items-end">
                                <div className="flex-1">
                                  <div className="mb-1 flex items-center justify-between text-[10px]">
                                    <span className="text-slate-400">{radiantTeamName}</span>
                                    <span className="text-slate-300 font-semibold">{formatCompact(radiantNw)}</span>
                                  </div>
                                  <div className="h-6 overflow-hidden rounded bg-slate-800">
                                    <div className="h-full rounded bg-gradient-to-r from-blue-600/80 to-blue-500/60 transition-all" style={{ width: `${radiantPct}%` }} />
                                  </div>
                                </div>
                                <span className="text-[10px] text-slate-500 shrink-0">VS</span>
                                <div className="flex-1">
                                  <div className="mb-1 flex items-center justify-between text-[10px]">
                                    <span className="text-slate-400">{direTeamName}</span>
                                    <span className="text-slate-300 font-semibold">{formatCompact(direNw)}</span>
                                  </div>
                                  <div className="h-6 overflow-hidden rounded bg-slate-800">
                                    <div className="h-full rounded bg-gradient-to-r from-red-600/80 to-red-500/60 transition-all ml-auto" style={{ width: `${direPct}%` }} />
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Gold / XP advantage mini timeline */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {/* Gold timeline */}
                              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
                                <div className="mb-2 flex items-center justify-between">
                                  <span className="text-[11px] font-semibold text-slate-300">经济优势</span>
                                  <span className="text-[10px] text-slate-500">每5分钟</span>
                                </div>
                                <div className="relative h-8 mb-1.5">
                                  {/* Center line */}
                                  <div className="absolute inset-x-0 top-1/2 h-px bg-slate-700" />
                                  {/* Markers */}
                                  <div className="relative flex justify-between h-full items-center px-0.5">
                                    {goldSamples.map((val, i) => {
                                      const isRadiant = val >= 0;
                                      return (
                                        <div key={i} className="relative flex flex-col items-center" style={{ width: `${100 / goldSamples.length}%` }}>
                                          <div
                                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${isRadiant ? 'bg-blue-400' : 'bg-red-400'}`}
                                            title={`${i * 5}min: ${val >= 0 ? '+' : ''}${formatCompact(val)}`}
                                          />
                                          <div className="absolute top-full mt-0.5 text-[8px] text-slate-500">{i * 5}'</div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                                <div className="flex items-center justify-between text-[9px] text-slate-500">
                                  <span className="text-blue-400/60">← {radiantTeamName.slice(0,4)}优势</span>
                                  <span className="text-red-400/60">{direTeamName.slice(0,4)}优势 →</span>
                                </div>
                              </div>

                              {/* XP timeline */}
                              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
                                <div className="mb-2 flex items-center justify-between">
                                  <span className="text-[11px] font-semibold text-slate-300">经验优势</span>
                                  <span className="text-[10px] text-slate-500">每5分钟</span>
                                </div>
                                <div className="relative h-8 mb-1.5">
                                  <div className="absolute inset-x-0 top-1/2 h-px bg-slate-700" />
                                  <div className="relative flex justify-between h-full items-center px-0.5">
                                    {xpSamples.map((val, i) => {
                                      const isRadiant = val >= 0;
                                      return (
                                        <div key={i} className="relative flex flex-col items-center" style={{ width: `${100 / xpSamples.length}%` }}>
                                          <div
                                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${isRadiant ? 'bg-cyan-400' : 'bg-orange-400'}`}
                                            title={`${i * 5}min: ${val >= 0 ? '+' : ''}${formatCompact(val)}`}
                                          />
                                          <div className="absolute top-full mt-0.5 text-[8px] text-slate-500">{i * 5}'</div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                                <div className="flex items-center justify-between text-[9px] text-slate-500">
                                  <span className="text-cyan-400/60">← {radiantTeamName.slice(0,4)}优势</span>
                                  <span className="text-orange-400/60">{direTeamName.slice(0,4)}优势 →</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                      <div className="border-t border-slate-800/60 pt-5" />
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">比赛数据</div>
                      <div className="flex gap-4 items-stretch">
                        <div className="flex-1 min-w-0 overflow-hidden min-h-[320px] rounded-xl bg-slate-900/30 p-3">
                          <MatchGraphs match={match} radiantTeamName={radiantTeamName} direTeamName={direTeamName} heroesData={heroesData} hideKeyEvents={isPrototypeMode} />
                        </div>
                        <div className="w-[280px] shrink-0 rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden flex flex-col">
                          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
                            <span className="text-xs font-semibold text-slate-200">关键事件</span>
                            <div className="flex gap-1">
                              {['全部', radiantTeamName.slice(0,4), direTeamName.slice(0,4)].map((label, i) => (
                                <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded ${i === 0 ? 'bg-slate-700 text-white' : 'text-slate-400'}`}>{label}</span>
                              ))}
                            </div>
                          </div>
                          <div className="overflow-y-auto flex-1 min-h-0 divide-y divide-slate-800/60">
                            {(() => {
                              const EVENT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
                                kill: Swords,
                                roshan: Shield,
                                tower: Landmark,
                                wipe: Skull,
                                ancient: Trophy,
                              };
                              return events.map((ev, i) => {
                                const Icon = EVENT_ICONS[ev.type];
                                return (
                                  <div key={i} className="flex items-start gap-2 px-3 py-2 hover:bg-slate-800/40 cursor-pointer">
                                    <span className="text-[11px] text-slate-500 shrink-0 w-10 pt-0.5">{ev.time}</span>
                                    {Icon && <Icon className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${ev.side === 'radiant' ? 'text-green-400/70' : 'text-red-400/70'}`} />}
                                    <span className="text-[11px] text-slate-300">{ev.text}</span>
                                  </div>
                                );
                              });
                            })()}
                          </div>
                          <div className="mt-auto border-t border-slate-800 px-3 py-2 text-center">
                            <span className="text-[10px] text-slate-600">共 {events.length} 个事件</span>
                          </div>
                        </div>
                      </div>
                      {/* Player tables */}
                      <div className="space-y-4">
                        <TeamSummaryTable
                          teamName={radiantTeamName}
                          teamRef={radiantTeamRef}
                          players={radiantPlayers}
                          isRadiant={true}
                          isWinner={match.radiant_win}
                          picksBans={match.picks_bans || []}
                          itemsMap={itemsMap}
                          onTeamClick={onTeamClick}
                          onPlayerClick={onPlayerClick}
                          hidePicksBans={true}
                        />
                        <TeamSummaryTable
                          teamName={direTeamName}
                          teamRef={direTeamRef}
                          players={direPlayers}
                          isRadiant={false}
                          isWinner={!match.radiant_win}
                          picksBans={match.picks_bans || []}
                          itemsMap={itemsMap}
                          onTeamClick={onTeamClick}
                          onPlayerClick={onPlayerClick}
                          hidePicksBans={true}
                        />
                      </div>
                      {/* 队伍阵容 roster section */}
                      <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
                        <h3 className="mb-3 text-sm font-semibold text-slate-300">队伍阵容</h3>
                        <div className="flex gap-8 flex-wrap">
                          {[
                            { team: radiantTeamName, teamRef: radiantTeamRef, players: radiantPlayers },
                            { team: direTeamName, teamRef: direTeamRef, players: direPlayers },
                          ].map(({ team, teamRef, players: ps }) => (
                            <div key={team} className="flex flex-1 flex-col gap-3 min-w-0">
                              <div className="flex items-center gap-2">
                                {teamRef?.logo_url ? (
                                  <img src={teamRef.logo_url} alt={team} className="h-6 w-6 object-contain" />
                                ) : (
                                  <div className="h-6 w-6 rounded-full bg-slate-700" />
                                )}
                                <span className="text-sm font-bold text-white">{team}</span>
                              </div>
                              <div className="flex gap-3 flex-wrap">
                                {ps.slice(0, 5).map((p) => {
                                  const heroId = p.hero_id;
                                  const heroData = heroesData[heroId];
                                  return (
                                    <div key={p.account_id} className="flex flex-col items-center gap-1">
                                      <div className="h-12 w-12 overflow-hidden rounded-full border-2 border-slate-700 bg-slate-800">
                                        {heroData?.img ? (
                                          <img
                                            src={`https://cdn.cloudflare.steamstatic.com${heroData.img}`}
                                            alt={heroData.name_cn || heroData.name || ''}
                                            className="h-full w-full object-cover"
                                          />
                                        ) : (
                                          <div className="h-full w-full bg-slate-700" />
                                        )}
                                      </div>
                                      <span className="max-w-[56px] truncate text-center text-[10px] text-slate-400">
                                        {p.personaname || `P${p.account_id}`}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  {/* Draft tab (prototype mode) */}
                  <TabsContent value="draft">
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                      <PrototypeOverview match={match} radiantTeamName={radiantTeamName} direTeamName={direTeamName} />
                    </div>
                  </TabsContent>

                  <TabsContent value="players">
                    {isPrototypeMode ? (
                      <MatchDataTable
                        radiantTeamName={radiantTeamName}
                        direTeamName={direTeamName}
                        radiantPlayers={radiantPlayers}
                        direPlayers={direPlayers}
                        radiantWin={match.radiant_win}
                        onPlayerClick={onPlayerClick}
                      />
                    ) : (
                      <div className="space-y-6">
                        <TeamSummaryTable
                          teamName={radiantTeamName}
                          teamRef={radiantTeamRef}
                          players={radiantPlayers}
                          isRadiant={true}
                          isWinner={match.radiant_win}
                          picksBans={match.picks_bans || []}
                          itemsMap={itemsMap}
                          onTeamClick={onTeamClick}
                          onPlayerClick={onPlayerClick}
                        />
                        <TeamSummaryTable
                          teamName={direTeamName}
                          teamRef={direTeamRef}
                          players={direPlayers}
                          isRadiant={false}
                          isWinner={!match.radiant_win}
                          picksBans={match.picks_bans || []}
                          itemsMap={itemsMap}
                          onTeamClick={onTeamClick}
                          onPlayerClick={onPlayerClick}
                        />
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="economy">
                    <div className="max-w-full overflow-hidden">
                      <MatchGraphs match={match} radiantTeamName={radiantTeamName} direTeamName={direTeamName} heroesData={heroesData} />
                    </div>
                  </TabsContent>

                  <TabsContent value="laning">
                    <div className="max-w-full overflow-hidden">
                      <LaningAnalysis matchId={match.match_id} radiantTeamName={radiantTeamName} direTeamName={direTeamName} heroesData={heroesData} />
                    </div>
                  </TabsContent>

                  <TabsContent value="aireport">
                    <div className="max-w-full overflow-hidden">
                      <AIReportSection match={match} />
                    </div>
                  </TabsContent>

                  <TabsContent value="history">
                    <div className="space-y-6">
                      {[
                        { league: 'ESL One 伯明翰', date: '2024-05-15', rScore: 2, dScore: 1 },
                        { league: 'PGL Wallachia S4', date: '2024-04-27', rScore: 0, dScore: 2 },
                        { league: 'DreamLeague S22', date: '2024-03-12', rScore: 1, dScore: 2 },
                      ].map((h) => (
                        <div key={h.date} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3">
                          <div className="h-7 w-7 shrink-0 rounded-full bg-slate-700" />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium text-slate-300">{h.league}</div>
                            <div className="text-[10px] text-slate-500">{h.date}</div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-sm font-bold text-white">{h.rScore}</span>
                            <span className="text-xs text-slate-500">:</span>
                            <span className="text-sm font-bold text-white">{h.dScore}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </TabsContent>
                </Tabs>
              </div>

              {/* ── Right sidebar (prototype mode desktop) ── */}
              {isPrototypeMode && !isMobile && (
                <div className="w-[240px] shrink-0 space-y-4">
                  {/* 赛事信息 */}
                  <div className="overflow-hidden rounded-xl border border-slate-800">
                    <div className="bg-slate-800/80 px-3 py-2 text-xs font-semibold text-slate-200">赛事信息</div>
                    <div className="space-y-0 divide-y divide-slate-800">
                      <div className="overflow-hidden rounded-none bg-slate-900/60 px-3 py-3">
                        <div className="text-sm font-bold text-white">{match.league_name || 'DreamLeague S23'}</div>
                      </div>
                      {[
                        ['赛事级别', 'S级联赛'],
                        ['举办时间', '2024.05.20 - 06.02'],
                        ['总奖金池', '$1,000,000'],
                        ['举办地点', '线上赛'],
                      ].map(([label, value]) => (
                        <div key={label} className="flex items-center justify-between bg-slate-900/20 px-3 py-2 text-xs">
                          <span className="text-slate-500">{label}</span>
                          <span className="text-slate-300">{value}</span>
                        </div>
                      ))}
                      <div className="px-3 py-2.5">
                        <button type="button" className="w-full rounded-lg border border-slate-700 py-1.5 text-xs text-slate-400 hover:border-slate-500 hover:text-slate-200">
                          查看赛事主页 →
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 直播与回放 */}
                  <div className="overflow-hidden rounded-xl border border-slate-800">
                    <div className="bg-slate-800/80 px-3 py-2 text-xs font-semibold text-slate-200">直播与回放</div>
                    <div className="divide-y divide-slate-800">
                      {[
                        { name: 'Twitch', color: '#9147ff', viewers: '12.4K' },
                        { name: 'YouTube', color: '#ff0000', viewers: '8.7K' },
                        { name: 'Douyu', color: '#ff6b00', viewers: '6.1K' },
                      ].map((stream) => (
                        <div key={stream.name} className="flex items-center gap-2.5 px-3 py-2.5">
                          <div className="h-7 w-7 shrink-0 rounded-md" style={{ backgroundColor: stream.color }} />
                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] text-slate-400">官方直播间</div>
                            <div className="text-xs font-medium text-slate-200">{stream.name}</div>
                          </div>
                          <span className="text-[10px] text-red-400">• {stream.viewers}</span>
                        </div>
                      ))}
                      <div className="px-3 py-2">
                        <button type="button" className="text-xs text-slate-500 hover:text-slate-300">查看更多直播 →</button>
                      </div>
                    </div>
                  </div>

                  {/* 接下来比赛 */}
                  <div className="overflow-hidden rounded-xl border border-slate-800">
                    <div className="flex items-center justify-between bg-slate-800/80 px-3 py-2">
                      <span className="text-xs font-semibold text-slate-200">接下来比赛</span>
                      <button type="button" className="text-[10px] text-slate-500 hover:text-slate-300">全部赛程 ›</button>
                    </div>
                    <div className="divide-y divide-slate-800">
                      {[
                        { time: '19:00', t1: 'Aurora', t2: 'BetBoom', bo: 'BO3' },
                        { time: '22:00', t1: 'G.Gladiators', t2: 'Liquid', bo: 'BO3' },
                        { time: '01:00', t1: 'Falcons', t2: 'Tundra', bo: 'BO3', tag: '明天' },
                      ].map((m2) => (
                        <div key={m2.t1} className="px-3 py-2.5">
                          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] text-slate-500">
                            <span>{m2.time}</span>
                            {m2.tag && <span className="rounded bg-slate-700/60 px-1 py-0.5 text-[9px] text-slate-400">{m2.tag}</span>}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="h-5 w-5 shrink-0 rounded-full bg-slate-700" />
                            <span className="flex-1 text-[11px] text-slate-300">{m2.t1}</span>
                            <span className="text-[10px] text-slate-400">vs</span>
                            <span className="flex-1 text-right text-[11px] text-slate-300">{m2.t2}</span>
                            <div className="h-5 w-5 shrink-0 rounded-full bg-slate-700" />
                          </div>
                          <div className="mt-1 text-right text-[10px] text-slate-500">{m2.bo} · 未开始</div>
                        </div>
                      ))}
                      <div className="px-3 py-2">
                        <button type="button" className="text-xs text-slate-500 hover:text-slate-300">查看完整赛程 →</button>
                      </div>
                    </div>
                  </div>

                  {/* 相关比赛 */}
                  <div className="overflow-hidden rounded-xl border border-slate-800">
                    <div className="bg-slate-800/80 px-3 py-2 text-xs font-semibold text-slate-200">相关比赛</div>
                    <div className="divide-y divide-slate-800">
                      {[
                        { league: 'ESL One 伯明翰', date: '2024-05-15', rS: 2, dS: 1, r: radiantTeamName, d: direTeamName },
                        { league: 'PGL Wallachia S4', date: '2024-04-27', rS: 0, dS: 2, r: direTeamName, d: radiantTeamName },
                        { league: 'DreamLeague S22', date: '2024-03-12', rS: 1, dS: 2, r: radiantTeamName, d: direTeamName },
                      ].map((rel) => (
                        <button key={rel.date} type="button" className="w-full px-3 py-2.5 text-left transition hover:bg-slate-800/40">
                          <div className="mb-1 flex items-center gap-1.5 text-[10px] text-slate-500">
                            <div className="h-4 w-4 shrink-0 rounded bg-slate-700" />
                            <span className="truncate">{rel.league}</span>
                            <span className="ml-auto shrink-0">{rel.date}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs">
                            <div className="h-5 w-5 shrink-0 rounded-full bg-slate-700" />
                            <span className="flex-1 truncate text-slate-300">{rel.r}</span>
                            <span className="shrink-0 font-bold text-white">{rel.rS} : {rel.dS}</span>
                            <span className="flex-1 truncate text-right text-slate-300">{rel.d}</span>
                            <div className="h-5 w-5 shrink-0 rounded-full bg-slate-700" />
                          </div>
                        </button>
                      ))}
                      <div className="px-3 py-2">
                        <button type="button" className="text-xs text-slate-500 hover:text-slate-300">查看更多交锋 →</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
    </>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="left" showCloseButton={false} aria-describedby={undefined} className="w-full sm:max-w-2xl bg-slate-900 border-slate-700 text-slate-100 p-0 overscroll-contain" data-visual-role="match-detail-modal" data-visual-state={matchDataState}>
          <SheetTitle className="sr-only">{match ? `${radiantTeamName} vs ${direTeamName}` : '比赛详情'}</SheetTitle>
          <button
            type="button"
            aria-label="关闭"
            className="absolute right-3 top-3 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 bg-slate-900/90 text-slate-200 shadow-lg backdrop-blur transition hover:bg-slate-800"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </button>
          <div
            ref={matchContentRef}
            className="h-full overflow-x-hidden overflow-y-auto p-2 pt-14 sm:p-5"
            onTouchStart={(event) => {
              const touch = event.touches[0];
              touchStartRef.current = { x: touch.clientX, y: touch.clientY };
            }}
            onTouchEnd={(event) => {
              if (!touchStartRef.current) return;
              const touch = event.changedTouches[0];
              const dx = touch.clientX - touchStartRef.current.x;
              const dy = touch.clientY - touchStartRef.current.y;
              touchStartRef.current = null;
              if (Math.abs(dx) >= 80 && Math.abs(dx) > Math.abs(dy) * 1.2) {
                onOpenChange(false);
              }
            }}
          >
            {detailBody}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  if (fullPage && !isMobile) {
    return (
      <div className="min-h-screen bg-background" data-visual-role="match-detail-page" data-visual-state={matchDataState}>
        <div ref={matchContentRef} className="mx-auto max-w-[1480px] px-4 pt-24 lg:px-6 pb-12">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="mb-4 inline-flex items-center gap-1.5 rounded-lg border border-border/30 bg-secondary/40 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:border-border/50 transition-colors"
          >
            ← 返回首页
          </button>
          {detailBody}
        </div>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-visual-role="match-detail-modal" data-visual-state={matchDataState}
        showCloseButton={false}
        aria-describedby={undefined}
        className={`overflow-y-auto bg-gradient-to-b from-card to-background border-border/40 rounded-2xl shadow-[var(--shadow-modal),var(--shadow-glow)] p-3 sm:p-6 ${
          isPrototypeMode ? 'w-[96vw] sm:max-w-[1360px] max-h-[94vh]' : 'w-[82vw] sm:max-w-6xl max-h-[90vh]'
        }`}
      >
        <DialogTitle className="sr-only">{match ? `${radiantTeamName} vs ${direTeamName}` : '比赛详情'}</DialogTitle>
        <div ref={matchContentRef}>{detailBody}</div>
      </DialogContent>
    </Dialog>
  );
}

function PrototypeOverview({ match, radiantTeamName, direTeamName }: { match: MatchDetail; radiantTeamName: string; direTeamName: string }) {
  const heroes = useHeroesData();
  const getHeroName = (heroId: number): string => {
    const hero = heroes[heroId];
    return hero?.name_cn || hero?.name || `Hero ${heroId}`;
  };
  const getHeroImg = (heroId: number): string => {
    const hero = heroes[heroId];
    if (!hero?.img) return '';
    return getHeroImageUrl(heroId, hero.img);
  };
  const picksBans = match.picks_bans || [];
  const radiantPicks = picksBans.filter((pb) => pb.team === 0 && pb.is_pick).sort((a,b) => (a.order||0)-(b.order||0));
  const direPicks = picksBans.filter((pb) => pb.team === 1 && pb.is_pick).sort((a,b) => (a.order||0)-(b.order||0));
  const radiantBans = picksBans.filter((pb) => pb.team === 0 && !pb.is_pick).sort((a,b) => (a.order||0)-(b.order||0));
  const direBans = picksBans.filter((pb) => pb.team === 1 && !pb.is_pick).sort((a,b) => (a.order||0)-(b.order||0));

  const HeroChip = ({ pb, team }: { pb: typeof radiantPicks[0]; team: number }) => {
    const imgSrc = getHeroImg(pb.hero_id);
    const glowRing = team === 0 ? 'ring-2 ring-blue-500/30' : 'ring-2 ring-red-500/30';
    const winRate = 45 + Math.round((pb.hero_id * 17) % 25); // sample 45-69%
    return (
      <div className="flex shrink-0 flex-col items-center gap-1" style={{ width: 80 }}>
        <div className={`h-[72px] w-[72px] overflow-hidden rounded-lg border-2 border-slate-700/60 bg-slate-800 ${glowRing}`}>
          {imgSrc ? (
            <img
              src={imgSrc}
              alt={getHeroName(pb.hero_id)}
              className="h-full w-full object-cover object-top"
              loading="lazy"
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center" style={heroPlaceholderColor(pb.hero_id)}>
              <span className="text-[8px] text-slate-300 font-semibold px-0.5 text-center leading-tight">{heroPlaceholderLabel(pb.hero_id)}</span>
            </div>
          )}
        </div>
        <span className="truncate text-[10px] text-slate-400 leading-tight max-w-[80px] text-center">{getHeroName(pb.hero_id)}</span>
        <span className="text-[9px] text-slate-500 leading-tight">{winRate}%</span>
      </div>
    );
  };

  const BanChip = ({ pb }: { pb: typeof radiantBans[0] }) => (
    <div
      className="overflow-hidden rounded bg-slate-800 shrink-0 border border-slate-700/30 opacity-50 grayscale"
      style={{ width: 28, height: 28 }}
      title={`禁选: ${getHeroName(pb.hero_id)}`}
    >
      <SafeImg
        src={getHeroImg(pb.hero_id) || undefined}
        alt={getHeroName(pb.hero_id)}
        className="h-full w-full object-cover brightness-75"
        fallback={
          <div className="h-full w-full flex items-center justify-center" style={heroPlaceholderColor(pb.hero_id)}>
            <span className="text-[5px] text-slate-500">{heroPlaceholderLabel(pb.hero_id)}</span>
          </div>
        }
      />
    </div>
  );

  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-[#0c1522]">
      {/* Two-column picks display */}
      <div className="flex items-stretch gap-0 divide-x divide-slate-800/60">
        {/* Radiant (left) */}
        <div className="flex flex-1 flex-col gap-2 p-3 min-w-0">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 shrink-0 overflow-hidden rounded-full bg-slate-700 p-0.5">
              {(() => {
                const logoSrc = getTeamLogoSrc(radiantTeamName, match.radiant_team?.logo_url);
                return logoSrc ? (
                  <img src={logoSrc} alt={radiantTeamName} className="h-full w-full object-contain" />
                ) : (
                  <div className="h-full w-full rounded-full bg-blue-600/40" />
                );
              })()}
            </div>
            <span className="text-sm font-bold text-white truncate">{radiantTeamName || '天辉'}</span>
            <span className={`ml-auto text-xs font-semibold shrink-0 ${match.radiant_win ? 'text-green-400' : 'text-red-400'}`}>
              {match.radiant_win ? '胜利' : '失败'}
            </span>
          </div>
          {/* Picks */}
          <div className="flex flex-nowrap gap-1.5 divide-x divide-slate-700/30 overflow-x-auto">
            {radiantPicks.length > 0
              ? radiantPicks.map((pb) => <HeroChip key={`rp-${pb.order}-${pb.hero_id}`} pb={pb} team={0} />)
              : [0,1,2,3,4].map(i => <div key={i} className="shrink-0 rounded-full bg-slate-800 border border-slate-700/30" style={{ width: 72, height: 72 }} />)
            }
          </div>
          {/* Bans */}
          {radiantBans.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[9px] text-slate-500 uppercase tracking-wide shrink-0">禁</span>
              {radiantBans.map((pb) => <BanChip key={`rb-${pb.order}-${pb.hero_id}`} pb={pb} />)}
            </div>
          )}
        </div>

        {/* Center VS divider */}
        <div className="flex flex-col items-center justify-center px-3 gap-1.5 shrink-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-slate-600 bg-slate-800/80">
            <span className="text-sm font-extrabold text-slate-300">VS</span>
          </div>
          <span className="text-[10px] text-slate-500 whitespace-nowrap">{getSeriesTypeLabel(match.series_type)}</span>
        </div>

        {/* Dire (right) */}
        <div className="flex flex-1 flex-col items-end gap-2 p-3 min-w-0">
          <div className="flex items-center gap-2 w-full justify-end">
            <span className={`mr-auto text-xs font-semibold shrink-0 ${!match.radiant_win ? 'text-green-400' : 'text-red-400'}`}>
              {!match.radiant_win ? '胜利' : '失败'}
            </span>
            <span className="text-sm font-bold text-white truncate">{direTeamName || '夜魇'}</span>
            <div className="h-7 w-7 shrink-0 overflow-hidden rounded-full bg-slate-700 p-0.5">
              {(() => {
                const logoSrc = getTeamLogoSrc(direTeamName, match.dire_team?.logo_url);
                return logoSrc ? (
                  <img src={logoSrc} alt={direTeamName} className="h-full w-full object-contain" />
                ) : (
                  <div className="h-full w-full rounded-full bg-red-600/40" />
                );
              })()}
            </div>
          </div>
          {/* Picks */}
          <div className="flex flex-nowrap gap-1.5 divide-x divide-slate-700/30 justify-end overflow-x-auto">
            {direPicks.length > 0
              ? direPicks.map((pb) => <HeroChip key={`dp-${pb.order}-${pb.hero_id}`} pb={pb} team={1} />)
              : [0,1,2,3,4].map(i => <div key={i} className="shrink-0 rounded-full bg-slate-800 border border-slate-700/30" style={{ width: 72, height: 72 }} />)
            }
          </div>
          {/* Bans */}
          {direBans.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              {direBans.map((pb) => <BanChip key={`db-${pb.order}-${pb.hero_id}`} pb={pb} />)}
              <span className="text-[9px] text-slate-500 uppercase tracking-wide shrink-0">禁</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MatchDataTable({
  radiantTeamName,
  direTeamName,
  radiantPlayers,
  direPlayers,
  radiantWin,
  onPlayerClick,
}: {
  radiantTeamName: string;
  direTeamName: string;
  radiantPlayers: Player[];
  direPlayers: Player[];
  radiantWin: boolean;
  onPlayerClick?: (accountId: number) => void;
}) {
  const teamData = [
    { name: radiantTeamName, players: radiantPlayers.slice(0, 5), isRadiant: true, isWinner: radiantWin, borderClass: 'border-l-blue-500/60' },
    { name: direTeamName, players: direPlayers.slice(0, 5), isRadiant: false, isWinner: !radiantWin, borderClass: 'border-l-red-500/60' },
  ];

  const headerCols = 'grid-cols-[minmax(140px,1.5fr)_72px_90px_70px_58px_58px_80px_72px]';

  return (
    <div className="space-y-6">
      {teamData.map(({ name, players, isRadiant: _isRadiant, isWinner, borderClass }) => (
        <div key={name} className="overflow-hidden rounded-xl border border-slate-800">
          {/* Team header */}
          <div className={`flex items-center gap-2 border-l-2 ${borderClass} bg-slate-800/40 border-b border-slate-800 px-4 py-2.5`}>
            <span className="text-sm font-bold text-white">{name}</span>
            {isWinner && <span className="rounded bg-green-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-green-400">胜者</span>}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block">
            <div className={`grid ${headerCols} divide-x divide-slate-800 bg-slate-900/60 text-[10px] uppercase tracking-wide text-slate-400`}>
              <div className="px-3 py-1.5">选手</div>
              <div className="px-2 py-1.5 text-center">英雄</div>
              <div className="px-2 py-1.5 text-center">KDA</div>
              <div className="px-2 py-1.5 text-center">正补/反补</div>
              <div className="px-2 py-1.5 text-center">GPM</div>
              <div className="px-2 py-1.5 text-center">XPM</div>
              <div className="px-2 py-1.5 text-center">净值</div>
              <div className="px-2 py-1.5 text-center">伤害</div>
            </div>
            {players.map((player, idx) => {
              const displayName = getPlayerDisplayName(player);
              const heroImg = getHeroImg(player.hero_id);
              return (
                <div
                  key={`${player.player_slot}-${player.account_id}`}
                  className={`grid ${headerCols} divide-x divide-slate-800/60 transition-colors hover:bg-slate-800/40 ${
                    idx % 2 === 0 ? 'bg-slate-900/10' : 'bg-slate-900/30'
                  }`}
                >
                  <div className="px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {player.account_id ? (
                        <button
                          type="button"
                          className="text-sm font-semibold text-slate-100 truncate hover:underline underline-offset-2 text-left max-w-[130px]"
                          onClick={() => onPlayerClick?.(Number(player.account_id))}
                        >
                          {displayName}
                        </button>
                      ) : (
                        <span className="text-sm font-semibold text-slate-100 truncate max-w-[130px]">{displayName}</span>
                      )}
                    </div>
                  </div>
                  <div className="px-1 py-2 flex items-center justify-center">
                    <div className="h-8 w-14 shrink-0 overflow-hidden rounded border border-slate-700 bg-slate-800">
                      <SafeImg
                        src={heroImg || undefined}
                        alt={getHeroName(player.hero_id)}
                        className="h-full w-full object-cover"
                        fallback={
                          <div className="h-full w-full flex items-center justify-center" style={heroPlaceholderColor(player.hero_id)}>
                            <span className="text-[7px] text-slate-300">{heroPlaceholderLabel(player.hero_id)}</span>
                          </div>
                        }
                      />
                    </div>
                  </div>
                  <div className="px-1 py-2 flex items-center justify-center">
                    <span className="text-xs font-semibold">
                      <span className="text-green-400">{player.kills}</span>
                      <span className="text-slate-500">/</span>
                      <span className="text-red-400">{player.deaths}</span>
                      <span className="text-slate-500">/</span>
                      <span className="text-slate-200">{player.assists}</span>
                    </span>
                  </div>
                  <div className="px-1 py-2 flex items-center justify-center text-xs text-slate-300">
                    {player.last_hits}<span className="text-slate-600 mx-0.5">/</span><span className="text-slate-500">{player.denies}</span>
                  </div>
                  <div className="px-1 py-2 flex items-center justify-center text-xs font-medium text-emerald-300">
                    {player.gold_per_min}
                  </div>
                  <div className="px-1 py-2 flex items-center justify-center text-xs font-medium text-cyan-300">
                    {player.xp_per_min}
                  </div>
                  <div className="px-1 py-2 flex items-center justify-center text-xs font-semibold text-amber-300">
                    {formatCompact(getNetWorth(player))}
                  </div>
                  <div className="px-1 py-2 flex items-center justify-center text-xs text-slate-300">
                    {formatCompact(player.hero_damage || 0)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden divide-y divide-slate-800">
            {players.map((player, idx) => {
              const displayName = getPlayerDisplayName(player);
              const heroImg = getHeroImg(player.hero_id);
              return (
                <div key={`m-${player.player_slot}-${player.account_id}`} className={`px-3 py-2.5 ${idx % 2 === 0 ? 'bg-slate-900/10' : 'bg-slate-900/30'}`}>
                  <div className="flex items-center gap-2.5">
                    <div className="h-10 w-16 shrink-0 overflow-hidden rounded border border-slate-700 bg-slate-800">
                      <SafeImg
                        src={heroImg || undefined}
                        alt={getHeroName(player.hero_id)}
                        className="h-full w-full object-cover"
                        fallback={<div className="h-full w-full flex items-center justify-center" style={heroPlaceholderColor(player.hero_id)}><span className="text-[7px] text-slate-300">{heroPlaceholderLabel(player.hero_id)}</span></div>}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      {player.account_id ? (
                        <button type="button" className="text-xs font-semibold text-slate-100 truncate block max-w-full hover:underline" onClick={() => onPlayerClick?.(Number(player.account_id))}>
                          {displayName}
                        </button>
                      ) : (
                        <span className="text-xs font-semibold text-slate-100 truncate block">{displayName}</span>
                      )}
                      <div className="text-[10px] text-slate-400">{getHeroName(player.hero_id)}</div>
                      <div className="mt-0.5 text-xs">
                        <span className="text-green-400">{player.kills}</span><span className="text-slate-500">/</span>
                        <span className="text-red-400">{player.deaths}</span><span className="text-slate-500">/</span>
                        <span className="text-slate-200">{player.assists}</span>
                        <span className="text-slate-500 ml-1.5">Lv.{player.level}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-semibold text-amber-300">{formatCompact(getNetWorth(player))}</div>
                      <div className="text-[10px] text-slate-500">GPM {player.gold_per_min}</div>
                      <div className="text-[10px] text-slate-500">XPM {player.xp_per_min}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function TeamSummaryTable({
  teamName,
  teamRef,
  players,
  isRadiant,
  isWinner,
  picksBans,
  itemsMap,
  onTeamClick,
  onPlayerClick,
  hidePicksBans = false,
}: {
  teamName: string;
  teamRef?: { team_id?: string | null; name?: string | null; logo_url?: string | null } | null;
  players: Player[];
  isRadiant: boolean;
  isWinner: boolean;
  picksBans: PicksBans[];
  itemsMap: Record<number, ItemInfo>;
  onTeamClick?: (team: { team_id?: string | null; name?: string | null; logo_url?: string | null }) => void;
  onPlayerClick?: (accountId: number) => void;
  hidePicksBans?: boolean;
}) {
  const teamCode = isRadiant ? 0 : 1;

  const teamPicksBans = picksBans
    .filter((entry) => entry.team === teamCode)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  const sortedPlayers = [...players].sort((a, b) => getNetWorth(b) - getNetWorth(a));

  return (
    <div className={`rounded-lg border overflow-hidden ${isWinner ? 'border-green-500/30 bg-green-500/5' : 'border-slate-800'}`}>
      <div className={`flex items-center justify-between px-3 py-2 bg-slate-800/40 border-b border-slate-800 border-l-2 ${isWinner ? 'border-l-green-500/60' : 'border-l-slate-700/40'}`}>
        <button
          type="button"
          className="text-sm font-semibold text-slate-100 hover:underline underline-offset-4"
          onClick={() => {
            if (teamRef?.name) onTeamClick?.(teamRef);
          }}
        >
          {teamName}
        </button>
        {isWinner && <span className="text-xs text-green-400 font-semibold">胜者</span>}
      </div>

      <div className="hidden md:block overflow-x-auto">
        <div className="min-w-[820px]">
          <header className="grid grid-cols-[minmax(180px,1.6fr)_70px_80px_72px_52px_52px_68px_52px_72px] divide-x divide-slate-800 bg-slate-900/70 text-[10px] uppercase tracking-wide text-slate-400">
            <div className="px-3 py-1.5">选手</div>
            <div className="px-2 py-1.5 text-center">K/D/A</div>
            <div className="px-2 py-1.5 text-center">正补/反补</div>
            <div className="px-2 py-1.5 text-center">净值</div>
            <div className="px-2 py-1.5 text-center">GPM</div>
            <div className="px-2 py-1.5 text-center">XPM</div>
            <div className="px-2 py-1.5 text-center">伤害</div>
            <div className="px-2 py-1.5 text-center">治疗</div>
            <div className="px-2 py-1.5 text-center">建筑伤害</div>
          </header>

          <div className="divide-y divide-slate-800/80 bg-slate-900/10">
            {sortedPlayers.map((player) => {
              const displayName = getPlayerDisplayName(player);
              const heroImg = getHeroImg(player.hero_id);

              return (
                <div
                  key={`${player.player_slot}-${player.account_id}-${player.hero_id}`}
                  className="grid grid-cols-[minmax(180px,1.6fr)_70px_80px_72px_52px_52px_68px_52px_72px] divide-x divide-slate-800/80 transition-colors hover:bg-slate-800/35"
                >
                  {/* 选手 */}
                  <div className="px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-9 w-14 shrink-0 overflow-hidden rounded-md border border-slate-700 bg-slate-800">
                        <SafeImg
                          src={heroImg || undefined}
                          alt={getHeroName(player.hero_id)}
                          className="h-full w-full object-cover object-center"
                          fallback={
                            <div className="h-full w-full flex items-center justify-center" style={heroPlaceholderColor(player.hero_id)}>
                              <span className="text-[7px] text-slate-300 px-0.5 text-center leading-tight">{heroPlaceholderLabel(player.hero_id)}</span>
                            </div>
                          }
                        />
                      </div>
                      <div className="min-w-0">
                        {player.account_id ? (
                          <button
                            type="button"
                            className="text-sm font-semibold text-slate-100 truncate hover:underline underline-offset-2 text-left block max-w-[130px]"
                            onClick={() => onPlayerClick?.(Number(player.account_id))}
                          >
                            {displayName}
                          </button>
                        ) : (
                          <div className="text-sm font-semibold text-slate-100 truncate max-w-[130px]">{displayName}</div>
                        )}
                        <div className="text-[11px] text-slate-400 truncate max-w-[130px]">{getHeroName(player.hero_id)}</div>
                        <div className="text-[10px] text-slate-500">Lv.{player.level}</div>
                      </div>
                    </div>
                  </div>

                  {/* K/D/A */}
                  <div className="px-1 py-2 flex items-center justify-center">
                    <span className="text-sm font-semibold">
                      <span className="text-green-400">{player.kills}</span>
                      <span className="text-slate-500"> / </span>
                      <span className="text-red-400">{player.deaths}</span>
                      <span className="text-slate-500"> / </span>
                      <span className="text-slate-200">{player.assists}</span>
                    </span>
                  </div>

                  {/* 正补/反补 */}
                  <div className="px-1 py-2 flex items-center justify-center text-sm text-slate-300">
                    {player.last_hits}<span className="text-slate-600 mx-0.5">/</span><span className="text-slate-500">{player.denies}</span>
                  </div>

                  {/* 净值 */}
                  <div className="px-1 py-2 flex items-center justify-center">
                    <span className="text-sm font-semibold text-amber-300">{formatCompact(getNetWorth(player))}</span>
                  </div>

                  {/* GPM */}
                  <div className="px-1 py-2 flex items-center justify-center text-sm text-emerald-300 font-medium">
                    {player.gold_per_min}
                  </div>

                  {/* XPM */}
                  <div className="px-1 py-2 flex items-center justify-center text-sm text-cyan-300 font-medium">
                    {player.xp_per_min}
                  </div>

                  {/* 伤害 */}
                  <div className="px-1 py-2 flex items-center justify-center text-sm text-slate-300">
                    {formatCompact(player.hero_damage || 0)}
                  </div>

                  {/* 治疗 */}
                  <div className="px-1 py-2 flex items-center justify-center text-sm text-slate-300">
                    {formatCompact(player.hero_healing || 0)}
                  </div>

                  {/* 建筑伤害 */}
                  <div className="px-1 py-2 flex items-center justify-center text-sm text-slate-300">
                    {formatCompact(player.tower_damage || 0)}
                  </div>
                </div>
              );
            })}

            {/* Totals row */}
            {(() => {
              const totK = sortedPlayers.reduce((s, p) => s + p.kills, 0);
              const totD = sortedPlayers.reduce((s, p) => s + p.deaths, 0);
              const totA = sortedPlayers.reduce((s, p) => s + p.assists, 0);
              const totLH = sortedPlayers.reduce((s, p) => s + p.last_hits, 0);
              const totDen = sortedPlayers.reduce((s, p) => s + p.denies, 0);
              const totNW = sortedPlayers.reduce((s, p) => s + getNetWorth(p), 0);
              const totGPM = sortedPlayers.reduce((s, p) => s + p.gold_per_min, 0);
              const totXPM = sortedPlayers.reduce((s, p) => s + p.xp_per_min, 0);
              const totDmg = sortedPlayers.reduce((s, p) => s + (p.hero_damage || 0), 0);
              const totHeal = sortedPlayers.reduce((s, p) => s + (p.hero_healing || 0), 0);
              const totBldg = sortedPlayers.reduce((s, p) => s + (p.tower_damage || 0), 0);
              return (
                <div className="grid grid-cols-[minmax(180px,1.6fr)_70px_80px_72px_52px_52px_68px_52px_72px] divide-x divide-slate-800/80 bg-slate-900/40 border-t border-slate-800">
                  <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400">总计</div>
                  <div className="px-1 py-1.5 flex items-center justify-center text-[11px] font-semibold">
                    <span className="text-green-400">{totK}</span><span className="text-slate-500">/</span><span className="text-red-400">{totD}</span><span className="text-slate-500">/</span><span className="text-slate-200">{totA}</span>
                  </div>
                  <div className="px-1 py-1.5 flex items-center justify-center text-[11px] text-slate-400">{totLH}<span className="text-slate-600 mx-0.5">/</span>{totDen}</div>
                  <div className="px-1 py-1.5 flex items-center justify-center text-[11px] text-amber-300 font-semibold">{formatCompact(totNW)}</div>
                  <div className="px-1 py-1.5 flex items-center justify-center text-[11px] text-emerald-300">{totGPM}</div>
                  <div className="px-1 py-1.5 flex items-center justify-center text-[11px] text-cyan-300">{totXPM}</div>
                  <div className="px-1 py-1.5 flex items-center justify-center text-[11px] text-slate-300">{formatCompact(totDmg)}</div>
                  <div className="px-1 py-1.5 flex items-center justify-center text-[11px] text-slate-300">{formatCompact(totHeal)}</div>
                  <div className="px-1 py-1.5 flex items-center justify-center text-[11px] text-slate-300">{formatCompact(totBldg)}</div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      <div className="space-y-1.5 p-1.5 md:hidden">
        {sortedPlayers.map((player) => {
          const displayName = getPlayerDisplayName(player);
          const laneName = getLaneName(player.lane, isRadiant);
          const mainItems = getMainItemIds(player);
          const backpackItems = getBackpackItemIds(player);
          const neutral = getNeutralItemId(player);
          const heroImg = getHeroImg(player.hero_id);

          return (
            <div
              key={`m-${player.player_slot}-${player.account_id}-${player.hero_id}`}
              className="rounded-lg border border-slate-800 bg-slate-900/40 p-1.5"
            >
              <div className="flex items-start gap-1.5">
                <div className="h-8 w-8 rounded overflow-hidden bg-slate-800 shrink-0">
                  <SafeImg
                    src={heroImg || undefined}
                    alt={getHeroName(player.hero_id)}
                    className="h-full w-full object-cover"
                    fallback={
                      <div className="h-full w-full flex items-center justify-center" style={heroPlaceholderColor(player.hero_id)}>
                        <span className="text-[7px] text-slate-300 px-0.5 text-center leading-tight">{heroPlaceholderLabel(player.hero_id)}</span>
                      </div>
                    }
                  />
                </div>
                <div className="min-w-0 flex-1">
                  {player.account_id ? (
                    <button
                      type="button"
                      className="text-xs font-medium text-slate-100 leading-tight break-all hover:underline underline-offset-2 text-left"
                      onClick={() => onPlayerClick?.(Number(player.account_id))}
                    >
                      {displayName}
                    </button>
                  ) : (
                    <div className="text-xs font-medium text-slate-100 leading-tight break-all">{displayName}</div>
                  )}
                  <div className="text-[10px] text-slate-400 leading-tight break-all">
                    {getHeroName(player.hero_id)}{laneName ? ` · ${laneName}` : ''}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-slate-500 leading-none">KDA</div>
                  <div className="text-xs font-semibold text-slate-100">
                    <span className="text-green-400">{player.kills}</span>/<span className="text-red-400">{player.deaths}</span>/{player.assists}
                  </div>
                </div>
              </div>

              <div className="mt-1 grid grid-cols-2 gap-1 text-[10px]">
                <div className="rounded border border-slate-800 bg-slate-950/50 px-2 py-1 text-slate-300">
                  <span className="text-slate-500">等级</span> {player.level}
                </div>
                <div className="rounded border border-slate-800 bg-slate-950/50 px-2 py-1 text-slate-300">
                  <span className="text-slate-500">正补/反补</span> {formatCompact(player.last_hits)}/{formatCompact(player.denies)}
                </div>
                <div className="rounded border border-slate-800 bg-slate-950/50 px-2 py-1 text-yellow-400 col-span-2">
                  <span className="text-slate-500">NET</span> {formatCompact(getNetWorth(player))}
                </div>
                <div className="col-span-2 rounded border border-slate-800 bg-slate-950/50 px-2 py-1 text-slate-300 break-all">
                  <span className="text-slate-500">GPM/XPM</span> {formatCompact(player.gold_per_min)}/{formatCompact(player.xp_per_min)}
                </div>
              </div>

              <div className="mt-1">
                <ItemStrip
                  mainItems={mainItems}
                  backpackItems={backpackItems}
                  neutralItem={neutral}
                  hasScepter={hasAghanimScepter(player)}
                  hasShard={hasAghanimShard(player)}
                  itemsMap={itemsMap}
                  collapsible
                  compactMobile
                />
              </div>
            </div>
          );
        })}
      </div>

      {!hidePicksBans && <PicksBansInline picksBans={teamPicksBans} />}
    </div>
  );
}

function ItemStrip({
  mainItems,
  backpackItems,
  neutralItem,
  hasScepter,
  hasShard,
  itemsMap,
  collapsible = false,
  compactMobile = false,
  centered = false,
}: {
  mainItems: number[];
  backpackItems: number[];
  neutralItem: number;
  hasScepter: boolean;
  hasShard: boolean;
  itemsMap: Record<number, ItemInfo>;
  collapsible?: boolean;
  compactMobile?: boolean;
  centered?: boolean;
}) {
  const renderItem = (itemId: number, options?: { compact?: boolean; muted?: boolean }) => {
    const compact = options?.compact || false;
    const muted = options?.muted || false;
    const item = itemId > 0 ? itemsMap[itemId] : undefined;
    const label = itemId > 0 ? (item?.name ? itemAbbr(item.name) : `#${itemId}`) : '';
    return (
      <div
        key={`${itemId}-${compact ? 'compact' : 'main'}-${muted ? 'muted' : 'full'}`}
        className={`rounded overflow-hidden border bg-slate-800 flex items-center justify-center flex-shrink-0 ${
          compact ? 'w-8 h-8 sm:w-9 sm:h-9' : compactMobile ? 'w-9 h-9 sm:w-10 sm:h-10' : 'w-10 h-10'
        } ${muted ? 'opacity-65 border-slate-700' : 'border-slate-600'}`}
        title={item?.name || (itemId > 0 ? `Item ${itemId}` : '')}
      >
        {itemId > 0 ? (
          <SafeImg
            src={item?.img || undefined}
            alt={item?.name || `Item ${itemId}`}
            className="w-full h-full object-contain"
            fallback={
              <div className="w-full h-full flex items-center justify-center" style={itemPlaceholderColor(itemId)}>
                <span className="text-[7px] text-slate-400 px-0.5 leading-tight text-center">{label}</span>
              </div>
            }
          />
        ) : (
          <div className="w-full h-full" />
        )}
      </div>
    );
  };

  const neutral = neutralItem > 0 ? itemsMap[neutralItem] : undefined;

  const content = (
    <div className={`flex items-center gap-1.5 ${centered ? 'justify-center' : 'justify-start'}`}>
      <div className="min-w-0 space-y-1 flex-1">
        <div className="flex flex-nowrap items-center gap-0.5">
          {mainItems.map((id, idx) => (
            <div key={`main-${idx}`}>{renderItem(id)}</div>
          ))}
          <div
            className={`${compactMobile ? 'w-9 h-9 sm:w-10 sm:h-10' : 'w-10 h-10'} rounded overflow-hidden border border-amber-600/60 bg-slate-800 flex-shrink-0`}
            title={neutral?.name || (neutralItem > 0 ? `Neutral Item ${neutralItem}` : '中立物品')}
          >
            {neutralItem > 0 ? (
              <SafeImg
                src={neutral?.img || undefined}
                alt={neutral?.name || `Neutral Item ${neutralItem}`}
                className="w-full h-full object-contain"
                fallback={
                  <div className="w-full h-full flex items-center justify-center" style={itemPlaceholderColor(neutralItem)}>
                    <span className="text-[7px] text-amber-300/70 px-0.5 leading-tight text-center">
                      {neutral?.name ? itemAbbr(neutral.name) : `N#${neutralItem}`}
                    </span>
                  </div>
                }
              />
            ) : (
              <div className="w-full h-full" />
            )}
          </div>
        </div>
        <div className="flex flex-nowrap items-center gap-0.5 text-slate-400 overflow-hidden">
          <span
            className="inline-flex h-6 w-6 items-center justify-center rounded border border-slate-700 bg-slate-900/70"
            title="背包栏"
            aria-label="背包栏"
          >
            <Backpack className="w-3.5 h-3.5" />
          </span>
          {backpackItems.map((id, idx) => (
            <div key={`backpack-${idx}`}>{renderItem(id, { compact: true, muted: true })}</div>
          ))}
        </div>
      </div>
      <div className={`${compactMobile ? 'w-8 h-8 mt-0' : 'w-10 h-10 mt-0'} relative flex-shrink-0 self-center`}>
        <img
          src={`https://www.opendota.com/assets/images/dota2/scepter_${hasScepter ? 1 : 0}.png`}
          alt="Aghanim's Scepter"
          className={`${compactMobile ? 'w-5 h-5' : 'w-7 h-7'} absolute right-0 top-0 rounded border border-slate-700 bg-slate-900/85 p-0.5 object-contain rotate-[7deg] z-10`}
          title={hasScepter ? 'A杖: 已拥有' : 'A杖: 未拥有'}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
        <img
          src={`https://www.opendota.com/assets/images/dota2/shard_${hasShard ? 1 : 0}.png`}
          alt="Aghanim's Shard"
          className={`${compactMobile ? 'w-5 h-5' : 'w-7 h-7'} absolute left-0 bottom-0 rounded border border-slate-700 bg-slate-900/85 p-0.5 object-contain -rotate-[7deg]`}
          title={hasShard ? '魔晶: 已拥有' : '魔晶: 未拥有'}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      </div>
    </div>
  );

  if (!collapsible) return content;

  return (
    <details className="group rounded-md border border-slate-800 bg-slate-950/30">
      <summary className="flex cursor-pointer list-none items-center justify-between px-2 py-1.5 text-xs text-slate-300 marker:content-['']">
        <span className="inline-flex items-center gap-1">
          <Backpack className="h-3.5 w-3.5 text-slate-400" />
          物品栏
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-slate-500 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-slate-800 px-2 py-2">{content}</div>
    </details>
  );
}

function PicksBansInline({ picksBans }: { picksBans: PicksBans[] }) {
  if (picksBans.length === 0) return null;

  return (
    <div className="border-t border-slate-800 px-4 py-3 bg-slate-900/30">
      <div className="text-xs text-slate-400 mb-2">Picks / Bans</div>
      <div className="overflow-x-auto pb-1">
        <div className="flex min-w-max flex-nowrap items-start gap-2.5">
          {picksBans.map((entry) => {
            const label = entry.is_pick ? '选择' : '禁止';
            const orderText = typeof entry.order === 'number' ? entry.order + 1 : '-';
            const heroName = getHeroName(entry.hero_id);
            const heroImg = getHeroImg(entry.hero_id);

            return (
              <section key={`${entry.team}-${entry.order}-${entry.hero_id}-${entry.is_pick ? 'p' : 'b'}`} className="flex-shrink-0">
                <div className="h-10 w-10 rounded-md overflow-hidden bg-slate-800 border border-slate-700 relative md:h-10 md:w-10">
                  <SafeImg
                    src={heroImg || undefined}
                    alt={heroName}
                    className={`w-full h-full object-cover ${entry.is_pick ? '' : 'grayscale brightness-75'}`}
                    fallback={
                      <div className="h-full w-full flex items-center justify-center" style={heroPlaceholderColor(entry.hero_id)}>
                        <span className="text-[7px] text-slate-400 px-0.5 text-center leading-tight">{heroPlaceholderLabel(entry.hero_id)}</span>
                      </div>
                    }
                  />
                  {!entry.is_pick && <div className="absolute inset-0 border-2 border-slate-500/60" />}
                </div>
                <aside className="mt-1 text-[11px] text-slate-400 text-center whitespace-nowrap">
                  {label} <b className="text-slate-200">{orderText}</b>
                </aside>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
