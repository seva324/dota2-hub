/**
 * 获取比赛数据 API
 */

import { createClient } from 'redis';
import fs from 'fs';
import path from 'path';

const REDIS_URL = process.env.REDIS_URL;

let redis;
async function getRedis() {
  if (!redis && REDIS_URL) {
    redis = createClient({ url: REDIS_URL });
    await redis.connect();
  }
  return redis;
}

// Fallback to local JSON file
function getLocalMatches() {
  try {
    const localPath = path.join(process.cwd(), 'public', 'data', 'matches.json');
    const data = fs.readFileSync(localPath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading local matches:', error);
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
    
    // Fallback to local JSON file
    const localMatches = getLocalMatches();
    const sortedMatches = localMatches
      .sort((a, b) => b.start_time - a.start_time)
      .slice(0, 500);
    return res.status(200).json(sortedMatches);
  } catch (error) {
    console.error('Error:', error);
    // Fallback to local JSON on error
    const localMatches = getLocalMatches();
    const sortedMatches = localMatches
      .sort((a, b) => b.start_time - a.start_time)
      .slice(0, 500);
    return res.status(200).json(sortedMatches);
  }
}
