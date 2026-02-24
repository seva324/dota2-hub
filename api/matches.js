/**
 * 获取比赛数据 API
 */

import { createClient } from 'redis';

const REDIS_URL = process.env.REDIS_URL;

let redis;
async function getRedis() {
  if (!redis && REDIS_URL) {
    redis = createClient({ url: REDIS_URL });
    await redis.connect();
  }
  return redis;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const r = await getRedis();
    
    const matchesListJson = await r.get('matches:list');
    
    if (matchesListJson) {
      const matchesList = JSON.parse(matchesListJson);
      return res.status(200).json(matchesList);
    }
    
    const matchesJson = await r.get('matches');
    if (matchesJson) {
      const matches = JSON.parse(matchesJson);
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
