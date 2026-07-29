import puppeteer from 'puppeteer';

// Dump internal layout of an overlay surface after opening it.
// usage: node dump-overlay.mjs <desktop|mobile> <match|team|player>
const [, , vpArg = 'desktop', surface = 'match'] = process.argv;

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
const mobile = vpArg === 'mobile';
await page.setViewport(mobile ? { width: 390, height: 1600, isMobile: true, hasTouch: true } : { width: 1440, height: 2400 });
await page.goto('http://localhost:5173/?prototype=1', { waitUntil: 'networkidle2', timeout: 90000 });
await new Promise((r) => setTimeout(r, 4000));

async function clickMatch() {
  return page.evaluate(() => {
    for (const b of document.querySelectorAll('button')) {
      const t = b.textContent || '';
      if (t.includes('LIVE') && t.includes('观看')) { b.click(); return 'ok'; }
    }
    return null;
  });
}
async function clickTeam() {
  return page.evaluate(() => { document.querySelector('[data-visual-role="team-flyout-trigger"]')?.click(); return 'ok'; });
}
async function clickPlayer() {
  return page.evaluate(() => {
    for (const b of document.querySelectorAll('button')) {
      const t = b.textContent || '';
      if (/Ame/.test(t) && /XG/.test(t)) { b.click(); return 'ok'; }
    }
    return null;
  });
}

const clicks = { match: clickMatch, team: clickTeam, player: clickPlayer };
console.log('click:', await clicks[surface]());
await new Promise((r) => setTimeout(r, 6000));

const tree = await page.evaluate(() => {
  const roots = [...document.querySelectorAll('[data-visual-role="match-detail-page"],[data-visual-role="team-flyout"],[data-visual-role="player-profile-flyout"]')];
  const root = roots.pop();
  if (!root) return 'NO OVERLAY OPEN: ' + document.title;
  const out = [];
  const MIN_AREA = 1500;
  const walk = (el, depth) => {
    if (depth > 8) return;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    if (r.width * r.height >= MIN_AREA && s.display !== 'none') {
      const cls = (typeof el.className === 'string' ? el.className : '').split(' ').filter(Boolean).slice(0, 4).join(' ');
      const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(' ').slice(0, 36);
      out.push(`${'  '.repeat(depth)}${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)} ${cls}${own ? '  "' + own + '"' : ''}`);
      for (const c of el.children) walk(c, depth + 1);
    }
  };
  walk(root, 0);
  return out.join('\n');
});
console.log(tree);
await browser.close();
