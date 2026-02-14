#!/usr/bin/env node
/**
 * 从 Liquipedia 获取战队 Logo
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
      fs.unlinkSync(filepath);
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
    
    // 查找 logo 图片
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
    
    // 尝试从 images 列表中找 logo
    const images = data.parse.images || [];
    const logoImage = images.find(img => 
      img.toLowerCase().includes('logo') || 
      img.toLowerCase().includes('icon') ||
      img.toLowerCase().includes('allmode')
    );
    
    if (logoImage) {
      // 获取图片 URL
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

const TARGET_TEAMS = [
  { id: 'xtreme-gaming', name: 'Xtreme Gaming', page: 'Xtreme_Gaming' },
  { id: 'yakult-brother', name: 'Yakult Brothers', page: 'Yakult_Brothers' },
  { id: 'yakult-brothers', name: 'Yakult Brothers', page: 'Yakult_Brothers' },
  { id: 'vici-gaming', name: 'Vici Gaming', page: 'Vici_Gaming' },
  { id: 'lgd-gaming', name: 'LGD Gaming', page: 'PSG.LGD' },
  { id: 'azure-ray', name: 'Azure Ray', page: 'Azure_Ray' },
  { id: 'team-spirit', name: 'Team Spirit', page: 'Team_Spirit' },
  { id: 'team-falcons', name: 'Team Falcons', page: 'Team_Falcons' },
  { id: 'tundra-esports', name: 'Tundra Esports', page: 'Tundra_Esports' },
  { id: 'gaimin-gladiators', name: 'Gaimin Gladiators', page: 'Gaimin_Gladiators' },
];

async function main() {
  console.log('========================================');
  console.log('从 Liquipedia 获取战队 Logo');
  console.log('Time:', new Date().toISOString());
  console.log('========================================\n');
  
  const updateTeam = db.prepare(`
    UPDATE teams SET logo_url = ?, updated_at = unixepoch() WHERE id = ?
  `);
  
  for (const team of TARGET_TEAMS) {
    console.log(`Fetching logo for ${team.name}...`);
    
    try {
      const logoUrl = await fetchTeamLogo(team.page);
      
      if (logoUrl) {
        console.log(`  Found: ${logoUrl}`);
        
        // 下载 logo 到本地
        const ext = logoUrl.includes('.png') ? '.png' : '.svg';
        const localPath = path.join(logosDir, `${team.id}${ext}`);
        
        try {
          await downloadImage(logoUrl, localPath);
          console.log(`  Saved to: images/teams/${team.id}${ext}`);
          
          // 更新数据库
          const publicUrl = `/dota2-hub/images/teams/${team.id}${ext}`;
          updateTeam.run(publicUrl, team.id);
          console.log(`  Updated database: ${publicUrl}`);
        } catch (downloadErr) {
          console.log(`  Download failed: ${downloadErr.message}`);
          // 仍然保存远程 URL
          updateTeam.run(logoUrl, team.id);
        }
      } else {
        console.log(`  No logo found`);
      }
    } catch (error) {
      console.error(`  Error: ${error.message}`);
    }
    
    // 避免请求过快
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n========================================');
  console.log('Logo 更新完成');
  console.log('========================================');
  
  db.close();
}

main();
