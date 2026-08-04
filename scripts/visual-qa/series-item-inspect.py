import re
import json

html = open('scripts/visual-qa/artifacts/dltv-match-427386.html', encoding='utf-8', errors='ignore').read()

p0 = html.find('"map_results"')
sstart = html.rfind('<script', 0, p0)
send = html.find('</script>', p0)
script = html[sstart:send]

# series_item = {...}; extract
si_start = script.find('series_item = ')
# skip past 'series_item = ' and maybe a comment/whitespace
js = script[si_start + len('series_item = '):]
# the value is a JSON object literal; find its extent
# It may contain trailing ';' then other assignments
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
blob = js[:i + 1]
data = json.loads(blob)
print('SERIES_ITEM TOP-LEVEL KEYS:', list(data.keys()))
print()
print('format_option_id:', data.get('format_option_id'), '| type:', data.get('type'), '| status:', data.get('status'))
print('first_team_id:', data.get('first_team_id'), 'second_team_id:', data.get('second_team_id'))
print('winner_team_id?', data.get('winner_team_id'), '| first_team_wins?', data.get('first_team_wins'))
# look for series scores / maps list
for k in data.keys():
    if any(s in k.lower() for s in ['map', 'score', 'win', 'series', 'game', 'format']):
        v = data[k]
        vs = repr(v)[:400]
        print(f'  {k}: {vs}')
