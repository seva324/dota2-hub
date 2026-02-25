/**
 * 本地测试脚本 - 测试 Liquipedia 解析逻辑
 */

const LIQUIPEDIA_URLS = [
  'https://liquipedia.net/dota2/DreamLeague/Season_28',
  'https://liquipedia.net/dota2/BLAST/Premier',
];

async function fetchLiquipediaPage(url) {
  try {
    const response = await fetch(`https://r.jina.ai/${url}`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const text = await response.text();
    return { url, text, success: true };
  } catch (error) {
    console.error(`Fetch error for ${url}:`, error.message);
    return { url, text: '', success: false, error: error.message };
  }
}

function parseUpcomingMatches(text, sourceUrl) {
  const matches = [];

  // 改进的正则表达式
  const teamPattern = /([A-Za-z0-9]+(?:\s*[A-Za-z0-9\.\-]+)*)\s+(?:vs\.?|-)\s+([A-Za-z0-9]+(?:\s*[A-Za-z0-9\.\-]+)*)/gi;

  // 提取所有日期
  const datePattern = /(\d{4}-\d{2}-\d{2})/g;
  const dates = [...text.matchAll(datePattern)].map(m => m[1]);

  let match;
  let matchId = 1;
  let dateIndex = 0;

  while ((match = teamPattern.exec(text)) !== null) {
    const matchDate = dates[Math.min(dateIndex, dates.length - 1)] || null;
    dateIndex = Math.min(dateIndex + 1, dates.length - 1);

    if (match[1] && match[2]) {
      matches.push({
        id: `match_${sourceUrl.replace(/[^a-zA-Z0-9]/g, '')}_${matchId++}`,
        team1: match[1].trim(),
        team2: match[2].trim(),
        start_date: matchDate,
        status: 'upcoming',
        source: sourceUrl,
      });
    }
  }

  return matches;
}

async function test() {
  console.log('=== Liquipedia 解析测试 ===\n');

  // 测试 fetch
  console.log('1. 测试从 Liquipedia 获取数据...\n');

  for (const url of LIQUIPEDIA_URLS) {
    console.log(`Fetching: ${url}`);
    const result = await fetchLiquipediaPage(url);

    if (result.success) {
      console.log(`  ✅ 成功获取数据 (${result.text.length} 字符)\n`);

      // 测试解析
      console.log('2. 测试解析比赛数据...\n');
      const matches = parseUpcomingMatches(result.text, url);

      console.log(`  解析到 ${matches.length} 场比赛\n`);

      // 查找 XG 相关的比赛
      const xgMatches = matches.filter(m =>
        m.team1.toLowerCase().includes('xg') ||
        m.team1.toLowerCase().includes('xtreme') ||
        m.team2.toLowerCase().includes('xg') ||
        m.team2.toLowerCase().includes('xtreme')
      );

      // 查找 BB 相关的比赛
      const bbMatches = matches.filter(m =>
        m.team1.toLowerCase().includes('bb') ||
        m.team1.toLowerCase().includes('betboom') ||
        m.team2.toLowerCase().includes('bb') ||
        m.team2.toLowerCase().includes('betboom')
      );

      // 查找 XG vs BB 的比赛
      const xgVsBB = matches.filter(m =>
        (m.team1.toLowerCase().includes('xg') || m.team1.toLowerCase().includes('xtreme')) &&
        (m.team2.toLowerCase().includes('bb') || m.team2.toLowerCase().includes('betboom')) ||
        (m.team2.toLowerCase().includes('xg') || m.team2.toLowerCase().includes('xtreme')) &&
        (m.team1.toLowerCase().includes('bb') || m.team1.toLowerCase().includes('betboom'))
      );

      console.log(`  XG 相关比赛: ${xgMatches.length} 场`);
      console.log(`  BB 相关比赛: ${bbMatches.length} 场`);
      console.log(`  XG vs BB 比赛: ${xgVsBB.length} 场\n`);

      if (xgMatches.length > 0) {
        console.log('  XG 比赛详情:');
        xgMatches.slice(0, 5).forEach(m => {
          console.log(`    - ${m.team1} vs ${m.team2} (${m.start_date || '无日期'})`);
        });
        console.log('');
      }

      if (bbMatches.length > 0) {
        console.log('  BB 比赛详情:');
        bbMatches.slice(0, 5).forEach(m => {
          console.log(`    - ${m.team1} vs ${m.team2} (${m.start_date || '无日期'})`);
        });
        console.log('');
      }

      // 打印前10场比赛
      console.log('  前10场比赛:');
      matches.slice(0, 10).forEach(m => {
        console.log(`    - ${m.team1} vs ${m.team2} (${m.start_date || '无日期'})`);
      });
    } else {
      console.log(`  ❌ 获取失败: ${result.error}\n`);
    }
  }
}

test().catch(console.error);
