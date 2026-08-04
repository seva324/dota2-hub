import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 2400 });
await page.goto('https://dotahub.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 8000));
await page.screenshot({ path: 'scripts/visual-qa/artifacts/home-final.png', fullPage: true });
console.log('saved home-final.png');
await browser.close();
