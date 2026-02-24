import { useState, useEffect } from 'react';
import { Navbar } from '@/components/custom/Navbar';
import { HeroSection } from '@/sections/HeroSection';
import { TournamentSection } from '@/sections/TournamentSection';
import { UpcomingSection } from '@/sections/UpcomingSection';
import { NewsSection } from '@/sections/NewsSection';
import { CommunitySection } from '@/sections/CommunitySection';
import { Footer } from '@/sections/Footer';

function App() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const apiBase = window.location.origin;
        console.log('API Base:', apiBase);
        
        const isLocalDev = apiBase.includes('localhost');
        
        // 加载 tournaments.json 数据
        let tournamentsData;
        if (isLocalDev) {
          const tournamentsRes = await fetch('/data/tournaments.json');
          tournamentsData = await tournamentsRes.json();
          console.log('Local tournaments loaded:', tournamentsData.tournaments?.length || 0);
        } else {
          // 生产环境：从 API 获取
          const tournamentsRes = await fetch(`${apiBase}/api/tournaments`);
          if (!tournamentsRes.ok) throw new Error(`HTTP ${tournamentsRes.status}`);
          tournamentsData = await tournamentsRes.json();
        }

        // 加载 matches.json 数据
        let matches;
        if (isLocalDev) {
          const matchesRes = await fetch('/data/matches.json');
          matches = await matchesRes.json();
          console.log('Local matches loaded:', matches.length);
        } else {
          const matchesRes = await fetch(`${apiBase}/api/matches`);
          if (!matchesRes.ok) throw new Error(`HTTP ${matchesRes.status}`);
          matches = await matchesRes.json();
        }

        // 使用 tournaments.json 中已有的 tournaments 和 seriesByTournament
        const formattedTournaments = (tournamentsData.tournaments || []).map((t: any) => ({
          id: t.id,
          name: t.name || t.name_cn || 'Unknown Tournament',
          name_cn: t.name_cn,
          prize_pool: t.prize_pool || t.prize,
          location: t.location,
          start_date: t.start_date,
          end_date: t.end_date,
          status: t.status,
          image: t.image || '/images/tournament-default.jpg'
        }));

        // 使用 tournaments.json 中已有的 seriesByTournament
        const seriesByTournament = tournamentsData.seriesByTournament || {};

        console.log('Series by tournament:', Object.keys(seriesByTournament).map(k => `${k}: ${seriesByTournament[k]?.length || 0} series`));

        // 过滤出有中国队伍参与的比赛
        const cnMatches = matches
          .filter((m: any) => m.radiant_team_name_cn || m.dire_team_name_cn)
          .map((m: any) => ({
            id: parseInt(m.match_id),
            match_id: parseInt(m.match_id),
            radiant_team_name: m.radiant_team_name || m.radiant_team_name_cn || 'Unknown',
            radiant_team_name_cn: m.radiant_team_name_cn,
            dire_team_name: m.dire_team_name || m.dire_team_name_cn || 'Unknown',
            dire_team_name_cn: m.dire_team_name_cn,
            radiant_game_wins: m.radiant_game_wins || 0,
            dire_game_wins: m.dire_game_wins || 0,
            start_time: m.start_time,
            series_type: m.series_type || 'BO3',
            tournament_name: '',
            tournament_name_cn: '',
            leagueid: m.league_id || null
          }));
        
        // 获取即将开始的比赛
        const now = Date.now() / 1000;
        const upcoming = cnMatches
          .filter((m: any) => m.start_time > now)
          .sort((a: any, b: any) => a.start_time - b.start_time)
          .slice(0, 10)
          .map((m: any) => ({ ...m, tournament_name: 'Dota 2 Pro League' }));

        // 格式化数据
        const homeData = {
          upcoming,
          cnMatches: cnMatches.slice(0, 50),
          tournaments: formattedTournaments,
          seriesByTournament,
          news: [],
          community: [],
          lastUpdated: new Date().toISOString()
        };

        console.log('Data loaded:', {
          matches: cnMatches.length,
          upcoming: upcoming.length,
          tournaments: formattedTournaments.length,
          seriesByTournament: Object.keys(seriesByTournament).length
        });
        
        setData(homeData);
      } catch (err) {
        console.error('Fetch error:', err);
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
        <TournamentSection tournaments={data.tournaments} seriesByTournament={data.seriesByTournament} />
        <UpcomingSection upcoming={data.upcoming} />
        <NewsSection news={data.news} />
        <CommunitySection posts={data.community} />
      </main>
      <Footer lastUpdated={data.lastUpdated} />
    </div>
  );
}

export default App;
