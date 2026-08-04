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

m0 = data['maps'][0]
mr = m0['map_results']
print('=== map_results player top-level keys ===')
p0k = mr[0]
print(sorted(p0k.keys()))
print()
print('=== aghanims_scepter/shard shape ===')
print('scepter:', json.dumps(p0k.get('aghanims_scepter')))
print('shard:', json.dumps(p0k.get('aghanims_shard')))
print('neutral_item:', json.dumps(p0k.get('neutral_item')))
print()
print('=== does map_results player include avatar image? ===')
print('player.image present:', 'image' in p0k['player'], '| value:', p0k['player'].get('image'))
print('player steam_id present:', 'steam_id' in p0k['player'], '| value:', p0k['player'].get('steam_id'))
print('player.role present:', p0k['player'].get('role'))
print()
print('=== map_results hero image ===')
print('hero.image:', p0k['hero'].get('image'))
print('facet image:', (p0k.get('facet') or {}).get('image'))
print()
print('=== radiant_win / winner on map ===')
print('map winner:', m0.get('winner'))
print()
print('=== teams in map_results: team objects? ===')
print('team field present:', 'team' in p0k, json.dumps(p0k.get('team'))[:200])
