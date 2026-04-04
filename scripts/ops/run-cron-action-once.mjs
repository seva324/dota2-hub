#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
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

function pickNonNegativeInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.trunc(parsed);
}

function pickBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function appendJsonLine(filePath, value) {
  ensureDir(filePath);
  fs.appendFileSync(filePath, `${JSON.stringify(value)}\n`);
}

function summarizeResult(payload) {
  if (!payload || typeof payload !== 'object') return '无有效 JSON 返回';
  if (!payload.ok) return `失败: ${payload.error || 'unknown error'}`;
  const result = payload.result || payload;
  if (!result || typeof result !== 'object') return 'ok';
  return Object.entries(result)
    .slice(0, 8)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? '[obj]' : v}`)
    .join(', ') || 'ok';
}

function readLastJsonLine(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.trim().split('\n');
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }
  return null;
}

function runLocalScript(scriptPath, scriptArgs = [], timeoutMs = 300000) {
  const result = spawnSync(process.execPath, [scriptPath, ...scriptArgs], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 12,
    timeout: timeoutMs,
  });
  const stdout = String(result.stdout || '').trim();
  const stderr = String(result.stderr || '').trim();
  let payload = null;
  try {
    payload = JSON.parse(stdout || '{}');
  } catch {}
  return {
    ok: result.status === 0,
    status: result.status,
    stdout,
    stderr,
    payload,
  };
}

async function invokeEndpoint(url, timeoutMs, extraHeaders = {}) {
  let payload = null;
  let ok = false;
  let errorMessage = '';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...extraHeaders,
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const text = await response.text();
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { ok: response.ok, raw: text.slice(0, 1000) };
    }
    ok = response.ok && payload?.ok !== false;
    if (!response.ok) errorMessage = `HTTP ${response.status}`;
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  return { ok, errorMessage, payload };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const action = String(args.action || '').trim();
  if (!action) throw new Error('Missing --action');
  const base = String(args.base || 'https://dota2-hub.vercel.app').replace(/\/$/, '');
  const timeoutMs = Number(args['timeout-ms'] || 120000);
  const logPath = args.log || `/tmp/d2hub-${action}.jsonl`;
  const notify = args.notify !== '0';
  const force = pickBoolean(args.force, false);
  const defaultMinInterval =
    (action === 'sync-news' || action === 'sync-liquipedia')
      ? 180
      : (action === 'sync-opendota' ? 60 : 0);
  const envMinInterval = pickNonNegativeInt(process.env.D2HUB_CRON_MIN_INTERVAL_MIN || process.env.CRON_MIN_INTERVAL_MIN, null);
  const argMinInterval = pickNonNegativeInt(args['min-interval-min'], null);
  const minIntervalMin = argMinInterval ?? envMinInterval ?? defaultMinInterval;
  const token = String(args.token || process.env.D2HUB_CRON_TOKEN || process.env.CRON_SECRET || '').trim();
  const startedAt = new Date().toISOString();
  const qs = new URLSearchParams();
  qs.set('action', action);
  if (force) qs.set('force', '1');
  if (minIntervalMin > 0) qs.set('minIntervalMin', String(minIntervalMin));
  const url = `${base}/api/cron?${qs.toString()}`;

  if (!force && minIntervalMin > 0) {
    const lastRecord = readLastJsonLine(logPath);
    const lastTs = lastRecord?.ts ? Date.parse(lastRecord.ts) : null;
    if (Number.isFinite(lastTs)) {
      const elapsedMs = Date.now() - lastTs;
      if (elapsedMs >= 0 && elapsedMs < minIntervalMin * 60 * 1000) {
        appendJsonLine(logPath, {
          ts: startedAt,
          action,
          url,
          ok: true,
          skipped: true,
          skipReason: `min_interval_${minIntervalMin}m`,
          lastTs: lastRecord.ts,
        });
        return;
      }
    }
  }

  if (notify) {
    await sendTelegramMessage([`🚀 d2hub ${action}`, `状态: 已启动`, `时间: ${startedAt}`].join('\n')).catch(() => {});
  }

  const result = await invokeEndpoint(
    url,
    timeoutMs,
    token ? { 'x-cron-token': token } : {}
  );
  let redditForward = null;
  if (result.ok && action === 'sync-news') {
    const redditForwardEnabled = pickBoolean(args['reddit-forward'] ?? process.env.D2HUB_REDDIT_FORWARD ?? '1', true);
    if (redditForwardEnabled) {
      const scriptPath = path.resolve(process.cwd(), 'scripts', 'post-reddit-to-xhs.mjs');
      if (fs.existsSync(scriptPath)) {
        const redditArgs = [];
        if (args['reddit-limit']) redditArgs.push('--limit', String(args['reddit-limit']));
        if (args['reddit-days']) redditArgs.push('--days', String(args['reddit-days']));
        if (args['reddit-fetch-limit']) redditArgs.push('--fetch-limit', String(args['reddit-fetch-limit']));
        if (args['reddit-comment-limit']) redditArgs.push('--comment-limit', String(args['reddit-comment-limit']));
        if (args['reddit-model']) redditArgs.push('--model', String(args['reddit-model']));
        if (args['reddit-prompt-file']) redditArgs.push('--prompt-file', String(args['reddit-prompt-file']));
        if (args['reddit-state-file']) redditArgs.push('--state-file', String(args['reddit-state-file']));
        if (args['reddit-xhs-cli']) redditArgs.push('--xhs-cli', String(args['reddit-xhs-cli']));
        if (args['reddit-cdp-url']) redditArgs.push('--cdp-url', String(args['reddit-cdp-url']));
        if (pickBoolean(args['reddit-force'], false)) redditArgs.push('--force');
        if (pickBoolean(args['reddit-dry-run'], false)) redditArgs.push('--dry-run');
        redditForward = runLocalScript(scriptPath, redditArgs, timeoutMs);
      } else {
        redditForward = { ok: false, status: null, stderr: `missing script: ${scriptPath}`, stdout: '', payload: null };
      }
    } else {
      redditForward = { ok: true, status: 0, stdout: '', stderr: '', payload: { skipped: true, reason: 'disabled' } };
    }
  }

  const record = {
    ts: startedAt,
    action,
    url,
    ok: result.ok,
    errorMessage: result.errorMessage,
    payload: result.payload,
    redditForward,
  };
  appendJsonLine(logPath, record);

  if (notify || !result.ok) {
    const status = result.ok ? '✅ 已完成' : '❌ 失败';
    const redditSummary = redditForward
      ? `\nReddit转发: ${
        redditForward.ok
          ? summarizeResult(redditForward.payload || { ok: true })
          : (redditForward.stderr || 'failed')
      }`
      : '';
    await sendTelegramMessage([
      `🕐 d2hub ${action}`,
      `状态: ${status}`,
      `时间: ${startedAt}`,
      `详情: ${result.ok ? summarizeResult(result.payload) : (result.errorMessage || summarizeResult(result.payload))}${redditSummary}`,
    ].join('\n')).catch((error) => {
      console.error(`[run-cron-action-once] Telegram notify failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  if (!result.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
