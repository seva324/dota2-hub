/**
 * 诊断 API - 用于调试 dltv.org 抓取问题
 */

import { createClient } from 'redis';

const DLTV_URL = 'https://dltv.org/matches';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    console.log('[Diagnostic] Fetching dltv.org...');
    const response = await fetch(DLTV_URL, {
      signal: AbortSignal.timeout(15000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      return res.status(500).json({ error: `HTTP ${response.status}` });
    }

    const html = await response.text();

    // 检查关键内容
    const hasToday = html.includes('今日赛程');
    const hasTomorrow = html.includes('明日赛程');
    const hasMatch = html.includes('vs');

    // 提取HTML样本
    const sample = html.substring(0, 10000);

    // 尝试匹配比赛
    const matchPattern = html.match(/(\d{1,2}:\d{2})[^<>]*?vs[^<>]*/gi);
    const matches = matchPattern ? matchPattern.slice(0, 10) : [];

    return res.status(200).json({
      htmlLength: html.length,
      hasToday,
      hasTomorrow,
      hasMatch,
      sampleMatches: matches,
      htmlSample: sample
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}
