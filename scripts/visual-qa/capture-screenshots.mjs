/**
 * Visual QA Screenshot Script — Desktop
 * Clips to the actual content area of each overlay.
 */

import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACTS_DIR = path.join(path.resolve(__dirname, '..', '..'), 'artifacts', 'visual-qa');
const BASE_URL = 'https://dotahub.cn/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function screenshotContent(page, filename, setupFn) {
  // Use tall viewport so content renders at natural height (no overflow clipping)
  await page.setViewport({ width: 1440, height: 5000, deviceScaleFactor: 1 });
  await sleep(300);
  await setupFn();
  await sleep(2000);

  const info = await page.evaluate(() => {
    // Find ALL sheet/dialog overlays, pick the last (topmost) one
    const allOverlays = document.querySelectorAll('[data-slot="sheet-content"], [data-slot="dialog-content"]');
    const root = allOverlays[allOverlays.length - 1];
    if (!root) return null;

    // Use the root overlay element itself, so we capture header + body
    const rect = root.getBoundingClientRect();

    // Find the scroll container (overflow-y: auto) that wraps header + body.
    // On a tall viewport, its scrollHeight equals the total content height.
    let scrollContainer = root;
    for (const el of root.querySelectorAll('*')) {
      const s = getComputedStyle(el);
      if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > 400) {
        scrollContainer = el;
      }
    }
    const targetRect = scrollContainer.getBoundingClientRect();
    // Use the scroll container's top, but measure total height from its children
    let bottom = 0;
    for (const child of scrollContainer.children) {
      const r = child.getBoundingClientRect();
      const childBottom = r.bottom;
      if (childBottom > bottom) bottom = childBottom;
    }
    const totalHeight = bottom > 0 ? bottom - targetRect.top : scrollContainer.scrollHeight;
    return { x: targetRect.x, y: targetRect.y, width: targetRect.width, height: totalHeight };
  });

  const fp = path.join(ARTIFACTS_DIR, filename);
  if (info && info.height > 200) {
    await page.screenshot({ path: fp, type: 'png', clip: info, captureBeyondViewport: true });
    console.log(`  ✓ ${filename} (${Math.round(info.width)}x${Math.round(info.height)})`);
  } else {
    console.log(`  ⚠ ${filename} — falling back to viewport`);
    await page.screenshot({ path: fp, type: 'png' });
  }

  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
}

async function main() {
  console.log(`Visual QA Screenshot Capture`);
  console.log(`  Target: ${BASE_URL}\n`);
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  try {
    // ============================================================
    // 1. TeamFlyout (Tundra)
    // ============================================================
    console.log('[1/3] TeamFlyout (Tundra)');
    await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(3000);
    await screenshotContent(page, 'team-flyout.desktop.png', async () => {
      await page.evaluate(() => {
        for (const b of document.querySelectorAll('button')) {
          if (b.textContent?.includes('Tundra')) { b.click(); return; }
        }
      });
    });
    await page.keyboard.press('Escape');
    await sleep(600);

    // ============================================================
    // 2. PlayerProfileFlyout (33)
    // ============================================================
    console.log('[2/3] PlayerProfileFlyout (33)');
    await screenshotContent(page, 'player-profile.desktop.png', async () => {
      await page.evaluate(() => {
        for (const b of document.querySelectorAll('button')) {
          if (b.textContent?.includes('Tundra')) { b.click(); return; }
        }
      });
      await new Promise(r => setTimeout(r, 2000));
      await page.evaluate(() => {
        const sheet = document.querySelector('[data-slot="sheet-content"]');
        if (!sheet) return;
        for (const b of sheet.querySelectorAll('button')) {
          if (b.textContent?.startsWith('33') && b.textContent?.includes('Neta')) {
            b.click(); return;
          }
        }
      });
    });
    await page.keyboard.press('Escape');
    await sleep(400);
    await page.keyboard.press('Escape');
    await sleep(600);

    // ============================================================
    // 3. MatchDetailModal (Map 1)
    // ============================================================
    console.log('[3/3] MatchDetailModal (Map 1)');
    await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(3000);
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(500);

    await page.setViewport({ width: 1440, height: 5000, deviceScaleFactor: 1 });
    await sleep(300);
    await page.evaluate(() => {
      for (const b of document.querySelectorAll('button')) {
        if (b.textContent?.trim() === 'Map 1') { b.click(); return; }
      }
    });
    await sleep(2500);

    // MatchDetail: find dialog or full-page div
    const mdInfo = await page.evaluate(() => {
      // Find the topmost overlay (dialog or full-page div)
      const allOverlays = document.querySelectorAll('[data-slot="dialog-content"], [data-visual-role="match-detail-page"]');
      const root = allOverlays[allOverlays.length - 1];
      if (!root) return null;

      // Find inner scrollable container
      for (const el of root.querySelectorAll('*')) {
        if (getComputedStyle(el).overflowY === 'auto' && el.scrollHeight > 500) {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: el.scrollHeight };
        }
      }
      const r = root.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: root.scrollHeight };
    });

    const fp = path.join(ARTIFACTS_DIR, 'match-detail.desktop.png');
    if (mdInfo) {
      await page.screenshot({ path: fp, type: 'png', clip: mdInfo, captureBeyondViewport: true });
      console.log(`  ✓ match-detail.desktop.png (${Math.round(mdInfo.width)}x${Math.round(mdInfo.height)})`);
    } else {
      await page.screenshot({ path: fp, type: 'png' });
      console.log('  ✓ match-detail.desktop.png (viewport fallback)');
    }

    await page.keyboard.press('Escape');
    await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
    console.log('\nDone.');
  } catch (err) {
    console.error('Fatal:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
