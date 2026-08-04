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

print('=== number of maps:', len(data['maps']))
for m in data['maps']:
    print(f"  Map steam={m['steam_id']} winner={m.get('winner')} score {m['radiant_score']}:{m['dire_score']} dur={m['duration']} radiant={m['radiant_team_id']} dire={m['dire_team_id']}")

print()
print('=== first_team keys ===')
ft = data['first_team']
print(list(ft.keys()))
print('  id:', ft.get('id'), '| title:', ft.get('title'), '| tag:', ft.get('tag'), '| slug:', ft.get('slug'))
print('  image:', ft.get('image'), '| image_dark:', ft.get('image_dark'))
print()
print('=== second_team keys ===')
st = data['second_team']
print(list(st.keys()))
print('  id:', st.get('id'), '| title:', st.get('title'), '| tag:', st.get('tag'))
print('  image:', st.get('image'), '| image_dark:', st.get('image_dark'))
print()
print('=== event keys ===')
ev = data.get('event', {})
print('  id:', ev.get('id'), '| title:', ev.get('title'), '| slug:', ev.get('slug'))
print()
# series_players sample - check if they have image/avatar
print('=== series_players count:', len(data.get('series_players', [])))
sp0 = data['series_players'][0]
print('player keys:', list(sp0['player'].keys()))
print('player image:', sp0['player'].get('image'))
print('player steam_id:', sp0['player'].get('steam_id'))
