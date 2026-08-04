import puppeteer from 'puppeteer';

const VIEWPORT = { width: 402, height: 874, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport(VIEWPORT);
await page.setUserAgent(UA);
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 3000));

const probe = async (scrollY) => {
  await page.evaluate((y) => window.scrollTo(0, y), scrollY);
  await new Promise((r) => setTimeout(r, 500));
  return page.evaluate(() => {
    const vh = window.innerHeight;
    const fixed = [];
    document.querySelectorAll('*').forEach((e) => {
      const s = getComputedStyle(e);
      if (s.position === 'fixed' || s.position === 'sticky') {
        const r = e.getBoundingClientRect();
        if (r.height > 0) {
          fixed.push({
            tag: e.tagName,
            cls: (e.className || '').toString().slice(0, 70),
            pos: s.position,
            top: Math.round(r.top), bottom: Math.round(r.bottom),
            h: Math.round(r.height), z: s.zIndex,
            text: (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60),
          });
        }
      }
    });
    return { vh, scrollY: window.scrollY, fixed };
  });
};

console.log('--- at top (scrollY=0) ---');
console.log(JSON.stringify(await probe(0), null, 1));

console.log('--- at results (scrollY=2041) ---');
const r = await probe(2041);
console.log(JSON.stringify(r, null, 1));

// 若有 fixed 底部元素，检查它与内容的重叠：找 elementFromPoint 在底栏区域命中的元素
if (r.fixed.length) {
  const overlap = await page.evaluate(() => {
    const vh = window.innerHeight;
    const results = [];
    // 采样底栏中部几个点，看命中什么
    for (const x of [60, 200, 340]) {
      const el = document.elementFromPoint(x, vh - 30);
      const r = el ? el.getBoundingClientRect() : null;
      results.push({
        x, hit: el ? `${el.tagName}.${(el.className || '').toString().slice(0, 40)}` : '(none)',
        text: el && el.textContent ? el.textContent.trim().replace(/\s+/g, ' ').slice(0, 40) : '',
        rect: r ? { top: Math.round(r.top), bottom: Math.round(r.bottom) } : null,
      });
    }
    return results;
  });
  console.log('--- elementFromPoint under bottom bar ---');
  console.log(JSON.stringify(overlap, null, 1));
}
await browser.close();
