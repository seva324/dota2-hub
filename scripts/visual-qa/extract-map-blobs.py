import re
import json

html = open('scripts/visual-qa/artifacts/dltv-match-427386.html', encoding='utf-8', errors='ignore').read()
positions = [m.start() for m in re.finditer(r'"map_results"', html)]


def extract_json(start):
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
    return html[start:i + 1]


for pi, p in enumerate(positions):
    start = p + len('"map_results":')
    blob = extract_json(start)
    data = json.loads(blob)
    n = len(data)
    teams = {}
    for pl in data:
        teams.setdefault(pl.get('team_id'), []).append(pl)
    scores = sorted({d.get('score') for d in data if d.get('score') is not None})
    print(f'--- occ {pi}: {n} players | teams={ {k: len(v) for k, v in teams.items()} } | team_ids={list(teams.keys())}')
    print(f'    scores={scores} | sample role={data[0].get("role") if data else None}')
