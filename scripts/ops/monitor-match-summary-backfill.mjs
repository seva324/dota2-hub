import fs from 'node:fs';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';
import { sendTelegramMessage } from './telegram-util.mjs';

function parseArgs(argv) {
  const result = {};
  for (const raw of argv) {
    if (!raw.startsWith('--')) continue;
    const body = raw.slice(2);
    const eqIndex = body.indexOf('=');
    if (eqIndex === -1) {
      result[body] = true;
      continue;
    }
    result[body.slice(0, eqIndex)] = body.slice(eqIndex + 1);
  }
  return result;
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  ensureDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function readNumber(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function pidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function pct(current, total) {
  if (!total) return '0.0';
  return ((current / total) * 100).toFixed(1);
}

function eta(startedAtMs, current, total) {
  if (!startedAtMs || !current || !total || current >= total) return 'n/a';
  const elapsedMs = Date.now() - startedAtMs;
  const rate = current / elapsedMs;
  if (!Number.isFinite(rate) || rate <= 0) return 'n/a';
  return formatDuration((total - current) / rate);
}

async function collectStats(db, totalMatches) {
  const [summaryRows, playerRows] = await Promise.all([
    db.query('select count(*)::int as c from match_summary'),
    db.query('select count(*)::int as c from player_stats'),
  ]);
  const matchSummary = summaryRows[0]?.c || 0;
  const playerStats = playerRows[0]?.c || 0;
  const expectedPlayerStats = totalMatches * 10;
  return { totalMatches, matchSummary, playerStats, expectedPlayerStats };
}

function buildMessage(name, pid, session, stats, state, status) {
  return [
    `📦 ${name}`,
    `状态: ${status}`,
    `tmux: ${session || 'n/a'}`,
    `PID: ${pid || 'n/a'}`,
    `match_summary: ${stats.matchSummary}/${stats.totalMatches} (${pct(stats.matchSummary, stats.totalMatches)}%)`,
    `player_stats: ${stats.playerStats}/${stats.expectedPlayerStats} (${pct(stats.playerStats, stats.expectedPlayerStats)}%)`,
    `耗时: ${formatDuration(Date.now() - state.startedAtMs)}`,
    `ETA(player_stats): ${eta(state.startedAtMs, stats.playerStats, stats.expectedPlayerStats)}`,
    `最近进度变化: ${state.lastProgressAtMs ? `${formatDuration(Date.now() - state.lastProgressAtMs)} 前` : 'n/a'}`,
  ].join('\n');
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const pidFile = args['pid-file'];
  const exitCodeFile = args['exit-code-file'];
  const session = args.session || '';
  const statePath = args.state || '/tmp/d2hub-match-summary-monitor-state.json';
  const name = args.name || 'match summary/player stats backfill';
  const intervalMs = Number(args['interval-sec'] || 300) * 1000;
  const notifyEveryMs = Number(args['notify-every-min'] || 15) * 60 * 1000;
  const staleAfterMs = Number(args['stale-min'] || 20) * 60 * 1000;
  const minProgressStep = Number(args['min-progress-step'] || 5000);
  const totalMatches = Number(args['total-matches'] || 0);
  const startedAtIso = args['started-at'] || new Date().toISOString();

  if (!pidFile) throw new Error('Missing --pid-file');
  if (!exitCodeFile) throw new Error('Missing --exit-code-file');
  if (!totalMatches) throw new Error('Missing --total-matches');

  const db = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);
  const state = readJson(statePath, {
    startedAtMs: Date.parse(startedAtIso),
    lastProgressAtMs: 0,
    lastNotifiedAtMs: 0,
    lastNotifiedPlayerStats: 0,
    lastNotifiedMatchSummary: 0,
    startupNotified: false,
    terminalNotified: false,
    stallNotifiedAtMs: 0,
  });

  async function tick() {
    const pid = readNumber(pidFile);
    const exitCodeExists = fs.existsSync(exitCodeFile);
    const exitCode = exitCodeExists ? readNumber(exitCodeFile) : null;
    const alive = pidAlive(pid);
    const stats = await collectStats(db, totalMatches);

    if (
      stats.matchSummary > (state.lastNotifiedMatchSummary || 0) ||
      stats.playerStats > (state.lastNotifiedPlayerStats || 0)
    ) {
      state.lastProgressAtMs = Date.now();
      state.stallNotifiedAtMs = 0;
    }

    if (!state.startupNotified) {
      await sendTelegramMessage(buildMessage(name, pid, session, stats, state, alive ? '监控已启动' : '启动时进程已结束'));
      state.startupNotified = true;
      state.lastNotifiedAtMs = Date.now();
      state.lastNotifiedPlayerStats = stats.playerStats;
      state.lastNotifiedMatchSummary = stats.matchSummary;
    } else if (
      (stats.playerStats - (state.lastNotifiedPlayerStats || 0) >= minProgressStep ||
        stats.matchSummary > (state.lastNotifiedMatchSummary || 0)) &&
      Date.now() - (state.lastNotifiedAtMs || 0) >= notifyEveryMs
    ) {
      await sendTelegramMessage(buildMessage(name, pid, session, stats, state, alive ? '运行中' : '进程结束'));
      state.lastNotifiedAtMs = Date.now();
      state.lastNotifiedPlayerStats = stats.playerStats;
      state.lastNotifiedMatchSummary = stats.matchSummary;
    }

    if (
      alive &&
      state.lastProgressAtMs &&
      Date.now() - state.lastProgressAtMs >= staleAfterMs &&
      (!state.stallNotifiedAtMs || Date.now() - state.stallNotifiedAtMs >= staleAfterMs)
    ) {
      await sendTelegramMessage(buildMessage(name, pid, session, stats, state, '疑似卡住'));
      state.stallNotifiedAtMs = Date.now();
    }

    const done = exitCodeExists || (!alive && stats.matchSummary >= stats.totalMatches && stats.playerStats >= stats.expectedPlayerStats);
    if (done && !state.terminalNotified) {
      const status = exitCode === 0 ? '已完成' : (alive ? '运行中' : '已停止');
      await sendTelegramMessage(buildMessage(name, pid, session, stats, state, status));
      state.terminalNotified = true;
    }

    writeJson(statePath, state);
    return done;
  }

  do {
    const shouldStop = await tick();
    if (shouldStop) break;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  } while (true);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
