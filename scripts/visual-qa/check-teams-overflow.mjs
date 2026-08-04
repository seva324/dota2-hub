import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 375, height: 812 });
await page.goto('http://localhost:8804/#/teams', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 4000));
const result = await page.evaluate(() => {
  const vw = document.documentElement.clientWidth;
  const offenders = [];
  document.querySelectorAll('*').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 || r.left < -1) {
      const tag = el.tagName.toLowerCase();
      const cls = typeof el.className === 'string' ? el.className.slice(0, 80) : '';
      offenders.push({ tag, cls, left: Math.round(r.left), right: Math.round(r.right) });
    }
  });
  return JSON.stringify({ vw, count: offenders.length, top: offenders.slice(0, 12) });
});
console.log(result);
await browser.close();
