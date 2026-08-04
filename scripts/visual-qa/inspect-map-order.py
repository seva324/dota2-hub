import json, re, sys

path = r'C:\Users\MOGEEEEEE\Dotahub\scripts\visual-qa\artifacts\dltv-match-427386.html'
html = open(path, encoding='utf-8').read()
marker = 'series_item = '
start = html.find(marker)
src = html[start + len(marker):]

# Bracket matching
depth = 0
i = 0
in_str = False
escaped = False
while i < len(src):
    c = src[i]
    if in_str:
        if escaped:
            escaped = False
        elif c == '\\':
            escaped = True
        elif c == '"':
            in_str = False
    elif c == '"':
        in_str = True
    elif c == '{':
        depth += 1
    elif c == '}':
        depth -= 1
        if depth == 0:
            break
    i += 1

raw = json.loads(src[:i+1])

maps = raw['maps']
print('maps count:', len(maps))
for idx, m in enumerate(maps):
    print(f"--- map[{idx}] label: {m.get('label')!r} steam_id: {m.get('steam_id')} radiant_team_id: {m.get('radiant_team_id')} dire_team_id: {m.get('dire_team_id')} score: {m.get('radiant_score')}:{m.get('dire_score')} winner: {m.get('winner')}")

print()
print('map[0] keys:', sorted(maps[0].keys()))
print()
print('map_results[0] first entry keys:')
mr = maps[0]['map_results'][0]
for k in sorted(mr.keys()):
    v = mr[k]
    if isinstance(v, (dict, list)):
        print(' ', k, ':', type(v).__name__, json.dumps(v, ensure_ascii=False)[:120])
    else:
        print(' ', k, '=', repr(v))

print()
print('--- order/role of map_results entries:')
for i, p in enumerate(maps[0]['map_results']):
    print(i, '| role', p.get('role'), '| team', p.get('team_id'), '| player', p.get('player', {}).get('title'), '| hero', p.get('hero', {}).get('title'))
