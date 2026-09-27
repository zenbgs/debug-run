#!/usr/bin/env python3
"""
Pack frame PNG terpisah dari Legacy Collection jadi spritesheet strip horizontal
dengan ukuran frame seragam, lalu tulis ke public/assets/.

Kenapa perlu: spritesheet bawaan ansimuz ukurannya tidak habis dibagi grid
(mis. slash-circular.png = 312x48), jadi tidak bisa dipakai langsung oleh
Phaser.load.spritesheet. Folder `sprites/` per-frame-nya seragam, jadi kita
pack ulang sendiri.

Jalankan:  python tools/pack_assets.py
Idempotent — aman dijalankan berulang.
"""

from __future__ import annotations

import glob
import os
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Butuh Pillow:  pip install Pillow")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "Legacy Collection", "Assets")
OUT = os.path.join(ROOT, "public", "assets")

FX = os.path.join(SRC, "Explosions and Magic")
GROTTO = os.path.join(FX, "Grotto-escape-2-FX", "sprites")

# (nama keluaran, subfolder relatif ke OUT, pola glob sumber)
JOBS = [
    ("fx-slash-horizontal", "fx", os.path.join(GROTTO, "slash-horizontal", "*.png")),
    ("fx-slash-upward", "fx", os.path.join(GROTTO, "slash-upward", "*.png")),
    ("fx-slash-circular", "fx", os.path.join(GROTTO, "slash-circular", "*.png")),
    ("fx-enemy-death", "fx", os.path.join(GROTTO, "enemy-death", "*.png")),
    ("fx-hit", "fx", os.path.join(FX, "Hit", "Sprites", "*.png")),
    ("fx-electro-shock", "fx", os.path.join(GROTTO, "electro-shock", "*.png")),
    ("fx-energy-field", "fx", os.path.join(GROTTO, "energy-field", "*.png")),
    ("player-fireball", "sprites", os.path.join(GROTTO, "fire-ball", "*.png")),
    ("fx-arcane-crescent", "fx", os.path.join(FX, "Warped shooting fx", "crossed", "sprites", "*.png")),
    ("fx-arcane-blast", "fx", os.path.join(FX, "Warped shooting fx", "charged", "sprites", "*.png")),
    ("player-arrow", "sprites", os.path.join(SRC, "Gothicvania", "Misc", "Dagger", "*.png")),
    (
        "enemy-beetle",
        "sprites",
        os.path.join(SRC, "Warped", "Characters", "top-down-shooter-enemies", "sprites", "enemy-01", "*.png"),
    ),
    (
        "enemy-crawler",
        "sprites",
        os.path.join(SRC, "Warped", "Characters", "top-down-shooter-enemies", "sprites", "enemy-02", "*.png"),
    ),
    (
        "enemy-moth",
        "sprites",
        os.path.join(SRC, "Warped", "Characters", "top-down-shooter-enemies", "sprites", "enemy-03", "*.png"),
    ),
    (
        "boss-core",
        "sprites",
        os.path.join(SRC, "Warped", "Characters", "top-down-boss", "PNG", "sprites", "boss", "*.png"),
    ),
    (
        "boss-bolt",
        "fx",
        os.path.join(SRC, "Warped", "Characters", "top-down-boss", "PNG", "sprites", "bolt", "*.png"),
    ),
    (
        "boss-rays",
        "fx",
        os.path.join(SRC, "Warped", "Characters", "top-down-boss", "PNG", "sprites", "rays", "*.png"),
    ),
]


def pack(name: str, subdir: str, pattern: str) -> tuple[str, int, int, int] | None:
    files = sorted(glob.glob(pattern))
    if not files:
        print(f"  ! LEWAT {name}: tidak ada file cocok\n    pola: {pattern}")
        return None

    frames = [Image.open(f).convert("RGBA") for f in files]
    sizes = {im.size for im in frames}
    if len(sizes) != 1:
        print(f"  ! LEWAT {name}: ukuran frame tidak seragam -> {sizes}")
        return None

    fw, fh = frames[0].size
    sheet = Image.new("RGBA", (fw * len(frames), fh), (0, 0, 0, 0))
    for i, im in enumerate(frames):
        sheet.paste(im, (i * fw, 0))

    target_dir = os.path.join(OUT, subdir)
    os.makedirs(target_dir, exist_ok=True)
    path = os.path.join(target_dir, f"{name}.png")
    sheet.save(path)
    print(f"  + {subdir}/{name}.png  {len(frames)} frame @ {fw}x{fh}")
    return (f"{subdir}/{name}", fw, fh, len(frames))


def main() -> int:
    if not os.path.isdir(SRC):
        sys.exit(f"Folder sumber tidak ditemukan: {SRC}")

    print("Packing aset...")
    results = [r for r in (pack(*job) for job in JOBS) if r]

    print("\nRingkasan untuk src/data/frames.ts:")
    for key, fw, fh, count in results:
        print(f"  {key:<28} frameWidth: {fw:>3}, frameHeight: {fh:>3}, frames: {count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
