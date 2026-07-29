import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
await page.setViewport({ width: 1440, height: 1200 });
await page.goto('http://localhost:5173/?prototype=1', { waitUntil: 'networkidle2', timeout: 90000 });
await new Promise((r) => setTimeout(r, 4000));

// open team flyout, inspect broken images
await page.evaluate(() => { document.querySelector('[data-visual-role="team-flyout-trigger"]')?.click(); });
await new Promise((r) => setTimeout(r, 3200));
const teamInfo = await page.evaluate(() => {
  const sheet = [...document.querySelectorAll('[data-visual-role="team-flyout"]')].pop();
  if (!sheet) return null;
  return {
    broken: [...sheet.querySelectorAll('img')].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src.slice(0, 160)),
    total: sheet.querySelectorAll('img').length,
  };
});
console.log('team-flyout imgs:', JSON.stringify(teamInfo, null, 1));
await page.keyboard.press('Escape');
await new Promise((r) => setTimeout(r, 1500));

// open player profile by exact button text contains Ame
const clicked = await page.evaluate(() => {
  for (const b of document.querySelectorAll('button')) {
    const t = (b.textContent || '');
    if (/Ame/.test(t) && /XG/.test(t)) { b.click(); return t.replace(/\s+/g, ' ').slice(0, 40); }
  }
  return null;
});
console.log('clicked:', clicked);
await new Promise((r) => setTimeout(r, 3500));
const info = await page.evaluate(() => {
  const els = [...document.querySelectorAll('[data-slot="sheet-content"],[data-slot="dialog-content"],[data-visual-role="player-profile-flyout"]')];
  return els
    .filter((e) => { const s = getComputedStyle(e); return s.display !== 'none' && e.getBoundingClientRect().width > 0; })
    .map((e) => ({
      role: e.getAttribute('data-visual-role') || e.getAttribute('data-slot'),
      broken: [...e.querySelectorAll('img')].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src.slice(0, 120)),
      text: (e.innerText || '').replace(/\s+/g, ' ').slice(0, 120),
    }));
});
console.log('overlays:', JSON.stringify(info, null, 1));
await browser.close();
