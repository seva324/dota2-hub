#!/usr/bin/env node
/**
 * Hero Lane Stats 同步脚本
 * 从 OpenDota API 获取英雄对线数据
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
        if (response.status === 404) {
          return [];
        }
        throw new Error(`HTTP ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      if (i === retries - 1) return [];
      console.log(`Retry ${i + 1}/${retries} for ${url}`);
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  return [];
}

async function fetchHeroLaneStats() {
  console.log('=== Fetching Hero Lane Stats ===');
  
  // 获取英雄列表
  const heroes = await fetchWithRetry(`${OPENDOTA_BASE_URL}/heroes`);
  console.log(`  Got ${heroes.length} heroes`);
  
  // 创建英雄 ID 到信息的映射
  const heroMap = {};
  for (const hero of heroes) {
    heroMap[hero.id] = hero;
  }
  
  // 保存英雄数据
  const heroesPath = path.join(publicDataDir, 'heroes.json');
  fs.writeFileSync(heroesPath, JSON.stringify(heroes, null, 2));
  console.log(`  Saved ${heroes.length} heroes to heroes.json`);
  
  const laneStats = [];
  
  console.log('  Fetching matchups for each hero...');
  
  const BATCH_SIZE = 5;
  const DELAY_MS = 2000;
  
  for (let i = 0; i < heroes.length; i += BATCH_SIZE) {
    const batch = heroes.slice(i, i + BATCH_SIZE);
    console.log(`  Processing heroes ${i + 1}-${Math.min(i + BATCH_SIZE, heroes.length)}/${heroes.length}`);
    
    const promises = batch.map(async (hero) => {
      const matchups = await fetchWithRetry(`${OPENDOTA_BASE_URL}/heroes/${hero.id}/matchups`);
      
      await new Promise(r => setTimeout(r, 500));
      
      return {
        hero_id: hero.id,
        hero_name: hero.name,
        localized_name: hero.localized_name,
        matchups: matchups || []
      };
    });
    
    const results = await Promise.all(promises);
    laneStats.push(...results);
    
    await new Promise(r => setTimeout(r, DELAY_MS));
  }
  
  console.log(`  Fetched matchups for ${laneStats.length} heroes`);
  
  // 处理和过滤数据
  const processedData = processLaneStats(laneStats, heroMap);
  
  // 保存数据
  const outputPath = path.join(publicDataDir, 'hero_lane_stats.json');
  fs.writeFileSync(outputPath, JSON.stringify(processedData, null, 2));
  console.log(`  Saved hero lane stats to ${outputPath}`);
}

function processLaneStats(rawData, heroMap) {
  const result = {
    heroes: [],
    lastUpdated: new Date().toISOString()
  };
  
  for (const hero of rawData) {
    const heroData = {
      id: hero.hero_id,
      name: hero.hero_name,
      localized_name: hero.localized_name,
      matchups: []
    };
    
    // 处理对线数据 (matchups)
    // API 返回: hero_id, games_played, wins
    if (hero.matchups && hero.matchups.length > 0) {
      for (const matchup of hero.matchups) {
        // 只保留有足够样本的数据
        if (matchup.games_played >= 50) {
          const opponent = heroMap[matchup.hero_id];
          heroData.matchups.push({
            hero_id: matchup.hero_id,
            hero_name: opponent?.name || `hero_${matchup.hero_id}`,
            localized_name: opponent?.localized_name || `英雄${matchup.hero_id}`,
            wins: matchup.wins,
            matches: matchup.games_played,
            win_rate: matchup.wins / matchup.games_played
          });
        }
      }
      
      // 按胜率排序
      heroData.matchups.sort((a, b) => b.win_rate - a.win_rate);
      
      // 只保留前50个对线英雄
      heroData.matchups = heroData.matchups.slice(0, 50);
    }
    
    result.heroes.push(heroData);
  }
  
  return result;
}

async function main() {
  console.log('========================================');
  console.log('Hero Lane Stats Sync');
  console.log('Time:', new Date().toISOString());
  console.log('========================================\n');
  
  await fetchHeroLaneStats();
  
  console.log('\nDone!');
}

main();
