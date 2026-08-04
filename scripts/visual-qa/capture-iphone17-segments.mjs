import puppeteer from 'puppeteer';

const VIEWPORT = { width: 402, height: 874, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const ANCHORS = [
  ['live', 1686], ['results', 2041], ['tournaments', 2965],
  ['news', 3452], ['rankings', 3920], ['players', 4520], ['events', 5179],
];

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport(VIEWPORT);
await page.setUserAgent(UA);
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));

for (const [name, y] of ANCHORS) {
  try {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await new Promise((r) => setTimeout(r, 700));
    await page.screenshot({ path: `scripts/visual-qa/artifacts/iphone17-home-${name}.png` });
    console.log('ok', name, '@', y);
  } catch (e) {
    console.log('FAIL', name, String(e).slice(0, 120));
  }
}
await browser.close();
console.log('done');
