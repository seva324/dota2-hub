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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', 'data', 'dota2.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

const logosDir = path.join(__dirname, '..', 'public', 'images', 'teams');
if (!fs.existsSync(logosDir)) {
  fs.mkdirSync(logosDir, { recursive: true });
}

function fetchWithGzip(url) {
  return new Promise((resolve, reject) => {
    const options = new URL(url);
    options.headers = {
      'User-Agent': 'DOTA2-Hub-Bot/1.0 (https://github.com/seva324/dota2-hub)',
      'Accept-Encoding': 'gzip',
      'Accept': 'application/json'
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

async function fetchTeamLogo(teamName) {
  const pageName = teamName.replace(/\s+/g, '_');
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
  };
  
  return teamMappings[nameLower] || nameLower.replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

async function main() {
  console.log('========================================');
  console.log('从 Liquipedia 获取战队 Logo 并更新比赛');
  console.log('Time:', new Date().toISOString());
  console.log('========================================\n');
  
  const updateTeam = db.prepare(`
    UPDATE teams SET logo_url = ?, updated_at = unixepoch() WHERE id = ?
  `);
  
  const updateMatchTeamLogos = db.prepare(`
    UPDATE matches 
    SET radiant_team_logo = ?, dire_team_logo = ?
    WHERE radiant_team_id = ? OR dire_team_id = ?
  `);
  
  // 获取所有在比赛中出现过的队伍
  const matchTeams = db.prepare(`
    SELECT DISTINCT radiant_team_name as name, radiant_team_id as id FROM matches WHERE radiant_team_name IS NOT NULL
    UNION
    SELECT DISTINCT dire_team_name as name, dire_team_id as id FROM matches WHERE dire_team_name IS NOT NULL
  `).all();
  
  console.log(`Found ${matchTeams.length} unique teams in matches\n`);
  
  const teamLogoCache = {};
  
  for (const team of matchTeams) {
    if (!team.name || team.name === 'unknown') continue;
    
    const teamId = team.id || getTeamIdFromName(team.name);
    console.log(`Processing logo for ${team.name} (${teamId})...`);
    
    // 检查是否已有 logo
    const existingLogo = db.prepare('SELECT logo_url FROM teams WHERE id = ?').get(teamId);
    if (existingLogo?.logo_url) {
      console.log(`  Already has logo: ${existingLogo.logo_url}`);
      teamLogoCache[teamId] = existingLogo.logo_url;
      continue;
    }
    
    try {
      const logoUrl = await fetchTeamLogo(team.name);
      
      if (logoUrl) {
        console.log(`  Found: ${logoUrl}`);
        
        const ext = logoUrl.includes('.png') ? '.png' : '.svg';
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
        // 使用通用 ID 尝试
        const genericId = getTeamIdFromName(team.name);
        if (genericId !== teamId) {
          console.log(`  Trying generic ID: ${genericId}`);
          const genericLogo = await fetchTeamLogo(genericId.replace(/-/g, ' '));
          if (genericLogo) {
            const ext = genericLogo.includes('.png') ? '.png' : '.svg';
            const localPath = path.join(logosDir, `${teamId}${ext}`);
            try {
              await downloadImage(genericLogo, localPath);
              const publicUrl = `/dota2-hub/images/teams/${teamId}${ext}`;
              updateTeam.run(publicUrl, teamId);
              teamLogoCache[teamId] = publicUrl;
            } catch (e) {
              updateTeam.run(genericLogo, teamId);
              teamLogoCache[teamId] = genericLogo;
            }
          }
        }
      }
    } catch (error) {
      console.error(`  Error: ${error.message}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // 更新所有比赛的队伍 logo
  console.log('\nUpdating match team logos...');
  
  const allTeams = db.prepare('SELECT id, logo_url FROM teams WHERE logo_url IS NOT NULL').all();
  const teamLogoMap = {};
  for (const t of allTeams) {
    teamLogoMap[t.id] = t.logo_url;
  }
  
  const matches = db.prepare('SELECT id, radiant_team_id, dire_team_id FROM matches').all();
  let updatedCount = 0;
  
  for (const m of matches) {
    const radiantLogo = teamLogoMap[m.radiant_team_id] || teamLogoMap[getTeamIdFromName(m.radiant_team_id)];
    const direLogo = teamLogoMap[m.dire_team_id] || teamLogoMap[getTeamIdFromName(m.dire_team_id)];
    
    if (radiantLogo || direLogo) {
      updateMatchTeamLogos.run(radiantLogo || null, direLogo || null, m.radiant_team_id, m.dire_team_id);
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
