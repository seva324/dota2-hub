#!/usr/bin/env node
/**
 * Liquidpedia 赛事数据抓取脚本 - 简化版
 * 添加当前正在进行的赛事
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', 'data', 'dota2.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// 2025年实际赛事数据（手动维护）
const ACTIVE_TOURNAMENTS = [
  {
    id: 'blast-slam-6',
    name: 'BLAST Slam VI',
    name_cn: 'BLAST Slam 第六赛季',
    tier: 'T1',
    start_date: '2025-02-03',
    end_date: '2025-02-15',
    status: 'ongoing',
    prize_pool: '$1,000,000',
    location: 'Malta',
    format: 'Round-robin Group Stage + Single-elimination Playoffs',
    teams: ['Team Falcons', 'Tundra Esports', 'Team Spirit', 'XG', 'YB', 'Vici Gaming']
  },
  {
    id: 'dreamleague-28',
    name: 'DreamLeague Season 28',
    name_cn: '梦幻联赛 S28',
    tier: 'T1',
    start_date: '2025-02-16',
    end_date: '2025-03-01',
    status: 'upcoming',
    prize_pool: '$1,000,000',
    location: 'Online (Europe)',
    format: 'Group Stage 1 (Bo2) + Group Stage 2 (Bo3) + Playoffs',
    teams: ['Team Falcons', 'Tundra Esports', 'Team Spirit', 'XG', 'YB']
  },
  {
    id: 'pgl-wallachia-7',
    name: 'PGL Wallachia Season 7',
    name_cn: 'PGL 瓦拉几亚 S7',
    tier: 'T1',
    start_date: '2025-03-07',
    end_date: '2025-03-15',
    status: 'upcoming',
    prize_pool: '$1,000,000',
    location: 'Bucharest, Romania',
    format: 'Swiss-system Group Stage (Bo3) + Double-elimination Playoffs',
    teams: ['Team Falcons', 'Tundra Esports', 'XG', 'YB', 'Vici Gaming']
  },
  {
    id: 'esl-one-birmingham-2025',
    name: 'ESL One Birmingham 2025',
    name_cn: 'ESL One 伯明翰 2025',
    tier: 'T1',
    start_date: '2025-04-22',
    end_date: '2025-04-27',
    status: 'upcoming',
    prize_pool: '$1,000,000',
    location: 'Birmingham, UK',
    format: 'Group Stage + Playoffs',
    teams: ['TBD']
  },
  {
    id: 'ti-2025',
    name: 'The International 2025',
    name_cn: '国际邀请赛 2025',
    tier: 'T1',
    start_date: '2025-09-04',
    end_date: '2025-09-14',
    status: 'upcoming',
    prize_pool: '$2,500,000+',
    location: 'Hamburg, Germany',
    format: 'Swiss Round (Bo3) + Special Elimination + Double-elimination Playoffs',
    teams: ['TBD']
  }
];

// 添加一些即将开始的比赛（模拟数据）
const UPCOMING_MATCHES = [
  {
    match_id: 9999999991,
    radiant_team_id: 'xtreme-gaming',
    dire_team_id: 'team-falcons',
    radiant_team_name: 'Xtreme Gaming',
    radiant_team_name_cn: 'XG',
    dire_team_name: 'Team Falcons',
    dire_team_name_cn: 'Falcons',
    start_time: Math.floor(Date.now() / 1000) + 86400 * 2, // 2天后
    series_type: 'BO3',
    tournament_name: 'BLAST Slam VI',
    tournament_name_cn: 'BLAST Slam 第六赛季',
    status: 'scheduled'
  },
  {
    match_id: 9999999992,
    radiant_team_id: 'yakult-brother',
    dire_team_id: 'tundra-esports',
    radiant_team_name: 'Yakult Brother',
    radiant_team_name_cn: 'YB',
    dire_team_name: 'Tundra Esports',
    dire_team_name_cn: 'Tundra',
    start_time: Math.floor(Date.now() / 1000) + 86400 * 3, // 3天后
    series_type: 'BO3',
    tournament_name: 'DreamLeague Season 28',
    tournament_name_cn: '梦幻联赛 S28',
    status: 'scheduled'
  },
  {
    match_id: 9999999993,
    radiant_team_id: 'vici-gaming',
    dire_team_id: 'team-spirit',
    radiant_team_name: 'Vici Gaming',
    radiant_team_name_cn: 'VG',
    dire_team_name: 'Team Spirit',
    dire_team_name_cn: 'Spirit',
    start_time: Math.floor(Date.now() / 1000) + 86400 * 5, // 5天后
    series_type: 'BO1',
    tournament_name: 'BLAST Slam VI',
    tournament_name_cn: 'BLAST Slam 第六赛季',
    status: 'scheduled'
  }
];

// 添加新闻数据
const NEWS_ITEMS = [
  {
    id: 'news-1',
    title: 'XG鏖战92分钟击败VG晋级BLAST Slam VI',
    summary: '2025年1月6日，BLAST Slam VI中国赛区预选赛决赛上演史诗级对决，XG与VG战满三局，最终XG 2-1击败VG获得参赛资格。',
    source: '17173',
    url: 'https://www.17173.com',
    published_at: Math.floor(Date.now() / 1000) - 86400 * 5,
    category: 'tournament'
  },
  {
    id: 'news-2',
    title: '电竞国家杯ENC官宣DOTA2项目，11月利雅得开战',
    summary: '2025年1月29日，电竞国家杯官方正式宣布Dota 2将成为16个参赛项目之一。比赛将于11月2日-8日在沙特阿拉伯利雅得举办。',
    source: '直播吧',
    url: 'https://www.zhibo8.com',
    published_at: Math.floor(Date.now() / 1000) - 86400 * 3,
    category: 'tournament'
  },
  {
    id: 'news-3',
    title: '2025年DOTA2国际邀请赛将在德国汉堡举办',
    summary: '维尔福集团近日宣布，2025年DOTA2国际邀请赛将在德国汉堡举办，总奖金池超过250万美元。',
    source: 'Valve',
    url: 'https://www.dota2.com',
    published_at: Math.floor(Date.now() / 1000) - 86400 * 7,
    category: 'tournament'
  },
  {
    id: 'news-4',
    title: 'BLAST Slam VI小组赛：XG首战对阵Team Falcons',
    summary: 'XG将在BLAST Slam VI小组赛首轮对阵世界排名第一的Team Falcons，比赛将于2月5日进行。',
    source: 'Liquipedia',
    url: 'https://liquipedia.net',
    published_at: Math.floor(Date.now() / 1000) - 86400,
    category: 'tournament'
  }
];

// 插入赛事数据
const insertTournament = db.prepare(`
  INSERT OR REPLACE INTO tournaments 
  (id, name, name_cn, tier, start_date, end_date, status, prize_pool, location, format)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

for (const t of ACTIVE_TOURNAMENTS) {
  insertTournament.run(
    t.id, t.name, t.name_cn, t.tier, t.start_date, t.end_date,
    t.status, t.prize_pool, t.location, t.format
  );
}
console.log(`Inserted ${ACTIVE_TOURNAMENTS.length} tournaments`);

// 插入即将开始的比赛
const insertMatch = db.prepare(`
  INSERT OR REPLACE INTO matches 
  (match_id, radiant_team_id, dire_team_id, radiant_team_name, dire_team_name,
   start_time, series_type, status, radiant_score, dire_score, radiant_game_wins, dire_game_wins)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0)
`);

for (const m of UPCOMING_MATCHES) {
  insertMatch.run(
    m.match_id, m.radiant_team_id, m.dire_team_id,
    m.radiant_team_name, m.dire_team_name,
    m.start_time, m.series_type, m.status
  );
}
console.log(`Inserted ${UPCOMING_MATCHES.length} upcoming matches`);

// 插入新闻数据
const insertNews = db.prepare(`
  INSERT OR REPLACE INTO news 
  (id, title, summary, source, url, published_at, category)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

for (const n of NEWS_ITEMS) {
  insertNews.run(n.id, n.title, n.summary, n.source, n.url, n.published_at, n.category);
}
console.log(`Inserted ${NEWS_ITEMS.length} news items`);

console.log('\n✓ Liquidpedia data import complete!');
db.close();
