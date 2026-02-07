'use client';

import { useEffect, useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Trophy, Calendar, Users, ChevronRight, Clock } from 'lucide-react';

interface Match {
  id: number;
  match_id: number;
  radiant_team_name: string;
  radiant_team_name_cn?: string;
  radiant_logo?: string;
  dire_team_name: string;
  dire_team_name_cn?: string;
  dire_logo?: string;
  radiant_score: number;
  dire_score: number;
  radiant_game_wins: number;
  dire_game_wins: number;
  start_time: number;
  series_type: string;
  status: string;
  tournament_name: string;
  tournament_name_cn?: string;
  tournament_tier?: string;
}

interface Tournament {
  id: string;
  name: string;
  name_cn?: string;
  tier: string;
  start_date: string;
  end_date: string;
  status: string;
  prize_pool?: string;
}

interface News {
  id: string;
  title: string;
  summary?: string;
  source: string;
  url: string;
  published_at: number;
  keywords?: string;
  category: string;
}

interface HomeData {
  upcoming: Match[];
  cnMatches: Match[];
  tournaments: Tournament[];
  news: News[];
  lastUpdated: string;
}

function Countdown({ targetTime }: { targetTime: number }) {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const updateCountdown = () => {
      const now = Math.floor(Date.now() / 1000);
      const diff = targetTime - now;
      
      if (diff <= 0) {
        setTimeLeft('比赛中');
        return;
      }

      const days = Math.floor(diff / 86400);
      const hours = Math.floor((diff % 86400) / 3600);
      const minutes = Math.floor((diff % 3600) / 60);

      if (days > 0) {
        setTimeLeft(`${days}天 ${hours}小时`);
      } else if (hours > 0) {
        setTimeLeft(`${hours}小时 ${minutes}分钟`);
      } else {
        setTimeLeft(`${minutes}分钟`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 60000);
    return () => clearInterval(interval);
  }, [targetTime]);

  return <span className="tabular-nums">{timeLeft}</span>;
}

export default function HomePage() {
  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        // 尝试多个可能的路径
        const paths = ['./data/home.json', '/dota2-hub/data/home.json', 'data/home.json'];
        let lastError;
        
        for (const path of paths) {
          try {
            console.log('Trying to fetch:', path);
            const response = await fetch(path);
            if (response.ok) {
              const homeData = await response.json();
              console.log('Data loaded successfully from:', path);
              setData(homeData);
              setLoading(false);
              return;
            }
          } catch (e) {
            lastError = e;
            console.log('Failed to fetch from:', path, e);
          }
        }
        
        throw lastError || new Error('All paths failed');
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        setError(`加载数据失败: ${errorMsg}`);
        console.error('Error loading data:', err);
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-amber-500 text-xl font-[family-name:var(--font-orbitron)]">加载中...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-red-500">{error || '数据加载失败'}</div>
      </div>
    );
  }

  const { upcoming, cnMatches, tournaments, news, lastUpdated } = data;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      {/* Header */}
      <header className="border-b border-slate-800/50 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg flex items-center justify-center">
                <Trophy className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold font-[family-name:var(--font-orbitron)] tracking-wider text-white">
                  DOTA2 HUB
                </h1>
                <p className="text-xs text-slate-400">专注中国战队 · 实时赛事战报</p>
              </div>
            </div>
            <nav className="hidden md:flex items-center gap-6">
              <a href="./" className="text-amber-500 font-medium">首页</a>
              <a href="./matches.html" className="text-slate-300 hover:text-white transition-colors">比赛</a>
              <a href="./tournaments.html" className="text-slate-300 hover:text-white transition-colors">赛事</a>
              <a href="./teams.html" className="text-slate-300 hover:text-white transition-colors">战队</a>
              <a href="./news.html" className="text-slate-300 hover:text-white transition-colors">资讯</a>
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero Section - 即将开始的比赛倒计时 */}
        {upcoming.length > 0 && (
          <section className="mb-12">
            <div className="flex items-center gap-2 mb-6">
              <Clock className="w-5 h-5 text-amber-500" />
              <h2 className="text-lg font-bold text-white font-[family-name:var(--font-orbitron)]">
                即将开始
              </h2>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {upcoming.slice(0, 2).map((match) => (
                <div
                  key={match.id}
                  className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-xl p-6 border border-slate-700/50 hover:border-amber-500/30 transition-all"
                >
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs text-amber-500 font-medium bg-amber-500/10 px-2 py-1 rounded">
                      {match.tournament_name_cn || match.tournament_name}
                    </span>
                    <span className="text-sm text-slate-400">{match.series_type}</span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-slate-700 rounded-lg flex items-center justify-center text-lg font-bold">
                        {match.radiant_team_name_cn?.[0] || match.radiant_team_name[0]}
                      </div>
                      <div>
                        <p className="font-bold text-white">{match.radiant_team_name_cn || match.radiant_team_name}</p>
                        <p className="text-xs text-slate-400">{match.radiant_team_name}</p>
                      </div>
                    </div>
                    
                    <div className="text-center">
                      <p className="text-2xl font-bold text-amber-500 font-[family-name:var(--font-orbitron)]">VS</p>
                      <p className="text-xs text-slate-400 mt-1">
                        <Countdown targetTime={match.start_time} />
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="font-bold text-white">{match.dire_team_name_cn || match.dire_team_name}</p>
                        <p className="text-xs text-slate-400">{match.dire_team_name}</p>
                      </div>
                      <div className="w-12 h-12 bg-slate-700 rounded-lg flex items-center justify-center text-lg font-bold">
                        {match.dire_team_name_cn?.[0] || match.dire_team_name[0]}
                      </div>
                    </div>
                  </div>
                  
                  <p className="text-xs text-slate-500 mt-4 text-center">
                    {format(match.start_time * 1000, 'yyyy年MM月dd日 HH:mm', { locale: zhCN })}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - 中国战队近期比赛 */}
          <div className="lg:col-span-2">
            <section className="mb-8">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-red-500" />
                  <h2 className="text-lg font-bold text-white font-[family-name:var(--font-orbitron)]">
                    中国战队战报
                  </h2>
                </div>
                <a href="/matches.html" className="text-sm text-amber-500 hover:text-amber-400 flex items-center gap-1">
                  查看全部 <ChevronRight className="w-4 h-4" />
                </a>
              </div>
              
              <div className="space-y-3">
                {cnMatches.length > 0 ? (
                  cnMatches.map((match) => (
                    <div
                      key={match.id}
                      className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/30 hover:border-slate-600/50 transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white">{match.radiant_team_name_cn || match.radiant_team_name}</span>
                            {(match.radiant_team_name_cn === 'XG' || match.radiant_team_name === 'Xtreme Gaming') && (
                              <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">CN</span>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-2 bg-slate-900 px-3 py-1 rounded">
                            <span className={`font-bold ${match.radiant_game_wins > match.dire_game_wins ? 'text-green-500' : 'text-slate-400'}`}>
                              {match.radiant_game_wins}
                            </span>
                            <span className="text-slate-500">:</span>
                            <span className={`font-bold ${match.dire_game_wins > match.radiant_game_wins ? 'text-green-500' : 'text-slate-400'}`}>
                              {match.dire_game_wins}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white">{match.dire_team_name_cn || match.dire_team_name}</span>
                            {(match.dire_team_name_cn === 'XG' || match.dire_team_name === 'Xtreme Gaming') && (
                              <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">CN</span>
                            )}
                          </div>
                        </div>
                        
                        <div className="text-right">
                          <p className="text-xs text-slate-400">{match.tournament_name_cn || match.tournament_name}</p>
                          <p className="text-xs text-slate-500">
                            {formatDistanceToNow(match.start_time * 1000, { locale: zhCN, addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12 text-slate-500">
                    暂无近期比赛数据
                  </div>
                )}
              </div>
            </section>

            {/* 赛事预告 */}
            <section>
              <div className="flex items-center gap-2 mb-6">
                <Calendar className="w-5 h-5 text-blue-500" />
                <h2 className="text-lg font-bold text-white font-[family-name:var(--font-orbitron)]">
                  赛事预告
                </h2>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {tournaments.map((tournament) => (
                  <div
                    key={tournament.id}
                    className="bg-gradient-to-br from-slate-800/60 to-slate-900/60 rounded-xl p-5 border border-slate-700/30 hover:border-blue-500/30 transition-all group"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-bold text-white group-hover:text-blue-400 transition-colors">
                          {tournament.name_cn || tournament.name}
                        </h3>
                        <p className="text-xs text-slate-400 mt-1">{tournament.name}</p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded font-medium ${
                        tournament.tier === 'T1' ? 'bg-amber-500/20 text-amber-400' :
                        tournament.tier === 'T2' ? 'bg-blue-500/20 text-blue-400' :
                        'bg-slate-600/20 text-slate-400'
                      }`}>
                        {tournament.tier}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm text-slate-400">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        <span>{tournament.start_date} 至 {tournament.end_date}</span>
                      </div>
                    </div>
                    
                    {tournament.prize_pool && (
                      <p className="text-sm text-amber-500 mt-3 font-medium">
                        奖金池: {tournament.prize_pool}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Right Column - 新闻 */}
          <div>
            <section className="mb-8">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-amber-500" />
                  <h2 className="text-lg font-bold text-white font-[family-name:var(--font-orbitron)]">
                    最新资讯
                  </h2>
                </div>
              </div>
              
              <div className="space-y-4">
                {news.map((item) => (
                  <a
                    key={item.id}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block bg-slate-800/40 rounded-lg p-4 border border-slate-700/20 hover:border-amber-500/30 hover:bg-slate-800/60 transition-all"
                  >
                    <div className="flex items-start gap-3">
                      <span className={`text-xs px-2 py-0.5 rounded flex-shrink-0 ${
                        item.category === 'transfer' ? 'bg-purple-500/20 text-purple-400' :
                        item.category === 'patch' ? 'bg-green-500/20 text-green-400' :
                        'bg-blue-500/20 text-blue-400'
                      }`}>
                        {item.category === 'transfer' ? '转会' :
                         item.category === 'patch' ? '更新' : '资讯'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white font-medium line-clamp-2">{item.title}</p>
                        {item.summary && (
                          <p className="text-xs text-slate-400 mt-1 line-clamp-2">{item.summary}</p>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-xs text-slate-500">{item.source}</span>
                          <span className="text-xs text-slate-600">·</span>
                          <span className="text-xs text-slate-500">
                            {formatDistanceToNow(item.published_at * 1000, { locale: zhCN, addSuffix: true })}
                          </span>
                        </div>
                        
                        {item.keywords && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {JSON.parse(item.keywords).map((keyword: string, idx: number) => (
                              <span key={idx} className="text-[10px] bg-slate-700/50 text-slate-400 px-1.5 py-0.5 rounded">
                                {keyword}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </section>

            {/* 最后更新时间 */}
            <div className="text-xs text-slate-500 text-center">
              最后更新: {lastUpdated ? format(new Date(lastUpdated), 'yyyy-MM-dd HH:mm', { locale: zhCN }) : '-'}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/50 mt-16 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-slate-500">
              DOTA2 Hub · 专注中国战队赛事战报
            </p>
            <div className="flex items-center gap-4 text-sm text-slate-500">
              <span>数据来源: OpenDota · Liquidpedia</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
