/**
 * 第 0 轮侦察脚本
 * 打开 dotahub.cn，提取 TeamFlyout / PlayerProfileFlyout / MatchDetailModal 的 trigger 选择器
 * 输出侦察报告，辅助确定后续截图脚本的选择器
 */

import puppeteer from 'puppeteer';
import fs from 'fs';

const BASE_URL = 'https://dotahub.cn';
const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

async function scoutViewport(browser, viewport) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  );

  console.log(`\n=== Scout ${viewport.width}x${viewport.height} ===`);

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  } catch (err) {
    console.error(`  Page load failed: ${err.message}`);
    await page.close();
    return { viewport: `${viewport.width}x${viewport.height}`, error: err.message };
  }

  await new Promise(r => setTimeout(r, 3000));

  const report = await page.evaluate(() => {
    const results = {
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      url: window.location.href,
      pageTitle: document.title,
      matchTriggers: [],
      teamTriggers: [],
      playerTriggers: [],
      otherButtons: [],
      consoleErrors: [],
      bodyTextSample: document.body.innerText.slice(0, 500),
    };

    const allButtons = document.querySelectorAll('button, [role="button"], [onclick]');

    allButtons.forEach((el) => {
      const tag = el.tagName.toLowerCase();
      const text = (el.textContent || '').trim().slice(0, 80);
      const className = (el.className && typeof el.className === 'string')
        ? el.className.slice(0, 200)
        : '';
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const entry = {
        tag,
        text,
        className,
        id: el.id || null,
        type: el.getAttribute('type') || null,
        role: el.getAttribute('role') || null,
        ariaLabel: el.getAttribute('aria-label') || null,
        dataAttrs: {},
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
        },
      };

      for (const attr of el.attributes) {
        if (attr.name.startsWith('data-')) {
          entry.dataAttrs[attr.name] = attr.value;
        }
      }

      const lowerText = text.toLowerCase();
      if (
        lowerText.includes('vs') ||
        lowerText.includes('bo') ||
        lowerText.includes('live') ||
        /^\d+\s*[-:]\s*\d+$/.test(lowerText)
      ) {
        results.matchTriggers.push(entry);
      } else if (
        entry.dataAttrs['data-team-id'] ||
        entry.dataAttrs['data-team-name'] ||
        className.includes('team')
      ) {
        results.teamTriggers.push(entry);
      } else if (
        entry.dataAttrs['data-player-id'] ||
        entry.dataAttrs['data-player-name'] ||
        className.includes('player')
      ) {
        results.playerTriggers.push(entry);
      } else if (text.length > 0 && text.length < 40) {
        results.otherButtons.push(entry);
      }
    });

    document.querySelectorAll('a').forEach((el) => {
      const href = el.getAttribute('href') || '';
      const text = (el.textContent || '').trim().slice(0, 80);
      if (href.includes('match') || /vs/i.test(text)) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          results.matchTriggers.push({
            tag: 'a',
            text,
            href,
            rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
            dataAttrs: {},
          });
        }
      }
    });

    document.querySelectorAll('*').forEach((el) => {
      const text = (el.textContent || '').trim();
      const className = (el.className && typeof el.className === 'string') ? el.className : '';
      if (
        className.includes('group/team') &&
        el.tagName === 'BUTTON'
      ) {
        const exists = results.teamTriggers.some(t => t.text === text.slice(0, 80));
        if (!exists) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            results.teamTriggers.push({
              tag: el.tagName.toLowerCase(),
              text: text.slice(0, 80),
              className: className.slice(0, 200),
              rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
              dataAttrs: {},
            });
          }
        }
      }
    });

    return results;
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      report.consoleErrors.push(msg.text());
    }
  });

  await page.close();
  return report;
}

async function main() {
  console.log('DotaHub Visual QA Scout — Round 0');
  console.log(`Base URL: ${BASE_URL}\n`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const results = {};

  for (const [name, vp] of Object.entries(VIEWPORTS)) {
    results[name] = await scoutViewport(browser, vp);
  }

  await browser.close();

  console.log('\n\n===== SCOUT SUMMARY =====\n');

  for (const [name, report] of Object.entries(results)) {
    if (report.error) {
      console.log(`[${name}] ERROR: ${report.error}`);
      continue;
    }
    console.log(`[${name}] ${report.viewport} — ${report.url}`);
    console.log(`  Match triggers: ${report.matchTriggers.length}`);
    report.matchTriggers.slice(0, 3).forEach((t, i) => {
      console.log(`    ${i + 1}. [${t.tag}] "${t.text}" @ (${t.rect.x},${t.rect.y}) ${t.rect.w}x${t.rect.h}`);
    });
    console.log(`  Team triggers: ${report.teamTriggers.length}`);
    report.teamTriggers.slice(0, 3).forEach((t, i) => {
      console.log(`    ${i + 1}. [${t.tag}] "${t.text}" @ (${t.rect.x},${t.rect.y}) ${t.rect.w}x${t.rect.h}`);
    });
    console.log(`  Player triggers: ${report.playerTriggers.length}`);
    report.playerTriggers.slice(0, 3).forEach((t, i) => {
      console.log(`    ${i + 1}. [${t.tag}] "${t.text}" @ (${t.rect.x},${t.rect.y}) ${t.rect.w}x${t.rect.h}`);
    });
    console.log(`  Other buttons: ${report.otherButtons.length}`);
    if (report.consoleErrors.length > 0) {
      console.log(`  Console errors: ${report.consoleErrors.length}`);
      report.consoleErrors.slice(0, 5).forEach((e) => console.log(`    - ${e}`));
    }
    console.log(`  Body sample: ${report.bodyTextSample.slice(0, 100)}...`);
  }

  const outDir = 'scripts/visual-qa/artifacts';
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = `${outDir}/scout-round0.json`;
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nFull report saved to: ${outPath}`);
}

main().catch((err) => {
  console.error('Scout failed:', err);
  process.exit(1);
});
