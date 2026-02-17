export default async function handler(req, res) {
  console.log('=== API called ===');
  console.log('method:', req.method);
  console.log('body:', req.body);
  
  if (req.method !== 'POST') {
    console.log('Not POST, returning 405');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { matchId } = req.body || {};
    console.log('matchId:', matchId);
    
    if (!matchId) {
      return res.status(400).json({ error: 'matchId required' });
    }

    // 1. 拉 opendota
    console.log('Fetching from OpenDota...');
    const matchRes = await fetch(`https://api.opendota.com/api/matches/${matchId}`);
    const match = await matchRes.json();
    console.log('Match fetched, players:', match.players?.length);

    if (!match.players) {
      return res.status(400).json({ error: 'Match not found' });
    }

    // 2. 调 AI
    console.log('Calling MiniMax...');
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
          { role: 'user', content: [{ type: 'text', text: `你是Dota2职业解说。请根据以下比赛数据写一份专业战报：${JSON.stringify(match).slice(0, 6000)}` }] }
        ]
      })
    });

    console.log('MiniMax response status:', aiRes.status);

    if (!aiRes.ok) {
      const text = await aiRes.text();
      console.error('MiniMax error:', text);
      return res.status(500).json({ error: 'AI接口报错: ' + text.slice(0, 100) });
    }

    const data = await aiRes.json();
    console.log('AI response received');
    
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

    console.log('Report generated, length:', report.length);
    return res.status(200).json({ report });
  } catch (e) {
    console.error('Error:', e);
    return res.status(500).json({ error: 'AI生成失败: ' + String(e) });
  }
}
