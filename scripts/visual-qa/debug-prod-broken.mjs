import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--ignore-certificate-errors'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 2400 });

const failures = [];
page.on('requestfailed', (r) => {
  if (/png|webp|jpe?g|svg|asset-image/i.test(r.url())) failures.push(`FAILED ${decodeURIComponent(r.url()).slice(0, 200)}`);
});
page.on('response', (r) => {
  if (r.status() >= 400 && /asset-image|bo3-image|images\//.test(r.url())) failures.push(`${r.status()} ${decodeURIComponent(r.url()).slice(0, 200)}`);
});

await page.goto('http://dotahub.cn/', { waitUntil: 'networkidle2', timeout: 120000 });
await new Promise((r) => setTimeout(r, 7000));

await page.evaluate(() => {
  const row = [...document.querySelectorAll('button')].find((b) => /系列赛战报/.test(b.textContent || ''));
  row?.click();
});
await new Promise((r) => setTimeout(r, 6000));

const broken = await page.evaluate(() => {
  const overlays = [...document.querySelectorAll('[data-visual-role="match-detail-page"],[data-visual-role="match-detail-modal"]')];
  return overlays.map((o) => ({
    role: o.getAttribute('data-visual-role'),
    broken: [...o.querySelectorAll('img')]
      .filter((i) => i.complete && i.naturalWidth === 0)
      .map((i) => decodeURIComponent(i.src).slice(60, 200)),
  }));
});

console.log('network failures:'); failures.slice(0, 10).forEach((f) => console.log(' ', f));
console.log('overlay broken:', JSON.stringify(broken, null, 1));
await browser.close();
