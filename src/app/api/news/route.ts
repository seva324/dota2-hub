import { NextResponse } from 'next/server';
import { getNews } from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');
  const isCnNews = searchParams.get('cn') === 'true';
  const limit = parseInt(searchParams.get('limit') || '20');

  try {
    const news = getNews({ category, isCnNews, limit });

    return NextResponse.json({ 
      success: true, 
      data: news,
      count: news.length 
    });
  } catch (error) {
    console.error('Error fetching news:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch news' },
      { status: 500 }
    );
  }
}
