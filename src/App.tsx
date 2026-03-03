import { useState, useEffect } from 'react';
import { Navbar } from '@/components/custom/Navbar';
import { HeroSection } from '@/sections/HeroSection';
import { TournamentSection } from '@/sections/TournamentSection';
import { UpcomingSection } from '@/sections/UpcomingSection';
import { NewsSection } from '@/sections/NewsSection';
import { CommunitySection } from '@/sections/CommunitySection';
import { Footer } from '@/sections/Footer';

// Target league IDs for tournament matches
const TARGET_LEAGUE_IDS = [19269, 18988, 19099, 19130];

// League ID to tournament ID mapping
const LEAGUE_TO_TOURNAMENT: Record<number, string> = {
  19269: 'dreamleague-s28',
  18988: 'dreamleague-s27',
  19099: 'blast-slam-vi',
  19130: 'esl-challenger-china'
};

// Team data type
interface TeamData {
  id: string;
  name: string;
  name_cn: string;
  tag: string;
  logo_url: string;
}

// Hero data type
interface HeroData {
  id: number;
  name: string;
  name_cn: string;
  img: string;
}

// Load teams data
let teamsData: TeamData[] = [];
const heroesData: Record<number, HeroData> = {};

// Fetch teams and heroes data
async function loadStaticData() {
  try {
    // Load teams
    const teamsRes = await fetch('/data/teams.json');
    teamsData = await teamsRes.json();
    console.log('Teams loaded:', teamsData.length);

    // Load heroes
    const heroesRes = await fetch('/data/heroes.json');
    const heroesJson = await heroesRes.json();
    // Convert string keys to numbers
    Object.entries(heroesJson).forEach(([key, value]) => {
      heroesData[parseInt(key)] = value as HeroData;
    });
    console.log('Heroes loaded:', Object.keys(heroesData).length);
  } catch (err) {
    console.error('Error loading static data:', err);
  }
}

// Find team logo by team name
function findTeamLogo(teamName: string): string | undefined {
  if (!teamName || !teamsData.length) {
    console.log('findTeamLogo: no teamName or teamsData', { teamName, teamsDataLength: teamsData.length });
    return undefined;
  }
  
  const normalizedName = teamName.toLowerCase().trim();
  console.log('findTeamLogo searching for:', teamName, '-> normalized:', normalizedName);
  
  // Try exact match first (check tag first as it's most common in match data)
  let team = teamsData.find(t => 
    t.tag.toLowerCase() === normalizedName || 
    t.name.toLowerCase() === normalizedName || 
    t.name_cn.toLowerCase() === normalizedName
  );
  
  // Try partial match - check if team name contains the search term or vice versa
  if (!team) {
    team = teamsData.find(t => 
      t.name.toLowerCase().includes(normalizedName) ||
      normalizedName.includes(t.name.toLowerCase()) ||
      t.tag.toLowerCase().includes(normalizedName) ||
      normalizedName.includes(t.tag.toLowerCase()) ||
      t.name_cn.toLowerCase().includes(normalizedName) ||
      normalizedName.includes(t.name_cn.toLowerCase())
    );
  }
  
  console.log('findTeamLogo result:', team?.name, team?.logo_url);
  return team?.logo_url;
}

// Helper function to add team logos to all series
function addTeamLogosToSeries(seriesByTournament: Record<string, any[]>): Record<string, any[]> {
  const result: Record<string, any[]> = {};
  
  Object.entries(seriesByTournament).forEach(([tournamentId, seriesList]) => {
    result[tournamentId] = seriesList.map(series => {
      // Debug log
      console.log(`Finding logo for team: "${series.radiant_team_name}" -> `, findTeamLogo(series.radiant_team_name));
      console.log(`Finding logo for team: "${series.dire_team_name}" -> `, findTeamLogo(series.dire_team_name));
      
      return {
        ...series,
        radiant_team_logo: series.radiant_team_logo || findTeamLogo(series.radiant_team_name),
        dire_team_logo: series.dire_team_logo || findTeamLogo(series.dire_team_name)
      };
    });
  });
  
  return result;
}

// Helper function to group matches into series by team pairing
function groupMatchesIntoSeries(matches: any[]): Record<string, any[]> {
  const seriesByKey: Record<string, any[]> = {};
  
  matches.forEach(match => {
    const leagueId = match.league_id;
    const tournamentId = LEAGUE_TO_TOURNAMENT[leagueId];
    if (!tournamentId) return;
    
    // Create a unique key for this team pairing: team1 vs team2 (sorted)
    const teams = [match.radiant_team_name, match.dire_team_name].sort();
    const seriesKey = `${tournamentId}_${teams[0]}_vs_${teams[1]}_${match.series_type}`;
    
    if (!seriesByKey[seriesKey]) {
      seriesByKey[seriesKey] = [];
    }
    seriesByKey[seriesKey].push(match);
  });
  
  // Convert to series format
  const result: Record<string, any[]> = {};
  
  Object.entries(seriesByKey).forEach(([key, seriesMatches]) => {
    const [tournamentId] = key.split('_vs_');
    const seriesType = seriesMatches[0]?.series_type || 'BO3';
    
    if (!result[tournamentId]) {
      result[tournamentId] = [];
    }
    
    // Sort matches by start_time
    seriesMatches.sort((a, b) => a.start_time - b.start_time);
    
    // Calculate wins
    let radiantWins = 0;
    let direWins = 0;
    seriesMatches.forEach(m => {
      if (m.radiant_win) radiantWins++;
      else direWins++;
    });
    
    const series = {
      series_id: `series_${key}`,
      series_type: seriesType,
      radiant_team_name: seriesMatches[0].radiant_team_name,
      dire_team_name: seriesMatches[0].dire_team_name,
      radiant_team_logo: findTeamLogo(seriesMatches[0].radiant_team_name),
      dire_team_logo: findTeamLogo(seriesMatches[0].dire_team_name),
      games: seriesMatches.map(m => ({
        match_id: m.match_id,
        radiant_team_name: m.radiant_team_name,
        dire_team_name: m.dire_team_name,
        radiant_score: m.radiant_score,
        dire_score: m.dire_score,
        radiant_win: m.radiant_win,
        start_time: m.start_time,
        duration: m.duration
      })),
      radiant_wins: radiantWins,
      dire_wins: direWins,
      tournament_id: null,
      tournament_name: null,
      stage: '',
      radiant_score: radiantWins,
      dire_score: direWins
    };
    
    result[tournamentId].push(series);
  });
  
  // Sort series by first game start_time
  Object.keys(result).forEach(tournamentId => {
    result[tournamentId].sort((a, b) => 
      (a.games[0]?.start_time || 0) - (b.games[0]?.start_time || 0)
    );
  });
  
  return result;
}

function App() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Load static data first (teams, heroes)
        await loadStaticData();
        
        // 加载 tournaments 数据 from API (Neon/Redis fallback)
        let tournamentsData;
        try {
          const tournamentsRes = await fetch('/api/tournaments');
          tournamentsData = await tournamentsRes.json();
        } catch (e) {
          console.error('Failed to load tournaments from API:', e);
          tournamentsData = { tournaments: [], seriesByTournament: {} };
        }
        console.log('Tournaments loaded:', tournamentsData.tournaments?.length || 0);

        // 加载 matches 数据 from API (Neon/Redis fallback)
        let matches;
        try {
          const matchesRes = await fetch('/api/matches');
          matches = await matchesRes.json();
        } catch (e) {
          console.error('Failed to load matches from API:', e);
          matches = [];
        }
        console.log('Matches loaded:', matches.length);

        // 加载 upcoming 数据 from API (Neon/Redis fallback)
        let upcomingData;
        try {
          const upcomingRes = await fetch('/api/upcoming');
          upcomingData = await upcomingRes.json();
        } catch (e) {
          console.error('Failed to load upcoming from API:', e);
          upcomingData = [];
        }
        console.log('Upcoming loaded:', upcomingData.length);

        // 加载 news 数据 from API
        let newsData;
        try {
          const newsRes = await fetch('/api/news');
          newsData = await newsRes.json();
        } catch (e) {
          console.error('Failed to load news from API:', e);
          newsData = [];
        }
        console.log('News loaded:', newsData.length);

        // 使用 tournaments.json 中已有的 tournaments 和 seriesByTournament
        const formattedTournaments = (tournamentsData.tournaments || []).map((t: any) => ({
          id: t.id,
          name: t.name || t.name_cn || 'Unknown Tournament',
          name_cn: t.name_cn,
          prize_pool: t.prize_pool || t.prize,
          prize_pool_usd: t.prize_pool_usd,
          location: t.location,
          start_date: t.start_date,
          end_date: t.end_date,
          start_time: t.start_time,
          end_time: t.end_time,
          status: t.status,
          image: t.image || '/images/tournament-default.jpg',
          league_id: t.league_id
        }));

        // 首先尝试从 matches 中动态生成 series
        // 过滤目标 league_id 的比赛
        const targetLeagueMatches = matches.filter((m: any) =>
          m.league_id && TARGET_LEAGUE_IDS.includes(Number(m.league_id))
        );
        
        console.log('Target league matches:', targetLeagueMatches.length);
        
        // 从匹配的比赛动态生成 series
        const dynamicSeriesByTournament = groupMatchesIntoSeries(targetLeagueMatches);
        console.log('Dynamic series by tournament:', Object.keys(dynamicSeriesByTournament).map(k => `${k}: ${dynamicSeriesByTournament[k]?.length || 0} series`));

        // 合并静态和动态的 seriesByTournament（API 优先，动态兜底）
        const staticSeriesByTournament = tournamentsData.seriesByTournament || {};
        const seriesByTournament = { ...dynamicSeriesByTournament, ...staticSeriesByTournament };

        // Add team logos to all series
        const seriesWithLogos = addTeamLogosToSeries(seriesByTournament);
        console.log('Series by tournament:', Object.keys(seriesWithLogos).map(k => `${k}: ${seriesWithLogos[k]?.length || 0} series`));

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
        
        // 使用 API 返回的 upcoming 数据，如果没有则从 cnMatches 中生成
        const now = Date.now() / 1000;
        let upcoming = upcomingData && upcomingData.length > 0
          ? upcomingData.map((m: any) => ({
              ...m,
              id: m.id || m.match_id,
              radiant_team_name: m.radiant_team_name || m.radiant_team_name_cn || 'TBD',
              dire_team_name: m.dire_team_name || m.dire_team_name_cn || 'TBD',
            }))
          : cnMatches
              .filter((m: any) => m.start_time > now)
              .sort((a: any, b: any) => a.start_time - b.start_time)
              .slice(0, 10)
              .map((m: any) => ({ ...m, tournament_name: 'Dota 2 Pro League' }));

        // 格式化数据
        const homeData = {
          upcoming,
          cnMatches: cnMatches.slice(0, 50),
          tournaments: formattedTournaments,
          seriesByTournament: seriesWithLogos,
          news: newsData || [],
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
