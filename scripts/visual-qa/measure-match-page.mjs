import puppeteer from 'puppeteer';
import fs from 'node:fs';

const OUT = 'scripts/visual-qa/artifacts/match-page';
const BASE = 'http://localhost:5174/#/match/427386?slug=midas-club-vs-team-resilience-games-of-the-future-2026';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MEASURE_JS = `(() => {
  const classify = (el) => {
    const q = (sel) => el.querySelector(sel);
    const self = (sel) => el.matches && el.matches(sel);
    if (q('[class*="size-10"]') || self('[class*="size-10"]')) return 'hero';
    if (q('[class*="size-8"]') || self('[class*="size-8"]')) return 'avatar';
    if (el.className && String(el.className).includes('grid-cols-3')) return 'stats';
    if (q('[class*="size-6"]') || self('[class*="size-6"]')) return 'items';
    return 'name';
  };

  // game blocks = rounded-2xl containers that contain the md:grid-cols-2 player grid
  const blocks = [...document.querySelectorAll('div[class*="rounded-2xl"]')].filter(
    (b) => b.querySelector('div[class*="md:grid-cols-2"]')
  );
  if (!blocks.length) return { error: 'no game blocks' };
  const block = blocks[0];

  const innerGrid = block.querySelector('div[class*="md:grid-cols-2"]');
  const cols = [...innerGrid.children]; // [leftCol, rightCol]
  const colInfo = cols.map((col, ci) => {
    const rect = col.getBoundingClientRect();
    return { side: ci === 0 ? 'left' : 'right', left: Math.round(rect.left), right: Math.round(rect.right) };
  });
  const centerX = window.innerWidth / 2;

  const rows = [];
  cols.forEach((col, ci) => {
    const side = ci === 0 ? 'left' : 'right';
    const players = [...col.children].filter(
      (ch) => ch.className && String(ch.className).includes('md:flex-nowrap')
    );
    players.forEach((row, ri) => {
      const r = row.getBoundingClientRect();
      const children = [...row.children]
        .map((c) => {
          const cr = c.getBoundingClientRect();
          return { desc: classify(c), left: Math.round(cr.left), right: Math.round(cr.right), width: Math.round(cr.width) };
        })
        .sort((a, b) => a.left - b.left);

      const by = (d) => children.find((c) => c.desc === d) || null;
      const nameBlock = [...row.children].find(
        (c) => c.className && String(c.className).includes('min-w-0') && String(c.className).includes('flex-1')
      );
      const nameText = nameBlock ? nameBlock.querySelector('.truncate') : null;
      const nameTextLeft = nameText ? Math.round(nameText.getBoundingClientRect().left) : null;

      const items = by('items');
      const stats = by('stats');
      rows.push({
        side,
        row: ri + 1,
        height: Math.round(r.height),
        heroLeft: by('hero') && by('hero').left,
        avatarLeft: by('avatar') && by('avatar').left,
        nameLeft: nameTextLeft,
        statsLeft: stats && stats.left,
        itemsRight: items && items.right,
        itemsLeft: items && items.left,
        order: children.map((c) => c.desc).join(' -> '),
        mirrored: side === 'right'
          ? !!items && !!stats && items.left < stats.left
          : !!items && !!stats && items.right > stats.left,
      });
    });
  });

  const bg = (sel) => {
    const el = block.querySelector(sel) || block;
    return getComputedStyle(el).backgroundColor;
  };

  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    centerX: Math.round(centerX),
    cols: colInfo,
    rows,
    colors: {
      headerBar: bg('div[class*="border-b"][class*="bg-white"]'),
      gameBlock: getComputedStyle(block).backgroundColor,
      playerGrid: getComputedStyle(innerGrid).backgroundColor,
      sampleRow: (() => {
        const row = innerGrid.querySelector('div[class*="md:flex-nowrap"]');
        return row ? getComputedStyle(row).backgroundColor : null;
      })(),
      body: getComputedStyle(document.body).backgroundColor,
    },
  };
})()`;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 2000 });
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 90000 });
  await page.waitForFunction(
    () => document.querySelectorAll('div[class*="rounded-2xl"]').length >= 3,
    { timeout: 20000 },
  ).catch(() => console.log('game blocks wait timeout'));
  await sleep(6000);

  const data = await page.evaluate(MEASURE_JS);
  if (data.error) { console.error(data.error); process.exit(1); }

  // fresh desktop screenshot
  await page.screenshot({ path: `${OUT}/match-page.desktop.png`, fullPage: true });
  console.log('captured fresh desktop screenshot');

  console.log('=== viewport ===', JSON.stringify(data.viewport), 'centerX:', data.centerX);
  console.log('=== columns ===', JSON.stringify(data.cols));

  console.log('=== colors ===');
  console.log('  header bar :', data.colors.headerBar);
  console.log('  game block :', data.colors.gameBlock);
  console.log('  player grid:', data.colors.playerGrid);
  console.log('  sample row :', data.colors.sampleRow);
  console.log('  body       :', data.colors.body);

  console.log('=== game block 1 rows ===');
  for (const row of data.rows) {
    console.log(
      `[${row.side} #${row.row}] h=${row.height}px | heroL=${row.heroLeft} avatarL=${row.avatarLeft} nameL=${row.nameLeft} statsL=${row.statsLeft} itemsR=${row.itemsRight} (itemsL=${row.itemsLeft}) | mirror=${row.mirrored}`,
    );
    console.log(`    order L->R: ${row.order}`);
  }

  await browser.close();
  console.log('done');
}

main().catch((e) => { console.error(e); process.exit(1); });
