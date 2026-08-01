import puppeteer from 'puppeteer';
import fs from 'node:fs';

const OUT = 'scripts/visual-qa/artifacts/local';
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--ignore-certificate-errors'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 2400 });

await page.goto('http://localhost:5174/', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 5000));

const info = await page.evaluate(() => ({
  text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 600),
  imgs: [...document.images].length,
  broken: [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src.slice(0, 120)).slice(0, 8),
}));
console.log('PAGE INFO:', JSON.stringify(info, null, 1));

// 桌面整页截图
await page.screenshot({ path: `${OUT}/homepage.desktop.png`, fullPage: true });
console.log('captured', `${OUT}/homepage.desktop.png`);

// 视口截图（首屏）
await page.screenshot({ path: `${OUT}/homepage.viewport.png` });
console.log('captured', `${OUT}/homepage.viewport.png`);

await browser.close();
