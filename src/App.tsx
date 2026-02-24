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
        // 获取 API 地址
        const apiBase = window.location.origin;
        console.log('API Base:', apiBase);
        
        // 获取比赛数据
        const matchesRes = await fetch(`${apiBase}/api/matches`);
        if (!matchesRes.ok) throw new Error(`HTTP ${matchesRes.status}`);
        const matches = await matchesRes.json();

        console.log('Matches loaded:', matches.length);

        // 硬编码赛事数据
        const hardcodedTournaments = [
          {
            id: 16430,
            name: 'DreamLeague Season 28',
            name_cn: '梦幻联赛第28赛季',
            prize_pool: '$1,000,000',
            location: '线上',
            start_date: '2026-01-19',
            end_date: '2026-02-08',
            status: 'completed',
            image: 'https://liquipedia.net/commons/images/thumb/4/49/DreamLeague_Season_28.png/600px-DreamLeague_Season_28.png'
          },
          {
            id: 16418,
            name: 'BLAST Slam VI',
            name_cn: 'BLAST Slam第六赛季',
            prize_pool: '$1,000,000',
            location: '线上',
            start_date: '2026-01-12',
            end_date: '2026-01-26',
            status: 'completed',
            image: 'https://liquipedia.net/commons/images/thumb/9/9d/BLAST_Slam_VI.png/600px-BLAST_Slam_VI.png'
          },
          {
            id: 16445,
            name: 'ESL Challenger China 2026',
            name_cn: 'ESL挑战者杯中国站2026',
            prize_pool: '$100,000',
            location: '中国',
            start_date: '2026-02-14',
            end_date: '2026-02-23',
            status: 'completed',
            image: 'https://liquipedia.net/commons/images/thumb/5/5c/ESL_Challenger_China_2026.png/600px-ESL_Challenger_China_2026.png'
          },
          {
            id: 16318,
            name: 'DreamLeague Season 27',
            name_cn: '梦幻联赛第27赛季',
            prize_pool: '$1,000,000',
            location: '线上',
            start_date: '2025-11-17',
            end_date: '2025-12-08',
            status: 'completed',
            image: 'https://liquipedia.net/commons/images/thumb/3/33/DreamLeague_Season_27.png/600px-DreamLeague_Season_27.png'
          }
        ];

        console.log('Tournaments loaded:', hardcodedTournaments.length);
        
        // Debug: 打印所有比赛的实际 leagueid
        const uniqueLeagueIds = [...new Set(matches.map((m: any) => m.leagueid).filter(Boolean))];
        console.log('Unique league IDs in matches:', uniqueLeagueIds.slice(0, 20));

        // 硬编码赛事 ID 列表 (字符串形式)
        const tournamentLeagueIds = ['16430', '16418', '16445', '16318'];
        
        // 将比赛数据按赛事分组 - 首先按 leagueid 筛选出属于这些赛事的比赛
        const tournamentMatches = matches
          .filter((m: any): boolean => {
            const leagueId = String(m.leagueid || '');
            return tournamentLeagueIds.includes(leagueId);
          })
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
            leagueid: m.leagueid || null
          }));

        console.log('Matches for tournaments:', tournamentMatches.length, 'by leagueid:', 
          tournamentLeagueIds.map((id: string) => `${id}: ${tournamentMatches.filter((m: any) => String(m.leagueid) === id).length}`));

        // 将比赛数据按赛事分组
        const seriesMap: Record<string, any[]> = {};
        
        // 初始化每个赛事的数组
        tournamentLeagueIds.forEach((id: string) => {
          seriesMap[id] = [];
        });
        
        // 根据 leagueid 分组到对应的赛事
        tournamentMatches.forEach((m: any) => {
          const leagueId = String(m.leagueid);
          
          // 如果比赛的 leagueid 匹配硬编码的赛事 ID，则添加到对应赛事
          if (leagueId && tournamentLeagueIds.includes(leagueId)) {
            seriesMap[leagueId].push({
              series_id: `series-${m.match_id}`,
              series_type: m.series_type || 'BO3',
              radiant_team_name: m.radiant_team_name,
              dire_team_name: m.dire_team_name,
              radiant_team_logo: null,
              dire_team_logo: null,
              radiant_score: m.radiant_score || m.radiant_game_wins,
              dire_score: m.dire_score || m.dire_game_wins,
              games: [{
                match_id: String(m.match_id),
                radiant_team_name: m.radiant_team_name,
                dire_team_name: m.dire_team_name,
                radiant_score: m.radiant_score || 0,
                dire_score: m.dire_score || 0,
                radiant_win: m.radiant_win,
                start_time: m.start_time,
                duration: m.duration || 0
              }],
              stage: 'Recent Matches'
            });
          }
        });
        
        // 转换数据格式以匹配前端期望 (用于 upcoming 和 cnMatches)
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
            leagueid: m.leagueid || null
          }));
        
        // 按开始时间排序每个赛事的比赛
        Object.keys(seriesMap).forEach(key => {
          seriesMap[key].sort((a, b) => {
            const aTime = a.games[0]?.start_time || 0;
            const bTime = b.games[0]?.start_time || 0;
            return bTime - aTime; // 最新的在前
          });
        });
        
        console.log('Series by tournament:', Object.keys(seriesMap).map(k => `${k}: ${seriesMap[k].length} matches`));

        // 使用硬编码的 tournaments 数据 - 将 ID 转为字符串以匹配 seriesByTournament 的键
        const formattedTournaments = hardcodedTournaments.map((t: any) => ({
          id: String(t.id),
          name: t.name || t.name_cn || 'Unknown Tournament',
          name_cn: t.name_cn,
          prize_pool: t.prize_pool,
          location: t.location,
          start_date: t.start_date,
          end_date: t.end_date,
          status: t.status,
          image: t.image
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
          seriesByTournament: seriesMap,
          news: [],
          community: [],
          lastUpdated: new Date().toISOString()
        };

        console.log('Data loaded:', {
          matches: cnMatches.length,
          upcoming: upcoming.length,
          tournaments: formattedTournaments.length
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
