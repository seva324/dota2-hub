import puppeteer from 'puppeteer';
import fs from 'node:fs';

const OUT = 'scripts/visual-qa/artifacts/match-page';
const BASE = 'http://localhost:5174/#/match/427386?slug=midas-club-vs-team-resilience-games-of-the-future-2026';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

  for (const [name, viewport] of [
    ['desktop', { width: 1440, height: 2000 }],
    ['mobile', { width: 390, height: 1600, isMobile: true, hasTouch: true }],
  ]) {
    const page = await browser.newPage();
    await page.setViewport(viewport);
    await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 90000 });
    // 等三场比赛块渲染 + 图片加载
    await page.waitForFunction(
      () => document.querySelectorAll('div[class*="rounded-2xl"]').length >= 3,
      { timeout: 20000 },
    ).catch(() => console.log(`${name}: game blocks wait timeout`));
    await sleep(6000);
    await page.screenshot({ path: `${OUT}/match-page.${name}.png`, fullPage: true });
    console.log(`captured ${name}`);
    await page.close();
  }

  await browser.close();
  console.log('done');
}

main().catch((e) => { console.error(e); process.exit(1); });
