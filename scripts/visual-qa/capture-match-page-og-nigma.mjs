import puppeteer from 'puppeteer';
import fs from 'node:fs';

const URL = 'https://dotahub.cn/#/match/427573?slug=nigma-vs-og-1win-essence-2';
const OUT = 'scripts/visual-qa/artifacts/match-page';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 2000 });
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(
  () => document.querySelectorAll('div[class*="rounded-2xl"]').length >= 2,
  { timeout: 30000 },
).catch(() => console.log('blocks wait timeout'));
await sleep(4000);
await page.screenshot({ path: `${OUT}/match-page.og-nigma.prod.png`, fullPage: true });
console.log('saved screenshot');
await browser.close();
