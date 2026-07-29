#!/usr/bin/env python3
"""Programmatic prototype analysis: palette + layout geometry.

For each prototype PNG, report:
- dominant colors (quantized, hex + share)
- horizontal bands: alternating runs of "page bg" vs "card-ish" colors
- bright accent runs (red/green/orange) row positions (LIVE badges, accents)
Output is compact JSON to stdout.
"""
import json
import sys
from collections import Counter
from pathlib import Path

from PIL import Image

PROTO = Path(r"C:\Users\MOGEEEEEE\Dotahub\Prototype")


def hexc(rgb):
    return "#{:02X}{:02X}{:02X}".format(*rgb[:3])


def quant(rgb, step=12):
    return tuple(min(255, (c // step) * step + step // 2) for c in rgb[:3])


def analyze(path: Path):
    with Image.open(path) as im:
        im = im.convert("RGB")
        w, h = im.size
        small = im.resize((w // 2, h // 2), Image.BILINEAR)
        px = small.load()
        sw, sh = small.size

        # dominant colors
        counter = Counter()
        for y in range(sh):
            for x in range(sw):
                counter[quant(px[x, y])] += 1
        total = sw * sh
        palette = [
            {"hex": hexc(c), "share": round(n / total, 4)}
            for c, n in counter.most_common(14)
        ]

        # row band analysis: classify each row by its modal color,
        # then merge consecutive rows with same modal color into bands.
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
                height = (y - start) * 2
                if height >= 6:
                    bands.append({"y": start * 2, "h": height, "color": hexc(rows[start])})
                start = y
        height = (sh - start) * 2
        if height >= 6:
            bands.append({"y": start * 2, "h": height, "color": hexc(rows[start])})

        # accent rows: rows where vivid red/green/orange pixels appear
        accent_rows = []
        for y in range(sh):
            red = green = orange = 0
            for x in range(0, sw, 4):
                r, g, b = px[x, y]
                if r > 150 and g < 110 and b < 100:
                    red += 1
                if g > 140 and r < 110 and b < 140:
                    green += 1
                if r > 180 and 100 < g < 190 and b < 90:
                    orange += 1
            if red or green or orange:
                accent_rows.append({"y": y * 2, "red": red, "green": green, "orange": orange})

        return {"file": path.name, "size": [w, h], "palette": palette, "bands": bands[:80], "accent_rows": accent_rows[:120]}


def main():
    out = {}
    for f in sorted(PROTO.glob("*.png")):
        out[f.stem] = analyze(f)
    dst = Path(r"C:\Users\MOGEEE~1\AppData\Local\Temp\opencode\proto-analysis.json")
    dst.write_text(json.dumps(out, ensure_ascii=False), encoding="utf8")
    print(f"wrote {dst}")


if __name__ == "__main__":
    sys.exit(main() or 0)
