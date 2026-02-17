import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { matchId } = req.body;
    if (!matchId) {
      return res.status(400).json({ error: 'matchId required' });
    }

    // 1. 拉 opendota
    const matchRes = await fetch(`https://api.opendota.com/api/matches/${matchId}`);
    const match = await matchRes.json();

    if (!match.players) {
      return res.status(400).json({ error: 'Match not found' });
    }

    // 2. 调 AI
    const aiRes = await fetch('https://api.minimax.io/anthropic/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.MINIMAX_API_KEY}`
      },
      body: JSON.stringify({
        model: 'MiniMax-M2.5',
        max_tokens: 2000,
        messages: [
          { role: 'user', content: [{ type: 'text', text: `你是Dota2职业解说。请根据以下比赛数据写一份专业战报，使用中文英雄昵称：${JSON.stringify(match).slice(0, 6000)}` }] }
        ]
      })
    });

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
    console.error(e);
    return res.status(500).json({ error: 'AI生成失败' });
  }
}
