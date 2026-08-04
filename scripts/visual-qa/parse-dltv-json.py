import re, json

html = open('scripts/visual-qa/artifacts/dltv-match-427386.html', encoding='utf-8', errors='ignore').read()
idx = html.find('"map_results":')
if idx < 0:
    print('not found')
    exit()
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
arr = html[start:i+1]
try:
    data = json.loads(arr)
    print('map_results entries:', len(data))
    if data:
        first = data[0]
        print('keys:', list(first.keys()))
        print('team_id:', first['team_id'], 'gold_total:', first['gold_total'], 'kills:', first.get('kills'), 'items:', len(first.get('items', [])))
        # 检查是否有队伍名
        for k in ['team_name', 'radiant', 'dire']:
            if k in first:
                print('has', k)
except Exception as e:
    print('parse err:', e, 'len:', len(arr))
