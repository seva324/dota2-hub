/**
 * 获取比赛数据 API
 * 从 Vercel KV 获取比赛列表
 */

import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
('Access-Control-Allow  res.setHeader-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // 尝试从 KV 获取
    const matchesList = await kv.get('matches:list');
    
    if (matchesList && matchesList.length > 0) {
      return res.status(200).json(matchesList);
    }
    
    // 如果 KV 没有数据，返回空数组或可以从 backup 获取
    const matches = await kv.get('matches');
    if (matches) {
      const list = Object.values(matches)
        .sort((a, b) => b.start_time - a.start_time)
        .slice(0, 500);
      return res.status(200).json(list);
    }
    
    return res.status(200).json([]);
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
