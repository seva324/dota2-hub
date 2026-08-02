import handler from '../api/events.js';
let statusCode = 0, headers = {}, body = null;
const req = { method: 'GET', query: { refresh: '1' }, headers: { host: 'localhost:5173' } };
const res = {
  setHeader(k, v) { headers[k] = v; },
  status(code) { statusCode = code; return this; },
  json(payload) { body = payload; },
  end() {},
};
const t0 = Date.now();
await handler(req, res);
console.log('elapsed:', Date.now() - t0, 'ms', '| status:', statusCode);
if (body) {
  const ev = body.events || {};
  console.log('counts — ongoing:', ev.ongoing?.length, 'upcoming:', ev.upcoming?.length, 'finished:', ev.finished?.length);
  console.log('source:', JSON.stringify(body.source));
  const o0 = ev.ongoing?.[0];
  const f0 = ev.finished?.[0];
  console.log('ongoing[0]:', JSON.stringify({ title: o0?.title, img: o0?.image?.slice(0, 70) }));
  console.log('finished[0]:', JSON.stringify({ title: f0?.title, img: f0?.image?.slice(0, 70) }));
  // verify images are proxied
  const proxied = ev.ongoing?.every(t => !t.image || t.image.includes('/api/asset-image') || t.image.includes('/images/mirror/'));
  console.log('all ongoing images proxied:', proxied);
}
