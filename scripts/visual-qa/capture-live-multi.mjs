import puppeteer from 'puppeteer';
import fs from 'node:fs';

const OUT = 'scripts/visual-qa/artifacts/local';
fs.mkdirSync(OUT, { recursive: true });

// 6 fake live matches, mixed team-name lengths + league line lengths, to reproduce multi-card layout
const FAKE = Array.from({ length: 6 }).map((_, i) => {
  const teams = [
    ['YeS', 'Team Resilience'],
    ['Natus Vincere', 'Team Spirit'],
    ['G2 x iG', 'XG'],
    ['Team Falcons', 'Tundra Esports'],
    ['Aurora Gaming', 'PSG.LGD'],
    ['9 Pandas', 'Team Liquid'],
  ][i];
  const leagues = [
    'Games of the Future 2026',
    'The International 2026 · Group Stage',
    'DreamLeague Season 27',
    'PGL Wallachia Season 4 — Main Event Playoffs',
  ];
  return {
    source: 'mock',
    leagueName: leagues[i % leagues.length],
    stage: i % 2 === 0 ? null : 'Playoffs',
    bestOf: 'BO3',
    seriesScore: `${Math.floor(i / 2)} : ${i % 2}`,
    live: true,
    teams: teams.map((name, j) => ({ side: j === 0 ? 'team1' : 'team2', name })),
    maps: [
      { matchId: 400000 + i, label: `Map ${i + 1}`, status: 'completed', team1Score: 10 + i, team2Score: 8 },
      { matchId: 500000 + i, label: `Map ${i + 1}`, status: 'live', team1Score: 42 + i, team2Score: 35 + i, gameTime: 1800 + i * 60 },
    ],
    liveMap: {
      matchId: 500000 + i,
      label: `Map ${i + 1}`,
      status: 'live',
      gameTime: 1800 + i * 60,
      team1Score: 42 + i,
      team2Score: 35 + i,
      team1NetWorthLead: i % 2 === 0 ? 3200 + i * 100 : -2800 - i * 100,
      team1TotalGold: 40000 + i * 1000,
      team2TotalGold: 38000 + i * 1000,
    },
  };
});

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.evaluateOnNewDocument((fake) => {
  const origFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.includes('/api/live-hero')) {
      return Promise.resolve(new Response(JSON.stringify({ liveMatches: fake }), { status: 200, headers: { 'content-type': 'application/json' } }));
    }
    return origFetch(input, init);
  };
}, FAKE);

await page.goto('http://localhost:5174/#/matches', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 3500));

const measure = await page.evaluate(() => {
  const items = Array.from(document.querySelectorAll('[data-slot="carousel-item"]'));
  const btns = items.map((it) => it.querySelector('button'));
  return {
    url: location.href,
    slideCount: items.length,
    slideWidths: items.map((el) => Math.round(el.getBoundingClientRect().width)),
    btnWidths: btns.map((b) => b && Math.round(b.getBoundingClientRect().width)),
    btnHeights: btns.map((b) => b && Math.round(b.getBoundingClientRect().height)),
    uniformWidth: items.every((el, i) => btns[i] && Math.round(btns[i].getBoundingClientRect().width) === Math.round(el.getBoundingClientRect().width)),
    btnFillsSlide: items.every((el, i) => btns[i] && Math.abs(btns[i].getBoundingClientRect().width - el.getBoundingClientRect().width) <= 1),
    viewport: window.innerWidth,
    containerW: Math.round((document.querySelector('[data-slot="carousel-content"] > div')?.getBoundingClientRect().width) || 0),
  };
});
console.log('MEASURE:', JSON.stringify(measure, null, 2));

await page.screenshot({ path: `${OUT}/live-multi-desktop.png` });

// 验证滑动仍可用：容器可滚动，且滚动后卡片内容平移（第二页可见）
const scrollCheck = await page.evaluate(async () => {
  const content = document.querySelector('[data-slot="carousel-content"]');
  const scrollable = content.scrollWidth > content.clientWidth;
  const firstItemLeftBefore = document.querySelector('[data-slot="carousel-item"]').getBoundingClientRect().x;
  content.scrollBy({ left: 420, behavior: 'instant' });
  await new Promise((r) => setTimeout(r, 300));
  const firstItemLeftAfter = document.querySelector('[data-slot="carousel-item"]').getBoundingClientRect().x;
  return { scrollable, scrolled: firstItemLeftBefore !== firstItemLeftAfter, before: Math.round(firstItemLeftBefore), after: Math.round(firstItemLeftAfter) };
});
console.log('SCROLL-CHECK:', JSON.stringify(scrollCheck));

await page.setViewport({ width: 1280, height: 900 });
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: `${OUT}/live-multi-1280.png` });

await browser.close();
console.log('done');
