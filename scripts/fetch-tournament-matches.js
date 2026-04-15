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
import {
  buildDltvRankingLogoIndex,
  findDltvRankingLogo,
} from '../lib/server/dltv-team-assets.js';

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

const DLTV_RANKING_URL = 'https://dltv.org/stats/teams';
const KNOWN_LOGO_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.svg', '.webp'];

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

function inferLogoExtension(url) {
  try {
    const pathname = new URL(url).pathname || '';
    const ext = path.extname(pathname).toLowerCase();
    return KNOWN_LOGO_EXTENSIONS.includes(ext) ? ext : '.png';
  } catch {
    return '.png';
  }
}

function getLogoStorage(teamId, ext = '.png') {
  const normalizedExt = KNOWN_LOGO_EXTENSIONS.includes(ext) ? ext : '.png';
  const publicPath = `${GITHUB_PAGES_BASE}/images/teams/${teamId}${normalizedExt}`;
  return {
    publicPath,
    localFilePath: path.join(__dirname, '..', 'public', 'images', 'teams', `${teamId}${normalizedExt}`),
  };
}

function findExistingLogoStorage(teamId) {
  for (const ext of KNOWN_LOGO_EXTENSIONS) {
    const storage = getLogoStorage(teamId, ext);
    if (fs.existsSync(storage.localFilePath)) {
      return storage;
    }
  }
  return getLogoStorage(teamId);
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

async function getTeamLogo(teamName, dltvRankingIndex) {
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
  const existingStorage = findExistingLogoStorage(teamId);
  const dltvLogo = findDltvRankingLogo(dltvRankingIndex, normalizedName, lowerName, teamId);

  if (dltvLogo?.logoUrl) {
    const rankingStorage = getLogoStorage(teamId, inferLogoExtension(dltvLogo.logoUrl));
    try {
      await downloadImage(dltvLogo.logoUrl, rankingStorage.localFilePath);
      console.log(`  Downloaded DLTV ranking logo: ${path.basename(rankingStorage.localFilePath)}`);
      logoCache[lowerName] = rankingStorage.publicPath;
      return rankingStorage.publicPath;
    } catch (error) {
      console.log(`  Failed to download DLTV ranking logo for ${teamName}: ${error.message}`);
      if (fs.existsSync(existingStorage.localFilePath)) {
        logoCache[lowerName] = existingStorage.publicPath;
        return existingStorage.publicPath;
      }
    }
  }

  // 如果本地文件已存在，直接返回本地路径
  if (fs.existsSync(existingStorage.localFilePath)) {
    logoCache[lowerName] = existingStorage.publicPath;
    return existingStorage.publicPath;
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
    const fallbackStorage = getLogoStorage(teamId, inferLogoExtension(logoUrl));
    try {
      await downloadImage(logoUrl, fallbackStorage.localFilePath);
      console.log(`  Downloaded logo: ${path.basename(fallbackStorage.localFilePath)}`);
      logoCache[lowerName] = fallbackStorage.publicPath;
      return fallbackStorage.publicPath;
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
  
  // 新的 Liquipedia 格式: timer-object 包含 timestamp
  // 格式: <span class="timer-object" data-timestamp="1772287200">...内容...</span>
  
  // 1. 解析所有 timer-object 元素 (Playoffs 格式)
  const timerPattern = /<span[^>]*class="timer-object[^"]*"[^>]*data-timestamp="(\d+)"[^>]*>([\s\S]*?)<\/span>/gi;
  let timerMatch;
  
  while ((timerMatch = timerPattern.exec(html)) !== null) {
    const timestamp = parseInt(timerMatch[1]);
    const content = timerMatch[2];
    
    // 提取队伍名 (data-highlightingclass)
    const teamMatches = content.match(/data-highlightingclass="([^"]+)"/g) || [];
    const teams = [];
    for (const tm of teamMatches) {
      const match = tm.match(/data-highlightingclass="([^"]+)"/);
      if (match && match[1] && !match[1].includes('TBD')) {
        teams.push(match[1]);
      }
    }
    
    if (teams.length < 2) continue;
    
    // 提取 format
    const formatMatch = content.match(/\(Bo(\d+)\)/i);
    const format = formatMatch ? 'BO' + formatMatch[1] : defaultFormat;
    
    // 提取 Round
    let round = 'Playoffs';
    const roundMatch = content.match(/<td[^>]*class="Round"[^>]*>([^<]+)</);
    if (roundMatch) {
      round = roundMatch[1].trim();
    }
    
    if (!stages.includes(round)) {
      stages.push(round);
    }
    
    // 提取比分 (如果比赛已结束)
    let score1 = 0, score2 = 0;
    const scoreMatch = content.match(/<div[^>]*class="score[^"]*"[^>]*>(\d+):(\d+)/);
    if (scoreMatch) {
      score1 = parseInt(scoreMatch[1]) || 0;
      score2 = parseInt(scoreMatch[2]) || 0;
    }
    
    const status = (score1 > 0 || score2 > 0) ? 'finished' : 'scheduled';
    
    const matchId = 'lp_' + tournamentId + '_' + timestamp + '_' + matches.length;
    
    matches.push({
      match_id: matchId,
      tournament_id: tournamentId,
      radiant_team_name: teams[0],
      dire_team_name: teams[1],
      radiant_score: score1,
      dire_score: score2,
      start_time: timestamp,
      series_type: format,
      status,
      stage: round
    });
  }
  
  // 2. 解析 Crosstable 格式 (Group Stage)
  const crosstableMatches = html.match(/<table[^>]*class="[^"]*crosstable[^"]*"[^>]*>[\s\S]*?<\/table>/gi) || [];
  
  for (const table of crosstableMatches) {
    // 获取表头中的 timestamp
    const headerTimers = table.match(/<th[^>]*data-timestamp="(\d+)"[^>]*>/g) || [];
    const timestamps = [];
    for (const t of headerTimers) {
      const m = t.match(/data-timestamp="(\d+)"/);
      if (m) timestamps.push(parseInt(m[1]));
    }
    
    if (timestamps.length === 0) continue;
    
    // 获取所有行
    const rows = table.match(/<tr[^>]*class="crosstable-tr[^"]*"[^>]*>[\s\S]*?<\/tr>/gi) || [];
    
    for (const row of rows) {
      // 获取队伍名
      const teamMatch = row.match(/data-highlightingclass="([^"]+)"/);
      if (!teamMatch || !teamMatch[1] || teamMatch[1] === 'TBD') continue;
      
      const teamName = teamMatch[1];
      
      // 解析每个有日期的单元格
      const cells = row.split('</td>');
      let colIndex = 0;
      
      for (const cell of cells) {
        if (cell.includes('crosstable-bgc-r-r') && cell.includes('crosstable-bgc-span')) {
          const dateMatch = cell.match(/class="crosstable-bgc-span"[^>]*>([^<]+)</);
          if (dateMatch && timestamps[colIndex] && timestamps[colIndex] > Math.floor(Date.now() / 1000)) {
            // 在表头中找对应的队伍
            const headerRows = table.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
            let otherTeam = null;
            
            for (const hr of headerRows) {
              if (hr.includes(dateMatch[1]) && hr.includes('data-highlightingclass')) {
                const om = hr.match(/data-highlightingclass="([^"]+)"/);
                if (om && om[1] !== teamName) {
                  otherTeam = om[1];
                  break;
                }
              }
            }
            
            if (otherTeam && otherTeam !== 'TBD') {
              const timestamp = timestamps[colIndex];
              const matchId = 'lp_cs_' + tournamentId + '_' + timestamp + '_' + matches.length;
              
              matches.push({
                match_id: matchId,
                tournament_id: tournamentId,
                radiant_team_name: teamName,
                dire_team_name: otherTeam,
                radiant_score: 0,
                dire_score: 0,
                start_time: timestamp,
                series_type: defaultFormat,
                status: 'scheduled',
                stage: 'Group Stage'
              });
              
              if (!stages.includes('Group Stage')) {
                stages.push('Group Stage');
              }
            }
          }
        }
        if (cell.includes('crosstable-bgc-r-r')) {
          colIndex++;
        }
      }
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
    'pgl-wallachia': 'PGL_Wallachia/7',
    'cct-season': 'CCT/Season_2',
    'epl-world': 'EPL/World_Series/12',
    'european_pro': 'European_Pro_League/Season_34',
    'cringe_station': 'Cringe_Station',
    'lunar_snake': 'Lunar_Snake/6',
  };
  
  const idLower = id.toLowerCase();
  for (const [key, page] of Object.entries(knownPages)) {
    if (idLower.includes(key)) {
      return page;
    }
  }
  
  // 尝试从ID中提取 DreamLeague 赛季号
  const dlMatch = idLower.match(/dreamleague-(\d+)/);
  if (dlMatch) {
    return `DreamLeague/${dlMatch[1]}`;
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
  console.log(`  正在获取: ${url}`);
  
  try {
    const html = await fetchWithGzip(url);
    console.log(`  获取到 HTML 长度: ${html.length}`);
    
    const { stages, matches } = parseTournamentPage(html, tournament.id);
    const filteredMatches = filterMatches(matches);
    
    console.log(`  解析到 ${filteredMatches.length} 场比赛 (${stages.join(', ')})`);
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
  
  // 清空所有比赛数据
  console.log('清空所有比赛数据...');
  db.exec('DELETE FROM matches');
  console.log('所有比赛数据已清除\n');
  
  const insertMatch = db.prepare(`
    INSERT OR REPLACE INTO matches 
    (match_id, radiant_team_name, dire_team_name, radiant_score, dire_score, 
     start_time, series_type, tournament_id, tournament_name, status, stage,
     radiant_team_logo, dire_team_logo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  let totalSaved = 0;
  const dltvRankingIndex = await fetchDltvRankingIndex();
  
  for (const t of tournaments) {
    console.log(`📅 ${t.name_cn || t.name}`);
    
    const result = await fetchTournamentMatches(t);
    if (!result) continue;
    
    for (const m of result.matches) {
      try {
        // 标准化队名
        const radiantName = normalizeTeamName(m.radiant_team_name);
        const direName = normalizeTeamName(m.dire_team_name);
        
        const radiantLogo = await getTeamLogo(radiantName, dltvRankingIndex);
        const direLogo = await getTeamLogo(direName, dltvRankingIndex);
        
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
