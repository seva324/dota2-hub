import puppeteer from 'puppeteer';
import fs from 'node:fs';

const OUT = 'scripts/visual-qa/artifacts/local';
const BASE = 'http://localhost:5173/?prototype=1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function clickByText(page, selector, predicateText, { exact = false } = {}) {
  return page.evaluate(
    ({ selector, predicateText, exact }) => {
      const els = [...document.querySelectorAll(selector)];
      for (const el of els) {
        const t = (el.textContent || '').trim();
        if (exact ? t === predicateText : t.includes(predicateText)) {
          el.click();
          return t;
        }
      }
      return null;
    },
    { selector, predicateText, exact },
  );
}

async function snap(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  console.log('captured', name);
}

async function captureSurface(browser, viewport, suffix) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  const log = [];

  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 90000 });
  await sleep(4500);
  await snap(page, `homepage.${suffix}`);

  // Match detail: click first live match card (prototype data)
  const clickedMatch = await page.evaluate(() => {
    for (const b of document.querySelectorAll('button')) {
      if ((b.textContent || '').includes('LIVE') && (b.textContent || '').includes('观看')) {
        b.click();
        return 'live-card';
      }
    }
    for (const b of document.querySelectorAll('button')) {
      if ((b.textContent || '').includes('LIVE')) { b.click(); return 'live-simple'; }
    }
    return null;
  });
  log.push('match-click=' + clickedMatch);
  await sleep(6000);
  await page.waitForFunction(
    () => [...document.querySelectorAll('[data-visual-state]')].some((e) => e.getAttribute('data-visual-state') === 'ready'),
    { timeout: 15000 },
  ).catch(() => console.log('match-detail: ready state timeout'));
  await snap(page, `match-detail.${suffix}`);
  await page.keyboard.press('Escape');
  await sleep(1500);

  // Team flyout: right rail hot team with explicit trigger marker (Tundra)
  const clickedTeam = await page.evaluate(() => {
    const trigger = document.querySelector('[data-visual-role="team-flyout-trigger"]');
    if (trigger) { trigger.click(); return 'trigger'; }
    for (const b of document.querySelectorAll('button')) {
      const t = (b.textContent || '');
      if (t.includes('Tundra')) { b.click(); return 'tundra'; }
    }
    return null;
  });
  log.push('team-click=' + clickedTeam);
  await sleep(6000);
  await page.waitForFunction(
    () => [...document.querySelectorAll('[data-visual-state]')].some((e) => e.getAttribute('data-visual-state') === 'ready'),
    { timeout: 15000 },
  ).catch(() => console.log('team-flyout: ready state timeout'));
  await snap(page, `team-flyout.${suffix}`);
  await page.keyboard.press('Escape');
  await sleep(1500);

  // Player profile: click the Ame hot-player entry in right rail
  const clickedPlayer = await page.evaluate(() => {
    for (const b of document.querySelectorAll('button')) {
      const t = (b.textContent || '');
      if (/Ame/.test(t) && /XG/.test(t)) { b.click(); return t.replace(/\s+/g, ' ').slice(0, 40); }
    }
    return null;
  });
  log.push('player-click=' + clickedPlayer);
  await sleep(6000);
  await page.waitForFunction(
    () => [...document.querySelectorAll('[data-visual-state]')].some((e) => e.getAttribute('data-visual-state') === 'ready'),
    { timeout: 15000 },
  ).catch(() => console.log('player-profile: ready state timeout'));
  await snap(page, `player-profile.${suffix}`);

  console.log(log.join('  '));
  await page.close();
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

  console.log('--- desktop ---');
  await captureSurface(browser, { width: 1440, height: 2000 }, 'desktop');
  console.log('--- mobile ---');
  await captureSurface(browser, { width: 390, height: 1600, isMobile: true, hasTouch: true }, 'mobile');

  await browser.close();
  console.log('done');
}

main().catch((e) => { console.error(e); process.exit(1); });
