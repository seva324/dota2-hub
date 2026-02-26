export interface ScraperNewsItem {
  id: string;
  title: string;
  summary?: string;
  url: string;
  imageUrl?: string;
  source: string;
  publishedAt: Date;
  category: string;
}

export interface ScraperResult {
  items: ScraperNewsItem[];
  source: string;
  success: boolean;
  error?: string;
}

// Base scraper interface
export interface NewsScraper {
  name: string;
  baseUrl: string;
  fetchNews(): Promise<ScraperResult>;
}

// Utility to generate unique ID from URL
export function generateId(url: string, prefix: string): string {
  const hash = url.slice(-20).replace(/[^a-zA-Z0-9]/g, '');
  return `${prefix}-${hash}`;
}

// Utility to normalize date
export function parseDate(dateStr: string): Date {
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? new Date() : date;
}

// Utility to fetch with timeout
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout = 10000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ...options.headers,
      },
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}
