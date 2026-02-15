#!/usr/bin/env node
/**
 * 赛事比赛数据抓取脚本
 * 从 Liquipedia 赛事页面获取比赛进程和结果
 * 优化：本地存储战队logo，使用完整队名
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

const GITHUB_PAGES_BASE = '/dota2-hub';
const logosDir = path.join(__dirname, '..', 'public', 'images', 'teams');
if (!fs.existsSync(logosDir)) {
  fs.mkdirSync(logosDir, { recursive: true });
}

// 添加 stage 列（如果不存在）
try {
  db.exec(`ALTER TABLE matches ADD COLUMN stage TEXT`);
} catch (e) {
  // 列可能已存在
}

// 战队名称映射：短名 -> 全称
const teamNameMapping = {
  'liquid': 'Team Liquid',
  'lgd': 'PSG.LGD',
  'lgd gaming': 'PSG.LGD',
  'spirit': 'Team Spirit',
  'tundra': 'Tundra Esports',
  'tundra esports': 'Tundra Esports',
  'navi': 'Natus Vincere',
  'natus vincere': 'Natus Vincere',
  'falcons': 'Team Falcons',
  'team falcons': 'Team Falcons',
  'gg': 'Gaimin Gladiators',
  'gaimin gladiators': 'Gaimin Gladiators',
  'bb': 'BetBoom Team',
  'betboom': 'BetBoom Team',
  'gl': 'GamerLegion',
  'gamerlegion': 'GamerLegion',
  'og': 'OG',
  'xg': 'Xtreme Gaming',
  'xtreme gaming': 'Xtreme Gaming',
  'yb': 'Yakult Brothers',
  'yakult brothers': 'Yakult Brothers',
  'vg': 'Vici Gaming',
  'vici gaming': 'Vici Gaming',
  'aurora': 'Aurora Gaming',
  'yandex': 'Team Yandex',
  'team yandex': 'Team Yandex',
  '9p': '9 Pandas',
  '9pandas': '9 Pandas',
  'entity': 'Entity',
  'g2': 'G2 Esports',
  'g2 esc': 'G2 Esports',
  'mouz': 'MOUZ',
  'heroic': 'Heroic',
  'execration': 'Execration',
  'sr': 'Team Spirit',
  'tspirit': 'Team Spirit',
};

// 已知战队的 Logo URL（用于下载）
const teamLogoUrls = {
  'team liquid': 'https://liquipedia.net/commons/images/thumb/0/01/Team_Liquid_2024_lightmode.png/120px-Team_Liquid_2024_lightmode.png',
  'psg.lgd': 'https://liquipedia.net/commons/images/thumb/3/3e/PSG.LGD_2020_allmode.png/120px-PSG.LGD_2020_allmode.png',
  'team spirit': 'https://liquipedia.net/commons/images/thumb/f/f2/Team_Spirit_2022_full_lightmode.png/120px-Team_Spirit_2022_full_lightmode.png',
  'tundra esports': 'https://liquipedia.net/commons/images/thumb/8/85/Tundra_Esports_2020_full_lightmode.png/120px-Tundra_Esports_2020_full_lightmode.png',
  'natus vincere': 'https://liquipedia.net/commons/images/thumb/3/3f/Natus_Vincere_2021_lightmode.png/120px-Natus_Vincere_2021_lightmode.png',
  'team falcons': 'https://liquipedia.net/commons/images/thumb/8/83/Team_Falcons_2022_allmode.png/120px-Team_Falcons_2022_allmode.png',
  'gaimin gladiators': 'https://liquipedia.net/commons/images/thumb/c/c6/Gaimin_Gladiators_2023_allmode.png/120px-Gaimin_Gladiators_2023_allmode.png',
  'betboom team': 'https://liquipedia.net/commons/images/thumb/7/77/BetBoom_Team_2023_allmode.png/120px-BetBoom_Team_2023_allmode.png',
  'gamerlegion': 'https://liquipedia.net/commons/images/thumb/6/69/GamerLegion_2023_lightmode.png/120px-GamerLegion_2023_lightmode.png',
  'og': 'https://liquipedia.net/commons/images/thumb/7/7b/OG_2026_allmode.png/120px-OG_2026_allmode.png',
  'xtreme gaming': 'https://liquipedia.net/commons/images/thumb/4/49/Xtreme_Gaming_2020_full.png/180px-Xtreme_Gaming_2020_full.png',
  'yakult brothers': 'https://liquipedia.net/commons/images/4/43/Yakult_Brothers_allmode.png',
  'vici gaming': 'https://liquipedia.net/commons/images/thumb/e/e0/Vici_Gaming_2020_full.png/180px-Vici_Gaming_2020_full.png',
  'aurora gaming': 'https://liquipedia.net/commons/images/thumb/9/9c/Aurora_2024_allmode.png/120px-Aurora_2024_allmode.png',
  'team yandex': 'https://liquipedia.net/commons/images/thumb/e/e9/Team_Yandex_lightmode.png/120px-Team_Yandex_lightmode.png',
  '9 pandas': 'https://liquipedia.net/commons/images/thumb/3/3b/9pandas_2023_allmode.png/120px-9pandas_2023_allmode.png',
  'entity': 'https://liquipedia.net/commons/images/thumb/c/c4/Entity_2023_allmode.png/120px-Entity_2023_allmode.png',
  'g2 esports': 'https://liquipedia.net/commons/images/thumb/5/5e/G2_Esports_2024_allmode.png/120px-G2_Esports_2024_allmode.png',
  'mouz': 'https://liquipedia.net/commons/images/thumb/c/c2/MOUZ_2021_allmode.png/120px-MOUZ_2021_allmode.png',
  'heroic': 'https://liquipedia.net/commons/images/thumb/0/03/Heroic_2023_allmode.png/120px-Heroic_2023_allmode.png',
  'rkx': 'https://liquipedia.net/commons/images/thumb/4/49/Xtreme_Gaming_2020_full.png/180px-Xtreme_Gaming_2020_full.png',
  'execration': 'https://liquipedia.net/commons/images/thumb/a/af/Execration_2024_full_allmode.png/120px-Execration_2024_full_allmode.png',
};

// Logo 缓存
const logoCache = {};

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
  });
}

function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    const options = new URL(url);
    options.headers = {
      'User-Agent': 'DOTA2-Hub-Bot/1.0 (https://github.com/seva324/dota2-hub)',
      'Accept': 'image/png,image/*,*/*'
    };

    const req = https.get(options, (res) => {
      if (res.statusCode === 404 || res.statusCode === 403) {
        reject(new Error(`Image not found: ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        fs.writeFileSync(filepath, buffer);
        resolve(true);
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

// 将队名转换为 ID（用于文件名）
function teamNameToId(teamName) {
  if (!teamName) return 'unknown';
  return teamName.toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizeTeamName(teamName) {
  if (!teamName) return teamName;
  const lower = teamName.toLowerCase().trim();
  return teamNameMapping[lower] || teamName;
}

async function getTeamLogo(teamName) {
  if (!teamName) return null;
  
  // 先标准化队名
  const normalizedName = normalizeTeamName(teamName);
  const lowerName = normalizedName.toLowerCase();
  
  // 检查缓存
  if (logoCache[lowerName]) {
    return logoCache[lowerName];
  }
  
  // 生成本地文件路径
  const teamId = teamNameToId(normalizedName);
  const localPath = `${GITHUB_PAGES_BASE}/images/teams/${teamId}.png`;
  const localFilePath = path.join(__dirname, '..', 'public', localPath);
  
  // 如果本地文件已存在，直接返回本地路径
  if (fs.existsSync(localFilePath)) {
    logoCache[lowerName] = localPath;
    return localPath;
  }
  
  // 尝试下载 logo
  let logoUrl = teamLogoUrls[lowerName];
  
  if (!logoUrl) {
    // 从数据库获取已保存的 logo
    try {
      const existing = db.prepare('SELECT logo_url FROM teams WHERE name LIKE ? OR id LIKE ?').get(`%${normalizedName}%`, `%${lowerName}%`);
      if (existing?.logo_url) {
        logoUrl = existing.logo_url;
      }
    } catch (e) {}
    
    // 如果还没有，从 Liquipedia 获取
    if (!logoUrl) {
      try {
        const pageName = normalizedName.replace(/\s+/g, '_');
        const apiUrl = `https://liquipedia.net/dota2/api.php?action=parse&page=${pageName}&format=json&prop=images`;
        const responseText = await fetchWithGzip(apiUrl);
        const data = JSON.parse(responseText);
        
        if (data.parse?.images) {
          const logoImage = data.parse.images.find(img => 
            img.toLowerCase().includes('logo') || 
            img.toLowerCase().includes('allmode') ||
            img.toLowerCase().includes('lightmode')
          );
          
          if (logoImage) {
            const imageApiUrl = `https://liquipedia.net/dota2/api.php?action=query&titles=File:${logoImage}&prop=imageinfo&iiprop=url&format=json`;
            const imgResponse = await fetchWithGzip(imageApiUrl);
            const imgData = JSON.parse(imgResponse);
            const pages = imgData.query?.pages || {};
            
            for (const pageId in pages) {
              if (pages[pageId].imageinfo?.[0]?.url) {
                logoUrl = pages[pageId].imageinfo[0].url;
                if (logoUrl.startsWith('//')) {
                  logoUrl = 'https:' + logoUrl;
                }
                break;
              }
            }
          }
        }
      } catch (e) {
        // 忽略错误
      }
    }
  }
  
  // 下载并保存到本地
  if (logoUrl) {
    try {
      await downloadImage(logoUrl, localFilePath);
      console.log(`  Downloaded logo: ${teamId}.png`);
      logoCache[lowerName] = localPath;
      return localPath;
    } catch (e) {
      console.log(`  Failed to download logo for ${teamName}: ${e.message}`);
    }
  }
  
  return null;
}

function parseTournamentPage(html, tournamentId) {
  const matches = [];
  const stages = [];
  
  html = html.replace(/\\\\/g, '').replace(/\\"/g, '"');
  
  let defaultFormat = 'BO3';
  if (html.includes('Bo5') || html.includes('Best of 5')) {
    defaultFormat = 'BO5';
  } else if (html.includes('Bo1') || html.includes('Best of 1')) {
    defaultFormat = 'BO1';
  }
  
  const stagePatterns = [
    /<span[^>]*class="match-info-stage[^"]*"[^>]*>([^<]+)<\/span>/gi,
    /<span[^>]*class="bracket-stage[^"]*"[^>]*>([^<]+)<\/span>/gi,
    /<h2[^>]*>(Group Stage|Playoffs|Play in|Lower Bracket|Upper Bracket|Grand Final)[^<]*<\/h2>/gi
  ];
  
  for (const pattern of stagePatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const stageName = match[1].trim();
      if (!stages.includes(stageName)) {
        stages.push(stageName);
      }
    }
  }
  
  // Carousel 格式
  const carouselBlocks = html.split(/<div[^>]*class="[^"]*carousel-item[^"]*"[^>]*>/);
  
  for (let i = 1; i < carouselBlocks.length; i++) {
    const block = carouselBlocks[i];
    
    const tsMatch = block.match(/data-timestamp="(\d+)"/);
    if (!tsMatch) continue;
    const timestamp = parseInt(tsMatch[1]);
    
    const teamMatches = block.match(/<a[^>]*href="\/dota2\/([^"]+)"[^>]*>([^<]+)<\/a>/g);
    let team1 = null, team2 = null;
    
    if (teamMatches) {
      const uniqueTeams = [];
      for (const tm of teamMatches) {
        const hrefMatch = tm.match(/href="\/dota2\/([^"]+)"[^>]*>([^<]+)<\/a>/);
        if (hrefMatch && hrefMatch[2] !== 'Watch now' && hrefMatch[2] !== 'View match details') {
          if (!uniqueTeams.includes(hrefMatch[2])) {
            uniqueTeams.push(hrefMatch[2]);
          }
        }
      }
      if (uniqueTeams.length >= 2) {
        team1 = uniqueTeams[0];
        team2 = uniqueTeams[1];
      }
    }
    
    if (!team1 || !team2) continue;
    
    const scoreMatches = block.match(/<span class="match-info-opponent-score[^"]*"[^>]*>([^<]*)<\/span>/g);
    let score1 = 0, score2 = 0;
    if (scoreMatches) {
      const scores = [];
      for (const sm of scoreMatches) {
        const s = sm.replace(/<[^>]+>/g, '').trim();
        if (s) scores.push(parseInt(s) || 0);
      }
      if (scores.length >= 2) {
        score1 = scores[0];
        score2 = scores[1];
      }
    }
    
    let status = 'scheduled';
    if (score1 > 0 || score2 > 0) {
      status = 'finished';
    } else if (timestamp * 1000 < Date.now()) {
      status = 'live';
    }
    
    const formatMatch = block.match(/\(Bo(\d+)\)/i);
    const format = formatMatch ? `BO${formatMatch[1]}` : defaultFormat;
    
    const stageMatch = block.match(/<span class="match-info-stage[^"]*"[^>]*>([^<]+)<\/span>/i);
    const stage = stageMatch ? stageMatch[1].trim() : null;
    
    const matchId = `lp_${tournamentId}_${timestamp}_${i}`;
    
    matches.push({
      match_id: matchId,
      tournament_id: tournamentId,
      radiant_team_name: team1,
      dire_team_name: team2,
      radiant_score: score1,
      dire_score: score2,
      start_time: timestamp,
      series_type: format,
      status,
      stage
    });
  }
  
  // 表格格式
  const tableBlocks = html.split(/<table[^>]*class="[^"]*wikitable[^"]*"/);
  
  for (let i = 1; i < tableBlocks.length; i++) {
    const block = tableBlocks[i];
    const rows = block.split(/<tr[^>]*class="[^"]*Match[^"]*"/);
    
    for (let j = 1; j < rows.length; j++) {
      const row = rows[j];
      
      const tsMatch = row.match(/data-timestamp="(\d+)"/);
      if (!tsMatch) continue;
      const timestamp = parseInt(tsMatch[1]);
      
      const teamLeftMatch = row.match(/<span class="team-template-text"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/);
      const teamRightMatch = row.match(/<td class="TeamRight"[^>]*>[\s\S]*?<span class="team-template-text"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/);
      
      const team1 = teamLeftMatch ? teamLeftMatch[1] : null;
      const team2 = teamRightMatch ? teamRightMatch[1] : null;
      
      if (!team1 || !team2) continue;
      
      let score1 = 0, score2 = 0;
      
      let scoreMatch = row.match(/<td class="Score"[^>]*>[\s\S]*?<div[^>]*>(\d+):<b>(\d+)<\/b><\/div>/);
      if (scoreMatch) {
        score1 = parseInt(scoreMatch[1]) || 0;
        score2 = parseInt(scoreMatch[2]) || 0;
      } else {
        scoreMatch = row.match(/<td class="Score"[^>]*>[\s\S]*?<div[^>]*><b>(\d+)<\/b>:(\d+)<\/div>/);
        if (scoreMatch) {
          score1 = parseInt(scoreMatch[1]) || 0;
          score2 = parseInt(scoreMatch[2]) || 0;
        } else {
          const simpleScoreMatch = row.match(/<td class="Score"[^>]*>[\s\S]*?<div[^>]*>([^<]+)<\/div>/);
          if (simpleScoreMatch) {
            const scores = simpleScoreMatch[1].replace(/<[^>]+>/g, '').trim().split(':');
            score1 = parseInt(scores[0]) || 0;
            score2 = parseInt(scores[1]) || 0;
          }
        }
      }
      
      const roundMatch = row.match(/<td class="Round"[^>]*>([^<]+)<\/td>/);
      const round = roundMatch ? roundMatch[1].trim() : null;
      
      let status = 'finished';
      if (score1 === 0 && score2 === 0) {
        status = 'scheduled';
      }
      
      const formatMatch = row.match(/<abbr[^>]*title="Best of (\d+)"[^>]*>/i);
      const format = formatMatch ? `BO${formatMatch[1]}` : defaultFormat;
      
      const matchId = `lp_table_${timestamp}_${i}_${j}`;
      
      matches.push({
        match_id: matchId,
        tournament_id: tournamentId,
        radiant_team_name: team1,
        dire_team_name: team2,
        radiant_score: score1,
        dire_score: score2,
        start_time: timestamp,
        series_type: format,
        status,
        stage: round
      });
    }
  }
  
  return { stages, matches };
}

// 过滤和去重
function filterMatches(matches) {
  const seen = new Set();
  return matches.filter(m => {
    if (m.radiant_team_name === 'TBD' || m.dire_team_name === 'TBD' ||
        m.radiant_team_name?.includes('edit') || m.dire_team_name?.includes('edit')) {
      return false;
    }
    const key = `${m.radiant_team_name}_${m.dire_team_name}_${m.start_time}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// 获取赛事的 Liquipedia 页面名
function getLiquipediaPage(tournament) {
  const name = tournament.name || '';
  const id = tournament.id || '';
  
  // 已知的赛事页面映射
  const knownPages = {
    'blast-slam-vi': 'BLAST/Slam/6',
    'blast-slam-6': 'BLAST/Slam/6',
    'blast-slam-7': 'BLAST/Slam/7',
    'esl-one': 'ESL_One',
    'the-international': 'The_International',
    'dreamleague': 'DreamLeague',
  };
  
  const idLower = id.toLowerCase();
  for (const [key, page] of Object.entries(knownPages)) {
    if (idLower.includes(key)) {
      return page;
    }
  }
  
  // 尝试从名称推断
  if (name.includes('BLAST') && name.includes('Slam')) {
    const match = name.match(/Slam\s*(\d+)/i);
    if (match) return `BLAST/Slam/${match[1]}`;
    return 'BLAST/Slam/6';
  }
  
  if (name.includes('DreamLeague')) {
    const match = name.match(/S(\d+)|Season\s*(\d+)/i);
    if (match) return `DreamLeague/${match[1] || match[2]}`;
    return 'DreamLeague';
  }
  
  if (name.includes('ESL One')) {
    return 'ESL_One';
  }
  
  if (name.includes('International')) {
    const match = name.match(/(\d{4})|TI(\d+)/i);
    if (match) return `The_International/${match[1] || match[2]}`;
    return 'The_International';
  }
  
  return null;
}

async function fetchTournamentMatches(tournament) {
  const pageName = getLiquipediaPage(tournament);
  if (!pageName) {
    console.log(`  跳过 ${tournament.name}: 无法确定 Liquipedia 页面`);
    return null;
  }
  
  const url = `https://liquipedia.net/dota2/api.php?action=parse&page=${pageName}&format=json&prop=text`;
  
  try {
    const html = await fetchWithGzip(url);
    const { stages, matches } = parseTournamentPage(html, tournament.id);
    const filteredMatches = filterMatches(matches);
    
    console.log(`  找到 ${filteredMatches.length} 场比赛 (${stages.join(', ')})`);
    return { stages, matches: filteredMatches };
  } catch (error) {
    console.error(`  错误: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('========================================');
  console.log('从 Liquipedia 获取赛事比赛数据');
  console.log('Time:', new Date().toISOString());
  console.log('========================================\n');
  
  // 获取所有进行中或即将开始的赛事
  const tournaments = db.prepare(`
    SELECT id, name, name_cn, status 
    FROM tournaments 
    WHERE status IN ('ongoing', 'upcoming')
    ORDER BY start_date DESC
  `).all();
  
  console.log(`找到 ${tournaments.length} 个进行中/即将开始的赛事\n`);
  
  // 清空旧比赛数据，避免脏数据累积
  console.log('清空旧比赛数据...');
  db.exec('DELETE FROM matches');
  console.log('旧数据已清除\n');
  
  const insertMatch = db.prepare(`
    INSERT OR REPLACE INTO matches 
    (match_id, radiant_team_name, dire_team_name, radiant_score, dire_score, 
     start_time, series_type, tournament_id, tournament_name, status, stage,
     radiant_team_logo, dire_team_logo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  let totalSaved = 0;
  
  for (const t of tournaments) {
    console.log(`📅 ${t.name_cn || t.name}`);
    
    const result = await fetchTournamentMatches(t);
    if (!result) continue;
    
    for (const m of result.matches) {
      try {
        // 标准化队名
        const radiantName = normalizeTeamName(m.radiant_team_name);
        const direName = normalizeTeamName(m.dire_team_name);
        
        const radiantLogo = await getTeamLogo(radiantName);
        const direLogo = await getTeamLogo(direName);
        
        insertMatch.run(
          m.match_id,
          radiantName,  // 使用标准化后的队名
          direName,
          m.radiant_score,
          m.dire_score,
          m.start_time,
          m.series_type,
          t.id,  // 使用数据库中的 tournament id
          t.name_cn || t.name,
          m.status,
          m.stage,
          radiantLogo,
          direLogo
        );
        totalSaved++;
      } catch (e) {
        // 忽略错误
      }
    }
  }
  
  console.log('\n========================================');
  console.log(`共保存 ${totalSaved} 场比赛到数据库`);
  console.log('========================================');
  
  db.close();
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
