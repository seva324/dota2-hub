/**
 * 获取即将开始的比赛 API
 */

import fs from 'fs';
import path from 'path';

// Fallback to local JSON file
function getLocalUpcoming() {
  try {
    const localPath = path.join(process.cwd(), 'public', 'data', 'upcoming.json');
    const data = fs.readFileSync(localPath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading local upcoming:', error);
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
    // Try to import @vercel/kv dynamically to avoid build errors
    let kv;
    try {
      const kvModule = await import('@vercel/kv');
      kv = kvModule.kv;
    } catch (importError) {
      console.log('KV not available, using local file');
      kv = null;
    }

    if (kv) {
      const upcoming = await kv.get('upcoming');
      if (upcoming) {
        return res.status(200).json(upcoming);
      }
    }
    
    // Fallback to local JSON file
    const localUpcoming = getLocalUpcoming();
    return res.status(200).json(localUpcoming);
  } catch (error) {
    console.error('Error:', error);
    // Fallback to local JSON on error
    const localUpcoming = getLocalUpcoming();
    return res.status(200).json(localUpcoming);
  }
}
