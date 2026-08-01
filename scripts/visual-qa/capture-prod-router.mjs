import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const OUT = join(ROOT, 'artifacts', 'visual-qa', 'router');
const BASE = process.env.SMOKE_BASE || 'https://dotahub.cn';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const MODULES = [
  { name: 'home', selector: null, url: `${BASE}/#/` },
  { name: 'tournaments-placeholder', selector: null, url: `${BASE}/#/tournaments` },
  { name: 'team-flyout', selector: '[role="dialog"]', url: `${BASE}/#/team/Team%20Spirit` },
  { name: 'player-flyout', selector: '[role="dialog"]', url: `${BASE}/#/player/898754153` },
  { name: 'match-detail', selector: '[role="dialog"]', url: `${BASE}/#/match/7777` },
];

const VIEWPORTS = {
  desktop: { width: 1440, height: 1000, deviceScaleFactor: 1 },
  mobile: { width: 390, height: 844, deviceScaleFactor: 2 },
};

const browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox', '--disable-gpu'] });
for (const mod of MODULES) {
  for (const [name, vp] of Object.entries(VIEWPORTS)) {
    const page = await browser.newPage();
    await page.setViewport(vp);
    try {
      await page.goto(mod.url, { waitUntil: 'networkidle2', timeout: 60000 });
      await page.evaluate(() => document.fonts?.ready);
      await new Promise(r => setTimeout(r, 3500));
      const dir = join(OUT, mod.name);
      mkdirSync(dir, { recursive: true });
      const fp = join(dir, `${name}.png`);
      const el = mod.selector ? await page.$(mod.selector) : null;
      if (el) await el.screenshot({ path: fp });
      else await page.screenshot({ path: fp, fullPage: false });
      console.log(`OK ${mod.name}/${name} -> ${fp}`);
    } catch (e) {
      console.log(`FAIL ${mod.name}/${name}: ${e.message}`);
    }
    await page.close();
  }
}
await browser.close();
