import puppeteer from 'puppeteer';

const VIEWPORT = { width: 402, height: 874, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport(VIEWPORT);
await page.setUserAgent(UA);
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 3500));

// 1) 主内容底部 padding / footer 与文档底
const layout = await page.evaluate(() => {
  const main = document.querySelector('main');
  const cs = main ? getComputedStyle(main) : null;
  const footer = [...document.querySelectorAll('footer')];
  const bodyPad = getComputedStyle(document.body).paddingBottom;
  return {
    docScrollH: document.documentElement.scrollHeight,
    vh: window.innerHeight,
    mainPadBottom: cs ? cs.paddingBottom : null,
    bodyPadBottom: bodyPad,
    footerCount: footer.length,
    footerText: footer.map((f) => f.textContent.trim().replace(/\s+/g, ' ').slice(0, 80)),
    footerRect: footer.length ? footer[0].getBoundingClientRect().toJSON() : null,
  };
});
console.log('LAYOUT:', JSON.stringify(layout, null, 1));

// 2) 滚到底，检查底部遮挡
await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
await new Promise((r) => setTimeout(r, 600));
const bottom = await page.evaluate(() => {
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  const atBottom = Math.abs(window.scrollY - maxScroll) < 5;
  // 底栏区域采样，看命中元素与其归属
  const points = [60, 200, 340];
  const hits = points.map((x) => {
    const el = document.elementFromPoint(x, window.innerHeight - 40);
    let owner = '';
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const cls = (n.className || '').toString();
      if (/footer|nav/i.test(cls)) { owner = n.tagName + '.' + cls.slice(0, 40); break; }
    }
    return { x, hit: `${el.tagName}.${(el.className || '').toString().slice(0, 40)}`, text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50), owner };
  });
  // 底部最后一个在 flow 中的内容元素
  const all = [...document.querySelectorAll('main *')].filter((e) => {
    const r = e.getBoundingClientRect();
    return r.bottom <= window.innerHeight && r.bottom > window.innerHeight - 120 && r.height > 0;
  }).map((e) => ({ tag: e.tagName, cls: (e.className || '').toString().slice(0, 40), text: (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50), bottom: Math.round(e.getBoundingClientRect().bottom) }));
  return { maxScroll, scrollY: window.scrollY, atBottom, hits, lastVisible: all.slice(-5) };
});
console.log('BOTTOM:', JSON.stringify(bottom, null, 1));
await browser.close();
