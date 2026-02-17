#!/usr/bin/env node
/**
 * Hero Data 同步脚本
 * 生成前端所需的英雄数据格式
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OPENDOTA_API_KEY = process.env.OPENDOTA_API_KEY || 'ab01b0b0-c459-4524-92eb-0b6af0cdc415';
const OPENDOTA_BASE_URL = 'https://api.opendota.com/api';

const publicDataDir = path.join(__dirname, '..', 'public', 'data');

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const headers = {};
      if (OPENDOTA_API_KEY) {
        headers['Authorization'] = `Bearer ${OPENDOTA_API_KEY}`;
      }
      
      const response = await fetch(url, { headers });
      
      if (!response.ok) {
        if (response.status === 429) {
          console.log('Rate limited, waiting 10s...');
          await new Promise(r => setTimeout(r, 10000));
          continue;
        }
        throw new Error(`HTTP ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      if (i === retries - 1) throw error;
      console.log(`Retry ${i + 1}/${retries}`);
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

async function fetchHeroData() {
  console.log('=== Fetching Hero Data ===');
  
  // 获取英雄列表
  const heroes = await fetchWithRetry(`${OPENDOTA_BASE_URL}/heroes`);
  console.log(`  Got ${heroes.length} heroes`);
  
  // 转换为前端所需格式: Record<id, { name, img }>
  // name: 英文名 (用于显示)
  // img: hero_xxx 格式 (用于加载图标)
  const heroesData = {};
  
  for (const hero of heroes) {
    // 从 name 提取 img 部分: npc_dota_hero_antimage -> antimage
    const imgName = hero.name.replace('npc_dota_hero_', '');
    
    heroesData[hero.id] = {
      id: hero.id,
      name: hero.localized_name,  // 英文名
      img: imgName                // 用于图标
    };
  }
  
  // 保存前端格式
  const heroesPath = path.join(publicDataDir, 'heroes.json');
  fs.writeFileSync(heroesPath, JSON.stringify(heroesData, null, 2));
  console.log(`  Saved ${heroes.length} heroes to heroes.json (frontend format)`);
  
  return heroesData;
}

async function fetchMatchups() {
  console.log('\n=== Fetching Hero Matchups ===');
  
  const heroes = await fetchWithRetry(`${OPENDOTA_BASE_URL}/heroes`);
  console.log(`  Got ${heroes.length} heroes`);
  
  const heroMap = {};
  for (const hero of heroes) {
    heroMap[hero.id] = hero;
  }
  
  const matchupsData = {};
  
  console.log('  Fetching matchups for each hero...');
  
  const BATCH_SIZE = 5;
  const DELAY_MS = 2000;
  
  for (let i = 0; i < heroes.length; i += BATCH_SIZE) {
    const batch = heroes.slice(i, i + BATCH_SIZE);
    console.log(`  Processing heroes ${i + 1}-${Math.min(i + BATCH_SIZE, heroes.length)}/${heroes.length}`);
    
    const promises = batch.map(async (hero) => {
      const matchups = await fetchWithRetry(`${OPENDOTA_BASE_URL}/heroes/${hero.id}/matchups`);
      
      await new Promise(r => setTimeout(r, 500));
      
      // 处理 matchups 数据
      const processedMatchups = [];
      if (matchups && matchups.length > 0) {
        for (const m of matchups) {
          if (m.games_played >= 50) {
            const opponent = heroMap[m.hero_id];
            processedMatchups.push({
              hero_id: m.hero_id,
              hero_name: opponent?.localized_name || `Hero ${m.hero_id}`,
              wins: m.wins,
              matches: m.games_played,
              win_rate: m.wins / m.games_played
            });
          }
        }
        // 按胜率排序
        processedMatchups.sort((a, b) => b.win_rate - a.win_rate);
        // 只保留前50
        processedMatchups.splice(50);
      }
      
      return { hero_id: hero.id, matchups: processedMatchups };
    });
    
    const results = await Promise.all(promises);
    for (const r of results) {
      matchupsData[r.hero_id] = r.matchups;
    }
    
    await new Promise(r => setTimeout(r, DELAY_MS));
  }
  
  console.log(`  Fetched matchups for ${heroes.length} heroes`);
  
  // 保存 matchups 数据
  const matchupsPath = path.join(publicDataDir, 'hero_matchups.json');
  fs.writeFileSync(matchupsPath, JSON.stringify(matchupsData, null, 2));
  console.log(`  Saved to ${matchupsPath}`);
}

async function main() {
  console.log('========================================');
  console.log('Hero Data Sync');
  console.log('Time:', new Date().toISOString());
  console.log('========================================\n');
  
  await fetchHeroData();
  await fetchMatchups();
  
  console.log('\nDone!');
}

main();
