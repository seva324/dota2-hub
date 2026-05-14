import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = 'C:\\Users\\MOGEEEEEE\\Dotahub';
const OUT = join(ROOT, 'artifacts', 'visual-qa');
const BASE = 'http://localhost:5173';

const CHROME_EXE = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const MODULES = [
  {
    module: 'team-flyout',
    selector: '[data-state="open"][role="dialog"]',
    url: `${BASE}/?prototype=1&devTeam=1`,
  },
  {
    module: 'player-profile',
    selector: '[role="dialog"]',
    url: `${BASE}/?prototype=1&devPlayer=1`,
  },
  {
    module: 'match-detail',
    selector: '[role="dialog"]',
    url: `${BASE}/?prototype=1&devMatch=1`,
  },
];

const VIEWPORTS = {
  desktop: { width: 1440, height: 1000, deviceScaleFactor: 1 },
  mobile: { width: 390, height: 844, deviceScaleFactor: 2 },
};

async function main() {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: CHROME_EXE,
    args: ['--no-sandbox', '--disable-gpu'],
  });

  for (const mod of MODULES) {
    for (const [name, vp] of Object.entries(VIEWPORTS)) {
      const page = await browser.newPage();
      await page.setViewport(vp);

      console.log(`Loading ${mod.module} ${name}...`);
      await page.goto(mod.url, { waitUntil: 'networkidle0', timeout: 60000 });

      // Wait for fonts, images, animations to settle
      await page.evaluate(() => document.fonts?.ready);
      await new Promise(r => setTimeout(r, 4000));

      let el;
      if (mod.selector) {
        el = await page.$(mod.selector);
      }

      const dir = join(OUT, mod.module);
      mkdirSync(dir, { recursive: true });
      const filepath = join(dir, `${name}-actual.png`);

      if (el) {
        await el.screenshot({ path: filepath });
      } else {
        console.warn(`  WARN: selector "${mod.selector}" not found, capturing full page`);
        await page.screenshot({ path: filepath, fullPage: false });
      }

      console.log(`  -> ${filepath}`);
      await page.close();
    }
  }

  await browser.close();
  console.log('All screenshots done.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
