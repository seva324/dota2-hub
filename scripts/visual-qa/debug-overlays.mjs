import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 400)));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 200));
});
const viewport = process.argv.includes('--mobile') ? { width: 390, height: 1400, isMobile: true, hasTouch: true } : { width: 1440, height: 1200 };
await page.setViewport(viewport);
await page.goto('http://localhost:5173/?prototype=1', { waitUntil: 'networkidle2', timeout: 90000 });
await new Promise((r) => setTimeout(r, 4000));

async function overlays(tag) {
  const o = await page.evaluate(() => {
    const els = [...document.querySelectorAll('[data-slot="sheet-content"],[data-slot="dialog-content"],[data-visual-role="match-detail-page"]')];
    return els
      .filter((e) => {
        const s = getComputedStyle(e);
        return s.display !== 'none' && s.visibility !== 'hidden' && e.getBoundingClientRect().width > 0;
      })
      .map((e) => ({
        role: e.getAttribute('data-slot') || e.getAttribute('data-visual-role'),
        rect: (() => { const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; })(),
        imgs: [...e.querySelectorAll('img')].length,
        broken: [...e.querySelectorAll('img')].filter((i) => i.complete && i.naturalWidth === 0).length,
        text: (e.innerText || '').replace(/\s+/g, ' ').slice(0, 100),
      }));
  });
  console.log(tag, JSON.stringify(o, null, 1));
}

await overlays('initial');

await page.evaluate(() => {
  for (const b of document.querySelectorAll('button')) {
    if ((b.textContent || '').includes('LIVE') && (b.textContent || '').includes('观看')) { b.click(); return; }
  }
});
await new Promise((r) => setTimeout(r, 3200));
await overlays('after-match-click');
await page.keyboard.press('Escape');
await new Promise((r) => setTimeout(r, 1200));

await page.evaluate(() => { document.querySelector('[data-visual-role="team-flyout-trigger"]')?.click(); });
await new Promise((r) => setTimeout(r, 3200));
await overlays('after-team-click');
await page.keyboard.press('Escape');
await new Promise((r) => setTimeout(r, 1200));

await page.evaluate(() => {
  const panels = [...document.querySelectorAll('div, section')];
  const heading = panels.find((el) => el.children.length <= 3 && (el.textContent || '').trim() === '人气选手');
  const btn = heading?.closest('div')?.parentElement?.querySelector('button');
  btn?.click();
});
await new Promise((r) => setTimeout(r, 3200));
await overlays('after-player-click');

await browser.close();
