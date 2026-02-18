import { useState, useEffect } from 'react';
import { Clock, Trophy, Target } from 'lucide-react';

interface Match {
  id: string;
  team1: string;
  team1Logo: string;
  team2: string;
  team2Logo: string;
  time: string; // 北京时间
  timestamp: number; // Unix timestamp
  tournament: string;
  stage: string;
  format: string;
}

// 战队Logo映射
const teamLogos: Record<string, string> = {
  'XG': '/images/xg-logo.png',
  'YB': '/images/yb-logo.png',
  'VG': '/images/vg-logo.png',
  'LGD': '/images/lgd-logo.png',
  'Spirit': '/images/spirit-logo.png',
  'Team Spirit': '/images/spirit-logo.png',
};

// 战队简称映射
const teamShortNames: Record<string, string> = {
  'Xtreme Gaming': 'XG',
  'Yakult Brothers': 'YB',
  'Team Spirit': 'Spirit',
  'Natus Vincere': 'NAVI',
  'Tundra Esports': 'Tundra',
  'Team Liquid': 'Liquid',
  'Team Falcons': 'Falcons',
  'OG': 'OG',
  'BetBoom Team': 'BB',
  'Aurora Gaming': 'Aurora',
  'PARIVISION': 'PARI',
  'GamerLegion': 'GL',
  'Execration': 'XctN',
  'MOUZ': 'MOUZ',
};

// 赛事Logo映射
const tournamentLogos: Record<string, string> = {
  'DreamLeague Season 28': '/images/dreamleague.jpg',
  'DreamLeague S28': '/images/dreamleague.jpg',
  'BLAST Slam VI': '/images/blast-slam.jpg',
  'ESL Challenger China': '/images/esl-reform.jpg',
};

function getTeamLogo(teamName: string): string {
  const short = teamShortNames[teamName] || teamName;
  return teamLogos[short] || teamLogos[teamName] || '';
}

function getTournamentLogo(tournament: string): string {
  return tournamentLogos[tournament] || '/images/dreamleague.jpg';
}

function formatCountdown(timestamp: number): string {
  const now = Date.now();
  const diff = timestamp - now;
  
  if (diff <= 0) return '比赛中';
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}天${hours % 24}小时`;
  }
  
  return `${hours}小时${minutes}分钟`;
}

export function UpcomingMatches() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [countdown, setCountdown] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 加载比赛数据
    fetch('/data/upcoming.json')
      .then(res => res.json())
      .then(data => {
        setMatches(data.matches || []);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  // 每分钟更新倒计时
  useEffect(() => {
    const updateCountdown = () => {
      const now = Date.now();
      const newCountdown: Record<string, string> = {};
      matches.forEach(m => {
        newCountdown[m.id] = formatCountdown(m.timestamp);
      });
      setCountdown(newCountdown);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 60000);
    return () => clearInterval(interval);
  }, [matches]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // 只显示未来7天的比赛
  const upcomingMatches = matches.filter(m => m.timestamp > Date.now()).slice(0, 8);

  if (upcomingMatches.length === 0) {
    return (
      <div className="text-center p-8 text-slate-400">
        <Trophy className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>近期暂无比赛</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4">
        {upcomingMatches.map((match) => (
          <div
            key={match.id}
            className="bg-slate-800/50 rounded-lg p-4 border border-slate-700 hover:border-blue-500/50 transition-colors"
          >
            {/* 赛事信息 */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <img 
                  src={getTournamentLogo(match.tournament)} 
                  alt={match.tournament}
                  className="w-5 h-5 rounded object-cover"
                />
                <span className="text-sm text-slate-400">{match.tournament}</span>
              </div>
              <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-1 rounded">
                {match.stage}
              </span>
            </div>

            {/* 对阵双方 */}
            <div className="flex items-center justify-between">
              {/* 队伍1 */}
              <div className="flex-1 flex items-center gap-3">
                <img 
                  src={match.team1Logo || '/images/placeholder.png'} 
                  alt={match.team1}
                  className="w-10 h-10 rounded-full object-contain bg-slate-700"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect fill="%23475569" width="40" height="40"/><text x="20" y="25" text-anchor="middle" fill="white" font-size="14">?</text></svg>';
                  }}
                />
                <span className="font-bold text-lg">{match.team1}</span>
              </div>

              {/* VS和时间 */}
              <div className="flex flex-col items-center px-4">
                <span className="text-2xl font-bold text-slate-500">VS</span>
              </div>

              {/* 队伍2 */}
              <div className="flex-1 flex items-center gap-3 flex-row-reverse">
                <img 
                  src={match.team2Logo || '/images/placeholder.png'} 
                  alt={match.team2}
                  className="w-10 h-10 rounded-full object-contain bg-slate-700"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect fill="%23475569" width="40" height="40"/><text x="20" y="25" text-anchor="middle" fill="white" font-size="14">?</text></svg>';
                  }}
                />
                <span className="font-bold text-lg">{match.team2}</span>
              </div>
            </div>

            {/* 时间信息 */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-700">
              <div className="flex items-center gap-2 text-slate-400">
                <Clock className="w-4 h-4" />
                <span className="text-sm">{match.time}</span>
              </div>
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-medium text-blue-400">
                  {countdown[match.id] || '计算中...'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
