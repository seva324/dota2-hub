#!/usr/bin/env node

function getHeroCnName(heroesCnData, heroId) {
  return heroesCnData?.[heroId]?.name_cn || `英雄${heroId}`;
}

function buildPrompt(match, heroesCnData) {
  return `
你是Dota2职业解说。根据以下比赛数据，写一份专业战报。

## 英雄名称（已转换为中文）
${Object.entries(heroesCnData).slice(0, 120).map(([id, h]) => `${id}=${h.name_cn}`).join(',')}

## 比赛信息
- 天辉 vs 夜魇
- 比分: ${match.radiant_score}:${match.dire_score}
- 时长: ${Math.floor(match.duration / 60)}分${match.duration % 60}秒
- 获胜: ${match.radiant_win ? '天辉' : '夜魇'}

## 选手数据（lane=1上路,2中路,3下路）
${match.players.map((p) => {
  const cnName = getHeroCnName(heroesCnData, p.hero_id);
  const team = p.player_slot < 128 ? '天辉' : '夜魇';
  return `${team} ${cnName}: KDA ${p.kills}/${p.deaths}/${p.assists} GPM:${p.gold_per_min} XPM:${p.xp_per_min} 分路:lane${p.lane}`;
}).join('\n')}

## 禁止词汇
不要用：游戏开始了、最后他们赢了、打得很激烈

## 战报结构（按 dota-ai-report.md）
1. 开篇：比赛基调（翻盘/碾压/拉锯），简述胜负
2. 对线篇：上中下三路分析，压制点
3. 节奏篇：关键装备和Powerspike
4. 高潮篇：关键团战和买活
5. 复盘：获胜关键/失败原因/改进建议

请生成专业、富有激情的战报！用中文英雄名！
`.trim();
}

export async function generateReportFromMatchId(matchId) {
  if (!matchId) {
    throw new Error('matchId required');
  }

  const minimaxApiKey = process.env.MINIMAX_API_KEY;
  if (!minimaxApiKey) {
    throw new Error('MINIMAX_API_KEY is required');
  }

  const [matchRes, heroesRes] = await Promise.all([
    fetch(`https://api.opendota.com/api/matches/${matchId}`),
    fetch('https://dota2-hub.vercel.app/data/heroes_cn.json'),
  ]);

  if (!matchRes.ok) {
    throw new Error(`OpenDota error: ${matchRes.status}`);
  }
  if (!heroesRes.ok) {
    throw new Error(`heroes_cn error: ${heroesRes.status}`);
  }

  const match = await matchRes.json();
  const heroesCnData = await heroesRes.json();

  if (!match?.players) {
    throw new Error('Match not found');
  }

  const prompt = buildPrompt(match, heroesCnData);

  const aiRes = await fetch('https://api.minimax.io/anthropic/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${minimaxApiKey}`,
    },
    body: JSON.stringify({
      model: 'MiniMax-M2.5',
      max_tokens: 3000,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
    }),
  });

  if (!aiRes.ok) {
    const text = await aiRes.text();
    throw new Error(`MiniMax error: ${text.slice(0, 300)}`);
  }

  const data = await aiRes.json();
  let report = '';
  if (Array.isArray(data?.content)) {
    for (const block of data.content) {
      if (block?.type === 'text') {
        report += block.text || '';
      }
    }
  }
  if (!report) {
    throw new Error('AI returned empty report');
  }

  return report;
}

function parseCliMatchId(argv) {
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if ((arg === '--match-id' || arg === '-m') && args[i + 1]) {
      return args[i + 1];
    }
  }
  return args[0];
}

async function main() {
  const matchId = parseCliMatchId(process.argv);
  if (!matchId) {
    console.error('Usage: node scripts/manual-api/generate-report.js --match-id <match_id>');
    process.exit(1);
  }

  try {
    const report = await generateReportFromMatchId(matchId);
    process.stdout.write(report + '\n');
  } catch (error) {
    console.error('[manual-api/generate-report] failed:', error?.message || error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
