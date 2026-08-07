import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, RefreshCw, Users } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { SafeImg } from '@/components/custom/SafeImg';
import { TeamLogoFallback } from '@/components/custom/TeamLogoFallback';
import { EmptyState } from '@/components/custom/EmptyState';
import { toCnAssetUrl } from '@/lib/assetUrls';
import { toFlagImageUrl } from '@/lib/playerProfile';
import { apiFetch } from '@/lib/api-cache';

interface RankingPlayer {
  name: string;
  photo: string | null;
  soloRank: number | null;
  country: string | null;
  playerUrl: string | null;
}

interface RankingTeam {
  rank: number;
  name: string;
  logo: string | null;
  teamUrl: string | null;
  players: RankingPlayer[];
}

const RANK_FONT = { fontFamily: "'Alibaba PuHuiTi', 'Exo2', sans-serif" };

const INITIAL_VISIBLE_TEAMS = 10;
const EXPAND_STEP_TEAMS = 10;

const MEDALS = {
  gold: { color: '#F5C96B', label: 'CHAMPION' },
  silver: { color: '#C7CDD6', label: 'RUNNER-UP' },
  bronze: { color: '#B08A5E', label: 'THIRD PLACE' },
} as const;

type MedalKey = keyof typeof MEDALS;

/** 从 DLTV 战队 URL（/teams/<slug>）提取 slug。 */
function slugFromTeamUrl(url?: string | null): string | null {
  const match = String(url || '').match(/\/teams\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

type OpenTeamHandler = (team: { name: string; slug?: string | null }) => void;

function formatUpdatedAt(ts?: number): string {
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return '';
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function PlayerAvatar({ player, teamName, px = 40, onSelect }: {
  player: RankingPlayer;
  teamName: string;
  px?: number;
  onSelect: (teamName: string, player: RankingPlayer) => void;
}) {
  return (
    <button
      type="button"
      title={`${player.name} · ${teamName}`}
      onClick={() => onSelect(teamName, player)}
      className="relative shrink-0 overflow-hidden rounded-full border border-white/10 bg-[#1a1d24] transition-transform duration-200 hover:scale-110 hover:border-red-400/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400/60"
      style={{ width: px, height: px }}
    >
      <SafeImg
        src={toCnAssetUrl(player.photo)}
        alt={player.name}
        className="size-full object-cover"
        fallback={
          <span className="flex size-full items-center justify-center text-xs font-bold text-slate-400">
            {player.name[0]?.toUpperCase() || '?'}
          </span>
        }
      />
    </button>
  );
}

function PodiumCard({ team, medal, onSelectPlayer, onOpenTeam }: {
  team: RankingTeam;
  medal: MedalKey;
  onSelectPlayer: (teamName: string, player: RankingPlayer) => void;
  onOpenTeam?: OpenTeamHandler;
}) {
  const champion = medal === 'gold';
  const { color, label } = MEDALS[medal];
  return (
    <article
      className={[
        'relative flex flex-col items-center gap-3.5 rounded-3xl border px-5 pb-6 pt-7 text-center',
        champion
          ? 'border-red-500/25 bg-gradient-to-b from-[#131c2b] to-[#0A1623] shadow-[0_0_70px_rgba(244,61,61,0.14)] md:pb-9 md:pt-9'
          : 'border-white/10 bg-[#0A1623]/70',
      ].join(' ')}
    >
      {champion && (
        <span className="mb-1 rounded-full border border-red-400/40 bg-red-500/10 px-3 py-1 text-[10px] font-bold tracking-[0.25em] text-red-300">
          {label}
        </span>
      )}
      <div
        className={champion ? 'text-8xl leading-none md:text-9xl' : 'text-6xl leading-none'}
        style={{ ...RANK_FONT, color, textShadow: champion ? '0 0 32px rgba(244,61,61,0.35)' : undefined }}
      >
        {team.rank}
      </div>
      <button
        type="button"
        onClick={() => onOpenTeam?.({ name: team.name, slug: slugFromTeamUrl(team.teamUrl) })}
        title={`查看 ${team.name} 战队资料`}
        className="flex flex-col items-center gap-2 rounded-xl px-3 py-1 transition-colors hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400/60"
      >
        <SafeImg
          src={toCnAssetUrl(team.logo)}
          alt={`${team.name} logo`}
          className={champion ? 'size-16 object-contain md:size-20' : 'size-12 object-contain md:size-14'}
          fallback={<TeamLogoFallback name={team.name} size={champion ? 64 : 48} />}
        />
        <h2
          className={champion ? 'max-w-full truncate text-xl tracking-wide text-white md:text-2xl' : 'max-w-full truncate text-lg tracking-wide text-white'}
          style={RANK_FONT}
        >
          {team.name}
        </h2>
      </button>
      <div className="flex items-center gap-2">
        {team.players.map((player) => (
          <PlayerAvatar key={player.name} player={player} teamName={team.name} px={champion ? 44 : 40} onSelect={onSelectPlayer} />
        ))}
      </div>
    </article>
  );
}

function TeamRow({ team, onSelectPlayer, onOpenTeam }: {
  team: RankingTeam;
  onSelectPlayer: (teamName: string, player: RankingPlayer) => void;
  onOpenTeam?: OpenTeamHandler;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5 rounded-2xl border border-white/5 bg-[#0A1623]/50 px-4 py-3 transition-colors hover:border-white/10 hover:bg-[#0A1623]">
      <span className="w-8 shrink-0 text-center text-lg leading-none text-slate-300" style={RANK_FONT}>
        {team.rank}
      </span>
      <button
        type="button"
        onClick={() => onOpenTeam?.({ name: team.name, slug: slugFromTeamUrl(team.teamUrl) })}
        title={`查看 ${team.name} 战队资料`}
        className="flex min-w-0 items-center gap-3 rounded-lg py-0.5 pr-1 transition-colors hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400/60"
      >
        <SafeImg
          src={toCnAssetUrl(team.logo)}
          alt={`${team.name} logo`}
          className="size-9 shrink-0 object-contain"
          fallback={<TeamLogoFallback name={team.name} size={36} />}
        />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{team.name}</span>
      </button>
      <div className="order-last flex basis-full items-center justify-end gap-1.5 md:order-none md:basis-auto">
        {team.players.map((player) => (
          <PlayerAvatar key={player.name} player={player} teamName={team.name} px={36} onSelect={onSelectPlayer} />
        ))}
      </div>
    </li>
  );
}

function PlayerDialog({ teamName, player, onClose }: {
  teamName: string;
  player: RankingPlayer | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={player !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm overflow-hidden border-white/10 bg-[#0A1623] p-0 sm:max-w-sm">
        {player && (
          <>
            <div className="aspect-[4/3] w-full overflow-hidden bg-[#0f1115]">
              <SafeImg
                src={toCnAssetUrl(player.photo)}
                alt={player.name}
                className="size-full object-cover object-top"
                fallback={
                  <div className="flex size-full items-center justify-center text-5xl font-bold text-slate-600">
                    {player.name[0]?.toUpperCase() || '?'}
                  </div>
                }
              />
            </div>
            <div className="flex items-end justify-between gap-4 px-5 pb-5 pt-2">
              <div className="min-w-0">
                <div className="truncate text-2xl tracking-wide text-white" style={RANK_FONT}>{player.name}</div>
                <div className="mt-1 text-xs text-slate-400">
                  {teamName}
                  {player.soloRank !== null && (
                    <span className="ml-1.5 rounded bg-white/10 px-1.5 py-0.5 text-[11px] font-semibold text-slate-200">
                      天梯 #{player.soloRank}
                    </span>
                  )}
                </div>
              </div>
              {player.country && (
                <img
                  src={toFlagImageUrl(player.country)}
                  alt={player.country.toUpperCase()}
                  title={player.country.toUpperCase()}
                  className="h-5 w-7 shrink-0 rounded-[3px] object-cover"
                />
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function TeamsPage({ onOpenTeam }: { onOpenTeam?: OpenTeamHandler }) {
  const [teams, setTeams] = useState<RankingTeam[]>([]);
  const [updatedAt, setUpdatedAt] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ teamName: string; player: RankingPlayer } | null>(null);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_TEAMS);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ teams?: RankingTeam[]; updatedAt?: number }>('/api/team-ranking', { ttlMs: 5 * 60 * 1000, cacheEmpty: false });
      if (!Array.isArray(data?.teams) || data.teams.length === 0) {
        throw new Error('empty');
      }
      setTeams(data.teams);
      setUpdatedAt(data.updatedAt);
    } catch (e) {
      console.error('[TeamsPage] failed to load ranking:', e instanceof Error ? e.message : String(e));
      setError('排名暂时无法获取，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load().finally(() => controller.abort());
    return () => controller.abort();
  }, [load]);

  const visibleTeams = teams.slice(0, visibleCount);
  const podium = visibleTeams.slice(0, 3);
  const rest = visibleTeams.slice(3);
  const hasMore = teams.length > visibleCount;

  return (
    <div className="relative mx-auto w-full max-w-[1280px] px-4 pb-16 pt-24 lg:px-6">
      <section className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl tracking-wide text-white md:text-4xl" style={RANK_FONT}>
            TEAM RANKING
          </h1>
        </div>
        {!loading && !error && (
          <span className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-400">
            {teams.length} 支战队{updatedAt ? ` · 更新于 ${formatUpdatedAt(updatedAt)}` : ''}
          </span>
        )}
      </section>

      {loading && (
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 md:grid-cols-3 md:items-end">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-4 rounded-3xl border border-white/5 bg-white/[0.03] px-6 pb-6 pt-7">
                <div className="h-8 w-14 animate-pulse rounded bg-white/10" />
                <div className="size-14 animate-pulse rounded-full bg-white/10" />
                <div className="h-5 w-28 animate-pulse rounded bg-white/10" />
                <div className="flex gap-2">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <div key={j} className="size-10 animate-pulse rounded-full bg-white/10" />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3.5 rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
                <div className="h-5 w-6 animate-pulse rounded bg-white/10" />
                <div className="size-9 animate-pulse rounded-full bg-white/10" />
                <div className="h-4 flex-1 animate-pulse rounded bg-white/10" />
                <div className="flex gap-1.5">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <div key={j} className="size-9 animate-pulse rounded-full bg-white/10" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <EmptyState
          icon={<Users className="size-5" />}
          label={error}
          hint="数据源暂时不可用，稍后再试"
        >
          <button
            type="button"
            onClick={() => load()}
            className="mt-1 inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/10 hover:text-white"
          >
            <RefreshCw className="size-4" />
            重新加载
          </button>
        </EmptyState>
      )}

      {!loading && !error && teams.length > 0 && (
        <div className="flex flex-col gap-8">
          <div className="grid gap-4 md:grid-cols-3 md:items-end">
            {podium.map((team, index) => {
              const medal: MedalKey = index === 0 ? 'gold' : index === 1 ? 'silver' : 'bronze';
              return (
                <div key={team.rank} className={index === 0 ? 'md:order-2' : index === 1 ? 'md:order-1' : 'md:order-3'}>
                  <PodiumCard team={team} medal={medal} onSelectPlayer={(teamName, player) => setSelected({ teamName, player })} onOpenTeam={onOpenTeam} />
                </div>
              );
            })}
          </div>
          <ul className="grid gap-3 md:grid-cols-2">
            {rest.map((team) => (
              <TeamRow key={team.rank} team={team} onSelectPlayer={(teamName, player) => setSelected({ teamName, player })} onOpenTeam={onOpenTeam} />
            ))}
          </ul>
          {hasMore && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setVisibleCount((count) => count + EXPAND_STEP_TEAMS)}
                className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/10 hover:text-white"
              >
                <ChevronDown className="size-4" />
                展开更多（剩余 {teams.length - visibleCount} 支）
              </button>
            </div>
          )}
        </div>
      )}

      <PlayerDialog
        teamName={selected?.teamName ?? ''}
        player={selected?.player ?? null}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
