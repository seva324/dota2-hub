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


# For each occurrence, find the nearest preceding 'n_map_' block id + 'Match ID:' and 'Map #N'
for pi, p in enumerate(positions):
    before = html[:p]
    # nearest preceding n_map id
    idm = list(re.finditer(r'id="n_map_(\d+)"', before))
    n_map = idm[-1].group(1) if idm else None
    # nearest preceding Match ID
    mims = list(re.finditer(r'Match ID:\s*(\d+)', before))
    mid = mims[-1].group(1) if mims else None
    # nearest preceding Map #N
    mns = list(re.finditer(r'Map #(\d+)', before))
    mnum = mns[-1].group(1) if mns else None
    data = json.loads(extract_json(p + len('"map_results":')))
    teams = {}
    for pl in data:
        teams.setdefault(pl.get('team_id'), []).append(pl)
    print(f'occ {pi}: n_map={n_map} Map#{mnum} matchID={mid} players={len(data)} teams={ {k: len(v) for k, v in teams.items()} }')
