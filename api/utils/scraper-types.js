export function generateId(url, prefix) {
  const hash = url.slice(-20).replace(/[^a-zA-Z0-9]/g, '');
  return `${prefix}-${hash}`;
}

export function parseDate(dateStr) {
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? new Date() : date;
}

export async function fetchWithTimeout(url, options = {}, timeout = 10000) {
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
