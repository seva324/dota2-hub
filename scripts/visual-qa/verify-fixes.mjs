import puppeteer from 'puppeteer';

const VIEWPORT = { width: 402, height: 874, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport(VIEWPORT);
await page.setUserAgent(UA);

// ===== 1. /matches 行检查 =====
await page.goto('http://localhost:5173/#/matches', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 3500));
const matches = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('main button')].filter((b) => b.className.includes('grid') && b.className.includes('grid-cols-'));
  const out = [];
  for (const btn of btns.slice(0, 5)) {
    const r = btn.getBoundingClientRect();
    // 赛事名：找 truncate 且含赛事字样的元素（len>5）
    const textEls = [...btn.querySelectorAll('span,div')].filter((e) => e.children.length === 0 && (e.textContent || '').trim().length > 5);
    const truncated = textEls.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => (e.textContent || '').trim().slice(0, 20));
    // View Match 按钮
    const vm = [...btn.querySelectorAll('span')].find((e) => (e.textContent || '').trim() === 'View Match');
    const vmRect = vm ? vm.getBoundingClientRect() : null;
    // 右侧队名（行内最后一个文本元素）
    const allText = [...btn.querySelectorAll('span,div')].filter((e) => e.children.length === 0 && (e.textContent || '').trim());
    const last = allText[allText.length - 1];
    out.push({
      rowText: (btn.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 55),
      rowW: Math.round(r.width),
      truncated,
      vm: vmRect ? { x: Math.round(vmRect.left), right: Math.round(vmRect.right), inside: vmRect.right <= window.innerWidth } : null,
      lastText: last ? (last.textContent || '').trim().slice(0, 16) : null,
      lastW: last ? Math.round(last.getBoundingClientRect().width) : null,
    });
  }
  return { vw: window.innerWidth, out };
});
console.log('=== /matches rows ===');
console.log(JSON.stringify(matches, null, 1));

// 截图
await page.evaluate(() => window.scrollTo(0, 0));
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: 'scripts/visual-qa/artifacts/iphone17-matches-fixed.png' });

// ===== 2. match detail 对战栏检查 =====
await page.goto('http://localhost:5173/#/match/427581?slug=lgd-gaming-vs-1win-team-1win-essence-2', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 3500));
const detail = await page.evaluate(() => {
  const rect = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom) }; };
  // 第 N 场 + 它的信息行（新结构）
  const gameNo = [...document.querySelectorAll('span')].find((e) => /^第 \d+ 场$/.test((e.textContent || '').trim()));
  if (!gameNo) return { error: 'no gameNo' };
  const gnRect = rect(gameNo);
  // 同一 GameBlock 内的右队 logo
  const block = gameNo.closest('.overflow-hidden');
  const imgs = [...block.querySelectorAll('img')].map((e) => ({ alt: e.alt || '', ...rect(e) }));
  // 队名宽度
  const names = [...block.querySelectorAll('span')].filter((e) => /^[A-Z][A-Za-z ]{3,}$/.test((e.textContent || '').trim()) && e.className.includes('truncate')).map((e) => ({ text: (e.textContent || '').trim(), w: Math.round(e.getBoundingClientRect().width) }));
  // 检查 gameNo 与任何 img 是否重叠
  const overlaps = imgs.filter((im) => !(gnRect.right <= im.x || gnRect.x >= im.right || gnRect.bottom <= im.y || gnRect.y >= im.bottom));
  return { gameNo: gnRect, imgs, names, overlapsWithImgs: overlaps.map((o) => o.alt) };
});
console.log('\n=== match detail matchup bar ===');
console.log(JSON.stringify(detail, null, 1));
await page.screenshot({ path: 'scripts/visual-qa/artifacts/iphone17-matchdetail-fixed.png' });

await browser.close();
