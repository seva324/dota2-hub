import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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

export function readTelegramConfig() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN || process.env.TG_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID || process.env.TG_CHAT_ID;
  if (botToken && chatId) {
    return { botToken, chatId, source: 'env' };
  }

  const configPath = path.join(os.homedir(), '.codex', '.omx-config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(`Telegram config missing: ${configPath}`);
  }

  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const telegram = raw?.notifications?.telegram;
  if (!telegram?.enabled || !telegram?.botToken || !telegram?.chatId) {
    throw new Error('Telegram notification config is incomplete in ~/.codex/.omx-config.json');
  }

  return {
    botToken: telegram.botToken,
    chatId: telegram.chatId,
    source: configPath,
  };
}

export async function sendTelegramMessage(text, options = {}) {
  const { botToken, chatId } = readTelegramConfig();
  const timeoutMs = Number(process.env.TELEGRAM_TIMEOUT_MS || options.timeoutMs || 30000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
        ...(options.parseMode ? { parse_mode: options.parseMode } : {}),
      }),
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Telegram API error ${response.status}: ${detail}`);
  }

  return response.json();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const text = args.text || process.env.TELEGRAM_TEXT;
  if (!text) {
    throw new Error('Usage: node scripts/ops/telegram-util.mjs --text="hello"');
  }
  await sendTelegramMessage(text, { parseMode: args['parse-mode'] || undefined });
  console.log('sent');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
