import json
import os
import re

os.chdir(os.path.dirname(os.path.abspath(__file__)))

data = json.load(open('news-preview-data.json', encoding='utf-8'))
template = open('news-template.html', encoding='utf-8').read()

data_json = json.dumps(data, ensure_ascii=False)
# JS 安全转义：<\/ 防止 </script> 提前闭合
data_json = data_json.replace('</', '<\\/')

out = template.replace('/*__NEWS_DATA__*/', f'window.__NEWS__ = {data_json};')

open('news.html', 'w', encoding='utf-8').write(out)
print('generated preview/news.html, size', os.path.getsize('news.html'), 'bytes')
