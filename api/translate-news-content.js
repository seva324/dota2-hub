const MINIMAX_API_URL = 'https://api.minimax.io/anthropic/v1/messages';
const MINIMAX_MODEL = process.env.MINIMAX_MODEL || 'MiniMax-M2.5';

async function fetchWithTimeout(url, options = {}, timeout = 25000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function looksChinese(text = '') {
  return /[\u4e00-\u9fff]/.test(text);
}

function extractMiniMaxText(data) {
  if (Array.isArray(data?.content)) {
    return data.content
      .filter((x) => x?.type === 'text' && typeof x?.text === 'string')
      .map((x) => x.text)
      .join('\n');
  }
  if (typeof data?.output_text === 'string') return data.output_text;
  return '';
}

function splitIntoChunks(text, maxLen = 1400) {
  const parts = String(text).split('\n\n');
  const chunks = [];
  let current = '';

  for (const part of parts) {
    const candidate = current ? `${current}\n\n${part}` : part;
    if (candidate.length <= maxLen) {
      current = candidate;
      continue;
    }

    if (current) chunks.push(current);
    if (part.length <= maxLen) {
      current = part;
    } else {
      for (let i = 0; i < part.length; i += maxLen) {
        chunks.push(part.slice(i, i + maxLen));
      }
      current = '';
    }
  }

  if (current) chunks.push(current);
  return chunks.slice(0, 8);
}

async function translateChunk(apiKey, chunk) {
  const prompt = [
    '将下面这段 Dota2 新闻正文翻译为简体中文。',
    '要求：保留段落结构；保留战队名、选手名、赛事名原文；保留 markdown 链接与图片语法；不要加解释。',
    '正文：',
    chunk,
  ].join('\n');

  const aiRes = await fetchWithTimeout(MINIMAX_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MINIMAX_MODEL,
      max_tokens: 1800,
      messages: [
        { role: 'user', content: [{ type: 'text', text: prompt }] },
      ],
    }),
  });

  if (!aiRes.ok) {
    const text = await aiRes.text().catch(() => '');
    throw new Error(`MiniMax failed: ${text.slice(0, 120)}`);
  }

  const data = await aiRes.json();
  const translated = extractMiniMaxText(data).trim();
  return translated || chunk;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const apiKey = process.env.MINIMAX_API_KEY;
    const raw = typeof req.body?.content === 'string' ? req.body.content.trim() : '';

    if (!raw) {
      return res.status(400).json({ error: 'content required' });
    }

    if (!apiKey || looksChinese(raw)) {
      return res.status(200).json({ translatedContent: raw });
    }

    const content = raw.slice(0, 9000);
    const chunks = splitIntoChunks(content);
    const translatedParts = [];

    for (const chunk of chunks) {
      try {
        const translated = await translateChunk(apiKey, chunk);
        translatedParts.push(translated);
      } catch {
        translatedParts.push(chunk);
      }
    }

    return res.status(200).json({ translatedContent: translatedParts.join('\n\n') || raw });
  } catch (error) {
    return res.status(200).json({
      translatedContent: typeof req.body?.content === 'string' ? req.body.content : '',
      warning: error instanceof Error ? error.message : 'translation failed',
    });
  }
}
