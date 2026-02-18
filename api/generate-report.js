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

    // 简化的 prompt，只给必要信息
    const prompt = `
你是Dota2职业解说。请根据以下比赛数据写一份专业战报。

英雄中文名称（必须使用）：
1=敌法师,2=斧王,3=祸乱之源,4=血魔,5=水晶室女,6=卓尔游侠,7=撼地者,8=主宰,9=米拉娜,10=变体精灵,
11=影魔,12=幻影长矛手,13=帕克,14=帕吉,15=谜团,16=石鳞剑士,17=树精卫士,18=炼金术士,19=祈求者,20=远古遗迹,
21=矮人直升机,22=暗影萨满,23=沙王,24=风暴之灵,25=钢背兽,26=剃刀,27=暗影恶魔,28=斯拉克,29=剧毒,30=食尸鬼,
31=钢爪,32=干扰者,33=裂魂人,34=司夜刺客,35=鱼人守卫,36=暗影牧师,37=拉席克,38=先知,39=复仇之魂,40=编织者,
41=赏金猎人,42=巫医,43=殁境神蚀者,44=暗灵,45=巨魔战将,46=龙骑士,47=发条技师,48=半人马战行者,49=嗜血狂魔,50=流浪剑客,
51=全能骑士,52=陈,53=谜团,54=山岭巨人,55=精灵守卫,56=圣堂刺客,57=熊战士,58=暗夜猎手,59=受折磨灵魂,60=死亡先知,
61=死灵飞龙,62=兽王,63=凤凰,64=卡尔,65=墨客,66=天光,67=弧光,68=米波,69=娜迦海妖,70=干扰者,
71=秀逗魔导士,72=工程师,73=永恒之火,74=Invoker,75=陈

阵营：radiant=天辉, dire=夜魇
分路：lane 1=上路, 2=中路, 3=下路
lane_role：1=优势路, 2=中路, 3=劣势路

禁止词汇：游戏开始了、最后他们赢了、打得很激烈

比赛数据：
${JSON.stringify(match, null, 2).slice(0, 6000)}

请生成战报，包含：开篇、对线篇、节奏篇、高潮篇、复盘。使用中文英雄名！
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
