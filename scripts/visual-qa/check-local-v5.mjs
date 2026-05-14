import puppeteer from 'puppeteer';
const b = await puppeteer.launch({headless:'new',args:['--no-sandbox']});
const p = await b.newPage();
await p.setViewport({width:1440,height:1100});
await p.goto('http://localhost:5174/?prototype=1',{waitUntil:'networkidle2',timeout:30000});
await new Promise(r=>setTimeout(r,4000));
// Check if match trigger exists
const btns = await p.evaluate(()=>{const r=[];for(const b of document.querySelectorAll('button'))r.push((b.className||'').slice(0,60));return r.slice(0,10)});
console.log('Buttons:',btns);
// Try to find match trigger
const hasMatch = await p.evaluate(()=>{for(const b of document.querySelectorAll('button')){if((b.textContent||'').includes('VS'))return true;}return false});
console.log('Has VS button:',hasMatch);
if(hasMatch){
  await p.evaluate(()=>{for(const b of document.querySelectorAll('button')){if((b.textContent||'').includes('VS')){b.click();return;}}});
  await new Promise(r=>setTimeout(r,2500));
  const cls = await p.evaluate(()=>{const d=document.querySelector('[data-slot="dialog-content"][data-state="open"]');return d?d.className:'none'});
  console.log('Modal FULL:',cls);
}
await b.close();
