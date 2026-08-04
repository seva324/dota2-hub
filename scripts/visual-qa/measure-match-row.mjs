import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 2400 });
await page.goto('http://localhost:5174/#/matches', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 6000));
const info = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('button')].filter(b => b.textContent?.includes('VS') && b.textContent?.includes('View Match'));
  const first = rows[0];
  if (!first) return { found: false };
  const rect = first.getBoundingClientRect();
  const center = rect.left + rect.width / 2;
  // 找 VS 元素
  const vs = [...first.querySelectorAll('span')].find(s => s.textContent?.trim() === 'VS');
  const vsRect = vs?.getBoundingClientRect();
  const vsCenter = vsRect ? vsRect.left + vsRect.width / 2 : null;
  return {
    found: true,
    rowWidth: Math.round(rect.width),
    rowCenter: Math.round(center),
    vsCenter: vsCenter ? Math.round(vsCenter) : null,
    offset: vsCenter ? Math.round(vsCenter - center) : null,
    imgSizes: [...first.querySelectorAll('img')].map(i => Math.round(i.getBoundingClientRect().width)),
  };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
