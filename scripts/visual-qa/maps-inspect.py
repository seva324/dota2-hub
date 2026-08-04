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

print('=== MAPS ===')
for m in data['maps']:
    print(json.dumps(m, ensure_ascii=False, indent=1))
    print('---')
