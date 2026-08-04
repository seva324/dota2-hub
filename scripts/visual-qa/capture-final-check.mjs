import puppeteer from 'puppeteer';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const URL = 'http://localhost:5173/#/match/427581?slug=lgd-gaming-vs-1win-team-1win-essence-2';
const MURL = 'http://localhost:5173/#/matches';

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

// 桌面 match detail
let p = await browser.newPage();
await p.setViewport({ width: 1440, height: 900 });
await p.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 5000));
await p.screenshot({ path: 'scripts/visual-qa/artifacts/desktop-matchdetail-restored.png' });
console.log('captured desktop-matchdetail-restored');
await p.close();

// 移动 match detail
p = await browser.newPage();
await p.setViewport({ width: 402, height: 874, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await p.setUserAgent(UA);
await p.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 5000));
await p.screenshot({ path: 'scripts/visual-qa/artifacts/iphone17-matchdetail-fixed2.png' });
console.log('captured iphone17-matchdetail-fixed2');
await p.close();

// 移动 matches
p = await browser.newPage();
await p.setViewport({ width: 402, height: 874, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await p.setUserAgent(UA);
await p.goto(MURL, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 4000));
await p.screenshot({ path: 'scripts/visual-qa/artifacts/iphone17-matches-fixed2.png' });
console.log('captured iphone17-matches-fixed2');
await p.close();

await browser.close();
