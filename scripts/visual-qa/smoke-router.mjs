import puppeteer from 'puppeteer-core';
const BASE = 'http://localhost:5173';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox'] });
const results = [];
async function check(name, fn) {
  try { await fn(); results.push(`PASS ${name}`); }
  catch (e) { results.push(`FAIL ${name}: ${e.message}`); }
}
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000 });

await check('homepage loads', async () => {
  await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('nav[aria-label="主导航"]', { timeout: 10000 });
  const body = await page.evaluate(() => document.body.innerText);
  if (!body.includes('DotaHub')) throw new Error('no DotaHub brand');
});

await check('nav to tournaments changes hash', async () => {
  const buttons = await page.$$('nav[aria-label="主导航"] button');
  for (const b of buttons) {
    const txt = await b.evaluate(el => el.textContent);
    if (txt && txt.includes('赛事')) { await b.click(); break; }
  }
  await new Promise(r => setTimeout(r, 300));
  const hash = await page.evaluate(() => location.hash);
  if (hash !== '#/tournaments') throw new Error(`hash=${hash}`);
});

await check('placeholder page shows', async () => {
  const body = await page.evaluate(() => document.body.innerText);
  if (!body.includes('赛事') || !body.includes('返回首页')) throw new Error('no placeholder');
});

await check('back to home', async () => {
  const buttons = await page.$$('button');
  for (const b of buttons) {
    const txt = await b.evaluate(el => el.textContent);
    if (txt && txt.includes('返回首页')) { await b.click(); break; }
  }
  await new Promise(r => setTimeout(r, 300));
  const hash = await page.evaluate(() => location.hash);
  if (hash !== '#/') throw new Error(`hash=${hash}`);
});

await check('match deep link opens overlay', async () => {
  await page.goto(`${BASE}/#/match/7777`, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 2000));
  const hash = await page.evaluate(() => location.hash);
  if (hash !== '#/match/7777') throw new Error(`hash=${hash}`);
  const body = await page.evaluate(() => document.body.innerText);
  if (!body.includes('比赛详情') && !body.includes('7777')) {
    // MatchDetail may show team names; just confirm an overlay dialog exists
    const hasDialog = await page.$('[role="dialog"]');
    if (!hasDialog) throw new Error('no match overlay');
  }
});

await check('team deep link opens flyout', async () => {
  await page.goto(`${BASE}/#/team/Team%20Spirit`, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 2500));
  const hasDialog = await page.$('[role="dialog"]');
  if (!hasDialog) throw new Error('no team flyout dialog');
});

await check('player deep link opens flyout', async () => {
  await page.goto(`${BASE}/#/player/898754153`, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 2500));
  const hasDialog = await page.$('[role="dialog"]');
  if (!hasDialog) throw new Error('no player flyout dialog');
});

console.log(results.join('\n'));
await browser.close();
const failed = results.filter(r => r.startsWith('FAIL')).length;
process.exit(failed ? 1 : 0);
