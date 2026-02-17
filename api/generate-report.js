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

    // 拉取比赛数据
    const matchRes = await fetch(`https://api.opendota.com/api/matches/${matchId}`);
    const match = await matchRes.json();

    if (!match.players) {
      return res.status(400).json({ error: 'Match not found' });
    }

    // 构建完整 prompt（参考 dota-prompt.md）
    const prompt = `
# Dota 2 AI 战报生成任务

## 角色设定
你是一位顶级的 DOTA 2 职业联赛解说，风格类似 TI 官方分析台，既专业精准又富有激情。

## 英雄名称规则
必须使用中文昵称：
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
- 矮人直升机 → 飞机
- 虚无之灵 → 紫猫

## 队伍类型判断
- 如果任意一方是中国战队（选手：Ame, xNova, fy, NothingToSay, Xxs, Yatoro, iceice, Collapse, panto, rue 等），在复盘部分增加"失败原因分析"和"改进建议"
- 如果双方都不是中国战队，适当精简篇幅

## 禁止词汇
- ❌ "游戏开始了"
- ❌ "最后他们赢了"
- ❌ "打得很激烈"

## 推荐词汇
- ✅ "战火燃起"
- ✅ "一波定乾坤"
- ✅ "逆风翻盘"
- ✅ "无解肥"
- ✅ "接管比赛"
- ✅ "节奏发动机"
- ✅ "提款机"

## 比赛数据
${JSON.stringify(match, null, 2).slice(0, 8000)}

## 写作要求

1. **开篇**：总结比赛基调（翻盘局/碾压局/拉锯局），用富有激情的语言开场

2. **对线篇**：分析三路优劣（lane 1=上路，lane 2=中路，lane 3=下路），指出具体的压制点

3. **节奏篇**：描述关键装备出炉后的节奏变化（如：BKB出炉接管比赛）

4. **高潮篇**：还原关键团战，利用买活数据描述决策博弈

5. **复盘**：
   - 总结胜负手
   - 中国战队输比赛时：增加"失败原因分析"和"改进建议"

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
