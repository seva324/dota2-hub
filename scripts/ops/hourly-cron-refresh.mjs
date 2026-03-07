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

function appendJsonLine(filePath, value) {
  ensureDir(filePath);
  fs.appendFileSync(filePath, `${JSON.stringify(value)}\n`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function summarizeResult(payload) {
  if (!payload || typeof payload !== 'object') return '无有效 JSON 返回';
  if (!payload.ok) return `失败: ${payload.error || 'unknown error'}`;
  const result = payload.result || payload;
  if (!result || typeof result !== 'object') return 'ok';
  return Object.entries(result)
    .slice(0, 6)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? '[obj]' : v}`)
    .join(', ') || 'ok';
}

function parseEndpoints(args) {
  if (args.endpoints) {
    return String(args.endpoints)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const [name, url] = item.split('|');
        return { name: name?.trim() || url?.trim(), url: url?.trim() };
      })
      .filter((item) => item.name && item.url);
  }

  const base = (args.base || 'https://dota2-hub.vercel.app').replace(/\/$/, '');
  return [
    { name: 'sync-opendota', url: `${base}/api/cron?action=sync-opendota` },
    { name: 'sync-liquipedia', url: `${base}/api/cron?action=sync-liquipedia` },
    { name: 'sync-news', url: `${base}/api/cron?action=sync-news` },
  ];
}

async function invokeEndpoint(endpoint, timeoutMs) {
  let payload = null;
  let ok = false;
  let errorMessage = '';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(endpoint.url, {
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

  return {
    name: endpoint.name,
    url: endpoint.url,
    ok,
    errorMessage,
    payload,
  };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const endpoints = parseEndpoints(args);
  const intervalMs = Number(args['interval-min'] || 60) * 60 * 1000;
  const logPath = args.log || '/tmp/d2hub-cron-refresh.jsonl';
  const once = Boolean(args.once);
  const quiet = Boolean(args.quiet);
  const timeoutMs = Number(args['timeout-ms'] || 120000);

  let iteration = 0;
  do {
    iteration += 1;
    const startedAt = new Date().toISOString();
    const results = [];
    for (const endpoint of endpoints) {
      results.push(await invokeEndpoint(endpoint, timeoutMs));
    }
    const ok = results.every((item) => item.ok);

    appendJsonLine(logPath, {
      ts: startedAt,
      iteration,
      endpoints,
      ok,
      results,
    });

    if (!quiet || !ok) {
      const status = ok ? '✅ 刷新成功' : '❌ 刷新失败';
      const detail = results
        .map((item) => `${item.ok ? '✅' : '❌'} ${item.name}\n${item.ok ? summarizeResult(item.payload) : (item.errorMessage || summarizeResult(item.payload))}`)
        .join('\n\n');
      await sendTelegramMessage([
        `🕐 d2hub cron hourly`,
        `时间: ${startedAt}`,
        `状态: ${status}`,
        `详情:`,
        detail,
      ].join('\n'));
    }

    if (once) break;
    await sleep(intervalMs);
  } while (true);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
