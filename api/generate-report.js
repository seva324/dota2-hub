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

    const matchRes = await fetch(`https://api.opendota.com/api/matches/${matchId}`);
    const match = await matchRes.json();

    if (!match.players) {
      return res.status(400).json({ error: 'Match not found' });
    }

    // 使用 dota-ai-report.md 的 prompt
    const prompt = `
# Dota 2 AI 战报生成任务

## 基础数据映射

### 阵营映射
- radiant = 天辉
- dire = 夜魇

### 分路映射
- lane 1 = 上路
- lane 2 = 中路  
- lane 3 = 下路
- lane_role 1 = 优势路/一号位
- lane_role 2 = 中路/二号位
- lane_role 3 = 劣势路/三号位

## 比赛数据
${JSON.stringify(match, null, 2).slice(0, 8000)}

## 战报结构

### 1. 开篇
- 总结比赛基调（翻盘局 / 碾压局 / 拉锯局）
- 简述胜负结果

### 2. 对线篇
- 按上路、中路、下路分析（用 lane 匹配）
- 指出具体的压制点（如：劣势路 75% 线优反压制）

### 3. 节奏篇
- 关键装备分析（BKB、跳刀等）
- 装备后带来的节奏变化

### 4. 高潮篇
- 关键团战还原
- 买活博弈

### 5. 复盘
- 获胜关键
- 失败原因
- 改进建议

## 风格指南

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

### 英雄昵称（必须使用）
- 矮人直升机 → 飞机
- 虚无之灵 → 紫猫
- 森海飞霞 → 小鹿
- 半人马战行者 → 人马
- 灰烬之灵 → 火猫
- 暗影恶魔 → 毒狗
- 马戏团长 → 滚滚
- 龙骑士 → DK
- 斯拉达 → 鱼人
- 发条技师 → 发条

请生成一份专业、富有激情的 Dota 2 战报！
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
