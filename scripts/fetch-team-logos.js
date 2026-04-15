#!/usr/bin/env node
/**
 * 从 Liquipedia 获取战队 Logo，并更新比赛记录中的队伍logo
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import zlib from 'zlib';
import fs from 'fs';
import {
  buildDltvRankingLogoIndex,
  findDltvRankingLogo,
} from '../lib/server/dltv-team-assets.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', 'data', 'dota2.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

const logosDir = path.join(__dirname, '..', 'public', 'images', 'teams');
if (!fs.existsSync(logosDir)) {
  fs.mkdirSync(logosDir, { recursive: true });
}

const DLTV_RANKING_URL = 'https://dltv.org/stats/teams';
const KNOWN_LOGO_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.svg', '.webp']);

function fetchWithGzip(url, accept = 'application/json') {
  return new Promise((resolve, reject) => {
    const options = new URL(url);
    options.headers = {
      'User-Agent': 'DOTA2-Hub-Bot/1.0 (https://github.com/seva324/dota2-hub)',
      'Accept-Encoding': 'gzip',
      'Accept': accept
    };

    const req = https.get(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        if (res.headers['content-encoding'] === 'gzip') {
          zlib.gunzip(buffer, (err, decompressed) => {
            if (err) reject(err);
            else resolve(decompressed.toString('utf-8'));
          });
        } else {
          resolve(buffer.toString('utf-8'));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

async function fetchDltvRankingIndex() {
  try {
    const html = await fetchWithGzip(DLTV_RANKING_URL, 'text/html,application/xhtml+xml');
    const index = buildDltvRankingLogoIndex(html);
    console.log(`Loaded ${index.entries.length} team logos from DLTV stats`);
    return index;
  } catch (error) {
    console.warn(`Failed to load DLTV stats logos: ${error.message}`);
    return { entries: [], byKey: new Map() };
  }
}

async function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    const options = new URL(url);
    options.headers = {
      'User-Agent': 'DOTA2-Hub-Bot/1.0'
    };

    const file = fs.createWriteStream(filepath);
    https.get(options, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        file.close();
        fs.unlinkSync(filepath);
        downloadImage(res.headers.location, filepath).then(resolve).catch(reject);
        return;
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(filepath);
      });
    }).on('error', (err) => {
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }
      reject(err);
    });
  });
}

function inferLogoExtension(url) {
  try {
    const pathname = new URL(url).pathname || '';
    const ext = path.extname(pathname).toLowerCase();
    return KNOWN_LOGO_EXTENSIONS.has(ext) ? ext : '.png';
  } catch {
    return '.png';
  }
}

async function fetchTeamLogo(teamName, teamId) {
  // 特殊战队名称映射 - 队名到 Liquipedia 页面
  const pageNameMap = {
    'yakult brothers': 'Yakult_Brothers_Dota2',
    'yakult-brothers': 'Yakult_Brothers_Dota2',
    'yb': 'Yakult_Brothers_Dota2',
    'xtreme gaming': 'Xtreme_Gaming',
    'xtreme-gaming': 'Xtreme_Gaming',
    'xg': 'Xtreme_Gaming',
    'vici gaming': 'Vici_Gaming',
    'vici-gaming': 'Vici_Gaming',
    'vg': 'Vici_Gaming',
    'lgd gaming': 'PSG.LGD',
    'psg.lgd': 'PSG.LGD',
    'azure ray': 'Azure_Ray',
    'azure-ray': 'Azure_Ray',
    'ar': 'Azure_Ray',
    'og': 'OG',
    'team liquid': 'Team_Liquid',
    'team-liquid': 'Team_Liquid',
    'team spirit': 'Team_Spirit',
    'team-spirit': 'Team_Spirit',
    'tundra esports': 'Tundra_Esports',
    'tundra-esports': 'Tundra_Esports',
    'aurora gaming': 'Aurora_Gaming',
    'aurora-gaming': 'Aurora_Gaming',
  };
  
  // 已知战队的直接 logo URL 映射（备用方案）
  const directLogoUrls = {
    'yakult-brothers': 'https://liquipedia.net/commons/images/4/43/Yakult_Brothers_allmode.png',
    'yakult_brothers': 'https://liquipedia.net/commons/images/4/43/Yakult_Brothers_allmode.png',
    'yb': 'https://liquipedia.net/commons/images/4/43/Yakult_Brothers_allmode.png',
    'og': 'https://liquipedia.net/commons/images/2/2f/OG_Logo.png',
    'team-liquid': 'https://liquipedia.net/commons/images/f/fc/Team_Liquid_allmode.png',
    'team-spirit': 'https://liquipedia.net/commons/images/f/f2/Team_Spirit_2022_full_lightmode.png',
    'spirit': 'https://liquipedia.net/commons/images/f/f2/Team_Spirit_2022_full_lightmode.png',
    'tundra-esports': 'https://liquipedia.net/commons/images/8/85/Tundra_Esports_2020_full_lightmode.png',
    'tundra': 'https://liquipedia.net/commons/images/8/85/Tundra_Esports_2020_full_lightmode.png',
    'aurora-gaming': 'https://liquipedia.net/commons/images/1/18/Aurora_Gaming_2023_allmode.png',
    'xtreme-gaming': 'https://liquipedia.net/commons/images/7/72/Xtreme_Gaming_%28China%29_allmode.png',
    'xg': 'https://liquipedia.net/commons/images/7/72/Xtreme_Gaming_%28China%29_allmode.png',
    'vici-gaming': 'https://liquipedia.net/commons/images/6/6a/Vici_Gaming_2020_allmode.png',
    'vg': 'https://liquipedia.net/commons/images/6/6a/Vici_Gaming_2020_allmode.png',
    'lgd-gaming': 'https://liquipedia.net/commons/images/4/47/PSG.LGD_2021_allmode.png',
    'azure-ray': 'https://liquipedia.net/commons/images/6/60/Azure_Ray_2023_allmode.png',
    'execration': 'https://liquipedia.net/commons/images/a/af/Execration_2024_full_allmode.png',
  };
  
  // 首先检查直接 URL
  if (directLogoUrls[teamId]) {
    return directLogoUrls[teamId];
  }
  if (directLogoUrls[teamName.toLowerCase()]) {
    return directLogoUrls[teamName.toLowerCase()];
  }
  
  const lowerName = teamName.toLowerCase();
  const pageName = (pageNameMap[lowerName] || pageNameMap[teamId] || teamName).replace(/\s+/g, '_');
  const apiUrl = `https://liquipedia.net/dota2/api.php?action=parse&page=${pageName}&format=json&prop=images|text`;
  
  try {
    const responseText = await fetchWithGzip(apiUrl);
    const data = JSON.parse(responseText);
    
    if (!data.parse) return null;
    
    const html = data.parse.text?.['*'] || '';
    
    const logoPatterns = [
      /<div class="infobox-image[^"]*"[^>]*>\s*<a[^>]*>\s*<img[^>]*src="([^"]+)"/i,
      /<img[^>]*class="[^"]*infobox-image[^"]*"[^>]*src="([^"]+)"/i,
      /src="(\/\/liquipedia\.net\/commons\/images\/[^"]+logo[^"]*)"/i,
      /src="(\/\/liquipedia\.net\/commons\/images\/thumb\/[^"]+)"/i,
    ];
    
    for (const pattern of logoPatterns) {
      const match = html.match(pattern);
      if (match) {
        let logoUrl = match[1];
        if (logoUrl.startsWith('//')) {
          logoUrl = 'https:' + logoUrl;
        }
        return logoUrl;
      }
    }
    
    const images = data.parse.images || [];
    const logoImage = images.find(img => 
      img.toLowerCase().includes('logo') || 
      img.toLowerCase().includes('icon') ||
      img.toLowerCase().includes('allmode')
    );
    
    if (logoImage) {
      const imageApiUrl = `https://liquipedia.net/dota2/api.php?action=query&titles=File:${logoImage}&prop=imageinfo&iiprop=url&format=json`;
      try {
        const imgResponse = await fetchWithGzip(imageApiUrl);
        const imgData = JSON.parse(imgResponse);
        const pages = imgData.query?.pages || {};
        for (const pageId in pages) {
          if (pages[pageId].imageinfo?.[0]?.url) {
            return pages[pageId].imageinfo[0].url;
          }
        }
      } catch (e) {
        console.error(`Error fetching image URL: ${e.message}`);
      }
    }
    
    return null;
  } catch (error) {
    console.error(`Error fetching logo for ${teamName}: ${error.message}`);
    return null;
  }
}

function getTeamIdFromName(name) {
  if (!name) return null;
  const nameLower = name.toLowerCase();
  
  const teamMappings = {
    'xtreme gaming': 'xtreme-gaming',
    'xg': 'xtreme-gaming',
    'yakult brothers': 'yakult-brothers',
    'yb': 'yakult-brothers',
    'vici gaming': 'vici-gaming',
    'vg': 'vici-gaming',
    'lgd gaming': 'lgd-gaming',
    'psg.lgd': 'lgd-gaming',
    'azure ray': 'azure-ray',
    'ar': 'azure-ray',
    'team spirit': 'team-spirit',
    'ts': 'team-spirit',
    'team falcons': 'team-falcons',
    'tundra esports': 'tundra-esports',
    'gaimin gladiators': 'gaimin-gladiators',
    'gg': 'gaimin-gladiators',
    'og': 'og',
    'team liquid': 'team-liquid',
    'tl': 'team-liquid',
    'betera': 'betera',
    'nigma galaxy': 'nigma-galaxy',
    'spirit': 'team-spirit',
    't1': 't1',
    'aurora gaming': 'aurora-gaming',
    'nouns': 'nouns',
    'heroic': 'heroic',
    'gaimin': 'gaimin-gladiators',
    'execration': 'execration',
  };
  
  return teamMappings[nameLower] || nameLower.replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

async function main() {
  console.log('========================================');
  console.log('优先从 DLTV Ranking 获取战队 Logo，并回退到 Liquipedia/已有数据');
  console.log('Time:', new Date().toISOString());
  console.log('========================================\n');
  
  const updateTeam = db.prepare(`
    UPDATE teams SET logo_url = ?, updated_at = unixepoch() WHERE id = ?
  `);
  
  // 获取所有在比赛中出现过的队伍
  const matchTeams = db.prepare(`
    SELECT DISTINCT radiant_team_name as name, radiant_team_id as id FROM matches WHERE radiant_team_name IS NOT NULL
    UNION
    SELECT DISTINCT dire_team_name as name, dire_team_id as id FROM matches WHERE dire_team_name IS NOT NULL
  `).all();
  
  console.log(`Found ${matchTeams.length} unique teams in matches\n`);
  
  const teamLogoCache = {};
  const selectTeamLogoById = db.prepare('SELECT logo_url FROM teams WHERE id = ?');
  const selectTeamLogoByName = db.prepare('SELECT logo_url FROM teams WHERE lower(name) = lower(?)');
  const dltvRankingIndex = await fetchDltvRankingIndex();
  
  for (const team of matchTeams) {
    if (!team.name || team.name === 'unknown') continue;
    
    const teamId = team.id || getTeamIdFromName(team.name);
    console.log(`Processing logo for ${team.name} (${teamId})...`);
    
    // 检查是否已有 logo
    const existingLogo = selectTeamLogoById.get(teamId);
    const dltvLogo = findDltvRankingLogo(dltvRankingIndex, team.name, teamId);
    if (!dltvLogo && existingLogo?.logo_url) {
      console.log(`  Already has logo: ${existingLogo.logo_url}`);
      teamLogoCache[teamId] = existingLogo.logo_url;
      continue;
    }
    
    try {
      const logoUrl = dltvLogo?.logoUrl || await fetchTeamLogo(team.name, teamId);
      
      if (logoUrl) {
        console.log(`  Found: ${logoUrl}`);
        
        const ext = inferLogoExtension(logoUrl);
        const localPath = path.join(logosDir, `${teamId}${ext}`);
        
        try {
          await downloadImage(logoUrl, localPath);
          console.log(`  Saved to: images/teams/${teamId}${ext}`);
          
          const publicUrl = `/dota2-hub/images/teams/${teamId}${ext}`;
          updateTeam.run(publicUrl, teamId);
          teamLogoCache[teamId] = publicUrl;
        } catch (downloadErr) {
          console.log(`  Download failed: ${downloadErr.message}`);
          updateTeam.run(logoUrl, teamId);
          teamLogoCache[teamId] = logoUrl;
        }
      } else {
        console.log(`  No logo found`);
      }
    } catch (error) {
      console.error(`  Error: ${error.message}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // 更新所有比赛的队伍 logo - 基于本地文件
  console.log('\nUpdating match team logos...');
  
  // 获取所有比赛的队伍
  const matches = db.prepare('SELECT id, radiant_team_id, dire_team_id, radiant_team_name, dire_team_name FROM matches').all();
  
  let updatedCount = 0;

  const resolveStoredLogo = (teamId, teamName) => (
    teamLogoCache[teamId]
    || teamLogoCache[getTeamIdFromName(teamName)]
    || selectTeamLogoById.get(teamId)?.logo_url
    || selectTeamLogoById.get(getTeamIdFromName(teamName))?.logo_url
    || selectTeamLogoByName.get(teamName)?.logo_url
    || null
  );
  
  for (const m of matches) {
    const radiantLogo = resolveStoredLogo(m.radiant_team_id, m.radiant_team_name);
    const direLogo = resolveStoredLogo(m.dire_team_id, m.dire_team_name);
    
    if (radiantLogo || direLogo) {
      db.prepare(`
        UPDATE matches 
        SET radiant_team_logo = ?, dire_team_logo = ?
        WHERE id = ?
      `).run(radiantLogo || null, direLogo || null, m.id);
      updatedCount++;
    }
  }
  
  console.log(`Updated ${updatedCount} matches with team logos`);
  
  console.log('\n========================================');
  console.log('Logo 更新完成');
  console.log('========================================');
  
  db.close();
}

main();
