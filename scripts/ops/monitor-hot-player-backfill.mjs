import fs from 'node:fs';
import path from 'node:path';
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

function fileExists(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
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

function readTailProgress(logPath) {
  if (!fileExists(logPath)) return null;
  const stat = fs.statSync(logPath);
  const start = Math.max(0, stat.size - 128 * 1024);
  const fd = fs.openSync(logPath, 'r');
  try {
    const length = stat.size - start;
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, start);
    const text = buffer.toString('utf8');
    const lines = text.trim().split('\n').reverse();
    for (const line of lines) {
      const match = line.match(/\((\d+)\/(\d+)\)/);
      if (match) {
        return {
          current: Number(match[1]),
          total: Number(match[2]),
          line: line.trim(),
          mtimeMs: stat.mtimeMs,
        };
      }
    }
    return { current: 0, total: 0, line: 'no progress line found', mtimeMs: stat.mtimeMs };
  } finally {
    fs.closeSync(fd);
  }
}

function pct(current, total) {
  if (!total) return '0.0';
  return ((current / total) * 100).toFixed(1);
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

function formatEta(startedAt, current, total) {
  if (!startedAt || !current || !total || current >= total) return 'n/a';
  const elapsedMs = Date.now() - startedAt;
  const rate = current / elapsedMs;
  if (!Number.isFinite(rate) || rate <= 0) return 'n/a';
  const remainingMs = (total - current) / rate;
  return formatDuration(remainingMs);
}

function buildMessage(name, pid, progress, state, status) {
  const current = progress?.current ?? 0;
  const total = progress?.total ?? 0;
  const progressText = total ? `${current}/${total} (${pct(current, total)}%)` : `${current}`;
  const eta = formatEta(state.startedAt, current, total);
  const updatedAgo = progress?.mtimeMs ? formatDuration(Date.now() - progress.mtimeMs) : 'n/a';
  return [
    `📡 ${name}`,
    `状态: ${status}`,
    `进度: ${progressText}`,
    `PID: ${pid || 'n/a'}`,
    `ETA: ${eta}`,
    `最近日志更新: ${updatedAgo} 前`,
    progress?.line ? `最近一条: ${progress.line}` : null,
  ].filter(Boolean).join('\n');
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const pid = args.pid ? Number(args.pid) : 0;
  const logPath = args.log;
  const name = args.name || 'hot-player-history phase2';
  const intervalMs = Number(args['interval-sec'] || 300) * 1000;
  const minProgressStep = Number(args['min-progress-step'] || 50);
  const notifyEveryMs = Number(args['notify-every-min'] || 30) * 60 * 1000;
  const staleAfterMs = Number(args['stale-min'] || 20) * 60 * 1000;
  const statePath = args.state || '/tmp/d2hub-backfill-monitor-state.json';
  const once = Boolean(args.once);

  if (!logPath) {
    throw new Error('Missing required --log=/path/to/log');
  }

  const state = readJson(statePath, {
    startedAt: Date.now(),
    lastSeenCurrent: 0,
    lastNotifiedCurrent: 0,
    lastNotifiedAt: 0,
    lastProgressAt: 0,
    stallNotifiedAt: 0,
    startupNotified: false,
    terminalNotified: false,
  });

  async function tick() {
    const alive = pidAlive(pid);
    const progress = readTailProgress(logPath);
    const current = progress?.current ?? 0;

    if (current > (state.lastSeenCurrent || 0)) {
      state.lastSeenCurrent = current;
      state.lastProgressAt = Date.now();
      state.stallNotifiedAt = 0;
    }

    if (!state.startupNotified) {
      await sendTelegramMessage(buildMessage(name, pid, progress, state, alive ? '监控已启动' : '启动时进程已不在运行'));
      state.startupNotified = true;
      state.lastNotifiedAt = Date.now();
      state.lastNotifiedCurrent = current;
    } else if (
      progress &&
      current > (state.lastNotifiedCurrent || 0) &&
      (
        (minProgressStep > 0 && current - (state.lastNotifiedCurrent || 0) >= minProgressStep) ||
        Date.now() - (state.lastNotifiedAt || 0) >= notifyEveryMs
      )
    ) {
      await sendTelegramMessage(buildMessage(name, pid, progress, state, alive ? '运行中' : '进程结束'));
      state.lastNotifiedAt = Date.now();
      state.lastNotifiedCurrent = current;
    }

    if (
      alive &&
      state.lastProgressAt &&
      Date.now() - state.lastProgressAt >= staleAfterMs &&
      (!state.stallNotifiedAt || Date.now() - state.stallNotifiedAt >= staleAfterMs)
    ) {
      await sendTelegramMessage(buildMessage(name, pid, progress, state, '疑似卡住'));
      state.stallNotifiedAt = Date.now();
    }

    if (!alive && !state.terminalNotified) {
      const done = progress && progress.total > 0 && progress.current >= progress.total;
      await sendTelegramMessage(buildMessage(name, pid, progress, state, done ? '已完成' : '已停止'));
      state.terminalNotified = true;
    }

    writeJson(statePath, state);
    return !alive;
  }

  do {
    const shouldStop = await tick();
    if (once || shouldStop) break;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  } while (true);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
