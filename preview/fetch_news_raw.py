import json
import os
import re
import urllib.request

os.chdir(os.path.dirname(os.path.abspath(__file__)))

# 重新抓取原始数据
req = urllib.request.Request(
    'https://dotahub.cn/api/news?limit=24',
    headers={'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache'},
)
raw = urllib.request.urlopen(req, timeout=30).read()
d = json.loads(raw.decode('utf-8'))
items = d if isinstance(d, list) else d.get('items', [])

def ck(v):
    try:
        return float(v)
    except Exception:
        return 0

def norm(it):
    return {
        'id': it.get('id') or str(int(ck(it.get('published_at', 0)))),
        'title': it.get('title') or '',
        'summary': it.get('summary') or '',
        'category': it.get('category') or '',
        'source': it.get('source') or '',
        'image': it.get('image_url') or '',
        'url': it.get('url') or '',
        'ts': int(ck(it.get('published_at', 0))),
    }

out = [norm(it) for it in items if (it.get('title') or '').strip()]
out.sort(key=lambda x: -x['ts'])

# 用 ensure_ascii=True 写出（surrogate 变成 \udc9d 转义，不炸文件）
json.dump(out, open('news-preview-data.json', 'w', encoding='utf-8'), ensure_ascii=True, indent=1)
print('raw saved', len(out))
