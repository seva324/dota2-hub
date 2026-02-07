import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'dota2.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
  }
  return db;
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

// 战队相关查询
export function getTeams(options?: { isCnOnly?: boolean; region?: string }) {
  const db = getDb();
  let sql = 'SELECT * FROM teams WHERE 1=1';
  const params: (string | number)[] = [];

  if (options?.isCnOnly) {
    sql += ' AND is_cn_team = 1';
  }
  if (options?.region) {
    sql += ' AND region = ?';
    params.push(options.region);
  }

  sql += ' ORDER BY name';

  return db.prepare(sql).all(...params);
}

export function getTeamById(id: string | undefined) {
  if (!id) return undefined;
  const db = getDb();
  return db.prepare('SELECT * FROM teams WHERE id = ?').get(id);
}

// 赛事相关查询
export function getTournaments(options?: { 
  status?: string; 
  tier?: string;
  limit?: number;
  upcoming?: boolean;
}) {
  const db = getDb();
  let sql = 'SELECT * FROM tournaments WHERE 1=1';
  const params: (string | number)[] = [];

  if (options?.status) {
    sql += ' AND status = ?';
    params.push(options.status);
  }
  if (options?.tier) {
    sql += ' AND tier = ?';
    params.push(options.tier);
  }
  if (options?.upcoming) {
    sql += ' AND start_date >= date("now")';
  }

  sql += ' ORDER BY start_date DESC';

  if (options?.limit) {
    sql += ' LIMIT ?';
    params.push(options.limit);
  }

  return db.prepare(sql).all(...params);
}

export function getTournamentById(id: string) {
  const db = getDb();
  return db.prepare('SELECT * FROM tournaments WHERE id = ?').get(id);
}

// 比赛相关查询
export function getMatches(options?: {
  tournamentId?: string;
  teamId?: string;
  status?: string;
  upcoming?: boolean;
  limit?: number;
}) {
  const db = getDb();
  let sql = `
    SELECT m.*, 
           rt.name as radiant_team_name, rt.name_cn as radiant_team_name_cn, rt.logo_url as radiant_logo,
           dt.name as dire_team_name, dt.name_cn as dire_team_name_cn, dt.logo_url as dire_logo,
           t.name as tournament_name, t.name_cn as tournament_name_cn
    FROM matches m
    LEFT JOIN teams rt ON m.radiant_team_id = rt.id
    LEFT JOIN teams dt ON m.dire_team_id = dt.id
    LEFT JOIN tournaments t ON m.tournament_id = t.id
    WHERE 1=1
  `;
  const params: (string | number)[] = [];

  if (options?.tournamentId) {
    sql += ' AND m.tournament_id = ?';
    params.push(options.tournamentId);
  }
  if (options?.teamId) {
    sql += ' AND (m.radiant_team_id = ? OR m.dire_team_id = ?)';
    params.push(options.teamId, options.teamId);
  }
  if (options?.status) {
    sql += ' AND m.status = ?';
    params.push(options.status);
  }
  if (options?.upcoming) {
    sql += ' AND m.start_time > unixepoch()';
  }

  sql += ' ORDER BY m.start_time DESC';

  if (options?.limit) {
    sql += ' LIMIT ?';
    params.push(options.limit);
  }

  return db.prepare(sql).all(...params);
}

export function getMatchById(id: number) {
  const db = getDb();
  return db.prepare(`
    SELECT m.*, 
           rt.name as radiant_team_name, rt.name_cn as radiant_team_name_cn, rt.logo_url as radiant_logo,
           dt.name as dire_team_name, dt.name_cn as dire_team_name_cn, dt.logo_url as dire_logo,
           t.name as tournament_name, t.name_cn as tournament_name_cn
    FROM matches m
    LEFT JOIN teams rt ON m.radiant_team_id = rt.id
    LEFT JOIN teams dt ON m.dire_team_id = dt.id
    LEFT JOIN tournaments t ON m.tournament_id = t.id
    WHERE m.id = ?
  `).get(id);
}

// 获取中国战队的比赛
export function getCnTeamMatches(options?: { status?: string; upcoming?: boolean; limit?: number }) {
  const db = getDb();
  let sql = `
    SELECT m.*, 
           rt.name as radiant_team_name, rt.name_cn as radiant_team_name_cn, rt.logo_url as radiant_logo,
           dt.name as dire_team_name, dt.name_cn as dire_team_name_cn, dt.logo_url as dire_logo,
           t.name as tournament_name, t.name_cn as tournament_name_cn
    FROM matches m
    LEFT JOIN teams rt ON m.radiant_team_id = rt.id
    LEFT JOIN teams dt ON m.dire_team_id = dt.id
    LEFT JOIN tournaments t ON m.tournament_id = t.id
    WHERE (rt.is_cn_team = 1 OR dt.is_cn_team = 1)
  `;
  const params: (string | number)[] = [];

  if (options?.status) {
    sql += ' AND m.status = ?';
    params.push(options.status);
  }
  if (options?.upcoming) {
    sql += ' AND m.start_time > unixepoch()';
  }

  sql += ' ORDER BY m.start_time DESC';

  if (options?.limit) {
    sql += ' LIMIT ?';
    params.push(options.limit);
  }

  return db.prepare(sql).all(...params);
}

// 新闻相关查询
export function getNews(options?: {
  category?: string;
  isCnNews?: boolean;
  limit?: number;
}) {
  const db = getDb();
  let sql = 'SELECT * FROM news WHERE 1=1';
  const params: (string | number)[] = [];

  if (options?.category) {
    sql += ' AND category = ?';
    params.push(options.category);
  }
  if (options?.isCnNews !== undefined) {
    sql += ' AND is_cn_news = ?';
    params.push(options.isCnNews ? 1 : 0);
  }

  sql += ' ORDER BY published_at DESC';

  if (options?.limit) {
    sql += ' LIMIT ?';
    params.push(options.limit);
  }

  return db.prepare(sql).all(...params);
}

// 社区热点查询
export function getCommunityHot(options?: {
  platform?: string;
  limit?: number;
}) {
  const db = getDb();
  let sql = 'SELECT * FROM community_hot WHERE 1=1';
  const params: (string | number)[] = [];

  if (options?.platform) {
    sql += ' AND platform = ?';
    params.push(options.platform);
  }

  sql += ' ORDER BY hot_score DESC, fetched_at DESC';

  if (options?.limit) {
    sql += ' LIMIT ?';
    params.push(options.limit);
  }

  return db.prepare(sql).all(...params);
}

// 获取即将进行的比赛（用于倒计时）
export function getUpcomingMatchesWithCountdown(limit = 10) {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  
  return db.prepare(`
    SELECT m.*, 
           rt.name as radiant_team_name, rt.name_cn as radiant_team_name_cn, rt.logo_url as radiant_logo,
           dt.name as dire_team_name, dt.name_cn as dire_team_name_cn, dt.logo_url as dire_logo,
           t.name as tournament_name, t.name_cn as tournament_name_cn,
           t.tier as tournament_tier
    FROM matches m
    LEFT JOIN teams rt ON m.radiant_team_id = rt.id
    LEFT JOIN teams dt ON m.dire_team_id = dt.id
    LEFT JOIN tournaments t ON m.tournament_id = t.id
    WHERE m.start_time > ?
    ORDER BY m.start_time ASC
    LIMIT ?
  `).all(now, limit);
}
