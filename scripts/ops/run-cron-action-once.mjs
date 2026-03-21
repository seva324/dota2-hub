#!/usr/bin/env node

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

async function invokeEndpoint(url, timeoutMs) {
  let payload = null;
  let ok = false;
  let errorMessage = '';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
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
  const startedAt = new Date().toISOString();
  const url = `${base}/api/cron?action=${encodeURIComponent(action)}`;

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

  const result = await invokeEndpoint(url, timeoutMs);
  const record = {
    ts: startedAt,
    action,
    url,
    ok: result.ok,
    errorMessage: result.errorMessage,
    payload: result.payload,
  };
  appendJsonLine(logPath, record);

  if (notify || !result.ok) {
    const status = result.ok ? '✅ 已完成' : '❌ 失败';
    await sendTelegramMessage([
      `🕐 d2hub ${action}`,
      `状态: ${status}`,
      `时间: ${startedAt}`,
      `详情: ${result.ok ? summarizeResult(result.payload) : (result.errorMessage || summarizeResult(result.payload))}`,
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
