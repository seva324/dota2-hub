import puppeteer from 'puppeteer';

const page_ = process.argv[2] || 'http://localhost:5173/?prototype=1';
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('console', (m) => {
  if (['error', 'warning'].includes(m.type())) console.log('[' + m.type() + ']', m.text().slice(0, 300));
});
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 500)));
page.on('requestfailed', (r) => console.log('[reqfail]', r.url().slice(0, 140), r.failure()?.errorText));
await page.setViewport({ width: 1440, height: 1200 });
await page.goto(page_, { waitUntil: 'networkidle2', timeout: 90000 });
await new Promise((r) => setTimeout(r, 5000));
const info = await page.evaluate(() => ({
  text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 700),
  textLen: document.body.innerText.length,
  imgs: [...document.images].length,
  brokenImgs: [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src.slice(0, 120)).slice(0, 10),
}));
console.log(JSON.stringify(info, null, 1));
await browser.close();
