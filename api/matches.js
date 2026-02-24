/**
 * 获取比赛数据 API
 * 从 Redis 获取比赛列表
 */

import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://default:CTq7DQ5ptIyjBe7ntGJtcdDJl1dr4l4A@redis-19738.crce185.ap-seast-1-1.ec2.cloud.redislabs.com:19738';

let redis;
function getRedis() {
  if (!redis) {
    redis = new Redis(REDIS_URL);
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
    const r = getRedis();
    
    // 尝试从 Redis 获取
    const matchesListJson = await r.get('matches:list');
    
    if (matchesListJson) {
      const matchesList = JSON.parse(matchesListJson);
      return res.status(200).json(matchesList);
    }
    
    // 如果没有缓存，尝试从 matches 获取
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
