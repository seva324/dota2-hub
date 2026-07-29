#!/usr/bin/env python3
"""Compare captured screenshots against prototypes using layout metrics."""
import json
from collections import Counter
from pathlib import Path

from PIL import Image

PROTO = Path(r"C:\Users\MOGEEEEEE\Dotahub\Prototype")
LOCAL = Path(r"C:\Users\MOGEEEEEE\Dotahub\scripts\visual-qa\artifacts\local")
OUT = Path(r"C:\Users\MOGEEE~1\AppData\Local\Temp\opencode\qa-report.json")

PAIRS = [
    ("Desktop Homepage.png", "homepage.desktop.png"),
    ("Desktop Match detail.png", "match-detail.desktop.png"),
    ("Desktop Team Flyout.png", "team-flyout.desktop.png"),
    ("Desktop Player Profile.png", "player-profile.desktop.png"),
    ("Mobile Homepage.png", "homepage.mobile.png"),
    ("Mobile Match detail.png", "match-detail.mobile.png"),
    ("Mobile Team Flyout.png", "team-flyout.mobile.png"),
    ("Mobile Player Profile.png", "player-profile.mobile.png"),
]


def quant(rgb, step=12):
    return tuple(min(255, (c // step) * step + step // 2) for c in rgb[:3])


def hexc(c):
    return "#{:02X}{:02X}{:02X}".format(*c)


def metrics(path: Path):
    with Image.open(path) as im:
        im = im.convert("RGB")
        w, h = im.size
        small = im.resize((max(1, w // 2), max(1, h // 2)), Image.BILINEAR)
        px = small.load()
        sw, sh = small.size
        counter = Counter()
        white = red = 0
        for y in range(sh):
            for x in range(sw):
                q = quant(px[x, y])
                counter[q] += 1
                r, g, b = px[x, y]
                if r > 200 and g > 200 and b > 200:
                    white += 1
                if r > 150 and g < 110 and b < 100:
                    red += 1
        total = sw * sh
        palette = [{"hex": hexc(c), "share": round(n / total, 3)} for c, n in counter.most_common(5)]
        rows = []
        for y in range(sh):
            rc = Counter()
            for x in range(0, sw, 2):
                rc[quant(px[x, y])] += 1
            rows.append(rc.most_common(1)[0][0])
        bands = []
        start = 0
        for y in range(1, sh):
            if rows[y] != rows[start]:
                hh = (y - start) * 2
                if hh >= 10:
                    bands.append({"y": start * 2, "h": hh, "c": hexc(rows[start])})
                start = y
        return {
            "size": [w, h],
            "white_share": round(white / total, 4),
            "red_share": round(red / total, 4),
            "palette": palette,
            "bands": bands[:40],
        }


def main():
    report = {}
    for proto_name, local_name in PAIRS:
        p = PROTO / proto_name
        l = LOCAL / local_name
        entry = {"prototype": metrics(p) if p.exists() else None, "current": metrics(l) if l.exists() else None}
        report[f"{proto_name} vs {local_name}"] = entry
    OUT.write_text(json.dumps(report, ensure_ascii=False), encoding="utf8")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
