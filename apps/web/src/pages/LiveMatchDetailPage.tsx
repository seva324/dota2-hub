import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { LiveScoreHeader } from '@/components/custom/LiveScoreHeader';
import { NetWorthChart } from '@/components/custom/NetWorthChart';
import { BuildingMap } from '@/components/custom/BuildingMap';
import { LiveLineup } from '@/components/custom/LiveLineup';
import { apiFetch } from '@/lib/api-cache';
import type { LiveDetailPayload, LiveMap } from '@/types/liveDetail';

const design = {
  blue: '#2b55e8',
  red: '#ff3b30',
  card: '#1a1d24',
  bg: '#0f1115',
};

const POLL_INTERVAL_MS = 15_000;

function formatBestOf(value: number | null): string {
  return Number.isFinite(value) && (value as number) > 0 ? `BO${value}` : 'BO3';
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl p-4" style={{ backgroundColor: design.card }}>
      <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">{title}</h2>
      {children}
    </section>
  );
}

/** Live 比赛详情全屏页：15s 轮询 /api/live-detail，展示比分/经济曲线/建筑/BP。 */
export function LiveMatchDetailPage({ seriesId, slug, champ, onBack }: {
  seriesId: string;
  slug?: string;
  champ?: string;
  onBack: () => void;
}) {
  const [payload, setPayload] = useState<LiveDetailPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeMapNumber, setActiveMapNumber] = useState<number | null>(null);
  const activeMapNumberRef = useRef<number | null>(null);
  const loadedRef = useRef(false);

  const selectMap = useCallback((number: number) => {
    activeMapNumberRef.current = number;
    setActiveMapNumber(number);
  }, []);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ series_id: seriesId });
      if (slug) params.set('slug', slug);
      if (champ) params.set('champ', champ);
      const data = await apiFetch<LiveDetailPayload>(`/api/live-detail?${params.toString()}`, {
        ttlMs: 0,
        cacheEmpty: false,
      });
      // timeout/not_found 响应无 maps：静默保留上一帧，避免用残缺 payload 渲染崩溃
      if (!data?.seriesId || !Array.isArray(data?.maps)) {
        loadedRef.current = true;
        return;
      }
      setPayload((prev) => {
        if (prev == null) {
          const initial = data.currentMapNumber ?? data.maps.find((m) => m.status === 'live')?.number ?? null;
          activeMapNumberRef.current = initial;
          setActiveMapNumber(initial);
        } else {
          const current = activeMapNumberRef.current;
          const selectedNow = data.maps.find((m) => m.number === current);
          const liveMap = data.maps.find((m) => m.status === 'live');
          // 选中的地图已结束且出现新的 live 地图 → 自动跟进（保持 LIVE 指示）
          if (current != null && selectedNow && selectedNow.status !== 'live' && liveMap && liveMap.number !== current) {
            activeMapNumberRef.current = liveMap.number;
            setActiveMapNumber(liveMap.number);
          }
        }
        return data;
      });
      setError(null);
    } catch (e) {
      // 网络错误保留现有数据，轮询继续
      setError(e instanceof Error ? e.message : '加载失败');
    }
  }, [seriesId, slug, champ]);

  useEffect(() => {
    load();
    const timer = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [load]);

  if (error && !payload) {
    return (
      <div className="mx-auto flex max-w-[1280px] flex-col items-center gap-4 px-4 pt-28 lg:px-6" style={{ backgroundColor: design.bg }}>
        <button type="button" onClick={onBack} className="flex items-center gap-2 text-sm font-semibold text-slate-300 hover:text-white">
          <ArrowLeft className="size-4" /> 返回赛程
        </button>
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-8 py-6 text-sm text-slate-300">{error}</div>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center" style={{ backgroundColor: design.bg }}>
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <Loader2 className="size-6 animate-spin" />
          <span className="text-sm">正在加载直播详情…</span>
        </div>
      </div>
    );
  }

  const maps = payload.maps.length > 0
    ? payload.maps
    : [{ matchId: null, number: 1, isTeam1Radiant: true, status: 'upcoming', winner: null, team1Score: null, team2Score: null, gameTime: null, team1NetWorthLead: null, team2NetWorthLead: null, buildingState: null, picks: [], states: [], odds: [] } as LiveMap];
  const activeMap = maps.find((m) => m.number === activeMapNumber) ?? maps[maps.length - 1] ?? maps[0];
  const live = activeMap.status === 'live';

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pt-24 lg:px-6" style={{ backgroundColor: design.bg }}>
      <div className="flex flex-col gap-4 pb-16">
        {/* 顶部：返回 + 赛事信息 */}
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={onBack} className="flex items-center gap-2 text-sm font-semibold text-slate-300 hover:text-white">
            <ArrowLeft className="size-4" /> 返回赛程
          </button>
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold text-slate-200">
              {payload.championship?.name || 'Live Match'} · {formatBestOf(payload.bestOf)}
            </span>
            {live && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: design.red }}>
                <span className="size-1.5 animate-pulse rounded-full bg-white" /> LIVE
              </span>
            )}
          </div>
        </div>

        <LiveScoreHeader
          payload={payload}
          activeMap={activeMap}
          onSelectMap={selectMap}
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SectionCard title="经济曲线">
            <NetWorthChart states={activeMap.states} />
          </SectionCard>
          <SectionCard title="建筑状态">
            <BuildingMap buildingState={activeMap.buildingState} />
          </SectionCard>
        </div>

        <SectionCard title={`阵容 · Map ${activeMap.number}`}>
          <LiveLineup
            picks={activeMap.picks}
            team1Name={payload.team1.name || 'TBD'}
            team2Name={payload.team2.name || 'TBD'}
            isTeam1Radiant={activeMap.isTeam1Radiant}
          />
        </SectionCard>

        {payload.cached === false && (
          <p className="text-center text-[10px] text-slate-600">数据来源 hawk.live · {payload.fetchedAt ? new Date(payload.fetchedAt).toLocaleTimeString() : ''}</p>
        )}
      </div>
    </div>
  );
}
