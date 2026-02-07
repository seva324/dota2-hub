#!/usr/bin/env node
/**
 * Liquidpedia 赛事数据抓取脚本
 * 使用 Playwright 抓取赛事信息和战队Logo
 */

const { chromium } = require('playwright');
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'dota2.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

const LIQUIPEDIA_BASE = 'https://liquipedia.net/dota2';

// 中国战队映射
const CN_TEAM_MAP = {
  'Xtreme Gaming': { id: 'xtreme-gaming', name_cn: 'XG', region: 'China' },
  'Azure Ray': { id: 'azure-ray', name_cn: 'AR', region: 'China' },
  'Vici Gaming': { id: 'vici-gaming', name_cn: 'VG', region: 'China' },
  'LGD Gaming': { id: 'lgd-gaming', name_cn: 'LGD', region: 'China' },
  'PSG.LGD': { id: 'lgd-gaming', name_cn: 'LGD', region: 'China' },
  'Invictus Gaming': { id: 'invictus-gaming', name_cn: 'iG', region: 'China' },
  'G2 x iG': { id: 'g2-ig', name_cn: 'G2.iG', region: 'China' },
  'Team Zero': { id: 'team-zero', name_cn: 'TZ', region: 'China' },
  'Team Aster': { id: 'team-aster', name_cn: 'Aster', region: 'China' },
};

async function scrapeTournaments(browser) {
  console.log('Scraping tournaments from Liquidpedia...');
  
  const page = await browser.newPage();
  
  try {
    // 访问赛事列表页
    await page.goto(`${LIQUIPEDIA_BASE}/Portal:Tournaments`, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    
    // 等待表格加载
    await page.waitForSelector('.wikitable', { timeout: 10000 });
    
    // 提取赛事数据
    const tournaments = await page.evaluate(() => {
      const rows = document.querySelectorAll('.wikitable tr');
      const data = [];
      
      for (let i = 1; i < Math.min(rows.length, 20); i++) {
        const cells = rows[i].querySelectorAll('td');
        if (cells.length >= 4) {
          const nameEl = cells[0].querySelector('a');
          const tierEl = cells[1];
          const dateEl = cells[2];
          const prizeEl = cells[3];
          
          if (nameEl) {
            data.push({
              name: nameEl.textContent.trim(),
              url: nameEl.href,
              tier: tierEl?.textContent.trim() || 'Unknown',
              date: dateEl?.textContent.trim() || '',
              prize: prizeEl?.textContent.trim() || '',
            });
          }
        }
      }
      
      return data;
    });
    
    console.log(`Found ${tournaments.length} tournaments`);
    
    // 保存到数据库
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO tournaments (id, name, tier, prize_pool, status, updated_at)
      VALUES (?, ?, ?, ?, ?, unixepoch())
    `);
    
    for (const tourney of tournaments) {
      const id = tourney.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
      stmt.run(id, tourney.name, tourney.tier, tourney.prize, 'upcoming');
    }
    
    return tournaments;
    
  } catch (error) {
    console.error('Error scraping tournaments:', error);
    return [];
  } finally {
    await page.close();
  }
}

async function scrapeTeamLogos(browser) {
  console.log('Scraping team logos...');
  
  const page = await browser.newPage();
  
  try {
    // 获取中国战队列表
    const teams = db.prepare('SELECT * FROM teams WHERE is_cn_team = 1').all();
    
    for (const team of teams) {
      try {
        // 访问战队页面
        const teamUrl = `${LIQUIPEDIA_BASE}/${encodeURIComponent(team.name.replace(/ /g, '_'))}`;
        await page.goto(teamUrl, { waitUntil: 'networkidle', timeout: 15000 });
        
        // 查找 Logo
        const logoUrl = await page.evaluate(() => {
          const logoImg = document.querySelector('.infobox img, .team-template-image img');
          return logoImg?.src || null;
        });
        
        if (logoUrl) {
          console.log(`Found logo for ${team.name}: ${logoUrl}`);
          
          db.prepare('UPDATE teams SET logo_url = ? WHERE id = ?')
            .run(logoUrl, team.id);
        }
        
        // 间隔请求
        await new Promise(r => setTimeout(r, 1000));
        
      } catch (error) {
        console.error(`Error scraping ${team.name}:`, error.message);
      }
    }
    
  } finally {
    await page.close();
  }
}

async function scrapeTransfers(browser) {
  console.log('Scraping transfer news...');
  
  const page = await browser.newPage();
  
  try {
    await page.goto(`${LIQUIPEDIA_BASE}/Portal:Transfers`, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    
    // 提取转会信息
    const transfers = await page.evaluate(() => {
      const rows = document.querySelectorAll('.wikitable tr');
      const data = [];
      
      for (let i = 1; i < rows.length; i++) {
        const cells = rows[i].querySelectorAll('td');
        if (cells.length >= 4) {
          data.push({
            date: cells[0]?.textContent?.trim() || '',
            player: cells[1]?.textContent?.trim() || '',
            from: cells[2]?.textContent?.trim() || '',
            to: cells[3]?.textContent?.trim() || '',
          });
        }
      }
      
      return data;
    });
    
    console.log(`Found ${transfers.length} transfers`);
    
    // 保存为新闻
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO news (id, title, summary, source, category, fetched_at)
      VALUES (?, ?, ?, ?, 'transfer', unixepoch())
    `);
    
    for (const transfer of transfers.slice(0, 10)) {
      const id = `transfer-${transfer.date}-${transfer.player}`.replace(/[^a-z0-9]/g, '-');
      const title = `${transfer.player} 从 ${transfer.from} 转会至 ${transfer.to}`;
      stmt.run(id, title, JSON.stringify(transfer), 'Liquidpedia');
    }
    
    return transfers;
    
  } catch (error) {
    console.error('Error scraping transfers:', error);
    return [];
  } finally {
    await page.close();
  }
}

// 主函数
async function main() {
  console.log('=== Liquidpedia Scraper ===');
  console.log('Start time:', new Date().toISOString());
  
  const browser = await chromium.launch({ headless: true });
  
  try {
    // 抓取赛事
    await scrapeTournaments(browser);
    
    // 抓取战队Logo
    await scrapeTeamLogos(browser);
    
    // 抓取转会新闻
    await scrapeTransfers(browser);
    
    console.log('\nScraping completed!');
    console.log('End time:', new Date().toISOString());
    
  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    await browser.close();
    db.close();
  }
}

main();
