import json
import os
import re

os.chdir(os.path.dirname(os.path.abspath(__file__)))

d = json.load(open('news-preview-data.json', encoding='utf-8'))

# 数据里残留的意外 Unicode（surrogate / CJK mojibake）兜底清理，
# 只清非引号/破折号/省略号的意外字符。
OK = {0x2018, 0x2019, 0x201C, 0x201D, 0x2014, 0x2026}
def clean(s):
    if not isinstance(s, str):
        return s or ''
    return ''.join(c for c in s if ord(c) <= 127 or ord(c) in OK)

for it in d:
    it['title'] = clean(it['title'])
    it['summary'] = clean(it['summary'])

# 写成正常 utf-8 文件（此时已无 surrogate）
json.dump(d, open('news-preview-data.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('final saved', len(d))
