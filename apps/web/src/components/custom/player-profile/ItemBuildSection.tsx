import { Backpack } from 'lucide-react';

type ItemEntry = { itemId: number; name: string; imageUrl: string; usageRate: number };

type Props = { items: ItemEntry[] };

export function ItemBuildSection({ items }: Props) {
  if (!items.length) {
    return (
      <section>
        <h4 className="mb-3 flex items-center gap-1.5 text-xs font-bold text-foreground uppercase tracking-wider">
          <Backpack className="size-3.5 text-amber-400" /> 常用装备
        </h4>
        <div className="rounded-xl border border-border/30 bg-secondary/30 p-4 text-sm text-slate-500">暂无装备统计</div>
      </section>
    );
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 text-xs font-bold text-foreground uppercase tracking-wider">
          <Backpack className="size-3.5 text-amber-400" /> 常用装备
        </h4>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {items.slice(0, 8).map((item) => (
          <div key={item.itemId} className="flex flex-col items-center gap-1.5 rounded-xl border border-border/30 bg-secondary/30 p-3 transition hover:border-slate-600/60 hover:bg-slate-800/50">
            <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-slate-700">
              {item.imageUrl ? (
                <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex size-full items-center justify-center text-[10px] text-slate-500">{item.name.slice(0, 2)}</div>
              )}
            </div>
            <span className="truncate w-full text-center text-[10px] text-slate-300">{item.name}</span>
            <span className="text-[10px] font-medium text-amber-400/80">{item.usageRate}%</span>
          </div>
        ))}
      </div>
    </section>
  );
}
