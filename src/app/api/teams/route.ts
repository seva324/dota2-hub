import { NextResponse } from 'next/server';
import { getTeams, getTeamById } from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id') || undefined;
  const isCnOnly = searchParams.get('cn') === 'true';
  const region = searchParams.get('region') || undefined;

  try {
    if (id) {
      const team = getTeamById(id);
      if (!team) {
        return NextResponse.json(
          { success: false, error: 'Team not found' },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true, data: team });
    }

    const teams = getTeams({ isCnOnly, region });

    return NextResponse.json({ 
      success: true, 
      data: teams,
      count: teams.length 
    });
  } catch (error) {
    console.error('Error fetching teams:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch teams' },
      { status: 500 }
    );
  }
}
