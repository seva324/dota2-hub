import { Shield, Flag } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { SafeImg } from '@/components/custom/SafeImg';type Props = {
  teamName: string;
  logoUrl: string | null;
  tag?: string | null;
  region?: string | null;
  isCnTeam: boolean;
  isLoading: boolean;
  teamHue: number;
};

export function TeamFlyoutHeader({ teamName, logoUrl, tag, region, isCnTeam, isLoading, teamHue }: Props) {
  return (
    <div className="relative border-b border-border/30 p-5 overflow-hidden"
      style={{ background: `linear-gradient(160deg, rgb(10 18 28) 0%, rgb(10 18 28) 35%, hsl(${teamHue} 50% 18% / 0.45) 100%)` }}>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none opacity-[0.025]">
        <span className="text-[7rem] font-black tracking-[0.5em] text-white" style={{ fontFamily: 'system-ui' }}>DOTA2</span>
      </div>
      <div className="relative z-10 flex items-center gap-4">
        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-secondary/90 to-secondary/40 border border-border/30 flex items-center justify-center overflow-hidden shrink-0"
          style={{ boxShadow: `0 0 28px hsl(${teamHue} 60% 40% / 0.2), 0 6px 20px -4px rgba(0,0,0,0.45)` }}>
          <SafeImg src={logoUrl} alt={teamName} className="w-10 h-10 object-contain" fallback={<Shield className="w-6 h-6 text-slate-400" />} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-extrabold text-white tracking-tight truncate">{teamName}</h2>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {isLoading && <Badge variant="outline" className="border-blue-500/30 text-blue-300 text-[10px]">加载中...</Badge>}
            <Badge variant="outline" className="border-amber-500/30 text-amber-300/80 text-[10px] font-semibold tracking-wider uppercase">DOTA 2</Badge>
            {tag && <Badge variant="outline" className="border-border/40 text-muted-foreground text-[10px]">{tag}</Badge>}
            {(region && region.toLowerCase() !== 'unknown') || isCnTeam ? (
              <Badge variant="outline" className="border-red-500/30 text-red-300/80 text-[10px]">
                <Flag className="w-3 h-3 mr-0.5" />
                {(region && region.toLowerCase() !== 'unknown') ? region : 'China'}
              </Badge>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
