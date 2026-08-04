import puppeteer from 'puppeteer';

// TeamFlyout + PlayerProfile on production with real data.
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--ignore-certificate-errors'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 2400 });
await page.goto('http://dotahub.cn/', { waitUntil: 'networkidle2', timeout: 120000 });
await new Promise((r) => setTimeout(r, 8000));

// click first hot-team button in right rail (热门战队 panel)
const clickedTeam = await page.evaluate(() => {
  const heading = [...document.querySelectorAll('h2')].find((h) => (h.textContent || '').includes('热门战队'));
  const panel = heading?.closest('section');
  const btn = panel ? [...panel.querySelectorAll('button')].find((b) => b.querySelector('img')) : null;
  if (btn) { const t = btn.textContent; btn.click(); return t; }
  return null;
});
console.log('team click:', clickedTeam);
await new Promise((r) => setTimeout(r, 7000));

const team = await page.evaluate(() => {
  const sheet = [...document.querySelectorAll('[data-visual-role="team-flyout"]')].pop();
  if (!sheet) return null;
  const imgs = [...sheet.querySelectorAll('img')];
  return {
    imgs: imgs.length,
    broken: imgs.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src.slice(0, 120)),
    text: (sheet.innerText || '').replace(/\s+/g, ' ').slice(0, 200),
  };
});
console.log('team-flyout:', JSON.stringify(team, null, 1));
await page.screenshot({ path: 'scripts/visual-qa/artifacts/prod/team-flyout.desktop.png' });

// open player from team flyout roster (player-profile-trigger or first roster button)
const clickedPlayer = await page.evaluate(() => {
  const sheet = [...document.querySelectorAll('[data-visual-role="team-flyout"]')].pop();
  if (!sheet) return null;
  const trigger = sheet.querySelector('[data-visual-role="player-profile-trigger"]');
  if (trigger) { trigger.click(); return 'trigger'; }
  const btn = [...sheet.querySelectorAll('button')].find((b) => (b.textContent || '').trim().length > 0 && (b.textContent || '').trim().length < 30);
  btn?.click();
  return btn ? (btn.textContent || '').slice(0, 30) : null;
});
console.log('player click:', clickedPlayer);
await new Promise((r) => setTimeout(r, 7000));
const player = await page.evaluate(() => {
  const el = [...document.querySelectorAll('[data-visual-role="player-profile-flyout"]')].pop();
  if (!el) return null;
  const imgs = [...el.querySelectorAll('img')];
  return {
    imgs: imgs.length,
    broken: imgs.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src.slice(0, 120)),
    text: (el.innerText || '').replace(/\s+/g, ' ').slice(0, 160),
  };
});
console.log('player-profile:', JSON.stringify(player, null, 1));
await page.screenshot({ path: 'scripts/visual-qa/artifacts/prod/player-profile.desktop.png' });
await browser.close();
