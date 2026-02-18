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

    // 并行请求比赛数据和英雄中文名称
    const [matchRes, heroesRes] = await Promise.all([
      fetch(`https://api.opendota.com/api/matches/${matchId}`),
      fetch('https://dota2-hub.vercel.app/data/heroes_cn.json')
    ]);

    const match = await matchRes.json();
    const heroesCnData = await heroesRes.json();

    if (!match.players) {
      return res.status(400).json({ error: 'Match not found' });
    }

    // 辅助函数：获取英雄中文名
    const getHeroCnName = (heroId) => {
      const hero = heroesCnData[heroId];
      return hero?.name_cn || `英雄${heroId}`;
    };

    // 使用 dota-ai-report.md + dota-mechanics.md + heroes_cn.json 的 prompt
    const prompt = `
# Dota 2 AI 战报生成任务

## 一、英雄中文名称映射（必须使用，来自 heroes_cn.json）
${Object.entries(heroesCnData).slice(0, 150).map(([id, h]) => `${id} = ${h.name_cn}`).join('\n')}

## 二、基础数据映射

### 阵营映射
- radiant = 天辉
- dire = 夜魇

### 分路映射（来自 dota-mechanics.md）
- lane 1 = 上路（地图上方）
- lane 2 = 中路
- lane 3 = 下路（地图下方）
- lane_role 1 = 优势路/一号位
- lane_role 2 = 中路/二号位
- lane_role 3 = 劣势路/三号位
- lane_role 4 = 四号位
- lane_role 5 = 五号位

### 关键术语（来自 dota-mechanics.md）
- LH (Last Hit) = 正补
- Deny = 反补
- GPM = 每分钟金币
- XPM = 每分钟经验
- KDA = 击杀/死亡/助攻
- Powerspike = 强势期
- Timing = 关键时间点

### 兵线机制
- 每30秒生成一波兵
- 超级兵：摧毁任意一路兵营后该路刷超级兵

### 击杀奖励
- First Blood：135金币
- 连杀奖励：Spree(3)→60, Dominating(4)→100, Mega Kill(5)→150

## 三、比赛数据（英雄已转换为中文名）
${JSON.stringify(match, null, 2).slice(0, 8000)}

## 四、战报结构

### 1. 开篇
- 总结比赛基调（翻盘局 / 碾压局 / 拉锯局 / 膀胱局）
- 简述胜负结果

### 2. 对线篇
- 按上路(lane=1)、中路(lane=2)、下路(lane=3)分析
- 指出具体的压制点

### 3. 节奏篇
- 关键装备分析（BKB、跳刀、分身等）
- 装备后带来的节奏变化

### 4. 高潮篇
- 关键团战还原
- 买活博弈

### 5. 复盘
- 获胜关键
- 失败原因（如果中国战队输）
- 改进建议（如果中国战队输）

## 五、风格指南

### 禁止词汇
- ❌ "游戏开始了"
- ❌ "最后他们赢了"
- ❌ "打得很激烈"

### 推荐词汇
- ✅ "战火燃起"
- ✅ "一波定乾坤"
- ✅ "逆风翻盘"
- ✅ "无解肥"
- ✅ "接管比赛"
- ✅ "节奏发动机"
- ✅ "提款机"

请生成一份专业、富有激情的 Dota 2 战报！必须使用 heroes_cn.json 中的英雄中文名称！
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
