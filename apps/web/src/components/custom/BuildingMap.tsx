import type { LiveBuildingState } from '@/types/liveDetail';

const design = {
  radiant: '#34d399',
  dire: '#ff3b30',
  dead: '#2a2d35',
  lane: 'rgba(255,255,255,0.14)',
  grid: 'rgba(255,255,255,0.06)',
};

type StructureKind = 'tower' | 'shrine' | 't4';

interface StructurePos {
  side: 'radiant' | 'dire';
  lane: 'top' | 'mid' | 'bot' | 't4';
  idx: number;
  kind: StructureKind;
  x: number;
  y: number;
}

/** 建筑点位坐标（220×220，radiant 左下 / dire 右上），与 hawk.live 渲染一致 */
const STRUCTURES: StructurePos[] = [
  // radiant 侧
  { side: 'radiant', lane: 'top', idx: 0, kind: 'tower', x: 20, y: 60 },
  { side: 'radiant', lane: 'top', idx: 1, kind: 'tower', x: 20, y: 100 },
  { side: 'radiant', lane: 'top', idx: 2, kind: 'tower', x: 20, y: 150 },
  { side: 'radiant', lane: 'top', idx: 3, kind: 'shrine', x: 7, y: 157 },
  { side: 'radiant', lane: 'top', idx: 4, kind: 'shrine', x: 23, y: 157 },
  { side: 'radiant', lane: 'mid', idx: 0, kind: 'tower', x: 95, y: 125 },
  { side: 'radiant', lane: 'mid', idx: 1, kind: 'tower', x: 75, y: 145 },
  { side: 'radiant', lane: 'mid', idx: 2, kind: 'tower', x: 58, y: 162 },
  { side: 'radiant', lane: 'mid', idx: 3, kind: 'shrine', x: 40, y: 157 },
  { side: 'radiant', lane: 'mid', idx: 4, kind: 'shrine', x: 53, y: 170 },
  { side: 'radiant', lane: 'bot', idx: 0, kind: 'tower', x: 160, y: 200 },
  { side: 'radiant', lane: 'bot', idx: 1, kind: 'tower', x: 120, y: 200 },
  { side: 'radiant', lane: 'bot', idx: 2, kind: 'tower', x: 70, y: 200 },
  { side: 'radiant', lane: 'bot', idx: 3, kind: 'shrine', x: 53, y: 187 },
  { side: 'radiant', lane: 'bot', idx: 4, kind: 'shrine', x: 53, y: 203 },
  { side: 'radiant', lane: 't4', idx: 0, kind: 't4', x: 20, y: 190 },
  { side: 'radiant', lane: 't4', idx: 1, kind: 't4', x: 30, y: 200 },
  // dire 侧（镜像）
  { side: 'dire', lane: 'top', idx: 0, kind: 'tower', x: 60, y: 20 },
  { side: 'dire', lane: 'top', idx: 1, kind: 'tower', x: 100, y: 20 },
  { side: 'dire', lane: 'top', idx: 2, kind: 'tower', x: 150, y: 20 },
  { side: 'dire', lane: 'top', idx: 3, kind: 'shrine', x: 157, y: 7 },
  { side: 'dire', lane: 'top', idx: 4, kind: 'shrine', x: 157, y: 23 },
  { side: 'dire', lane: 'mid', idx: 0, kind: 'tower', x: 125, y: 95 },
  { side: 'dire', lane: 'mid', idx: 1, kind: 'tower', x: 145, y: 75 },
  { side: 'dire', lane: 'mid', idx: 2, kind: 'tower', x: 162, y: 58 },
  { side: 'dire', lane: 'mid', idx: 3, kind: 'shrine', x: 157, y: 40 },
  { side: 'dire', lane: 'mid', idx: 4, kind: 'shrine', x: 170, y: 53 },
  { side: 'dire', lane: 'bot', idx: 0, kind: 'tower', x: 200, y: 160 },
  { side: 'dire', lane: 'bot', idx: 1, kind: 'tower', x: 200, y: 120 },
  { side: 'dire', lane: 'bot', idx: 2, kind: 'tower', x: 200, y: 70 },
  { side: 'dire', lane: 'bot', idx: 3, kind: 'shrine', x: 187, y: 53 },
  { side: 'dire', lane: 'bot', idx: 4, kind: 'shrine', x: 203, y: 53 },
  { side: 'dire', lane: 't4', idx: 0, kind: 't4', x: 190, y: 20 },
  { side: 'dire', lane: 't4', idx: 1, kind: 't4', x: 200, y: 30 },
];

/** 单格建筑是否存活：字符串第 idx 位为 '1' */
function isAlive(state: LiveBuildingState | null, side: 'radiant' | 'dire', lane: string, idx: number): boolean {
  const laneStr = state?.[side]?.[lane as 'top'] as string | undefined;
  return !!(laneStr && laneStr[idx] === '1');
}

/** 建筑状态地图：三路塔/泉水/T4 存活点亮，被摧毁置灰，天辉/夜魇队名标注。 */
export function BuildingMap({ buildingState, radiantName, direName }: {
  buildingState: LiveBuildingState | null;
  radiantName?: string;
  direName?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-1">
      <span className="flex items-center gap-1.5 text-xs font-bold" style={{ color: design.radiant }}>
        <span className="size-2 rounded-full" style={{ backgroundColor: design.radiant, boxShadow: `0 0 8px ${design.radiant}55` }} />
        {radiantName || 'Radiant'}（Radiant）
      </span>
      <svg viewBox="0 0 220 220" className="h-auto w-full max-w-[280px]" role="img" aria-label="建筑状态地图">
        {/* 背景网格 */}
        <rect width="220" height="220" fill="#10141a" rx="12" />
        <path d="M65 155 L155 65" stroke={design.lane} strokeWidth="2" fill="none" />
        <path d="M20 140 L20 20 L140 20" stroke={design.lane} strokeWidth="2" fill="none" />
        <path d="M80 200 L200 200 L200 80" stroke={design.lane} strokeWidth="2" fill="none" />
        <path d="M155 65 L155 40 M20 20 L40 20" stroke={design.grid} strokeWidth="1" fill="none" />

        {STRUCTURES.map((s) => {
          const alive = isAlive(buildingState, s.side, s.lane, s.idx);
          const fill = alive ? design[s.side] : design.dead;
          const label = `${s.side}-${s.lane}-${s.idx}`;
          return s.kind === 'shrine' ? (
            <rect key={label} x={s.x - 5} y={s.y - 5} width="10" height="10" rx="2" fill={fill} opacity={alive ? 1 : 0.7} />
          ) : (
            <circle key={label} cx={s.x} cy={s.y} r={s.kind === 't4' ? 5 : 6} fill={fill} opacity={alive ? 1 : 0.7} stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
          );
        })}
      </svg>
      <span className="flex items-center gap-1.5 text-xs font-bold" style={{ color: design.dire }}>
        <span className="size-2 rounded-full" style={{ backgroundColor: design.dire, boxShadow: `0 0 8px ${design.dire}55` }} />
        {direName || 'Dire'}（Dire）
      </span>
    </div>
  );
}
