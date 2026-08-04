import puppeteer from 'puppeteer';

// iPhone 17: 6.3" 逻辑视口 402x874, dpr 3
const VIEWPORT = { width: 402, height: 874, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport(VIEWPORT);
await page.setUserAgent(UA);
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 4000));

const metrics = await page.evaluate(() => ({
  scrollW: document.documentElement.scrollWidth,
  clientW: document.documentElement.clientWidth,
  scrollH: document.documentElement.scrollHeight,
  overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
}));
console.log('metrics:', JSON.stringify(metrics));

await page.screenshot({ path: 'scripts/visual-qa/artifacts/iphone17-home-full.png', fullPage: true });
await page.screenshot({ path: 'scripts/visual-qa/artifacts/iphone17-home-top.png' });
console.log('saved iphone17-home-full.png + iphone17-home-top.png');
await browser.close();
