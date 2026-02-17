import type { VercelRequest, VercelResponse } from '@vercel/node';

interface MatchData {
  match_id: number;
  duration: number;
  radiant_score: number;
  dire_score: number;
  radiant_win: boolean;
  radiant_team_name: string;
  dire_team_name: string;
  players: Array<{
    player_slot: number;
    hero_id: number;
    name?: string;
    kills: number;
    deaths: number;
    assists: number;
    gold_per_min: number;
    xp_per_min: number;
    last_hits: number;
    denies: number;
    lane: number;
    lane_role: number;
  }>;
  objectives: Array<{
    type: string;
    time: number;
    key?: string;
  }>;
  teamfights: Array<{
    start: number;
    end: number;
    radiant_deaths: number[];
    dire_deaths: number[];
    buybacks: number;
  }>;
  radiant_gold_adv: number[];
  picks_bans: Array<{
    is_pick: boolean;
    hero_id: number;
    team: number;
  }>;
}

// Hero nickname mapping
const heroNicknames: Record<number, string> = {
  72: '飞机', 126: '紫猫', 123: '小鹿', 96: '人马', 106: '火猫',
  79: '毒狗', 131: '滚滚', 49: 'DK', 28: '鱼人', 51: '发条',
  1: '敌法', 2: '蓝猫', 5: '影魔', 6: '潮汐', 7: '牛头',
  8: '谜团', 11: '兽王', 13: '冰女', 16: '剑圣', 17: '炼金',
  19: '女王', 20: '伐木机', 21: '夜魔', 22: '蚂蚁', 23: '光法',
  25: '混沌', 26: '先知', 29: '蝙蝠', 30: '飞机', 31: '神灵',
  32: '火枪', 37: 'NEC', 38: '电魂', 40: '拍拍', 41: '猛犸',
  43: '毒龙', 44: '幽鬼', 45: 'TB', 46: '水人', 47: '猴子',
  48: '小狗', 52: 'DP', 53: 'Lion', 55: '屠夫', 56: 'TK',
  57: '白虎', 58: '风行', 59: 'VS', 60: '炸弹人', 61: '老奶奶',
  62: '陈', 63: '小精灵', 64: '大屁股', 65: '末日', 66: '沉默',
  68: '墨客', 69: '大树', 70: '土猫', 71: 'PA', 73: 'TS',
  74: '小鹿', 75: '酒仙', 76: '卡尔', 77: 'AA', 78: '光瘤',
  81: '神谕', 82: '大鱼人', 83: '兔子', 84: '沙王', 86: '天怒',
  88: '亚巴顿', 89: '桓', 90: '巨魔', 92: 'NAGA', 94: 'Pom',
  98: '白牛', 99: '黑贤', 100: '大牛', 104: '血魔', 107: '赏金',
  108: '小Y', 109: 'SK', 110: 'Coco', 112: 'ES', 114: 'OD',
  128: 'Lina', 129: 'Lich', 130: 'Luna', 135: 'Mirana', 136: 'Monkey',
  137: 'Morph', 138: 'Naga', 139: 'Necro', 140: 'OD', 141: 'Ogre',
  143: 'Oracle', 147: 'Phantom', 151: 'Ratt', 152: 'Razor', 153: 'Riki',
  154: 'Rubick', 155: 'SK', 160: 'Slark', 162: 'Sniper', 163: 'Spectre',
  165: 'Storm', 166: 'Sven', 167: 'Techies', 168: 'TA', 169: 'Terror',
  170: 'Timber', 171: 'Tiny', 172: 'Treant', 173: 'Troll', 174: 'Tusk',
  175: 'Undying', 176: 'Ursa', 177: 'Venge', 178: 'Venom', 179: 'Viper',
  181: 'Void', 182: 'Warf', 183: 'Weaver', 184: 'Wind', 189: 'Zeus',
};

function getHeroNickname(heroId: number): string {
  return heroNicknames[heroId] || `英雄${heroId}`;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function buildPrompt(data: MatchData): string {
  const radiantPlayers = data.players.filter(p => p.player_slot < 128);
  const direPlayers = data.players.filter(p => p.player_slot >= 128);
  const radiantWin = data.radiant_win;
  const winner = radiantWin ? data.radiant_team_name : data.dire_team_name;
  const loser = radiantWin ? data.dire_team_name : data.radiant_team_name;

  // Lane analysis
  const lanes = [1, 2, 3];
  let laneData = '';
  for (const lane of lanes) {
    const laneName = lane === 1 ? '上路' : lane === 2 ? '中路' : '下路';
    const rLanePlayers = radiantPlayers.filter(p => p.lane === lane);
    const dLanePlayers = direPlayers.filter(p => p.lane === lane);
    const rLH = rLanePlayers.reduce((s, p) => s + p.last_hits, 0);
    const dLH = dLanePlayers.reduce((s, p) => s + p.last_hits, 0);
    const rHeroes = rLanePlayers.map(p => getHeroNickname(p.hero_id)).join('+');
    const dHeroes = dLanePlayers.map(p => getHeroNickname(p.hero_id)).join('+');
    
    laneData += `
${laneName}:
- ${data.radiant_team_name}: ${rHeroes} (补刀: ${rLH})
- ${data.dire_team_name}: ${dHeroes} (补刀: ${dLH})
`;
  }

  // Key objectives
  const objectives = data.objectives || [];
  const firstBlood = objectives.find(o => o.type === 'CHAT_MESSAGE_FIRSTBLOOD');
  const roshanKills = objectives.filter(o => o.type === 'CHAT_MESSAGE_ROSHAN_KILL');
  
  let objectivesData = '';
  if (firstBlood) objectivesData += `- 一血: ${formatTime(firstBlood.time)}\n`;
  if (roshanKills.length > 0) {
    roshanKills.forEach((r, i) => {
      objectivesData += `- 肉山${i+1}: ${formatTime(r.time)}\n`;
    });
  }

  // Player stats
  let playerStats = '';
  for (const p of radiantPlayers) {
    playerStats += `${getHeroNickname(p.hero_id)}: ${p.kills}/${p.deaths}/${p.assists} | GPM:${p.gold_per_min} | XPM:${p.xp_per_min}\n`;
  }
  for (const p of direPlayers) {
    playerStats += `${getHeroNickname(p.hero_id)}: ${p.kills}/${p.deaths}/${p.assists} | GPM:${p.gold_per_min} | XPM:${p.xp_per_min}\n`;
  }

  // Gold advantage
  const goldAdv = data.radiant_gold_adv || [];
  const gold10 = goldAdv[10] || 0;
  const gold20 = goldAdv[20] || 0;
  const gold30 = goldAdv[30] || 0;

  return `
# Dota 2 比赛战报生成任务

## 比赛信息
- 对阵: ${data.radiant_team_name} vs ${data.dire_team_name}
- 比分: ${data.radiant_score}:${data.dire_score}
- 时长: ${formatTime(data.duration)}
- 获胜方: ${winner}

## 对线数据 (lane: 1=上路, 2=中路, 3=下路)
${laneData}

## 关键事件
${objectivesData || '无'}

## 经济曲线
- 10分钟: ${gold10 > 0 ? '+' + gold10 : gold10}
- 20分钟: ${gold20 > 0 ? '+' + gold20 : gold20}
- 30分钟: ${gold30 > 0 ? '+' + gold30 : gold30}

## 选手数据
${playerStats}

## 写作要求

1. **开篇**: 总结比赛基调（翻盘局/碾压局/拉锯局），用富有激情的语言开场

2. **对线篇**: 分析三路优劣，指出具体的压制点（如：Ame的DK劣势路75%线优反压对手）

3. **节奏篇**: 描述关键装备出炉后的节奏变化（如：BKB出炉接管比赛）

4. **高潮篇**: 还原关键团战，利用买活数据描述决策博弈

5. **复盘**: 
   - 如果中国战队输比赛：增加"失败原因分析"和"改进建议"
   - 如果双方都不是中国战队：精简篇幅

## 禁止词汇
- "游戏开始了"
- "最后他们赢了"  
- "打得很激烈"

## 推荐词汇
- 战火燃起
- 一波定乾坤
- 逆风翻盘
- 无解肥
- 接管比赛

请生成一份专业、富有激情的 Dota 2 战报！
`;
}

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  // Only allow POST
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const data: MatchData = request.body;
    
    if (!data.match_id) {
      return response.status(400).json({ error: 'Missing match_id' });
    }

    const prompt = buildPrompt(data);

    // Get API key from environment variable
    const apiKey = process.env.MINIMAX_API_KEY;
    if (!apiKey) {
      return response.status(500).json({ error: 'API key not configured' });
    }

    // Call Minimax API
    const aiResponse = await fetch('https://api.minimax.chat/v1/text/chatcompletion_v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'MiniMax-M2.5',
        messages: [
          {
            role: 'system',
            content: '你是一位顶级的 DOTA 2 职业联赛解说，风格类似 TI 官方分析台，既专业精准又富有激情。必须使用英雄中文昵称（如飞机、紫猫、小鹿、人马、火猫、毒狗、滚滚、DK、鱼人）。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 2000
      })
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('Minimax API error:', errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const report = aiData.choices?.[0]?.message?.content || '生成失败，请稍后重试';

    return response.status(200).json({ report });

  } catch (error) {
    console.error('Error generating report:', error);
    return response.status(500).json({ error: 'Failed to generate report' });
  }
}
