/**
 * Liquipedia 数据同步 API
 * 从 Liquipedia 拉取赛事信息并存入 Vercel KV
 */

import { kv } from '@vercel/kv';

// Liquipedia 页面列表
const LIQUIPEDIA_URLS = [
  'https://liquipedia.net/dota2/DreamLeague/Season_28',
  'https://liquipedia.net/dota2/BLAST/Premier',
  'https://liquipedia.net/dota2/PGL/Major/2026',
  'https://liquipedia.net/dota2/ESL_One/',
];

async function fetchLiquipediaPage(url) {
  try {
    // 使用 jina.ai 的 HTML to JSON 服务
    const response = await fetch(`https://r.jina.ai/${url}`);
    const text = await response.text();
    return { url, text, success: true };
  } catch (error) {
    console.error(`Error fetching ${url}:`, error.message);
    return { url, text: '', success: false, error: error.message };
  }
}

function parseMatchInfo(text, sourceUrl) {
  // 简化解析 - 实际需要更复杂的 HTML 解析
  const matches = [];
  
  // 这里是一个简化版本
  // 实际使用时需要根据 Liquipedia 的 HTML 结构进行解析
  
  return matches;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    console.log('========================================');
    console.log('DOTA2 Hub - Liquipedia Sync');
    console.log('Time:', new Date().toISOString());
    console.log('========================================\n');

    let newTournaments = 0;
    let newMatches = 0;

    // 获取现有数据
    const existingTournaments = await kv.get('tournaments') || {};
    const existingUpcoming = await kv.get('upcoming') || [];

    console.log(`Existing tournaments: ${Object.keys(existingTournaments).length}`);
    console.log(`Existing upcoming matches: ${existingUpcoming.length}`);

    // 从 Liquipedia 拉取数据
    console.log('\n--- Fetching from Liquipedia ---');
    for (const url of LIQUIPEDIA_URLS) {
      console.log(`Fetching: ${url}`);
      const result = await fetchLiquipediaPage(url);
      
      if (result.success) {
        // 解析赛事信息
        const tournaments = parseMatchInfo(result.text, url);
        for (const t of tournaments) {
          if (!existingTournaments[t.id]) {
            existingTournaments[t.id] = t;
            newTournaments++;
          }
        }
      }
      
      await new Promise(r => setTimeout(r, 1000));
    }

    // 保存到 KV
    await kv.set('tournaments', existingTournaments);
    console.log(`\nSaved ${newTournaments} new tournaments`);

    // 更新 upcoming 列表
    const upcomingList = Object.values(existingTournaments)
      .filter(t => t.status === 'upcoming' && t.start_date)
      .sort((a, b) => new Date(a.start_date) - new Date(b.start_date))
      .slice(0, 50);
    
    await kv.set('upcoming', upcomingList);
    console.log(`Updated upcoming: ${upcomingList.length} matches`);

    console.log(`\n========================================`);
    console.log(`Sync completed! Tournaments: ${newTournaments}, Upcoming: ${newMatches}`);
    console.log('========================================');

    return res.status(200).json({ 
      success: true, 
      tournaments: newTournaments,
      upcoming: upcomingList.length,
      message: `Synced ${newTournaments} tournaments`
    });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
