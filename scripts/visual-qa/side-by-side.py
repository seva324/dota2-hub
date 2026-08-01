#!/usr/bin/env python3
"""把原型图与本地/生产截图左右拼接，用于 vision.cjs 对比 QA。"""
import sys
from pathlib import Path
from PIL import Image

def main():
    left_path = Path(sys.argv[1])
    right_path = Path(sys.argv[2])
    out_path = Path(sys.argv[3])

    left = Image.open(left_path).convert("RGB")
    right = Image.open(right_path).convert("RGB")

    # 统一高度，等比缩放
    target_h = max(left.height, right.height)
    left = left.resize((int(left.width * target_h / left.height), target_h), Image.LANCZOS)
    right = right.resize((int(right.width * target_h / right.height), target_h), Image.LANCZOS)

    gap = 24
    canvas = Image.new("RGB", (left.width + gap + right.width, target_h), (20, 20, 25))
    canvas.paste(left, (0, 0))
    canvas.paste(right, (left.width + gap, 0))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out_path, quality=90)
    print(f"saved {out_path} ({canvas.width}x{canvas.height})")

if __name__ == "__main__":
    main()
