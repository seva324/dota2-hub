import re
import json

html = open('scripts/visual-qa/artifacts/dltv-match-427386.html', encoding='utf-8', errors='ignore').read()

# Find the script tag containing 'map_results'
p0 = html.find('"map_results"')
# find enclosing <script>
sstart = html.rfind('<script', 0, p0)
send = html.find('</script>', p0)
print('script range:', sstart, send, 'len', send - sstart)
script = html[sstart:send]
print('script src?', script[:200])

# In the script, find where the JSON object containing the page data begins.
# Common pattern: const page = {...} or window.__INITIAL_STATE__ = {...}
# Show the beginning of the script
print('===== script head =====')
print(script[:1500])
