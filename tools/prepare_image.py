#!/usr/bin/env python3
"""Prepare an uploaded image: strip metadata, make responsive JPEGs.

Usage:
    python3 tools/prepare_image.py <source> <base-name>

Writes assets/img/<base-name>-480.jpg, -960.jpg, -1600.jpg and -2400.jpg.
The content only stores <base-name>.
"""

import os
import sys
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "img"
SIZES = (480, 960, 1600, 2400)


def main():
    if len(sys.argv) != 3:
        print("usage: prepare_image.py <source> <base-name>", file=sys.stderr)
        return 2
    source = Path(sys.argv[1])
    base = sys.argv[2].strip().strip("/")
    if not base or ".." in base:
        print("invalid base name", file=sys.stderr)
        return 2
    im = Image.open(source)
    im = ImageOps.exif_transpose(im).convert("RGB")
    target_dir = (OUT / base).parent
    target_dir.mkdir(parents=True, exist_ok=True)
    for width in SIZES:
        if im.width < width and width not in (480, 960):
            continue
        height = max(1, round(im.height * width / im.width))
        out = im.resize((width, height), Image.LANCZOS)
        path = OUT / f"{base}-{width}.jpg"
        out.save(path, "JPEG", quality=82, optimize=True, progressive=True)
    print(f"prepared {base} from {im.width}x{im.height}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
