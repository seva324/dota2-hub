import { useState, useEffect } from 'react';
import { Navbar } from '@/components/custom/Navbar';
import { HeroSection } from '@/sections/HeroSection';
import { TournamentSection } from '@/sections/TournamentSection';
import { UpcomingSection } from '@/sections/UpcomingSection';
import { NewsSection } from '@/sections/NewsSection';
import { CommunitySection } from '@/sections/CommunitySection';
import { Footer } from '@/sections/Footer';

interface HomeData {
  upcoming: Array<{
    id: number;
    match_id: number;
    radiant_team_name: string;
    radiant_team_name_cn?: string;
    radiant_team_logo?: string;
    dire_team_name: string;
    dire_team_name_cn?: string;
    dire_team_logo?: string;
    start_time: number;
    series_type: string;
    tournament_name: string;
    tournament_name_cn?: string;
  }>;
  cnMatches: Array<{
    id: number;
    match_id: number;
    radiant_team_name: string;
    radiant_team_name_cn?: string;
    radiant_team_logo?: string;
    dire_team_name: string;
    dire_team_name_cn?: string;
    dire_team_logo?: string;
    radiant_game_wins: number;
    dire_game_wins: number;
    start_time: number;
    series_type: string;
    tournament_name: string;
    tournament_name_cn?: string;
  }>;
  tournaments: Array<{
    id: string;
    name: string;
    name_cn?: string;
    tier: string;
    start_date: string;
    end_date: string;
    status: string;
    prize_pool?: string;
    location?: string;
    format?: string;
  }>;
  matchesByTournament?: Record<string, Array<{
    id: number;
    match_id: string;
    radiant_team_name: string;
    dire_team_name: string;
    radiant_score: number;
    dire_score: number;
    start_time: number;
    series_type: string;
    tournament_name: string;
    status: string;
    stage?: string;
  }>>;
  news: Array<{
    id: string;
    title: string;
    summary?: string;
    source: string;
    url: string;
    published_at: number;
    category: string;
  }>;
  community?: Array<{
    id: string;
    title: string;
    author: string;
    source: string;
    upvotes: number;
    comments: number;
    url: string;
    publishedAt: string;
  }>;
  lastUpdated: string;
}

function App() {
  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/dota2-hub/data/home.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const homeData = await response.json();
        setData(homeData);
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载失败');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <div className="text-red-500 text-xl">加载中...</div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 text-xl mb-2">{error || '数据加载失败'}</div>
          <button 
            onClick={() => window.location.reload()}
            className="text-slate-400 hover:text-white underline"
          >
            刷新重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <Navbar />
      <main>
        <HeroSection upcoming={data.upcoming} />
        <TournamentSection tournaments={data.tournaments} matchesByTournament={data.matchesByTournament} />
        <UpcomingSection upcoming={data.upcoming} />
        <NewsSection news={data.news} />
        <CommunitySection posts={data.community} />
      </main>
      <Footer lastUpdated={data.lastUpdated} />
    </div>
  );
}

export default App;
