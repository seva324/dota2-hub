import re
import json

html = open('scripts/visual-qa/artifacts/dltv-match-427386.html', encoding='utf-8', errors='ignore').read()

# Find the big JSON object that contains map_results. Search for a preceding '{' and capture keys before 'map_results'
mr_positions = [m.start() for m in re.finditer(r'"map_results"', html)]

# The parent object likely has keys before map_results. Grab 1200 chars before each
for pi, p in enumerate(mr_positions):
    before = html[p-1500:p]
    print(f'===== before map_results occ {pi} (last 1500 chars) =====')
    print(before[-1400:])
    print()
