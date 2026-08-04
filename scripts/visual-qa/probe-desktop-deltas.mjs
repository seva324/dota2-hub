import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

// 1) match detail 对战栏桌面测量
await page.goto('http://localhost:5173/#/match/427581?slug=lgd-gaming-vs-1win-team-1win-essence-2', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 5000));
const d = await page.evaluate(() => {
  const rect = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right) }; };
  const gameNo = [...document.querySelectorAll('span')].find((e) => /^第 \d+ 场$/.test((e.textContent || '').trim()));
  if (!gameNo) return { error: 'no gameNo' };
  const bar = gameNo.closest('.relative');
  const infoRow = gameNo.parentElement;
  const gameTime = [...infoRow.querySelectorAll('span')].find((e) => (e.textContent || '').includes('Game Time'));
  const kills = [...bar.querySelectorAll('span')].filter((e) => /^\d+$/.test((e.textContent || '').trim()));
  return {
    barHeight: Math.round(bar.getBoundingClientRect().height),
    gameNo: rect(gameNo),
    gameTime: gameTime ? rect(gameTime) : null,
    infoRow: rect(infoRow),
    kills: kills.slice(0, 2).map((k) => rect(k)),
    barTop: Math.round(bar.getBoundingClientRect().top),
  };
});
console.log('MATCH DETAIL desktop bar:', JSON.stringify(d, null, 1));

// 2) matches 桌面：各行中间列宽度是否一致
await page.goto('http://localhost:5173/#/matches', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 4000));
const m = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('main button')].filter((b) => b.className.includes('grid-cols-\\[1fr_auto_1fr\\]') || (b.className.includes('md:grid-cols') && b.className.includes('grid-cols-1')));
  // 桌面下取 md:grid-cols 生效的行
  const rows = btns.filter((b) => b.getBoundingClientRect().width > 700).slice(0, 4);
  return rows.map((b) => {
    const r = b.getBoundingClientRect();
    // 中间列 = 队伍区（含 VS/比分）：找含 'VS' 或 ': ' 的中间 flex
    const texts = [...b.querySelectorAll('span,div')].filter((e) => e.children.length === 0 && (e.textContent || '').trim());
    const vm = texts.find((e) => (e.textContent || '').trim() === 'View Match');
    const firstTeam = [...b.querySelectorAll('span')].find((e) => e.className.includes('text-\\[13px\\]') || (e.textContent||'').trim().length>3);
    const vmX = vm ? Math.round(vm.getBoundingClientRect().left) : null;
    return {
      rowW: Math.round(r.width),
      text: (b.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50),
      viewMatchX: vmX,
      // 队名元素（text-13px 或 truncate）
      teamNameEls: [...b.querySelectorAll('span')].filter((e) => e.className.includes('truncate') && (e.textContent||'').trim().length > 2).map((e) => ({ t: (e.textContent||'').trim(), w: Math.round(e.getBoundingClientRect().width) })).slice(0, 4),
    };
  });
});
console.log('\nMATCHES desktop rows:', JSON.stringify(m, null, 1));
await browser.close();
