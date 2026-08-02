import puppeteer from 'puppeteer';
import fs from 'node:fs';
const OUT = 'scripts/visual-qa/artifacts/prod';
fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 2400 });
await page.goto('https://dotahub.cn/#/matches', { waitUntil: 'networkidle2', timeout: 90000 });
await new Promise((r) => setTimeout(r, 6000));
const info = await page.evaluate(() => ({
  headings: [...document.querySelectorAll('h1,h2')].map(h => h.textContent?.trim()),
  text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 500),
}));
console.log('HEADINGS:', JSON.stringify(info.headings));
console.log('TEXT:', JSON.stringify(info.text));
await page.screenshot({ path: `${OUT}/matches-page.png`, fullPage: true });
console.log('captured prod matches-page.png');
await browser.close();
