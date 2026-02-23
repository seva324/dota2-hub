/**
 * 获取赛事数据 API
 */

import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const tournaments = await kv.get('tournaments');
    
    if (tournaments) {
      const list = Object.values(tournaments)
        .sort((a, b) => new Date(b.start_date || 0) - new Date(a.start_date || 0));
      return res.status(200).json(list);
    }
    
    return res.status(200).json([]);
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
