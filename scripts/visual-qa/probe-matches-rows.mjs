import puppeteer from 'puppeteer';

const VIEWPORT = { width: 402, height: 874, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport(VIEWPORT);
await page.setUserAgent(UA);
await page.goto('http://localhost:5173/#/matches', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 4000));

const rows = await page.evaluate(() => {
  // 所有赛程行：upcoming/completed 的 button 行
  const btns = [...document.querySelectorAll('main button')].filter((b) => b.className.includes('grid') && b.className.includes('grid-cols-'));
  const out = [];
  for (const btn of btns) {
    const r = btn.getBoundingClientRect();
    // 该行是否超宽
    const overflow = r.right > window.innerWidth || r.left < 0;
    // 该行内所有文本节点与是否被截断（scrollWidth > clientWidth）
    const textEls = [...btn.querySelectorAll('span,div')].filter((e) => e.children.length === 0 && (e.textContent || '').trim());
    const trunc = textEls.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => ({
      text: (e.textContent || '').trim().slice(0, 24),
      scrollW: e.scrollWidth, clientW: e.clientWidth,
    }));
    // 中间 TeamMatchup 区域宽度
    const matchup = btn.querySelector('.grid-cols-\\[1fr_auto_1fr\\] .flex.items-center, button .flex.items-center');
    // 右侧最后一个元素（View Match / 时间列）
    const allEls = [...btn.querySelectorAll('*')].filter((e) => e.children.length === 0 && (e.textContent || '').trim());
    const first = allEls[0], last = allEls[allEls.length - 1];
    out.push({
      rowText: (btn.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60),
      rowW: Math.round(r.width), rowRight: Math.round(r.right), vw: window.innerWidth, overflow,
      trunc,
      firstEl: first ? { t: (first.textContent || '').trim().slice(0, 16), x: Math.round(first.getBoundingClientRect().left) } : null,
      lastEl: last ? { t: (last.textContent || '').trim().slice(0, 16), x: Math.round(last.getBoundingClientRect().left), right: Math.round(last.getBoundingClientRect().right) } : null,
    });
  }
  return out;
});
console.log(JSON.stringify(rows, null, 1));
await browser.close();
