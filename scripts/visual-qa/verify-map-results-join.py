import re
import json

html = open('scripts/visual-qa/artifacts/dltv-match-427386.html', encoding='utf-8', errors='ignore').read()

p0 = html.find('"map_results"')
sstart = html.rfind('<script', 0, p0)
send = html.find('</script>', p0)
script = html[sstart:send]

si_start = script.find('series_item = ')
js = script[si_start + len('series_item = '):]
depth = 0
i = 0
in_str = False
esc = False
n = len(js)
while i < n:
    c = js[i]
    if in_str:
        if esc:
            esc = False
        elif c == '\\':
            esc = True
        elif c == '"':
            in_str = False
    else:
        if c == '"':
            in_str = True
        elif c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                break
    i += 1
data = json.loads(js[:i + 1])

print('=== maps[i] keys ===')
for m in data['maps']:
    keys = list(m.keys())
    has_mr = 'map_results' in keys
    has_mc = 'map_charts' in keys
    print(f'  steam={m["steam_id"]} keys={len(keys)} map_results={has_mr} map_charts={has_mc}')
    if has_mr:
        mr = m['map_results']
        print(f'    map_results len={len(mr)} teams={ {p.get("team_id") for p in mr} }')

print()
print('=== series_players join check ===')
sp_ids = {sp['player']['id'] for sp in data['series_players']}
print('series_players player ids:', sorted(sp_ids))
mr0 = data['maps'][0].get('map_results', [])
mr_ids = {p['player']['id'] for p in mr0}
print('map0 map_results player ids:', sorted(mr_ids))
print('overlap:', sorted(sp_ids & mr_ids))
# does a series_player have the same id as map_results player, with image + steam_id?
for sp in data['series_players']:
    pid = sp['player']['id']
    if pid in mr_ids:
        print(f'  join ok: player {pid} image={sp["player"].get("image")} steam_id={sp["player"].get("steam_id")} title={sp["player"].get("title")}')
        break
