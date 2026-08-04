import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.goto('http://localhost:5173/#/match/427581?slug=lgd-gaming-vs-1win-team-1win-essence-2', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 7000));

const info = await page.evaluate(() => {
  // 第一个 GameBlock：找含 '第 2 场' 的块（closest .overflow-hidden）
  const gameNo = [...document.querySelectorAll('span')].find((e) => /^第 \d+ 场$/.test((e.textContent || '').trim()));
  if (!gameNo) return { error: 'no gameNo at all' };
  const block = gameNo.closest('.overflow-hidden');
  const bar = block ? block.querySelector('.relative') : null;
  // 可见文本
  const visibleTexts = [...block.querySelectorAll('span')]
    .filter((e) => e.getBoundingClientRect().width > 0 && e.children.length === 0)
    .map((e) => ({ t: (e.textContent || '').trim(), w: Math.round(e.getBoundingClientRect().width) }))
    .slice(0, 15);
  // 可见的 img alt
  const visibleImgs = [...block.querySelectorAll('img')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.alt).slice(0, 4);
  // bar 的 className 与是否有 md:hidden / hidden md:flex 子块
  const childBlocks = bar ? [...bar.children].map((c) => ({ cls: (c.className || '').toString().slice(0, 60), display: getComputedStyle(c).display })) : [];
  return {
    blockFound: !!block,
    barClass: bar ? (bar.className || '').toString().slice(0, 60) : null,
    barHeight: bar ? Math.round(bar.getBoundingClientRect().height) : null,
    childBlocks,
    visibleTexts,
    visibleImgs,
  };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
