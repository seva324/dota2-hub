import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 2400 });
await page.goto('http://localhost:5174/#/matches', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 6000));
const info = await page.evaluate(() => {
  // Upcoming 行数 (VS 按钮)
  const upcomingRows = [...document.querySelectorAll('button')].filter(b => b.textContent?.includes('VS') && b.textContent?.includes('View Match')).length;
  // 展开按钮
  const expandBtns = [...document.querySelectorAll('button')].filter(b => b.textContent?.includes('展开更多') || b.textContent?.includes('收起')).map(b => b.textContent?.trim());
  // Completed filter
  const dateBtns = [...document.querySelectorAll('button')].filter(b => b.textContent?.trim() === 'Today' || /^\d{1,2}-\d{1,2}$/.test(b.textContent?.trim() || '')).map(b => b.textContent?.trim());
  const customBtn = [...document.querySelectorAll('button')].filter(b => b.textContent?.includes('自定义日期')).map(b => b.textContent?.trim());
  const select = document.querySelector('select');
  return { upcomingRows, expandBtns, dateBtns, customBtn, tournamentSelect: select ? select.textContent?.trim().slice(0, 40) : null };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
