const marker = 'series_item = ';
const r = await fetch('https://dltv.org/matches/427386', {
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Dota2Hub/1.0)' },
});
const text = await r.text();
console.log('status:', r.status, 'len:', text.length, 'has marker:', text.includes(marker));

const start = text.indexOf(marker);
const src = text.slice(start + marker.length);
let depth = 0;
let i = 0;
let ins = false;
let esc = false;
while (i < src.length) {
  const c = src[i];
  if (ins) {
    if (esc) esc = false;
    else if (c === '\\') esc = true;
    else if (c === '"') ins = false;
  } else if (c === '"') ins = true;
  else if (c === '{') depth += 1;
  else if (c === '}') {
    depth -= 1;
    if (depth === 0) break;
  }
  i += 1;
}
const raw = JSON.parse(src.slice(0, i + 1));
console.log('keys:', Object.keys(raw));
console.log('id:', raw.id);
console.log('maps count:', raw.maps?.length);
console.log('first_team:', raw.first_team?.title, '| second:', raw.second_team?.title);
console.log('event:', raw.event?.title);
if (raw.maps?.length) {
  const m = raw.maps[0];
  console.log('map0 label:', m.label, '| steam:', m.steam_id, '| results len:', m.map_results?.length);
}
