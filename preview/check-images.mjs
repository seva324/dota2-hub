import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.goto('http://127.0.0.1:8801/news.html', { waitUntil: 'networkidle0', timeout: 30000 });
await new Promise((r) => setTimeout(r, 1500));

const result = await page.evaluate(() => {
  const imgs = [...document.querySelectorAll('img')];
  return {
    total: imgs.length,
    loaded: imgs.filter(i => i.complete && i.naturalWidth > 0).length,
    failed: imgs.filter(i => !(i.complete && i.naturalWidth > 0)).length,
    failures: imgs.filter(i => !(i.complete && i.naturalWidth > 0)).slice(0, 10).map(i => i.src.slice(0, 60)),
  };
});
console.log(JSON.stringify(result, null, 2));
await browser.close();
