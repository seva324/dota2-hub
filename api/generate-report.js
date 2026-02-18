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
    const { matchId } = req.body || {};
    if (!matchId) {
      return res.status(400).json({ error: 'matchId required' });
    }

    // 并行获取比赛数据和英雄中文名
    const [matchRes, heroesRes] = await Promise.all([
      fetch(`https://api.opendota.com/api/matches/${matchId}`),
      fetch('https://dota2-hub.vercel.app/data/heroes_cn.json')
    ]);

    const match = await matchRes.json();
    const heroesCnData = await heroesRes.json();

    if (!match.players) {
      return res.status(400).json({ error: 'Match not found' });
    }

    // 转换英雄ID为中文名
    const getHeroCnName = (heroId) => {
      return heroesCnData[heroId]?.name_cn || `英雄${heroId}`;
    };

    // 使用 dota-ai-report.md 的战报模板
    const prompt = `
你是Dota2职业解说。根据以下比赛数据，写一份专业战报。

## 英雄名称（已转换为中文）
${Object.entries(heroesCnData).slice(0, 120).map(([id, h]) => `${id}=${h.name_cn}`).join(',')}

## 比赛信息
- 天辉 vs 夜魇
- 比分: ${match.radiant_score}:${match.dire_score}
- 时长: ${Math.floor(match.duration / 60)}分${match.duration % 60}秒
- 获胜: ${match.radiant_win ? '天辉' : '夜魇'}

## 选手数据（lane=1上路,2中路,3下路）
${match.players.map(p => {
  const cnName = getHeroCnName(p.hero_id);
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
`;

    const aiRes = await fetch('https://api.minimax.io/anthropic/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.MINIMAX_API_KEY}`
      },
      body: JSON.stringify({
        model: 'MiniMax-M2.5',
        max_tokens: 3000,
        messages: [
          { role: 'user', content: [{ type: 'text', text: prompt }] }
        ]
      })
    });

    if (!aiRes.ok) {
      const text = await aiRes.text();
      console.error('MiniMax error:', text);
      return res.status(500).json({ error: 'AI接口报错: ' + text.slice(0, 100) });
    }

    const data = await aiRes.json();
    
    let report = '';
    if (data.content && Array.isArray(data.content)) {
      for (const block of data.content) {
        if (block.type === 'text') {
          report += block.text;
        }
      }
    }

    if (!report) {
      return res.status(500).json({ error: 'AI生成失败' });
    }

    return res.status(200).json({ report });
  } catch (e) {
    console.error('Error:', e);
    return res.status(500).json({ error: 'AI生成失败: ' + String(e) });
  }
}
