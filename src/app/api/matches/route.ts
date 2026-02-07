import { NextResponse } from 'next/server';
import { getMatches, getCnTeamMatches, getUpcomingMatchesWithCountdown } from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const tournamentId = searchParams.get('tournament');
  const teamId = searchParams.get('team');
  const status = searchParams.get('status');
  const upcoming = searchParams.get('upcoming') === 'true';
  const cnOnly = searchParams.get('cn') === 'true';
  const limit = parseInt(searchParams.get('limit') || '50');

  try {
    let matches;

    if (type === 'countdown') {
      // 获取即将开始的比赛（带倒计时）
      matches = getUpcomingMatchesWithCountdown(limit);
    } else if (cnOnly) {
      // 获取中国战队的比赛
      matches = getCnTeamMatches({ status, upcoming, limit });
    } else {
      // 获取所有比赛
      matches = getMatches({ tournamentId, teamId, status, upcoming, limit });
    }

    return NextResponse.json({ 
      success: true, 
      data: matches,
      count: matches.length 
    });
  } catch (error) {
    console.error('Error fetching matches:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch matches' },
      { status: 500 }
    );
  }
}
