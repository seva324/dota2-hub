import puppeteer from 'puppeteer';
const b = await puppeteer.launch({headless:'new',args:['--no-sandbox']});
const p = await b.newPage();
await p.setViewport({width:1440,height:1100});
await p.goto('https://dotahub.cn',{waitUntil:'networkidle2',timeout:30000});
await new Promise(r=>setTimeout(r,4000));
await p.evaluate(()=>{for(const btn of document.querySelectorAll('button')){if((btn.className||'').includes('text-sm')&&(btn.className||'').includes('font-bold')){btn.click();return;}}});
await new Promise(r=>setTimeout(r,3000));
const found = await p.evaluate(()=>!!document.querySelector('[data-visual-role]'));
console.log('Deployed:', found);
if(found){const r=await p.evaluate(()=>Array.from(document.querySelectorAll('[data-visual-role]')).map(e=>e.getAttribute('data-visual-role')));console.log('Roles:',r);}
await b.close();
