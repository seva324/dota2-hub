import { useState, useEffect } from 'react';

interface Player {
  player_slot: number;
  account_id?: number;
  personaname?: string;
  name?: string;
  hero_id: number;
  level?: number;
  kills?: number;
  deaths?: number;
  assists?: number;
  gold_per_min?: number;
  xp_per_min?: number;
  last_hits?: number;
  denies?: number;
  lane?: number;
  lane_role?: number;
}

interface Match {
  match_id: number;
  duration: number;
  radiant_score: number;
  dire_score: number;
  radiant_win: boolean;
  players?: Player[];
}

interface AIReportSectionProps {
  match: Match;


}

export function AIReportSection({ match }: AIReportSectionProps) {
  const [report, setReport] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    generateReport();
  }, [match]);

  const generateReport = async () => {
    setLoading(true);
    setError('');

    try {
      const res = await fetch('https://seva324s-projects-dota2-hub.vercel.app/api/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId: match.match_id })
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      const data = await res.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      setReport(data.report || '生成内容为空');

    } catch (err) {
      console.error('Error generating report:', err);
      setError(err instanceof Error ? err.message : '生成失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mb-4"></div>
        <p className="text-slate-400 text-sm">AI 正在生成专业战报...</p>
        <p className="text-slate-500 text-xs mt-2">根据比赛数据撰写分析文案</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <div className="text-red-400 mb-4">⚠️ 生成失败</div>
        <p className="text-slate-400 text-sm">{error}</p>
        <button 
          onClick={generateReport}
          className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
        >
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="prose prose-invert max-w-none">
      <div className="bg-slate-900/50 rounded-lg p-4 text-sm overflow-auto max-h-[600px]">
        <div className="whitespace-pre-wrap text-slate-200 text-sm leading-relaxed space-y-2">
          {report.split('\n').map((line, i) => {
            if (line.startsWith('# ')) {
              return <h1 key={i} className="text-xl font-bold text-yellow-400 mt-4 mb-2">{line.replace('# ', '')}</h1>;
            }
            if (line.startsWith('## ')) {
              return <h2 key={i} className="text-lg font-bold text-blue-400 mt-3 mb-2">{line.replace('## ', '')}</h2>;
            }
            if (line.startsWith('### ')) {
              return <h3 key={i} className="text-base font-bold text-green-400 mt-2 mb-1">{line.replace('### ', '')}</h3>;
            }
            if (line.trim() === '') {
              return <br key={i} />;
            }
            const formattedLine = line
              .replace(/\*\*(.+?)\*\*/g, '<span class="text-yellow-300 font-bold">$1</span>');
            return <p key={i} dangerouslySetInnerHTML={{ __html: formattedLine }} />;
          })}
        </div>
      </div>
    </div>
  );
}
