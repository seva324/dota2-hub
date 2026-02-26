/**
 * 获取即将开始的比赛 API
 * 数据源: Redis (由 sync-liquipedia API 写入)
 * 回退: 本地 JSON 文件
 */

import fs from 'fs';
import path from 'path';

const REDIS_URL = process.env.REDIS_URL;

// Redis client singleton
let redis = null;

async function getRedis() {
  if (!redis && REDIS_URL) {
    const { createClient } = await import('redis');
    redis = createClient({ url: REDIS_URL });
    await redis.connect();
  }
  return redis;
}

// Fallback to local JSON file
function getLocalUpcoming() {
  try {
    const localPath = path.join(process.cwd(), 'public', 'data', 'upcoming.json');
    const data = fs.readFileSync(localPath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('[Upcoming API] Error reading local upcoming:', error);
    return [];
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Try Redis first
    let redisClient;
    try {
      redisClient = await getRedis();
    } catch (redisError) {
      console.log('[Upcoming API] Redis not available:', redisError.message);
    }

    if (redisClient) {
      try {
        const upcoming = await redisClient.get('upcoming');

        if (upcoming) {
          console.log('[Upcoming API] Found data in Redis');
          const parsed = JSON.parse(upcoming);
          return res.status(200).json(parsed);
        } else {
          console.log('[Upcoming API] No data in Redis, using fallback');
        }
      } catch (redisError) {
        console.log('[Upcoming API] Redis get failed:', redisError.message);
      }
    }

    // Fallback to local JSON file
    console.log('[Upcoming API] Using local JSON fallback');
    const localUpcoming = getLocalUpcoming();
    return res.status(200).json(localUpcoming);
  } catch (error) {
    console.error('[Upcoming API] Error:', error);
    // Fallback to local JSON on error
    const localUpcoming = getLocalUpcoming();
    return res.status(200).json(localUpcoming);
  }
}
