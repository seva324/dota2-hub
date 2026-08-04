import json

html = open('scripts/visual-qa/artifacts/dltv-match-427386.html', encoding='utf-8', errors='ignore').read()
idx = html.find('"map_results":')
start = html.find('[', idx)
depth = 0
i = start
in_str = False
esc = False
while i < len(html):
    c = html[i]
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
        elif c == '[':
            depth += 1
        elif c == ']':
            depth -= 1
            if depth == 0:
                break
    i += 1

data = json.loads(html[start:i + 1])
print('=== TOTAL MAPS ===', len(data))
print('=== TOP-LEVEL MAP 1 KEYS ===')
print(list(data[0].keys()))
print()
print('=== SAMPLE MAP 1 RAW (truncated) ===')
print(json.dumps(data[0], ensure_ascii=False)[:3000])

print()
print('=== SAMPLE MAP 1 FULL JSON ===')
print(json.dumps(data[0], ensure_ascii=False, indent=1)[:2500])
