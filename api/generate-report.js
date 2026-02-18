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

    // 构建精简但完整的 prompt（参考 dota-ai-report.md 结构）
    const prompt = `
你是Dota2职业联赛解说。根据以下比赛数据，按照 dota-ai-report.md 的战报模板生成专业战报。

## 英雄名称（必须使用中文名）
用这个映射表把英雄ID转换成中文名：
1敌法师,2斧王,3祸乱之源,4血魔,5水晶室女,6卓尔游侠,7撼地者,8主宰,9米拉娜,10变体精灵,
11影魔,12幻影长矛手,13帕克,14帕吉,15谜团,16石鳞剑士,17树精卫士,18炼金,19祈求者,20远古遗迹,
21矮人直升机,22暗影萨满,23沙王,24风暴之灵,25钢背兽,26剃刀,27暗影恶魔,28斯拉克,29剧毒,30食尸鬼,
31钢爪,32干扰者,33裂魂人,34司夜刺客,35鱼人,36暗影牧师,37拉席克,38先知,39复仇之魂,40编织者,
41赏金猎人,42巫医,43殁境神蚀者,44暗灵,45巨魔战将,46龙骑士,47发条,48人马,49嗜血狂魔,50流浪剑客,
51全能骑士,52陈,53谜团,54山岭巨人,55精灵守卫,56圣堂刺客,57熊战士,58暗夜猎手,59死亡先知,60死灵飞龙,
61兽王,62凤凰,63卡尔,64墨客,65娜迦海妖,66天光,67弧光,68米波

## 比赛信息
- 天辉(radiant) vs 夜魇(dire)
- 比分: ${match.radiant_score}:${match.dire_score}
- 时长: ${Math.floor(match.duration / 60)}分${match.duration % 60}秒
- 获胜: ${match.radiant_win ? '天辉' : '夜魇'}

## 选手数据（用lane匹配：1上路,2中路,3下路）
${match.players.map(p => {
  const heroId = p.hero_id;
  const cnNames = {1:'敌法师',2:'斧王',3:'祸乱之源',4:'血魔',5:'水晶室女',6:'卓尔游侠',7:'撼地者',8:'主宰',9:'米拉娜',10:'变体精灵',11:'影魔',12:'幻影长矛手',13:'帕克',14:'帕吉',15:'谜团',16:'石鳞剑士',17:'树精卫士',18:'炼金',19:'祈求者',20:'远古遗迹',21:'矮人直升机',22:'暗影萨满',23:'沙王',24:'风暴之灵',25:'钢背兽',26:'剃刀',27:'暗影恶魔',28:'斯拉克',29:'剧毒',30:'食尸鬼',31:'钢爪',32:'干扰者',33:'裂魂人',34:'司夜刺客',35:'鱼人',36:'暗影牧师',37:'拉席克',38:'先知',39:'复仇之魂',40:'编织者',41:'赏金猎人',42:'巫医',43:'殁境神蚀者',44:'暗灵',45:'巨魔战将',46:'龙骑士',47:'发条',48:'人马',49:'嗜血狂魔',50:'流浪剑客',51:'全能骑士',52:'陈',54:'山岭巨人',55:'精灵守卫',56:'圣堂刺客',57:'熊战士',58:'暗夜猎手',59:'死亡先知',60:'死灵飞龙',61:'兽王',62:'凤凰',63:'卡尔',64:'墨客',65:'娜迦海妖',66:'天光',67:'弧光',68:'米波'};
  const cnName = cnNames[heroId] || `英雄${heroId}`;
  const team = p.player_slot < 128 ? '天辉' : '夜魇';
  return `${team} ${cnName}: KDA ${p.kills}/${p.deaths}/${p.assists} GPM:${p.gold_per_min} XPM:${p.xp_per_min} 分路:${p.lane}`;
}).join('\n')}

## 关键术语（参考 dota-mechanics.md）
- lane 1=上路,2=中路,3=下路
- lane_role 1=优势路/一号位,2=中路/二号位,3=劣势路/三号位
- GPM=每分钟金币, XPM=每分钟经验
- Powerspike=强势期, Timing=关键时间点
- 超级兵：破路后出现

## 禁止词汇
不要用：游戏开始了、最后他们赢了、打得很激烈

## 战报结构（参考 dota-ai-report.md）
1. 开篇：总结比赛基调（翻盘/碾压/拉锯），简述胜负
2. 对线篇：按上中下三路分析，指出压制点
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
