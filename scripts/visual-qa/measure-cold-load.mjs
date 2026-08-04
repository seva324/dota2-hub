// 生产冷启动首屏计时：home(Live/upcoming/results)、match detail、tournaments、teams
// 用法：node scripts/visual-qa/measure-cold-load.mjs
// 输出 JSON 到 stdout：每条路径的 domReady、contentVisible（首个内容区块出现）、以及 API 逐项耗时。
import puppeteer from 'puppeteer';

const BASE = 'https://dotahub.cn';
const ROUTES = {
  home: BASE + '/',
  match: BASE + '/#/match/427386?slug=midas-club-vs-team-resilience-games-of-the-future-2026',
  tournaments: BASE + '/#/tournaments',
  teams: BASE + '/#/teams',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

async function instrument() {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 2000 });
  await page.evaluateOnNewDocument(() => {
    window.__api = [];
    const origFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input.url;
      const start = performance.now();
      return origFetch(input, init).then(async (res) => {
        const clone = res.clone();
        try { await clone.text(); } catch {}
        window.__api.push({ url, ms: Math.round(performance.now() - start), status: res.status });
        return res;
      }).catch((e) => { window.__api.push({ url, ms: Math.round(performance.now() - start), error: String(e) }); throw e; });
    };
  });
  return page;
}

async function measure(name, url, contentTest) {
  const page = await instrument();
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  const domReady = Date.now() - t0;

  let contentMs = null;
  for (let i = 0; i < 60; i++) {
    const ok = await page.evaluate(contentTest);
    if (ok) { contentMs = Date.now() - t0; break; }
    await sleep(250);
  }

  const api = await page.evaluate(() => window.__api || []);
  console.log(`\n=== ${name} ===`);
  console.log(`domReady: ${domReady}ms, contentVisible: ${contentMs}ms`);
  for (const c of [...api].sort((a, b) => a.ms - b.ms)) {
    console.log(`  ${c.url} -> ${c.ms}ms status=${c.status}${c.error ? ' ERROR=' + c.error : ''}`);
  }
  await page.close();
  return { domReady, contentMs, api };
}

await measure('HOME (live/upcoming/results)', ROUTES.home, () => {
  const t = document.body.innerText;
  return t.includes('Recent Results') || t.includes('Live Matches') || t.includes('暂无比赛结果') || t.includes('最新赛况');
});

await measure('MATCH DETAIL', ROUTES.match, () => {
  const t = document.body.innerText.replace(/\s+/g, ' ');
  return !t.includes('正在加载比赛详情') && (/Midas Club|MOUZ|Team Resilience/.test(t));
});

await measure('TOURNAMENTS', ROUTES.tournaments, () => {
  const t = document.body.innerText;
  return t.includes('赛事') && (t.includes('Blast') || t.includes('PGL') || t.includes('DreamLeague') || t.includes('赛事列表'));
});

await measure('TEAMS', ROUTES.teams, () => {
  const t = document.body.innerText;
  return t.includes('战队') && /Tundra|Xtreme|Spirit|Team/.test(t);
});

await browser.close();
console.log('\ndone');
