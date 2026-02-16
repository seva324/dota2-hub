#!/usr/bin/env node
/**
 * 从 Liquipedia 获取赛事数据
 * 使用与比赛预告相同的方式获取赛事信息
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import zlib from 'zlib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', 'data', 'dota2.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

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

function parseTournaments(html) {
  const tournaments = [];
  const now = new Date();
  const currentYear = now.getFullYear();
  
  console.log('Parsing tournaments from HTML, length:', html.length);
  
  // 从 Liquipedia:Tournaments 页面解析结构化数据
  // 格式类似: DreamLeague/28 | DreamLeague S28 | icon= | ... | startdate=Feb 16 | enddate=Mar 01
  
  const monthMap = {
    'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
    'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
    'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
  };
  
  function parseDate(dateStr, year = currentYear) {
    if (!dateStr) return null;
    
    // 尝试 "Feb 16" 格式
    const match = dateStr.match(/(\w+)\s+(\d+)/);
    if (match) {
      const monthNum = monthMap[match[1]];
      if (!monthNum) {
        console.log('Unknown month:', match[1], 'in dateStr:', dateStr);
        return null;
      }
      const day = match[2].padStart(2, '0');
      return `${year}-${monthNum}-${day}`;
    }
    
    // 尝试只有月份 "Feb" 格式 - 默认设为该月1号
    const monthOnlyMatch = dateStr.match(/^(\w+)$/);
    if (monthOnlyMatch && monthMap[monthOnlyMatch[1]]) {
      const monthNum = monthMap[monthOnlyMatch[1]];
      return `${year}-${monthNum}-01`;
    }
    
    // 尝试直接解析 YYYY-MM-DD 格式
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return dateStr;
    }
    
    // 尝试 "Feb 16 - Mar 01" 范围格式，提取第一个日期
    const rangeMatch = dateStr.match(/(\w+)\s+(\d+)/);
    if (rangeMatch) {
      const monthNum = monthMap[rangeMatch[1]];
      if (monthNum) {
        const day = rangeMatch[2].padStart(2, '0');
        return `${year}-${monthNum}-${day}`;
      }
    }
    
    console.log('Could not parse date:', dateStr);
    return null;
  }
  
  // 解析每个赛事条目
  const lines = html.split('\n');
  let currentStatus = 'upcoming';
  let matchCount = 0;
  let parseFailCount = 0;
  
  for (const line of lines) {
    // 检测状态
    if (line.includes('Upcoming')) {
      currentStatus = 'upcoming';
      continue;
    } else if (line.includes('Ongoing')) {
      currentStatus = 'ongoing';
      continue;
    } else if (line.includes('Completed')) {
      currentStatus = 'completed';
      continue;
    }
    
    // 解析赛事条目: page | name | icon=... | startdate=... | enddate=...
    const match = line.match(/^\s*\*?\s*([^|]+)\s*\|\s*([^|]+)\s*\|.*startdate=([^|\s]+).*enddate=([^|\s]+)/i);
    if (match) {
      matchCount++;
      const page = match[1].trim();
      const name = match[2].trim();
      const startDateStr = match[3].trim();
      const endDateStr = match[4].trim();
      
      const startDate = parseDate(startDateStr);
      const endDate = parseDate(endDateStr);
      
      if (!startDate) {
        parseFailCount++;
        continue;
      }
      
      // 确定ID - 清理 HTML 标签
      const cleanId = page.replace(/<[^>]+>/g, '').replace(/\//g, '-').replace(/_\d{4}$/, '').toLowerCase() || 
                 name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const id = cleanId;
      
      // 解析奖金和Tier（从链接名推断）
      let tier = 'T2';
      let prizePool = 'TBD';
      
      if (name.includes('DreamLeague') || name.includes('PGL') || name.includes('ESL One') || 
          name.includes('The International') || name.includes('BLAST Slam')) {
        tier = 'T1';
        prizePool = '$1,000,000';
      }
      if (name.includes('TI') || name.includes('International')) {
        prizePool = '$2,500,000+';
      }
      
      // 中文名映射
      let name_cn = name;
      if (name.includes('DreamLeague')) {
        name_cn = name.replace(/DreamLeague/i, '梦幻联赛').replace(/Season\s*(\d+)/i, 'S$1');
      } else if (name.includes('PGL Wallachia')) {
        name_cn = name.replace(/PGL Wallachia/i, 'PGL瓦拉几亚').replace(/Season\s*(\d+)/i, 'S$1');
      } else if (name.includes('ESL One')) {
        name_cn = name.replace('ESL One', 'ESL One');
      } else if (name.includes('BLAST Slam')) {
        name_cn = name.replace('BLAST Slam', 'BLAST Slam');
      } else if (name.includes('The International') || /\bTI\d+\b/.test(name)) {
        name_cn = name.replace('The International', '国际邀请赛');
      } else if (name.includes('EPL')) {
        name_cn = name.replace(/EPL/i, 'EPL');
      } else if (name.includes('CCT')) {
        name_cn = name.replace(/CCT/i, 'CCT');
      }
      
      tournaments.push({
        id: id.substring(0, 50),
        name: name,
        name_cn: name_cn,
        tier: tier,
        start_date: startDate,
        end_date: endDate,
        status: currentStatus,
        prize_pool: prizePool,
        location: null,
        format: null
      });
    }
  }
  
  console.log(`Parsed: ${matchCount} matches found, ${parseFailCount} failed to parse`);
  console.log(`Tournaments array length: ${tournaments.length}`);
  
  // 去重
  const seen = new Set();
  return tournaments.filter(t => {
    const key = t.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function main() {
  console.log('========================================');
  console.log('从 Liquipedia 获取赛事信息');
  console.log('Time:', new Date().toISOString());
  console.log('========================================\n');
  
  // 清空旧赛事数据
  console.log('清空旧赛事数据...');
  db.exec('DELETE FROM tournaments');
  console.log('旧数据已清除\n');
  
  const LIQUIPEDIA_API = 'https://liquipedia.net/dota2/api.php';
  const params = new URLSearchParams({
    action: 'parse',
    page: 'Liquipedia:Tournaments',  // 使用专门的赛事列表页面
    format: 'json',
    prop: 'text'
  });
  
  try {
    const url = `${LIQUIPEDIA_API}?${params}`;
    console.log('Fetching:', url);
    const responseText = await fetchWithGzip(url);
    const data = JSON.parse(responseText);
    const html = data.parse.text['*'];
    
    const tournaments = parseTournaments(html);
    
    console.log(`找到 ${tournaments.length} 个赛事\n`);
    
    // 显示赛事
    for (const t of tournaments.slice(0, 20)) {
      console.log(`📅 ${t.name_cn || t.name}`);
      console.log(`   状态: ${t.status} | Tier: ${t.tier} | 奖金: ${t.prize_pool}`);
      if (t.start_date) console.log(`   日期: ${t.start_date} ~ ${t.end_date || 'TBD'}`);
      console.log();
    }
    
    // 保存到数据库
    const insertTournament = db.prepare(`
      INSERT OR REPLACE INTO tournaments
      (id, name, name_cn, tier, start_date, end_date, status, prize_pool, location, format)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    let savedCount = 0;
    for (const t of tournaments) {
      try {
        insertTournament.run(
          t.id, t.name, t.name_cn, t.tier, t.start_date, t.end_date,
          t.status, t.prize_pool, t.location, t.format
        );
        savedCount++;
      } catch (error) {
        console.error(`Error saving tournament ${t.name}:`, error.message);
      }
    }
    
    console.log('========================================');
    console.log(`已保存 ${savedCount} 个赛事到数据库`);
    console.log('========================================');
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }
  
  db.close();
}

main();
