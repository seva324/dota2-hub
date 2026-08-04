import json, re

html = open(r'C:\Users\MOGEEEEEE\Dotahub\scripts\visual-qa\artifacts\dltv-match-427386.html', encoding='utf-8').read()
marker = 'series_item = '
start = html.find(marker)
src = html[start + len(marker):]

depth = 0
i = 0
in_str = False
escaped = False
while i < len(src):
    c = src[i]
    if in_str:
        if escaped:
            escaped = False
        elif c == '\\':
            escaped = True
        elif c == '"':
            in_str = False
    elif c == '"':
        in_str = True
    elif c == '{':
        depth += 1
    elif c == '}':
        depth -= 1
        if depth == 0:
            break
    i += 1

raw = json.loads(src[:i+1])
ft = raw.get('first_team') or {}
st = raw.get('second_team') or {}
ev = raw.get('event') or {}
print('id:', raw.get('id'))
print('first_team:', ft.get('id'), ft.get('slug'), ft.get('title'))
print('second_team:', st.get('id'), st.get('slug'), st.get('title'))
print('event:', ev.get('slug'), ev.get('title'))
