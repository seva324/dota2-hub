const heroNicknames = {
  72: '飞机', 126: '紫猫', 123: '小鹿', 96: '人马', 106: '火猫',
  79: '毒狗', 131: '滚滚', 49: 'DK', 28: '鱼人', 51: '发条',
};

function getHeroNickname(heroId) {
  return heroNicknames[heroId] || `英雄${heroId}`;
}

function formatTime(seconds) {
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;
}

export default async function handler(request, response) {
  // Set CORS headers
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const data = request.body;
    if (!data.match_id) {
      return response.status(400).json({ error: 'Missing match_id' });
    }

    const radiantPlayers = data.players.filter(p => p.player_slot < 128);
    const direPlayers = data.players.filter(p => p.player_slot >= 128);
    const winner = data.radiant_win ? data.radiant_team_name : data.dire_team_name;

    const prompt = `
比赛: ${data.radiant_team_name} vs ${data.dire_team_name}
比分: ${data.radiant_score}:${data.dire_score} 时长: ${formatTime(data.duration)}
获胜: ${winner}

对线数据:
上路: ${radiantPlayers.filter(p => p.lane === 1).map(p => getHeroNickname(p.hero_id)).join('+')} vs ${direPlayers.filter(p => p.lane === 1).map(p => getHeroNickname(p.hero_id)).join('+')}
中路: ${radiantPlayers.filter(p => p.lane === 2).map(p => getHeroNickname(p.hero_id)).join('+')} vs ${direPlayers.filter(p => p.lane === 2).map(p => getHeroNickname(p.hero_id)).join('+')}
下路: ${radiantPlayers.filter(p => p.lane === 3).map(p => getHeroNickname(p.hero_id)).join('+')} vs ${direPlayers.filter(p => p.lane === 3).map(p => getHeroNickname(p.hero_id)).join('+')}

选手数据:
${data.players.map(p => `${getHeroNickname(p.hero_id)}: ${p.kills}/${p.deaths}/${p.assists} GPM:${p.gold_per_min}`).join('\n')}

请用专业激情风格写Dota2战报，使用中文英雄昵称。
`;

    const apiKey = process.env.MINIMAX_API_KEY;
    if (!apiKey) {
      return response.status(500).json({ error: 'API key not configured' });
    }

    const aiResponse = await fetch('https://api.minimax.io/anthropic/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'MiniMax-M2.5',
        max_tokens: 2000,
        messages: [
          { role: 'user', content: [{ type: 'text', text: prompt }] }
        ]
      })
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('API error:', aiResponse.status, errorText);
      return response.status(500).json({ error: `API error: ${aiResponse.status}`, details: errorText });
    }

    const aiData = await aiResponse.json();
    
    let report = '';
    if (aiData.content && Array.isArray(aiData.content)) {
      for (const block of aiData.content) {
        if (block.type === 'text') {
          report += block.text;
        }
      }
    }
    
    if (!report) {
      report = '生成失败';
    }

    return response.status(200).json({ report });

  } catch (error) {
    console.error('Error:', error);
    return response.status(500).json({ error: String(error) });
  }
}
