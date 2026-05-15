/**
 * MatchDetailPage — Full-page match detail matching the PRD/prototype layout.
 * Header: team logos + score + metadata + Ban/Pick strip
 * Body: left (player stats + chart + events) + right sidebar (team lineups + cards)
 */
import { ArrowLeft, BarChart3, Shield, Swords, Target, TrendingUp, Trophy } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PicksBansInline } from '@/components/custom/PicksBansInline';
import { MatchGraphs } from '@/components/custom/MatchGraphs';
import { SafeImg } from '@/components/custom/SafeImg';
function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return '-';
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(Math.round(value));
}
import { getHeroImageUrl } from '@/lib/assetUrls';
import { resolveTeamLogo } from '@/lib/teams';

type MatchDetail = any;
type HeroInfo = Record<number, { id: number; name: string; img: string; name_cn: string }>;

type Props = {
  match: MatchDetail;
  radiantTeamName: string;
  direTeamName: string;
  radiantTeamRef: { team_id?: string | null; name?: string | null; logo_url?: string | null } | null;
  direTeamRef: { team_id?: string | null; name?: string | null; logo_url?: string | null } | null;
  radiantSeriesWins: number;
  direSeriesWins: number;
  seriesMaps: Array<{ label: string; matchId: string; radiantScore?: number; direScore?: number; duration?: number }>;
  activeMatchId: number | string | null;
  setActiveMatchId: (id: number | string) => void;
  heroesData: HeroInfo;
  onClose: () => void;
  onTeamClick?: (team: { team_id?: string | null; name?: string | null; logo_url?: string | null }) => void;
  onPlayerClick?: (accountId: number) => void;
};

function getNetWorth(p: any): number {
  return p?.net_worth ?? p?.gold_per_min ?? 0;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function getKDA(p: any): string {
  const k = p.kills ?? 0;
  const d = p.deaths ?? 0;
  const a = p.assists ?? 0;
  return `${k}/${d}/${a}`;
}

function getHeroImg(heroId: number, hd: HeroInfo): string {
  const h = hd[heroId];
  if (h?.img) return getHeroImageUrl(heroId, h.img);
  return `/images/mirror/heroes/${heroId}.png`;
}

function getHeroName(heroId: number, hd: HeroInfo): string {
  return hd[heroId]?.name_cn || hd[heroId]?.name || `Hero ${heroId}`;
}

export function MatchDetailPage({
  match, radiantTeamName, direTeamName, radiantTeamRef, direTeamRef,
  radiantSeriesWins, direSeriesWins, seriesMaps, activeMatchId, setActiveMatchId,
  heroesData, onClose, onTeamClick, onPlayerClick,
}: Props) {
  const radiantScore = seriesMaps.length > 0 ? radiantSeriesWins : match.radiant_score;
  const direScore = seriesMaps.length > 0 ? direSeriesWins : match.dire_score;

  const radiantPlayers = match.players?.filter((p: any) => p.player_slot < 128) || [];
  const direPlayers = match.players?.filter((p: any) => p.player_slot >= 128) || [];

  const radiantLogo = resolveTeamLogo(
    { teamId: radiantTeamRef?.team_id || undefined, name: radiantTeamRef?.name || undefined },
    [], radiantTeamRef?.logo_url || null
  );
  const direLogo = resolveTeamLogo(
    { teamId: direTeamRef?.team_id || undefined, name: direTeamRef?.name || undefined },
    [], direTeamRef?.logo_url || null
  );

  return (
    <div className="mx-auto max-w-[1360px] px-4 pt-6 pb-12">
      {/* Back button */}
      <button onClick={onClose} className="mb-4 inline-flex items-center gap-1.5 rounded-lg border border-border/30 bg-secondary/40 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:border-border/50 transition-colors">
        <ArrowLeft className="size-3.5" /> 返回首页
      </button>

      {/* ===== Header: Teams + Score ===== */}
      <div className="rounded-xl border border-border/40 bg-gradient-to-b from-card to-background overflow-hidden mb-5">
        <div className="flex items-center justify-between px-6 py-4">
          {/* Radiant team */}
          <button onClick={() => onTeamClick?.(radiantTeamRef || { name: radiantTeamName })} className="flex flex-col items-center gap-2 min-w-0">
            <div className="w-14 h-14 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden">
              <SafeImg src={radiantLogo || ''} alt={radiantTeamName} className="w-12 h-12 object-contain" fallback={<Shield className="w-6 h-6 text-slate-500" />} />
            </div>
            <span className={`text-sm font-bold truncate max-w-[120px] ${match.radiant_win ? 'text-green-400' : 'text-slate-300'}`}>{radiantTeamName}</span>
          </button>

          {/* Score */}
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-3">
              <span className={`text-3xl font-black tabular-nums ${Number(radiantScore) > Number(direScore) ? 'text-green-400' : 'text-slate-400'}`}>{radiantScore}</span>
              <span className="text-xl text-slate-600 font-light">:</span>
              <span className={`text-3xl font-black tabular-nums ${Number(direScore) > Number(radiantScore) ? 'text-green-400' : 'text-slate-400'}`}>{direScore}</span>
            </div>
            <span className="text-[10px] text-slate-500 mt-1">
              {match.series_type || 'BO3'} · {match.duration ? formatDuration(match.duration) : ''}
            </span>
            {seriesMaps.length > 0 && (
              <span className="text-[10px] text-emerald-400/80 font-medium mt-0.5">
                {match.radiant_win === true ? `${radiantTeamName} 胜利` : match.radiant_win === false ? `${direTeamName} 胜利` : ''}
              </span>
            )}
          </div>

          {/* Dire team */}
          <button onClick={() => onTeamClick?.(direTeamRef || { name: direTeamName })} className="flex flex-col items-center gap-2 min-w-0">
            <div className="w-14 h-14 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden">
              <SafeImg src={direLogo || ''} alt={direTeamName} className="w-12 h-12 object-contain" fallback={<Shield className="w-6 h-6 text-slate-500" />} />
            </div>
            <span className={`text-sm font-bold truncate max-w-[120px] ${match.radiant_win === false ? 'text-green-400' : 'text-slate-300'}`}>{direTeamName}</span>
          </button>
        </div>

        {/* Match metadata row */}
        <div className="flex items-center justify-center gap-4 border-t border-border/20 px-6 py-2 text-[11px] text-slate-500">
          <span>Match ID: {match.match_id}</span>
          <span>·</span>
          <span>{match.start_time ? new Date(match.start_time * 1000).toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—'}</span>
          <span>·</span>
          <span className="text-emerald-400/80">已结束</span>
        </div>
      </div>

      {/* ===== Ban/Pick Strip ===== */}
      <PicksBansInline picksBans={match.picks_bans || []} heroesData={heroesData} />

      {/* ===== Tab bar + Content ===== */}
      <Tabs defaultValue="overview" className="w-full mt-5">
        <TabsList className="flex w-full border-b border-slate-800 bg-transparent p-0 h-auto gap-0 mb-5">
          {['概览', '阵容选择', '比赛数据', '比赛进程', '历史交锋'].map((label, i) => {
            const values = ['overview', 'draft', 'players', 'economy', 'history'];
            const icons = [BarChart3, Swords, Target, TrendingUp, Trophy];
            const Icon = icons[i];
            return (
              <TabsTrigger key={values[i]} value={values[i]} className="rounded-none border-b-2 border-b-transparent pb-2 pt-1 px-4 text-sm font-medium text-muted-foreground data-[state=active]:border-b-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none">
                <Icon className="w-3.5 h-3.5 mr-1.5" />{label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {/* Overview tab */}
        <TabsContent value="overview">
          <div className="flex gap-5">
            {/* Left main column */}
            <div className="min-w-0 flex-1 space-y-4">
              {/* Series map tabs */}
              {seriesMaps.length > 0 && (
                <div className="flex items-center gap-2">
                  {seriesMaps.map((m) => {
                    const active = String(activeMatchId) === String(m.matchId);
                    return (
                      <button key={m.matchId} type="button" onClick={() => setActiveMatchId(m.matchId)}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                          active ? 'border-red-400/60 bg-red-500/10 text-red-100' : 'border-slate-700 bg-slate-900/75 text-slate-400 hover:border-red-400/30 hover:text-red-100'
                        }`}>
                        <span>{m.label}</span>
                        {typeof m.radiantScore === 'number' && <span className="text-[10px] text-slate-300">{m.radiantScore}:{m.direScore}</span>}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Player Stats Table */}
              <section>
                <h3 className="mb-3 text-sm font-semibold text-slate-300">比赛数据</h3>
                <div className="overflow-hidden rounded-lg border border-slate-800">
                  <div className="grid grid-cols-[28px_1fr_60px_50px_50px_45px_45px_45px] gap-x-2 items-center border-b border-slate-800 bg-slate-900/60 px-3 py-2 text-[10px] font-medium text-slate-400">
                    <span /> <span>选手</span> <span className="text-center">KDA</span>
                    <span className="text-center">净值</span> <span className="text-center">GPM</span>
                    <span className="text-center">XPM</span> <span className="text-center">伤害</span> <span className="text-center">治疗</span>
                  </div>
                  {[radiantPlayers, direPlayers].map((team, _ti) => team.map((p: any, i: number) => {
                    const heroImg = p.hero_id ? getHeroImg(p.hero_id, heroesData) : '';
                    const heroName = p.hero_id ? getHeroName(p.hero_id, heroesData) : '';
                    const isRadiant = p.player_slot < 128;
                    const won = isRadiant ? match.radiant_win : !match.radiant_win;
                    const playerName = p.name || p.personaname || `Player ${p.account_id}`;
                    return (
                      <div key={`${p.account_id}-${p.player_slot}`}
                        className={`grid grid-cols-[28px_1fr_60px_50px_50px_45px_45px_45px] gap-x-2 items-center border-b border-slate-800/50 px-3 py-2 text-xs last:border-b-0 ${
                          won ? 'bg-emerald-950/10' : 'bg-red-950/10'
                        }`}>
                        <div className="flex justify-center">
                          {heroImg ? <img src={heroImg} alt={heroName} className="w-6 h-6 rounded object-cover" /> : <div className="w-6 h-6 rounded bg-slate-700" />}
                        </div>
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[9px] text-slate-500 w-4 text-center">{isRadiant ? i+1 : i+1}</span>
                          <button onClick={() => onPlayerClick?.(p.account_id)} className="truncate text-slate-200 hover:text-white text-left">{playerName}</button>
                        </div>
                        <span className="text-center text-[11px] text-slate-200 tabular-nums">{getKDA(p)}</span>
                        <span className="text-center text-[11px] text-amber-400/80 tabular-nums">{formatCompact(getNetWorth(p))}</span>
                        <span className="text-center text-[11px] text-slate-300 tabular-nums">{p.gold_per_min || '—'}</span>
                        <span className="text-center text-[11px] text-slate-300 tabular-nums">{p.xp_per_min || '—'}</span>
                        <span className="text-center text-[11px] text-slate-400 tabular-nums">{formatCompact(p.hero_damage || 0)}</span>
                        <span className="text-center text-[11px] text-slate-400 tabular-nums">{formatCompact(p.hero_healing || 0)}</span>
                      </div>
                    );
                  }))}
                </div>
              </section>

              {/* Net Worth Chart */}
              <section>
                <h3 className="mb-3 text-sm font-semibold text-slate-300">经济曲线</h3>
                <MatchGraphs match={match} radiantTeamName={radiantTeamName} direTeamName={direTeamName} heroesData={heroesData} />
              </section>

              {/* Map Events */}
              <section>
                <h3 className="mb-3 text-sm font-semibold text-slate-300">地图事件</h3>
                <div className="rounded-lg border border-slate-800 divide-y divide-slate-800/50">
                  <div className="px-3 py-4 text-xs text-slate-500 text-center">地图事件数据加载中</div>
                </div>
              </section>
            </div>

            {/* Right sidebar */}
            <aside className="w-[240px] shrink-0 space-y-4">
              {/* Team Lineups */}
              <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                <h3 className="mb-2 text-xs font-semibold text-slate-300">队伍阵容</h3>
                <div className="space-y-1.5">
                  {[radiantPlayers, direPlayers].map((team, idx) => (
                    <div key={idx}>
                      <span className={`text-[10px] font-medium ${idx === 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {idx === 0 ? radiantTeamName : direTeamName}
                      </span>
                      {team.map((p: any) => {
                        const heroName = p.hero_id ? getHeroName(p.hero_id, heroesData) : '';
                        return (
                          <div key={p.account_id || p.player_slot} className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-400">
                            <span className="w-4 text-center text-[10px] text-slate-500">{p.player_slot < 128 ? p.player_slot + 1 : p.player_slot - 127}</span>
                            <span className="truncate">{heroName}</span>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              {/* Match Info Card */}
              <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                <h3 className="mb-2 text-xs font-semibold text-slate-300">比赛信息</h3>
                <div className="space-y-1.5 text-[11px]">
                  <div className="flex justify-between"><span className="text-slate-500">赛事</span><span className="text-slate-300">{match.league?.name || match.tournament_name || '—'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">赛制</span><span className="text-slate-300">{match.series_type || 'BO3'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">时长</span><span className="text-slate-300">{formatDuration(match.duration)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">状态</span><span className="text-emerald-400">已结束</span></div>
                </div>
              </div>

              {/* Team buttons */}
              <div className="space-y-1.5">
                <button onClick={() => onTeamClick?.(radiantTeamRef || { name: radiantTeamName })} className="w-full rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-left text-xs text-slate-300 hover:border-slate-700 transition-colors">
                  查看 {radiantTeamName} 资料 →
                </button>
                <button onClick={() => onTeamClick?.(direTeamRef || { name: direTeamName })} className="w-full rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-left text-xs text-slate-300 hover:border-slate-700 transition-colors">
                  查看 {direTeamName} 资料 →
                </button>
              </div>
            </aside>
          </div>
        </TabsContent>

        {/* Other tabs: reuse existing content */}
        <TabsContent value="draft"><PicksBansInline picksBans={match.picks_bans || []} heroesData={heroesData} /></TabsContent>
        <TabsContent value="players"><div className="text-sm text-slate-400 p-4">比赛数据 — see 概览 tab</div></TabsContent>
        <TabsContent value="economy"><MatchGraphs match={match} radiantTeamName={radiantTeamName} direTeamName={direTeamName} heroesData={heroesData} /></TabsContent>
        <TabsContent value="history"><div className="text-sm text-slate-400 p-4">历史交锋数据 — 开发中</div></TabsContent>
      </Tabs>
    </div>
  );
}
