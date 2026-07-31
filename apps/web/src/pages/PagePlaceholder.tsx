import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export interface PagePlaceholderProps {
  title: string;
  badge?: string;
  description: string;
  onBack: () => void;
}

export function PagePlaceholder({ title, badge, description, onBack }: PagePlaceholderProps) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-[1480px] flex-col items-center justify-center gap-4 px-4 pt-24 text-center lg:px-6">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="border-white/10 text-xs font-semibold tracking-wide text-red-400">
          {badge ?? 'DotaHub'}
        </Badge>
      </div>
      <h1 className="text-3xl font-black tracking-tight text-white">{title}</h1>
      <p className="max-w-md text-sm leading-relaxed text-slate-400">{description}</p>
      <Button
        variant="outline"
        className="mt-2 border-white/10 bg-white/5 text-slate-200 hover:border-red-400/40 hover:bg-red-500/10 hover:text-white"
        onClick={onBack}
      >
        <ArrowLeft className="size-4" />
        返回首页
      </Button>
    </div>
  );
}
