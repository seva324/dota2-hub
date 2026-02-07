import { NextResponse } from 'next/server';
import { getTournaments } from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const tier = searchParams.get('tier');
  const upcoming = searchParams.get('upcoming') === 'true';
  const limit = parseInt(searchParams.get('limit') || '20');

  try {
    const tournaments = getTournaments({ status, tier, upcoming, limit });

    return NextResponse.json({ 
      success: true, 
      data: tournaments,
      count: tournaments.length 
    });
  } catch (error) {
    console.error('Error fetching tournaments:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch tournaments' },
      { status: 500 }
    );
  }
}
