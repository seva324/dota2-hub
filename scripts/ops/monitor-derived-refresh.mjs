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

function formatEta(startedAtMs, current, total) {
  if (!startedAtMs || !current || !total || current >= total) return 'n/a';
  const elapsedMs = Date.now() - startedAtMs;
  const rate = current / elapsedMs;
  if (!Number.isFinite(rate) || rate <= 0) return 'n/a';
  return formatDuration((total - current) / rate);
}

function buildMessage(name, pid, mode, stats, state, status) {
  const playerDone = stats.playerUpdated >= stats.playerTotal;
  const teamDone = stats.teamUpdated >= stats.teamTotal;
  const overallDone = playerDone && teamDone;

  return [
    `📡 ${name}`,
    `状态: ${status}`,
    `模式: ${mode}`,
    `PID: ${pid || 'n/a'}`,
    `Players: ${stats.playerUpdated}/${stats.playerTotal} (${pct(stats.playerUpdated, stats.playerTotal)}%)`,
    `Teams: ${stats.teamUpdated}/${stats.teamTotal} (${pct(stats.teamUpdated, stats.teamTotal)}%)`,
    `Overall: ${overallDone ? 'done' : `${stats.totalUpdated}/${stats.totalTarget} (${pct(stats.totalUpdated, stats.totalTarget)}%)`}`,
    `耗时: ${formatDuration(Date.now() - state.startedAtMs)}`,
    `ETA(players): ${formatEta(state.startedAtMs, stats.playerUpdated, stats.playerTotal)}`,
    `最近进度变化: ${state.lastProgressAtMs ? `${formatDuration(Date.now() - state.lastProgressAtMs)} 前` : 'n/a'}`,
  ].join('\n');
}

async function collectFullStats(db, startedAtIso) {
  const [playerRows, playerCacheRows, teamRows, teamCacheRows] = await Promise.all([
    db`select count(*)::int as c from pro_players where account_id is not null`,
    db`select count(*)::int as c from player_profile_cache where updated_at >= ${startedAtIso}::timestamptz`,
    db`
      with active_team_ids as (
        select radiant_team_id::bigint as team_id from matches where radiant_team_id is not null
        union
        select dire_team_id::bigint as team_id from matches where dire_team_id is not null
        union
        select radiant_team_id::bigint as team_id from upcoming_series where radiant_team_id is not null
        union
        select dire_team_id::bigint as team_id from upcoming_series where dire_team_id is not null
      )
      select count(*)::int as c from active_team_ids
    `,
    db`select count(*)::int as c from team_flyout_cache where updated_at >= ${startedAtIso}::timestamptz`,
  ]);

  return {
    playerTotal: playerRows[0]?.c || 0,
    playerUpdated: playerCacheRows[0]?.c || 0,
    teamTotal: teamRows[0]?.c || 0,
    teamUpdated: teamCacheRows[0]?.c || 0,
  };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const pid = args.pid ? Number(args.pid) : 0;
  const startedAtIso = args['started-at'];
  const mode = args.mode === 'incremental' ? 'incremental' : 'full';
  const intervalMs = Number(args['interval-sec'] || 300) * 1000;
  const minProgressStep = Number(args['min-progress-step'] || 5);
  const notifyEveryMs = Number(args['notify-every-min'] || 30) * 60 * 1000;
  const staleAfterMs = Number(args['stale-min'] || 20) * 60 * 1000;
  const statePath = args.state || '/tmp/d2hub-derived-refresh-monitor-state.json';
  const name = args.name || 'derived refresh';

  if (!startedAtIso) {
    throw new Error('Missing required --started-at=ISO_TIMESTAMP');
  }

  const db = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);
  const state = readJson(statePath, {
    startedAtMs: Date.parse(startedAtIso),
    lastProgressAtMs: 0,
    lastNotifiedAtMs: 0,
    lastNotifiedTotalUpdated: 0,
    startupNotified: false,
    terminalNotified: false,
    stallNotifiedAtMs: 0,
  });

  async function tick() {
    const alive = pidAlive(pid);
    const stats = await collectFullStats(db, startedAtIso);
    stats.totalTarget = stats.playerTotal + stats.teamTotal;
    stats.totalUpdated = stats.playerUpdated + stats.teamUpdated;

    if (stats.totalUpdated > (state.lastNotifiedTotalUpdated || 0)) {
      state.lastProgressAtMs = Date.now();
      state.stallNotifiedAtMs = 0;
    }

    if (!state.startupNotified) {
      await sendTelegramMessage(buildMessage(name, pid, mode, stats, state, alive ? '监控已启动' : '启动时进程已结束'));
      state.startupNotified = true;
      state.lastNotifiedAtMs = Date.now();
      state.lastNotifiedTotalUpdated = stats.totalUpdated;
    } else if (
      stats.totalUpdated > (state.lastNotifiedTotalUpdated || 0) &&
      (
        stats.totalUpdated - (state.lastNotifiedTotalUpdated || 0) >= minProgressStep ||
        Date.now() - (state.lastNotifiedAtMs || 0) >= notifyEveryMs
      )
    ) {
      await sendTelegramMessage(buildMessage(name, pid, mode, stats, state, alive ? '运行中' : '进程结束'));
      state.lastNotifiedAtMs = Date.now();
      state.lastNotifiedTotalUpdated = stats.totalUpdated;
    }

    if (
      alive &&
      state.lastProgressAtMs &&
      Date.now() - state.lastProgressAtMs >= staleAfterMs &&
      (!state.stallNotifiedAtMs || Date.now() - state.stallNotifiedAtMs >= staleAfterMs)
    ) {
      await sendTelegramMessage(buildMessage(name, pid, mode, stats, state, '疑似卡住'));
      state.stallNotifiedAtMs = Date.now();
    }

    const done = stats.playerUpdated >= stats.playerTotal && stats.teamUpdated >= stats.teamTotal;
    if ((!alive || done) && !state.terminalNotified) {
      await sendTelegramMessage(buildMessage(name, pid, mode, stats, state, done ? '已完成' : '已停止'));
      state.terminalNotified = true;
    }

    writeJson(statePath, state);
    return !alive || done;
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
