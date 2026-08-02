import puppeteer from 'puppeteer';
import fs from 'node:fs';
const OUT = 'scripts/visual-qa/artifacts/local';
fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 2400 });
await page.goto('http://localhost:5174/#/matches', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 6000));
// 展开 upcoming
const expand = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('展开更多'));
  if (btn) { btn.click(); return true; }
  return false;
});
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: `${OUT}/matches-page2.png`, fullPage: true });
console.log('captured matches-page2.png, expanded:', expand);
await browser.close();
