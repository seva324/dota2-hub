import { useEffect, useState } from 'react';
import { Users, Clock, TrendingUp, FileText, Backpack } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MatchGraphs } from './MatchGraphs';
import { LaningAnalysis } from './LaningAnalysis';
import { AIReportSection } from './AIReportSection';

let proPlayersMap: Record<number, { name: string; team_name: string; realname: string }> = {};
let heroesData: Record<number, HeroInfo> = {};
let cachedItemsMap: Record<number, ItemInfo> = {};

fetch('/data/pro_players.json')
  .then((res) => res.json())
  .then((data) => {
    proPlayersMap = data;
  })
  .catch(() => {});

fetch('/data/heroes.json')
  .then((res) => res.json())
  .then((data) => {
    heroesData = data;
  })
  .catch(() => {});

interface HeroInfo {
  id: number;
  name: string;
  img: string;
  name_cn: string;
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
  if (!hero?.img) {
    return `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${id}.png`;
  }
  return `https://steamcdn-a.akamaihd.net/apps/dota2/images/heroes/${hero.img}_lg.png`;
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
    hour: '2-digit',
    minute: '2-digit',
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

function normalizeItemImg(img: string): string {
  if (!img) return '';
  if (img.startsWith('http://') || img.startsWith('https://')) return img;
  if (img.startsWith('/apps/')) return `https://cdn.cloudflare.steamstatic.com${img}`;
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

interface MatchDetailModalProps {
  matchId: number | string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTeamClick?: (team: { team_id?: string | null; name?: string | null; logo_url?: string | null }) => void;
}

export function MatchDetailModal({ matchId, open, onOpenChange, onTeamClick }: MatchDetailModalProps) {
  const [match, setMatch] = useState<MatchDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [itemsMap, setItemsMap] = useState<Record<number, ItemInfo>>(cachedItemsMap);

  useEffect(() => {
    if (!open || Object.keys(itemsMap).length > 0) return;
    fetchItemsMap()
      .then((items) => setItemsMap(items))
      .catch(() => {});
  }, [open, itemsMap]);

  useEffect(() => {
    if (matchId && open) {
      setLoading(true);
      setError(null);

      const matchIdNum = typeof matchId === 'string' ? parseInt(matchId, 10) : matchId;

      fetch(`/api/match-details?match_id=${matchIdNum}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.error) {
            throw new Error(data.error);
          }
          setMatch(data);
        })
        .catch((err) => {
          console.error('Failed to fetch match:', err);
          setError(err.message || '加载失败');
        })
        .finally(() => setLoading(false));
    }
  }, [matchId, open]);

  if (!matchId) return null;

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] sm:max-w-7xl max-h-[90vh] overflow-y-auto bg-slate-900 border-slate-800 p-3 sm:p-6">
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
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-4 sm:mb-6 pb-3 sm:pb-4 border-b border-slate-800 gap-2 sm:gap-4">
              <div className="flex items-center gap-1 sm:gap-2 md:gap-4 flex-wrap w-full justify-center md:justify-start">
                <button
                  type="button"
                  className={`text-base sm:text-lg md:text-2xl font-bold ${match.radiant_win ? 'text-green-400' : 'text-red-400'} break-words max-w-[110px] sm:max-w-[160px] md:max-w-none hover:underline underline-offset-4`}
                  onClick={() => {
                    if (radiantTeamRef?.name) onTeamClick?.(radiantTeamRef);
                  }}
                >
                  {radiantTeamName}
                </button>
                <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                  <span
                    className={`text-xl sm:text-2xl md:text-3xl font-bold ${match.radiant_score > match.dire_score ? 'text-green-400' : 'text-slate-400'}`}
                  >
                    {match.radiant_score}
                  </span>
                  <span className="text-slate-600 text-base sm:text-lg md:text-xl">:</span>
                  <span
                    className={`text-xl sm:text-2xl md:text-3xl font-bold ${match.dire_score > match.radiant_score ? 'text-green-400' : 'text-slate-400'}`}
                  >
                    {match.dire_score}
                  </span>
                </div>
                <button
                  type="button"
                  className={`text-base sm:text-lg md:text-2xl font-bold ${!match.radiant_win ? 'text-green-400' : 'text-red-400'} break-words max-w-[110px] sm:max-w-[160px] md:max-w-none hover:underline underline-offset-4`}
                  onClick={() => {
                    if (direTeamRef?.name) onTeamClick?.(direTeamRef);
                  }}
                >
                  {direTeamName}
                </button>
              </div>
              <div className="text-right text-xs sm:text-sm text-slate-400 w-full md:w-auto">
                <div className="flex items-center justify-center md:justify-end">
                  <div className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1">
                    <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-300" />
                    <span className="text-sm sm:text-base font-semibold tracking-wide text-amber-200">
                      比赛时长 {formatDuration(match.duration)}
                    </span>
                  </div>
                </div>
                <div className="mt-1.5 flex items-center justify-center md:justify-end text-[11px]">
                  <div className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-0.5 text-slate-300 whitespace-nowrap overflow-x-auto max-w-full">
                    <span>Professional Match</span>
                    <span className="text-slate-500">·</span>
                    <span>赛制 {getSeriesTypeLabel(match.series_type)}</span>
                    <span className="text-slate-500">·</span>
                    <span>系列赛 ID {match.series_id || '-'}</span>
                    <span className="text-slate-500">·</span>
                    <span>Match ID {match.match_id}</span>
                    <span className="text-slate-500">·</span>
                    <span>开始 {formatDate(match.start_time)}</span>
                    <span className="text-slate-500">·</span>
                    <span>{match.league_name || 'Unknown League'}</span>
                  </div>
                </div>
              </div>
            </div>

            <Tabs defaultValue="players" className="w-full">
              <TabsList className="bg-slate-800/50 mb-4 flex w-full overflow-x-auto">
                <TabsTrigger value="players" className="data-[state=active]:bg-slate-700 text-xs sm:text-sm min-w-[92px] flex-1 sm:flex-none">
                  <Users className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                  <span>KDA</span>
                </TabsTrigger>
                <TabsTrigger value="economy" className="data-[state=active]:bg-slate-700 text-xs sm:text-sm min-w-[92px] flex-1 sm:flex-none">
                  <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                  <span>经济</span>
                </TabsTrigger>
                <TabsTrigger value="laning" className="data-[state=active]:bg-slate-700 text-xs sm:text-sm min-w-[92px] flex-1 sm:flex-none">
                  <Users className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                  <span>对线</span>
                </TabsTrigger>
                <TabsTrigger value="aireport" className="data-[state=active]:bg-slate-700 text-xs sm:text-sm min-w-[92px] flex-1 sm:flex-none">
                  <FileText className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                  <span>AI战报</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="players">
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
                  />
                </div>
              </TabsContent>

              <TabsContent value="economy">
                <MatchGraphs match={match} radiantTeamName={radiantTeamName} direTeamName={direTeamName} heroesData={heroesData} />
              </TabsContent>

              <TabsContent value="laning">
                <LaningAnalysis matchId={match.match_id} radiantTeamName={radiantTeamName} direTeamName={direTeamName} heroesData={heroesData} />
              </TabsContent>

              <TabsContent value="aireport">
                <AIReportSection match={match} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </DialogContent>
    </Dialog>
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
}: {
  teamName: string;
  teamRef?: { team_id?: string | null; name?: string | null; logo_url?: string | null } | null;
  players: Player[];
  isRadiant: boolean;
  isWinner: boolean;
  picksBans: PicksBans[];
  itemsMap: Record<number, ItemInfo>;
  onTeamClick?: (team: { team_id?: string | null; name?: string | null; logo_url?: string | null }) => void;
}) {
  const teamCode = isRadiant ? 0 : 1;

  const total = players.reduce(
    (acc, p) => {
      acc.level += p.level || 0;
      acc.kills += p.kills || 0;
      acc.deaths += p.deaths || 0;
      acc.assists += p.assists || 0;
      acc.lastHits += p.last_hits || 0;
      acc.denies += p.denies || 0;
      acc.netWorth += getNetWorth(p);
      acc.gpm += p.gold_per_min || 0;
      acc.xpm += p.xp_per_min || 0;
      return acc;
    },
    { level: 0, kills: 0, deaths: 0, assists: 0, lastHits: 0, denies: 0, netWorth: 0, gpm: 0, xpm: 0 }
  );

  const teamPicksBans = picksBans
    .filter((entry) => entry.team === teamCode)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  return (
    <div className="rounded-lg border border-slate-800 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-slate-800/40 border-b border-slate-800">
        <button
          type="button"
          className="text-sm sm:text-base font-semibold text-slate-100 hover:underline underline-offset-4"
          onClick={() => {
            if (teamRef?.name) onTeamClick?.(teamRef);
          }}
        >
          {teamName} - 摘要
        </button>
        {isWinner && <span className="text-xs sm:text-sm text-green-400 font-semibold">胜者</span>}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[940px]">
          <thead className="bg-slate-900/70">
            <tr className="text-xs text-slate-400">
              <th className="text-left px-3 py-2 w-[260px]">玩家</th>
              <th className="text-center px-2 py-2 w-[56px]">等级</th>
              <th className="text-right px-2 py-2 w-[52px] text-green-400">击杀</th>
              <th className="text-right px-2 py-2 w-[52px] text-red-400">死亡</th>
              <th className="text-right px-2 py-2 w-[52px] text-slate-300">助攻</th>
              <th className="text-right px-2 py-2 w-[90px]">正补/反补</th>
              <th className="text-right px-2 py-2 w-[80px] text-yellow-400">NET</th>
              <th className="text-right px-2 py-2 w-[96px]">GPM/XPM</th>
              <th className="text-left px-3 py-2">物品</th>
            </tr>
          </thead>
          <tbody>
            {[...players].sort((a, b) => getNetWorth(b) - getNetWorth(a)).map((player) => {
              const displayName = getPlayerDisplayName(player);
              const laneName = getLaneName(player.lane, isRadiant);
              const mainItems = getMainItemIds(player);
              const backpackItems = getBackpackItemIds(player);
              const neutral = getNeutralItemId(player);

              return (
                <tr key={`${player.player_slot}-${player.account_id}-${player.hero_id}`} className="border-t border-slate-800/70">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-10 h-10 rounded overflow-hidden bg-slate-800 flex-shrink-0">
                        <img src={getHeroImg(player.hero_id)} alt={getHeroName(player.hero_id)} className="w-full h-full object-cover" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm text-slate-100 truncate">{displayName}</div>
                        <div className="text-xs text-slate-400 truncate">
                          {getHeroName(player.hero_id)}{laneName ? ` · ${laneName}` : ''}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-center text-sm text-slate-200">{player.level}</td>
                  <td className="px-2 py-2 text-right text-sm text-green-400">{player.kills}</td>
                  <td className="px-2 py-2 text-right text-sm text-red-400">{player.deaths}</td>
                  <td className="px-2 py-2 text-right text-sm text-slate-200">{player.assists}</td>
                  <td className="px-2 py-2 text-right text-sm text-slate-300">
                    {formatCompact(player.last_hits)}/{formatCompact(player.denies)}
                  </td>
                  <td className="px-2 py-2 text-right text-sm text-yellow-400">{formatCompact(getNetWorth(player))}</td>
                  <td className="px-2 py-2 text-right text-sm text-slate-300">
                    {formatCompact(player.gold_per_min)}/{formatCompact(player.xp_per_min)}
                  </td>
                  <td className="px-3 py-2">
                    <ItemStrip
                      mainItems={mainItems}
                      backpackItems={backpackItems}
                      neutralItem={neutral}
                      hasScepter={hasAghanimScepter(player)}
                      hasShard={hasAghanimShard(player)}
                      itemsMap={itemsMap}
                    />
                  </td>
                </tr>
              );
            })}

            <tr className="border-t border-slate-700 bg-slate-900/40 text-xs text-slate-300">
              <td className="px-3 py-2" />
              <td className="px-2 py-2 text-center">{total.level}</td>
              <td className="px-2 py-2 text-right text-green-400">{total.kills}</td>
              <td className="px-2 py-2 text-right text-red-400">{total.deaths}</td>
              <td className="px-2 py-2 text-right">{total.assists}</td>
              <td className="px-2 py-2 text-right">
                {formatCompact(total.lastHits)}/{formatCompact(total.denies)}
              </td>
              <td className="px-2 py-2 text-right text-yellow-400">{formatCompact(total.netWorth)}</td>
              <td className="px-2 py-2 text-right">
                {formatCompact(total.gpm)}/{formatCompact(total.xpm)}
              </td>
              <td className="px-3 py-2" />
            </tr>
          </tbody>
        </table>
      </div>

      <PicksBansInline picksBans={teamPicksBans} />
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
}: {
  mainItems: number[];
  backpackItems: number[];
  neutralItem: number;
  hasScepter: boolean;
  hasShard: boolean;
  itemsMap: Record<number, ItemInfo>;
}) {
  const renderItem = (itemId: number, options?: { compact?: boolean; muted?: boolean }) => {
    const compact = options?.compact || false;
    const muted = options?.muted || false;
    const item = itemId > 0 ? itemsMap[itemId] : undefined;
    return (
      <div
        key={`${itemId}-${compact ? 'compact' : 'main'}-${muted ? 'muted' : 'full'}`}
        className={`rounded overflow-hidden border bg-slate-800 flex-shrink-0 ${
          compact ? 'w-7 h-5' : 'w-10 h-7'
        } ${muted ? 'opacity-65 border-slate-700' : 'border-slate-600'}`}
        title={item?.name || ''}
      >
        {item?.img ? (
          <img src={item.img} alt={item.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full" />
        )}
      </div>
    );
  };

  const neutral = neutralItem > 0 ? itemsMap[neutralItem] : undefined;

  return (
    <div className="flex items-start justify-start gap-1.5">
      <div className="min-w-0 space-y-1.5">
        <div className="flex items-center gap-1">
          {mainItems.map((id, idx) => (
            <div key={`main-${idx}`}>{renderItem(id)}</div>
          ))}
          <div
            className="w-10 h-7 rounded overflow-hidden border border-amber-600/60 bg-slate-800 flex-shrink-0"
            title={neutral?.name || '中立物品'}
          >
            {neutral?.img ? <img src={neutral.img} alt={neutral.name} className="w-full h-full object-cover" /> : <div className="w-full h-full" />}
          </div>
        </div>
        <div className="flex items-center gap-1 text-slate-400">
          <span
            className="inline-flex h-5 w-5 items-center justify-center rounded border border-slate-700 bg-slate-900/70"
            title="背包栏"
            aria-label="背包栏"
          >
            <Backpack className="w-3 h-3" />
          </span>
          {backpackItems.map((id, idx) => (
            <div key={`backpack-${idx}`}>{renderItem(id, { compact: true, muted: true })}</div>
          ))}
        </div>
      </div>
      <div className="relative w-9 h-8 mt-0.5 flex-shrink-0">
        <img
          src={`https://www.opendota.com/assets/images/dota2/scepter_${hasScepter ? 1 : 0}.png`}
          alt="Aghanim's Scepter"
          className="absolute right-0 top-0 w-6 h-6 rounded border border-slate-700 bg-slate-900/85 p-0.5 object-contain rotate-[7deg] z-10"
          title={hasScepter ? 'A杖: 已拥有' : 'A杖: 未拥有'}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
        <img
          src={`https://www.opendota.com/assets/images/dota2/shard_${hasShard ? 1 : 0}.png`}
          alt="Aghanim's Shard"
          className="absolute left-0 bottom-0 w-6 h-6 rounded border border-slate-700 bg-slate-900/85 p-0.5 object-contain -rotate-[7deg]"
          title={hasShard ? '魔晶: 已拥有' : '魔晶: 未拥有'}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      </div>
    </div>
  );
}

function PicksBansInline({ picksBans }: { picksBans: PicksBans[] }) {
  if (picksBans.length === 0) return null;

  return (
    <div className="border-t border-slate-800 px-4 py-3 bg-slate-900/30">
      <div className="text-xs text-slate-400 mb-2">Picks / Bans</div>
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {picksBans.map((entry) => {
          const label = entry.is_pick ? '选择' : '禁止';
          const orderText = typeof entry.order === 'number' ? entry.order + 1 : '-';
          const heroName = getHeroName(entry.hero_id);

          return (
            <section key={`${entry.team}-${entry.order}-${entry.hero_id}-${entry.is_pick ? 'p' : 'b'}`} className="flex-shrink-0">
              <div className="w-11 h-11 rounded overflow-hidden bg-slate-800 border border-slate-700 relative">
                <img
                  src={getHeroImg(entry.hero_id)}
                  alt={heroName}
                  className={`w-full h-full object-cover ${entry.is_pick ? '' : 'grayscale brightness-75'}`}
                  title={heroName}
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
  );
}
