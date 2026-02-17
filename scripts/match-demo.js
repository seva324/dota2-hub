#!/usr/bin/env node
/**
 * Match Analysis Demo - 比赛数据分析
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const publicDataDir = path.join(__dirname, '..', 'public', 'data');

// 读取选手映射
function loadPlayerMapping() {
  const mappingPath = path.join(publicDataDir, 'pro_players.json');
  if (fs.existsSync(mappingPath)) {
    return JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
  }
  return {};
}

// 读取英雄数据
function loadHeroes() {
  const heroesPath = path.join(publicDataDir, 'heroes.json');
  if (fs.existsSync(heroesPath)) {
    return JSON.parse(fs.readFileSync(heroesPath, 'utf-8'));
  }
  return [];
}

function getHeroName(heroId, heroes) {
  for (const h of heroes) {
    if (h.id === heroId) {
      return h.localized_name;
    }
  }
  return `Hero ${heroId}`;
}

function getPlayerName(accountId, playerMapping) {
  if (accountId && playerMapping[accountId]) {
    return playerMapping[accountId].name;
  }
  return null;
}

async function fetchMatch(matchId) {
  const response = await fetch(`https://api.opendota.com/api/matches/${matchId}`);
  return await response.json();
}

function analyzeMatch(match, playerMapping, heroes) {
  const radiant = match.players.filter(p => p.player_slot < 128);
  const dire = match.players.filter(p => p.player_slot >= 128);
  
  const radiantTeam = match.radiant_team?.name || 'Radiant';
  const direTeam = match.dire_team?.name || 'Dire';
  const winner = match.radiant_win ? radiantTeam : direTeam;
  
  // 分析报告
  const analysis = {
    match_id: match.match_id,
    duration: match.duration,
    radiant_team: radiantTeam,
    dire_team: direTeam,
    winner: winner,
    radiant_score: sum(radiant, 'kills'),
    dire_score: sum(dire, 'kills'),
    players: {
      radiant: radiant.map(p => ({
        name: getPlayerName(p.account_id, playerMapping) || p.personaname || 'Unknown',
        hero: getHeroName(p.hero_id, heroes),
        kills: p.kills,
        deaths: p.deaths,
        assists: p.assists,
        net_worth: p.net_worth,
        gold_per_min: p.gold_per_min,
        xp_per_min: p.xp_per_min,
        hero_damage: p.hero_damage,
        tower_damage: p.tower_damage
      })),
      dire: dire.map(p => ({
        name: getPlayerName(p.account_id, playerMapping) || p.personaname || 'Unknown',
        hero: getHeroName(p.hero_id, heroes),
        kills: p.kills,
        deaths: p.deaths,
        assists: p.assists,
        net_worth: p.net_worth,
        gold_per_min: p.gold_per_min,
        xp_per_min: p.xp_per_min,
        hero_damage: p.hero_damage,
        tower_damage: p.tower_damage
      }))
    },
    // AI 点评
    ai_commentary: generateAICommentary(match, radiant, dire, radiantTeam, direTeam)
  };
  
  return analysis;
}

function sum(arr, key) {
  return arr.reduce((a, b) => a + (b[key] || 0), 0);
}

function generateAICommentary(match, radiant, dire, radiantTeam, direTeam) {
  const commentary = [];
  
  const radiantKills = sum(radiant, 'kills');
  const direKills = sum(dire, 'kills');
  const radiantGold = sum(radiant, 'net_worth');
  const direGold = sum(dire, 'net_worth');
  
  // 总体评价
  if (direKills - radiantKills > 15) {
    commentary.push('Xtreme Gaming 碾压对手，全场压制力极强。');
  }
  
  // MVP 分析
  const allPlayers = [...radiant, ...dire].sort((a, b) => b.net_worth - a.net_worth);
  const mvp = allPlayers[0];
  const mvpName = mvp.account_id && playerMapping[mvp.account_id] ? playerMapping[mvp.account_id].name : mvp.personaname;
  
  if (mvp.net_worth > 25000) {
    commentary.push(`MVP: ${mvpName} (${getHeroName(mvp.hero_id, heroes)}) - ${mvp.net_worth}经济，无解肥Carry。`);
  }
  
  // 对线分析 - player_slot: 0=一号位(Carry), 1=二号位(Mid), 2=三号位(Offlane), 3=四号位(Soft), 4=五号位(Hard)
  const midRadiant = radiant.find(p => p.player_slot % 128 === 1);  // 二号位是中单
  const midDire = dire.find(p => p.player_slot % 128 === 1);  // 二号位是中单
  
  if (midRadiant && midDire) {
    if (midDire.gold_per_min - midRadiant.gold_per_min > 50) {
      commentary.push(`中路线优: ${midDire.personaname} 对线压制成功。`);
    }
  }
  
  return commentary;
}

async function main() {
  const matchId = process.argv[2] || '8693504706';
  console.log(`Fetching match ${matchId}...`);
  
  const playerMapping = loadPlayerMapping();
  const heroes = loadHeroes();
  
  console.log('Loaded player mapping:', Object.keys(playerMapping).length, 'players');
  console.log('Loaded heroes:', heroes.length, 'heroes');
  
  const match = await fetchMatch(matchId);
  const analysis = analyzeMatch(match, playerMapping, heroes);
  
  console.log();
  console.log('=' . repeat(50));
  console.log('MATCH ANALYSIS DEMO');
  console.log('=' . repeat(50));
  console.log();
  console.log(`Match ID: ${analysis.match_id}`);
  console.log(`Duration: ${Math.floor(analysis.duration / 60)}m ${analysis.duration % 60}s`);
  console.log(`${analysis.radiant_team} vs ${analysis.dire_team}`);
  console.log(`Winner: ${analysis.winner}`);
  console.log();
  console.log('--- KDA ---');
  console.log(`${analysis.radiant_team}: ${analysis.radiant_score} kills`);
  console.log(`${analysis.dire_team}: ${analysis.dire_score} kills`);
  console.log();
  console.log('--- Players ---');
  console.log(analysis.radiant_team + ':');
  for (const p of analysis.players.radiant) {
    console.log(`  ${p.name} (${p.hero}): ${p.kills}/${p.deaths}/${p.assists} - ${p.net_worth}g`);
  }
  console.log(analysis.dire_team + ':');
  for (const p of analysis.players.dire) {
    console.log(`  ${p.name} (${p.hero}): ${p.kills}/${p.deaths}/${p.assists} - ${p.net_worth}g`);
  }
  console.log();
  console.log('--- AI Commentary ---');
  for (const c of analysis.ai_commentary) {
    console.log('  ' + c);
  }
  
  // 保存到文件
  const outputPath = path.join(publicDataDir, 'match_demo.json');
  fs.writeFileSync(outputPath, JSON.stringify(analysis, null, 2));
  console.log();
  console.log('Saved to:', outputPath);
}

main();
