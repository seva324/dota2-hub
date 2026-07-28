#!/usr/bin/env python3
"""One-off: compress mirrored player avatars to 256px webp.

Rewrite public/images/mirror/players/*.{png,webp} as .webp and update
manifest.json mappings that point at the old file names.
"""
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(r"C:\Users\MOGEEEEEE\Dotahub")
PLAYERS_DIR = ROOT / "public" / "images" / "mirror" / "players"
MANIFEST = ROOT / "public" / "images" / "mirror" / "manifest.json"
MAX_DIM = 256
QUALITY = 82


def main() -> int:
    files = sorted(
        p for p in PLAYERS_DIR.iterdir()
        if p.is_file() and p.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}
    )
    if not files:
        print("no player files found")
        return 1

    renames: dict[str, str] = {}
    total_before = 0
    total_after = 0
    skipped = 0

    for i, src in enumerate(files, 1):
        dst = src.with_suffix(".webp")
        before = src.stat().st_size
        try:
            if src.suffix.lower() == ".webp":
                with Image.open(src) as im:
                    if max(im.size) <= MAX_DIM:
                        skipped += 1
                        total_before += before
                        total_after += before
                        continue
            with Image.open(src) as im:
                has_alpha = im.mode in ("RGBA", "LA", "PA") or (
                    im.mode == "P" and "transparency" in im.info
                )
                im = im.convert("RGBA" if has_alpha else "RGB")
                im.thumbnail((MAX_DIM, MAX_DIM), Image.LANCZOS)
                im.save(dst, "WEBP", quality=QUALITY, method=6)
        except Exception as exc:  # keep original on failure
            print(f"FAIL {src.name}: {exc}", flush=True)
            continue
        if i % 20 == 0:
            print(f"progress {i}/{len(files)}", flush=True)

        after = dst.stat().st_size
        if src.suffix.lower() != ".webp":
            src.unlink()
        renames[f"/images/mirror/players/{src.name}"] = f"/images/mirror/players/{dst.name}"
        total_before += before
        total_after += after

    manifest = json.loads(MANIFEST.read_text(encoding="utf8"))
    changed = 0
    mappings = manifest.get("mappings", {})
    for key, value in list(mappings.items()):
        if value in renames:
            mappings[key] = renames[value]
            changed += 1
    for item in manifest.get("items", []):
        mp = item.get("mirroredPath")
        if mp in renames:
            item["mirroredPath"] = renames[mp]
    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf8")

    print(
        f"converted {len(renames)} files (skipped {skipped} already-small webp), "
        f"manifest entries updated: {changed}, "
        f"size {total_before / 1024 / 1024:.1f}MB -> {total_after / 1024 / 1024:.1f}MB"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
