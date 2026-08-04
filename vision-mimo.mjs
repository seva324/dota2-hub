#!/usr/bin/env node
/**
 * 本地代理识图脚本 — 通过 CC Switch 本地代理调用 claude-haiku-4-5（路由到 MiMo V2.5）。
 *
 * 用法:
 *   node vision-mimo.mjs <图片路径> [问题]
 *
 * 链路（已验证 2026-08-03）:
 *   CC Switch 代理 127.0.0.1:15721/claude-desktop/v1/messages
 *   鉴权: claude_desktop_gateway_token（~/.cc-switch/cc-switch.db settings 表）
 *   要点: 必须带浏览器 User-Agent；max_tokens 需 >=8192（MiMo 是推理模型）
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';

const PROXY_BASE = process.env.VISION_MIMO_PROXY_BASE || 'http://127.0.0.1:15721/claude-desktop';
const MODEL = process.env.VISION_MIMO_MODEL || 'claude-haiku-4-5';
const DB_PATH = path.join(os.homedir(), '.cc-switch', 'cc-switch.db');

function getGatewayToken() {
  const code = [
    "import sqlite3",
    `con = sqlite3.connect('file:${DB_PATH.replace(/\\/g, '/')}?mode=ro', uri=True)`,
    "print(con.execute(\"SELECT value FROM settings WHERE key='claude_desktop_gateway_token'\").fetchone()[0])",
  ].join(';');
  try {
    return execFileSync('python', ['-c', code], { encoding: 'utf8' }).trim();
  } catch (e) {
    throw new Error(`读取 gateway token 失败（${DB_PATH}）: ${String(e.message).slice(0, 300)}`);
  }
}

function parseArgs() {
  const argv = process.argv.slice(2);
  let imageSource = '', prompt = '';
  for (const a of argv) {
    if (!imageSource) imageSource = a;
    else prompt = prompt ? prompt + ' ' + a : a;
  }
  if (!imageSource) throw new Error('用法: node vision-mimo.mjs <图片路径> [问题]');
  if (!prompt) prompt = '请详细描述这张图片的内容。';
  return { imageSource, prompt };
}

function toBase64DataUrl(imagePath) {
  const resolved = path.resolve(imagePath);
  if (!fs.existsSync(resolved)) throw new Error(`文件不存在: ${resolved}`);
  const ext = path.extname(resolved).toLowerCase().replace('.', '');
  const mimeMap = { jpg: 'jpeg', jpeg: 'jpeg', png: 'png', gif: 'gif', webp: 'webp', bmp: 'bmp' };
  const data = fs.readFileSync(resolved);
  return { mediaType: `image/${mimeMap[ext] || 'jpeg'}`, b64: data.toString('base64') };
}

async function main() {
  const { imageSource, prompt } = parseArgs();
  const { mediaType, b64 } = toBase64DataUrl(imageSource);
  const token = getGatewayToken();

  const body = {
    model: MODEL,
    max_tokens: 8192,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
        { type: 'text', text: prompt },
      ],
    }],
  };

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'anthropic-version': '2023-06-01',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  };

  const t0 = Date.now();
  const res = await fetch(`${PROXY_BASE.replace(/\/+$/, '')}/v1/messages`, {
    method: 'POST', headers, body: JSON.stringify(body),
  });
  const raw = await res.text();
  if (!res.ok) {
    const snippet = raw.includes('<html') ? '上游被 Cloudflare 拦截' : raw.slice(0, 300);
    throw new Error(`HTTP ${res.status}: ${snippet}`);
  }

  let data;
  try { data = JSON.parse(raw); } catch { throw new Error(`无法解析响应: ${raw.slice(0, 300)}`); }

  const parts = (data.content || [])
    .filter((p) => p && typeof p.text === 'string')
    .map((p) => p.text);
  const text = parts.join('\n').trim();

  console.log(`[model=${data.model} stop=${data.stop_reason} time=${Date.now() - t0}ms]`);
  if (data.usage) console.log(`[usage=${JSON.stringify(data.usage)}]`);
  if (!text) {
    console.error(`MiMo 返回空内容（stop_reason=${data.stop_reason}）。若为 max_tokens 请调大脚本内 max_tokens。`);
    process.exit(1);
  }
  console.log(text);
}

main().catch((err) => { console.error('识图失败:', err.message); process.exit(1); });
