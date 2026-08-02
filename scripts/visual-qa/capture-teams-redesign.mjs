import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 2000 });
await page.goto('http://localhost:8804/#/teams', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 5000));
await page.screenshot({ path: 'scripts/visual-qa/artifacts/teams-redesign.png', fullPage: true });
console.log('saved teams-redesign.png');
await browser.close();
