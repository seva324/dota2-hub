export async function fetchWithTimeout(url, options = {}, timeout = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
        Connection: 'keep-alive',
        ...options.headers,
      },
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function markdownToText(text = '') {
  return String(text)
    .replace(/!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/gi, ' ')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi, '$1')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/^\s*#+\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function looksChinese(text = '') {
  return /[\u4e00-\u9fff]/.test(text);
}
