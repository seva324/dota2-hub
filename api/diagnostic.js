/**
 * 诊断 API - 用于调试 dltv.org 抓取问题
 */

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

    // 查找API端点
    const apiPatterns = [
      /api\/([a-z\/]+)/gi,
      /fetch\("([^"]+)"/gi,
      /url:\s*["']([^"']+)["']/gi,
    ];
    const apiEndpoints = [];
    for (const pattern of apiPatterns) {
      const matches = html.match(pattern);
      if (matches) {
        apiEndpoints.push(...matches.slice(0, 5));
      }
    }

    // 尝试调用可能的API
    const possibleApis = [
      '/api/matches',
      '/api/v1/matches',
      '/matches/api',
      'dltv.org/api',
    ];
    const apiResults = {};
    for (const api of possibleApis) {
      try {
        const testUrl = api.startsWith('http') ? api : `https://dltv.org${api}`;
        const testRes = await fetch(testUrl, { signal: AbortSignal.timeout(5000) });
        apiResults[api] = { status: testRes.status, ok: testRes.ok };
      } catch (e) {
        apiResults[api] = { error: e.message };
      }
    }

    // 查找JSON数据 - 尝试多种模式
    let jsonData = null;
    const jsonPatterns = [
      /window\.matches\s*=\s*(\[[\s\S]*?\]);/,
      /window\.data\s*=\s*(\{[\s\S]*?\});/,
      /matches\s*:\s*(\[[\s\S]*?\]\s*,)/,
      /"matches"\s*:\s*(\[[\s\S]*?\])/,
    ];
    for (const pattern of jsonPatterns) {
      const match = html.match(pattern);
      if (match) {
        jsonData = match[1].substring(0, 5000);
        break;
      }
    }

    // 查找HTML中的比赛元素 - 更宽松的匹配
    const matchElements = html.match(/class="[^"]*match[^"]*"/gi);
    const elementCount = matchElements ? matchElements.length : 0;

    // 查找表格行
    const tableRows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi);
    const rowCount = tableRows ? tableRows.length : 0;

    // 查找包含vs的表格单元格
    const vsCells = html.match(/<td[^>]*>[^<>]*vs[^<>]*<\/td>/gi);
    const vsCount = vsCells ? vsCells.length : 0;

    // 查找带有时间的元素
    const timeElements = html.match(/(\d{1,2}:\d{2})/gi);

    return res.status(200).json({
      htmlLength: html.length,
      hasToday,
      hasTomorrow,
      hasMatch,
      sampleMatches: matches,
      jsonData,
      elementCount,
      rowCount,
      vsCount: vsCells ? vsCells.slice(0, 5) : [],
      timeElements: timeElements ? timeElements.slice(0, 20) : [],
      apiEndpoints: apiEndpoints.slice(0, 10),
      apiResults,
      htmlSample: sample
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}
