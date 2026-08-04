import re
import json

html = open('scripts/visual-qa/artifacts/dltv-match-427386.html', encoding='utf-8', errors='ignore').read()

# Find the parent JSON object. Locate each 'map_results' and walk backwards to find the object's opening '{'
# to determine sibling keys. Simpler: locate each occurrence's key and capture keys between occurrences.
mr_positions = [m.start() for m in re.finditer(r'"map_results"', html)]

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


# For each occurrence, capture the key-value pairs before it (siblings) to understand map structure.
# Find the nearest enclosing '{' before it by scanning for the last '{' before occurrence where
# its matching '}' is after occurrence.
for pi, p in enumerate(mr_positions):
    data = json.loads(extract_json(p + len('"map_results":')))
    # Capture the preceding sibling keys by looking at the section between the previous map_results end and this one
    print(f'===== occurrence {pi} =====')
    # Show text between the previous ]} and this key - the sibling fields
    print(f'players={len(data)}')

    # find the sibling keys: scan backward from p for a balanced object start
    # look at ~700 chars before p and find all '"key":' patterns
    before = html[max(0, p-900):p]
    keys = re.findall(r'"([a-z_0-9]+)":', before)
    print('recent sibling keys:', keys[-12:])
    print()
