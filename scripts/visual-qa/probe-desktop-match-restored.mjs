import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.goto('http://localhost:5173/#/match/427581?slug=lgd-gaming-vs-1win-team-1win-essence-2', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 7000));

const d = await page.evaluate(() => {
  const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right) }; };
  // 找可见的（非 0 尺寸）第 N 场
  const gameNos = [...document.querySelectorAll('span')].filter((e) => /^第 \d+ 场$/.test((e.textContent || '').trim()));
  const visible = gameNos.filter((e) => e.getBoundingClientRect().width > 0);
  const gameNo = visible[0];
  if (!gameNo) return { error: 'no visible gameNo', total: gameNos.length };
  const parent = gameNo.parentElement;
  const bar = gameNo.closest('.relative');
  const gt = [...bar.querySelectorAll('span')].find((e) => (e.textContent || '').includes('Game Time'));
  const kills = [...bar.querySelectorAll('span')].filter((e) => /^\d+$/.test((e.textContent || '').trim())).slice(0, 2);
  const x = (el) => el ? Math.round(el.getBoundingClientRect().left) : null;
  return {
    visibleGameNos: gameNos.length,
    gameNoParentCls: (parent.className || '').toString().slice(0, 50),
    gameNoParentPos: getComputedStyle(parent).position,
    gameNoRect: rect(gameNo),
    barHeight: Math.round(bar.getBoundingClientRect().height),
    gameTimeRect: rect(gt),
    killsX: kills.map(x),
    // GameTime x 是否在两个 kills 之间（桌面原布局特征）
    gameTimeX: x(gt),
  };
});
console.log(JSON.stringify(d, null, 1));
await browser.close();
