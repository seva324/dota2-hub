/**
 * 获取赛事数据 API
 */

import fs from 'fs';
import path from 'path';

// Fallback to local JSON file
function getLocalTournaments() {
  try {
    const localPath = path.join(process.cwd(), 'public', 'data', 'tournaments.json');
    const data = fs.readFileSync(localPath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading local tournaments:', error);
    return { tournaments: [], seriesByTournament: {} };
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
      const tournaments = await kv.get('tournaments');
      
      if (tournaments) {
        const list = Object.values(tournaments)
          .sort((a, b) => new Date(b.start_date || 0) - new Date(a.start_date || 0));
        return res.status(200).json(list);
      }
    }
    
    // Fallback to local JSON file
    const localData = getLocalTournaments();
    const list = (localData.tournaments || [])
      .sort((a, b) => new Date(b.start_date || 0) - new Date(a.start_date || 0));
    return res.status(200).json(list);
  } catch (error) {
    console.error('Error:', error);
    // Fallback to local JSON on error
    const localData = getLocalTournaments();
    const list = (localData.tournaments || [])
      .sort((a, b) => new Date(b.start_date || 0) - new Date(a.start_date || 0));
    return res.status(200).json(list);
  }
}
