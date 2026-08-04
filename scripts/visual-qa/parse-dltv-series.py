import re, json

html = open('scripts/visual-qa/artifacts/dltv-match-427386.html', encoding='utf-8', errors='ignore').read()
# 找 series 比分 / 地图结果
# map_results 里的 team_id 和 wins
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
# 每条 map_results 有 team_id, 统计每队有几条(即每队5玩家)
from collections import Counter
team_counts = Counter(d['team_id'] for d in data)
print('team_id -> player count:', dict(team_counts))
# 找队伍名映射 (在 HTML 别处)
# 找 series 比分
for kw in ['radiant_win', '"winner"', '"win"', 'scoreboard']:
    cnt = html.count(kw)
    print(f'{kw}: {cnt}')
