import puppeteer from 'puppeteer';

// Production end-to-end QA: open each surface, count broken images, check
// overlay geometry, verify interactions.
const BASE = 'http://dotahub.cn/';
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--ignore-certificate-errors'] });

async function newPage(viewport) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 120000 });
  await new Promise((r) => setTimeout(r, 8000));
  return page;
}

const results = {};

async function report(page, tag, sel) {
  const info = await page.evaluate((sel) => {
    const overlay = sel ? [...document.querySelectorAll(sel)].pop() : document.body;
    const scope = overlay || document.body;
    const imgs = [...scope.querySelectorAll('img')];
    const broken = imgs.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src.slice(0, 110));
    const r = scope === document.body ? null : scope.getBoundingClientRect();
    return {
      imgs: imgs.length,
      broken,
      rect: r ? [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] : null,
      text: (scope.innerText || '').replace(/\s+/g, ' ').slice(0, 90),
    };
  }, sel);
  results[tag] = info;
  console.log(tag, JSON.stringify({ imgs: info.imgs, brokenCount: info.broken.length, rect: info.rect }));
  if (info.broken.length) console.log('  broken:', info.broken);
}

// --- desktop ---
{
  const page = await newPage({ width: 1440, height: 2400 });
  await page.screenshot({ path: 'scripts/visual-qa/artifacts/prod/homepage.desktop.png' });
  await report(page, 'home-desktop', null);

  // open match detail via first completed match row or live card
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('button')) {
      const t = b.textContent || '';
      if (/查看全部直播|观看直播/.test(t)) continue;
    }
    const row = [...document.querySelectorAll('button')].find((b) => /VS|vs|:.{0,2}\d|\d\s*-\s*\d/.test(b.textContent || '') && (b.textContent || '').length < 120);
    row?.click();
  });
  await new Promise((r) => setTimeout(r, 5000));
  await report(page, 'match-overlay-desktop', '[data-visual-role="match-detail-page"],[data-visual-role="match-detail-modal"]');
  await page.screenshot({ path: 'scripts/visual-qa/artifacts/prod/match-detail.desktop.png' });
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 1200));

  // team flyout from rail
  await page.evaluate(() => { document.querySelector('[data-visual-role="team-flyout-trigger"]')?.click(); });
  await new Promise((r) => setTimeout(r, 6000));
  await report(page, 'team-flyout-desktop', '[data-visual-role="team-flyout"]');
  await page.screenshot({ path: 'scripts/visual-qa/artifacts/prod/team-flyout.desktop.png' });
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 1200));
  await page.close();
}

// --- mobile ---
{
  const page = await newPage({ width: 390, height: 1700, isMobile: true, hasTouch: true });
  await page.screenshot({ path: 'scripts/visual-qa/artifacts/prod/homepage.mobile.png' });
  await report(page, 'home-mobile', null);
  await page.close();
}

await browser.close();
console.log('done');
