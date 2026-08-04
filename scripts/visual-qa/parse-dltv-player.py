import re, json

html = open('scripts/visual-qa/artifacts/dltv-match-427386.html', encoding='utf-8', errors='ignore').read()
# 提取 map_results
idx = html.find('"map_results":')
start = html.find('[', idx)
depth = 0; i = start; in_str = False; esc = False
while i < len(html):
    c = html[i]
    if in_str:
        if esc: esc = False
        elif c == '\\': esc = True
        elif c == '"': in_str = False
    else:
        if c == '"': in_str = True
        elif c == '[': depth += 1
        elif c == ']':
            depth -= 1
            if depth == 0: break
    i += 1
data = json.loads(html[start:i+1])

# 看第一条 player 结构
p = data[0]
print('=== player field ===')
print(json.dumps(p.get('player'), indent=1, ensure_ascii=False)[:600])
print('=== hero field ===')
print(json.dumps(p.get('hero'), indent=1, ensure_ascii=False)[:400])
print('=== additional ===')
print(json.dumps(p.get('additional'), indent=1, ensure_ascii=False)[:400])
print('=== items sample ===')
print(json.dumps(p.get('items'), indent=1, ensure_ascii=False)[:400])
print('=== aghs ===')
print('scepter:', p.get('aghanims_scepter'), 'shard:', p.get('aghanims_shard'))
