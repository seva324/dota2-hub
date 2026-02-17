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
  objectives?: Array<{
    type: string;
    time: number;
    key?: string;
  }>;
  teamfights?: Array<{
    start: number;
    end: number;
    radiant_deaths: number[];
    dire_deaths: number[];
    buybacks: number;
  }>;
  radiant_gold_adv?: number[];
}

interface AIReportSectionProps {
  match: Match;
  radiantTeamName: string;
  direTeamName: string;
}

export function AIReportSection({ match, radiantTeamName, direTeamName }: AIReportSectionProps) {
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
      const radiantPlayers = match.players?.filter((p: Player) => p.player_slot < 128) || [];
      const direPlayers = match.players?.filter((p: Player) => p.player_slot >= 128) || [];

      // Prepare data for API
      const requestData = {
        match_id: match.match_id,
        duration: match.duration || 0,
        radiant_score: match.radiant_score || 0,
        dire_score: match.dire_score || 0,
        radiant_win: match.radiant_win || false,
        radiant_team_name: radiantTeamName,
        dire_team_name: direTeamName,
        players: [
          ...radiantPlayers.map((p: Player) => ({
            player_slot: p.player_slot,
            hero_id: p.hero_id,
            name: p.name || p.personaname || '',
            kills: p.kills || 0,
            deaths: p.deaths || 0,
            assists: p.assists || 0,
            gold_per_min: p.gold_per_min || 0,
            xp_per_min: p.xp_per_min || 0,
            last_hits: p.last_hits || 0,
            denies: p.denies || 0,
            lane: p.lane || 1,
            lane_role: p.lane_role || 1
          })),
          ...direPlayers.map((p: Player) => ({
            player_slot: p.player_slot,
            hero_id: p.hero_id,
            name: p.name || p.personaname || '',
            kills: p.kills || 0,
            deaths: p.deaths || 0,
            assists: p.assists || 0,
            gold_per_min: p.gold_per_min || 0,
            xp_per_min: p.xp_per_min || 0,
            last_hits: p.last_hits || 0,
            denies: p.denies || 0,
            lane: p.lane || 1,
            lane_role: p.lane_role || 1
          }))
        ],
        objectives: match.objectives || [],
        teamfights: match.teamfights || [],
        radiant_gold_adv: match.radiant_gold_adv || [],
        picks_bans: []
      };

      // Call AI API
      const apiUrl = '/api/generate-report';
      
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData)
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
            // Format headings
            if (line.startsWith('# ')) {
              return <h1 key={i} className="text-xl font-bold text-yellow-400 mt-4 mb-2">{line.replace('# ', '')}</h1>;
            }
            if (line.startsWith('## ')) {
              return <h2 key={i} className="text-lg font-bold text-blue-400 mt-3 mb-2">{line.replace('## ', '')}</h2>;
            }
            if (line.startsWith('### ')) {
              return <h3 key={i} className="text-base font-bold text-green-400 mt-2 mb-1">{line.replace('### ', '')}</h3>;
            }
            if (line.startsWith('- ') || line.match(/^\d+\./)) {
              return <li key={i} className="text-slate-300 ml-4">{line.replace(/^[-\d.]\s*/, '')}</li>;
            }
            if (line.trim() === '') {
              return <br key={i} />;
            }
            // Bold text
            const formattedLine = line
              .replace(/\*\*(.+?)\*\*/g, '<span class="text-yellow-300 font-bold">$1</span>')
              .replace(/\*(.+?)\*/g, '<span class="text-blue-300">$1</span>');
            return <p key={i} dangerouslySetInnerHTML={{ __html: formattedLine }} />;
          })}
        </div>
      </div>
    </div>
  );
}
