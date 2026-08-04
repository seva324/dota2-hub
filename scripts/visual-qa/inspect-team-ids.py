import json

html = open(r'C:\Users\MOGEEEEEE\Dotahub\scripts\visual-qa\artifacts\dltv-match-427386.html', encoding='utf-8').read()
marker = 'series_item = '
start = html.find(marker)
src = html[start + len(marker):]

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
print('first_team id:', raw['first_team']['id'], 'second_team id:', raw['second_team']['id'])

for mi, m in enumerate(raw['maps']):
    if not m.get('map_results'):
        print(f'map[{mi}] empty')
        continue
    print(f'map[{mi}] steam {m.get("steam_id")} radiant_team_id {m.get("radiant_team_id")} dire_team_id {m.get("dire_team_id")} score {m.get("radiant_score")}:{m.get("dire_score")} winner {m.get("winner")}')
    teams = set()
    for p in m['map_results']:
        teams.add(p.get('team_id'))
    print('   player team_ids:', teams)

# Check aghs item steamId on the Invoker (player with aghanims_scepter flag 0 but item 108)
for mi, m in enumerate(raw['maps']):
    for p in m.get('map_results', []):
        items = p.get('items', [])
        steam_ids = [it.get('steam_id') for it in items]
        if '108' in steam_ids or 108 in steam_ids:
            print(f'map[{mi}] player {p["player"]["title"]} has item steamId 108; scepter flag={p.get("aghanims_scepter")}')
            break
    else:
        continue
    break
