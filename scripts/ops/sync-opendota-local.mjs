#!/usr/bin/env node
/**
 * 本地 OpenDota 同步（MacBook tmux cron 用，替代 EdgeOne 远程 /api/cron?action=sync-opendota）。
 *
 * 背景：runSyncOpenDota 是多步重流程（OpenDota proMatches/比赛详情/队伍信息 + Neon 写入），
 * EdgeOne Pages Function 平台 60s 上限内跑不完 → HTTP 504。本机无平台限制，
 * 本地跑并直接写生产 Neon。
 *
 * 用法：node --env-file=.env.local scripts/ops/sync-opendota-local.mjs
 * 输出 JSON：{ ok, ts, elapsedMs, result | error }
 */

import { runSyncOpenDota } from '../../lib/server/sync-opendota.js';
import { sendTelegramMessage } from './telegram-util.mjs';

const startedAt = new Date().toISOString();
const startedAtMs = Date.now();

try {
  const result = await runSyncOpenDota();
  const record = { ok: true, ts: startedAt, elapsedMs: Date.now() - startedAtMs, result };
  console.log(JSON.stringify(record));
  process.exit(0);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const record = { ok: false, ts: startedAt, elapsedMs: Date.now() - startedAtMs, error: message };
  console.log(JSON.stringify(record));
  await sendTelegramMessage([
    '🕐 d2hub cron hourly',
    `时间: ${startedAt}`,
    '状态: ❌ 刷新失败',
    '详情:',
    `❌ sync-opendota（本地）\n${message}`,
  ].join('\n')).catch(() => {});
  process.exit(1);
}
