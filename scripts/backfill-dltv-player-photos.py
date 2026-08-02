#!/usr/bin/env python3
"""Backfill: mirror DLTV ranking player photos to public/images/mirror/players.

Downloads each photo from dltv.org (via the /api/asset-image proxy so we
reuse the allowed host logic), compresses it to a small webp, and appends
dltv.org source -> /images/mirror/players/<hash>.webp mappings to manifest.json.
Run AFTER refreshing the ranking so the API returns the current photo set.
"""
import hashlib
import json
import os
import sys
import urllib.request
from pathlib import Path

ROOT = Path(r"C:\Users\MOGEEEEEE\Dotahub")
SOURCE = ROOT / "public" / "images" / "mirror"
PLAYERS_DIR = SOURCE / "players"
MANIFEST = SOURCE / "manifest.json"
PROXY_URL = "http://localhost:8804/api/asset-image"

MAX_DIM = 256
QUALITY = 82
CONCURRENCY = 8


def fetch_bytes(url: str) -> bytes | None:
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            return r.read()
    except Exception as exc:
        print(f"  FAIL fetch {url.split('/')[-1][:40]}: {exc}", flush=True)
        return None


def compress(data: bytes, dst: Path) -> bool:
    import io

    from PIL import Image

    try:
        im = Image.open(io.BytesIO(data))
        has_alpha = im.mode in ("RGBA", "LA", "PA") or (
            im.mode == "P" and "transparency" in im.info
        )
        im = im.convert("RGBA" if has_alpha else "RGB")
        im.thumbnail((MAX_DIM, MAX_DIM), Image.LANCZOS)
        im.save(dst, "WEBP", quality=QUALITY, method=6)
        return True
    except Exception as exc:
        print(f"  FAIL compress {dst.name}: {exc}", flush=True)
        return False


def main() -> int:
    from concurrent.futures import ThreadPoolExecutor, as_completed

    if len(sys.argv) > 1:
        proxy_url = sys.argv[1]
    else:
        proxy_url = PROXY_URL

    PLAYERS_DIR.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(MANIFEST.read_text(encoding="utf8")) if MANIFEST.exists() else {"generatedAt": None, "mappings": {}}
    mappings: dict = manifest.setdefault("mappings", {})

    # Reuse /api/team-ranking data so the photo set matches what the API serves.
    import urllib.request as urlreq

    ranking_req = urlreq.urlopen(f"{proxy_url.rsplit('/api', 1)[0]}/api/team-ranking", timeout=30)
    ranking = json.loads(ranking_req.read())
    teams = ranking.get("teams", [])
    photos = {}
    for team in teams:
        for player in team.get("players", []):
            photo = player.get("photo")
            if photo and photo not in photos:
                photos[photo] = player.get("name", "player")

    print(f"found {len(photos)} photos to mirror", flush=True)
    existing = set(PLAYERS_DIR.glob("*.webp"))
    existing_names = {p.name for p in existing}

    results = {"mirrored": 0, "skipped": 0, "failed": 0}
    new_mappings: dict[str, str] = {}

    def mirror_photo(url: str) -> tuple[str, str | None]:
        digest = hashlib.sha256(url.encode("utf8")).hexdigest()[:20]
        fname = f"{digest}.webp"
        if fname in existing_names:
            return url, fname
        if mappings.get(url):
            return url, None  # already mapped in manifest
        data = fetch_bytes(f"{proxy_url}?url={urllib.parse.quote(url, safe='')}")
        if not data:
            return url, None
        dst = PLAYERS_DIR / fname
        if not compress(data, dst):
            return url, None
        return url, fname

    with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
        futures = {pool.submit(mirror_photo, url): url for url in photos}
        done = 0
        for future in as_completed(futures):
            url, fname = future.result()
            done += 1
            if fname is None:
                if mappings.get(url):
                    results["skipped"] += 1
                else:
                    results["failed"] += 1
            else:
                results["mirrored"] += 1
                new_mappings[url] = f"/images/mirror/players/{fname}"
            if done % 50 == 0:
                print(f"  progress {done}/{len(photos)}", flush=True)

    if new_mappings:
        mappings.update(new_mappings)
        manifest["generatedAt"] = os.path.getmtime(MANIFEST) if MANIFEST.exists() else None
        MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf8")
        print(f"[backfill-dltv-player-photos] manifest updated with {len(new_mappings)} mappings", flush=True)

    print(json.dumps(results, indent=2))
    return 0 if results["failed"] == 0 else 1


if __name__ == "__main__":
    import urllib.parse
    sys.exit(main())
