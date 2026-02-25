/**
 * 测试 dltv.org 解析逻辑
 */

const DLTV_URL = 'https://dltv.org/matches';

const CN_TEAMS = ['xg', 'xtreme', 'yb', 'yakult', 'vg', 'vici', 'lgd', 'ar', 'azure', 'astral'];

async function fetchDLTVMatches() {
  try {
    const response = await fetch(DLTV_URL, {
      signal: AbortSignal.timeout(15000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    return { html, success: true };
  } catch (error) {
    console.error(`Fetch error:`, error.message);
    return { html: '', success: false, error: error.message };
  }
}

function parseDLTVMatches(html) {
  const matches = [];
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();

  console.log(`当前日期: ${currentYear}-${currentMonth}-${currentDay}\n`);

  // 解析今日赛程
  const todaySection = html.match(/今日赛程[\s\S]*?(?=明日赛程|$)/i);
  if (todaySection) {
    console.log('=== 今日赛程 ===');
    const todayMatches = parseScheduleSection(todaySection[0], currentYear, currentMonth, currentDay, 'today');
    matches.push(...todayMatches);
  }

  // 解析明日赛程
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowSection = html.match(/明日赛程[\s\S]*?$/i);
  if (tomorrowSection) {
    console.log('\n=== 明日赛程 ===');
    const tomorrowMatches = parseScheduleSection(tomorrowSection[0], tomorrow.getFullYear(), tomorrow.getMonth() + 1, tomorrow.getDate(), 'tomorrow');
    matches.push(...tomorrowMatches);
  }

  return matches;
}

function parseScheduleSection(section, year, month, day, dayType) {
  const matches = [];
  let matchId = 1;

  // 完整匹配: 时间 + 赛事 + 对阵
  const fullPattern = /(\d{1,2}:\d{2})\s+([A-Za-z][A-Za-z0-9\s\.&\-']*(?:Season|Trophy|League|Championship|Major|Minor)[\s&A-Za-z0-9\-']*)\s+([A-Za-z][a-zA-Z0-9]*(?:\s+[A-Za-z0-9]+)*)\s+vs\.?\s+([A-Za-z][a-zA-Z0-9]*(?:\s+[A-Za-z0-9]+)*)/gi;

  let fullMatch;
  while ((fullMatch = fullPattern.exec(section)) !== null) {
    const time = fullMatch[1];
    const tournament = fullMatch[2].trim();
    const team1 = fullMatch[3].trim();
    const team2 = fullMatch[4].trim();

    const [hours, minutes] = time.split(':').map(Number);
    const matchDate = new Date(Date.UTC(year, month - 1, day, hours, minutes));

    if (matchDate.getTime() > Date.now()) {
      console.log(`  ${time} - ${tournament}: ${team1} vs ${team2}`);

      matches.push({
        id: `dltv_${year}${month}${day}_${matchId++}`,
        team1: team1,
        team2: team2,
        start_time: Math.floor(matchDate.getTime() / 1000),
        tournament_name: tournament,
        status: 'upcoming',
        source: 'dltv.org',
      });
    }
  }

  return matches;
}

function isChineseTeam(teamName) {
  if (!teamName) return false;
  const name = teamName.toLowerCase();
  return CN_TEAMS.some(cn => name.includes(cn));
}

async function test() {
  console.log('=== 测试 dltv.org 解析 ===\n');

  console.log('正在从 dltv.org 获取数据...\n');

  const result = await fetchDLTVMatches();

  if (!result.success) {
    console.log(`获取失败: ${result.error}`);
    return;
  }

  console.log(`获取成功，HTML 长度: ${result.html.length}\n`);

  const matches = parseDLTVMatches(result.html);

  console.log(`\n共解析到 ${matches.length} 场比赛\n`);

  // 查找 XG 相关比赛
  const xgMatches = matches.filter(m =>
    m.team1.toLowerCase().includes('xg') ||
    m.team1.toLowerCase().includes('xtreme') ||
    m.team2.toLowerCase().includes('xg') ||
    m.team2.toLowerCase().includes('xtreme')
  );

  console.log('=== XG 相关比赛 ===');
  if (xgMatches.length > 0) {
    xgMatches.forEach(m => {
      const date = new Date(m.start_time * 1000);
      const beijingTime = date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', timeZoneName: 'short' });
      console.log(`  ${m.team1} vs ${m.team2}`);
      console.log(`  赛事: ${m.tournament_name}`);
      console.log(`  时间: ${beijingTime}`);
      console.log('');
    });
  } else {
    console.log('  未找到 XG 比赛\n');
  }

  // 打印所有比赛
  console.log('=== 所有比赛 ===');
  matches.forEach(m => {
    const date = new Date(m.start_time * 1000);
    const beijingTime = date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' });
    console.log(`  ${beijingTime} - ${m.team1} vs ${m.team2}`);
  });
}

test().catch(console.error);
