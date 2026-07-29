#!/usr/bin/env python3
"""Detect major card/panel boxes in a dark-UI screenshot via flood fill.

Proportional coordinates relative to detected content container so desktop/
mobile/prototype scales can be compared directly.
"""
import json
import sys
from collections import deque
from pathlib import Path

from PIL import Image


def load(path):
    im = Image.open(path).convert("RGB")
    return im.width, im.height, im.load()


def dist2(c1, c2):
    return (c1[0] - c2[0]) ** 2 + (c1[1] - c2[1]) ** 2 + (c1[2] - c2[2]) ** 2


def analyze(path: Path, bg_tol=14, min_area_frac=0.002, step=3):
    w, h, px = load(path)
    page_bg = px[0, h - 1]
    W, H = w // step, h // step
    mask = [[False] * W for _ in range(H)]
    for yy in range(H):
        y = yy * step
        for xx in range(W):
            if dist2(px[xx * step, y], page_bg) > bg_tol ** 2:
                mask[yy][xx] = True

    seen = [[False] * W for _ in range(H)]
    boxes = []
    for yy in range(H):
        for xx in range(W):
            if not mask[yy][xx] or seen[yy][xx]:
                continue
            # flood fill with 1-cell dilation tolerance
            q = deque([(xx, yy)])
            seen[yy][xx] = True
            x0 = x1 = xx
            y0 = y1 = yy
            count = 0
            while q:
                x, y = q.popleft()
                count += 1
                x0, x1 = min(x0, x), max(x1, x)
                y0, y1 = min(y0, y), max(y1, y)
                for dx, dy in ((2, 0), (-2, 0), (0, 2), (0, -2)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < W and 0 <= ny < H and mask[ny][nx] and not seen[ny][nx]:
                        seen[ny][nx] = True
                        q.append((nx, ny))
            area = (x1 - x0) * (y1 - y0)
            if area >= W * H * min_area_frac and count > area * 0.15:
                boxes.append({
                    "x": round(x0 * step / w, 3),
                    "y": y0 * step,
                    "w": round((x1 - x0) * step / w, 3),
                    "h": (y1 - y0) * step,
                })
    boxes.sort(key=lambda b: (b["y"], b["x"]))
    merged = []
    for b in boxes:
        if merged and abs(b["y"] - merged[-1]["y"]) < 24 and abs(b["x"] - merged[-1]["x"]) < 0.05 and abs(b["w"] - merged[-1]["w"]) < 0.05:
            prev = merged[-1]
            prev["h"] = max(prev["y"] + prev["h"], b["y"] + b["h"]) - prev["y"]
        else:
            merged.append(b)
    return {"file": path.name, "size": [w, h], "bg": "#%02X%02X%02X" % page_bg, "boxes": merged}


def main():
    targets = [
        Path(r"C:\Users\MOGEEEEEE\Dotahub\Prototype\Desktop Homepage.png"),
        Path(r"C:\Users\MOGEEEEEE\Dotahub\Prototype\Mobile Homepage.png"),
        Path(r"C:\Users\MOGEEEEEE\Dotahub\Prototype\Desktop Match detail.png"),
        Path(r"C:\Users\MOGEEEEEE\Dotahub\Prototype\Desktop Team Flyout.png"),
        Path(r"C:\Users\MOGEEEEEE\Dotahub\Prototype\Desktop Player Profile.png"),
        Path(r"C:\Users\MOGEEEEEE\Dotahub\Prototype\Mobile Match detail.png"),
        Path(r"C:\Users\MOGEEEEEE\Dotahub\Prototype\Mobile Team Flyout.png"),
        Path(r"C:\Users\MOGEEEEEE\Dotahub\Prototype\Mobile Player Profile.png"),
        Path(r"C:\Users\MOGEEEEEE\Dotahub\scripts\visual-qa\artifacts\prod\homepage.desktop.png"),
        Path(r"C:\Users\MOGEEEEEE\Dotahub\scripts\visual-qa\artifacts\prod\homepage.mobile.png"),
    ]
    out = {}
    for t in targets:
        if t.exists():
            out[t.name] = analyze(t)
    dst = Path(r"C:\Users\MOGEEE~1\AppData\Local\Temp\opencode\box-report.json")
    dst.write_text(json.dumps(out, ensure_ascii=False), encoding="utf8")
    for name, v in out.items():
        print(f"== {name} bg={v['bg']}")
        for b in v["boxes"][:26]:
            print(f"   x={b['x']:.3f} y={b['y']:>5} w={b['w']:.3f} h={b['h']:>4}")
    print("wrote", dst)


if __name__ == "__main__":
    sys.exit(main() or 0)
