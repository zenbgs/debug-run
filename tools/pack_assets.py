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
    # Ledakan sihir radial untuk skill Purge milik Mage. Sebelumnya Purge memakai
    # `slash-circular` yang sama persis dengan Cleave milik Warrior — dua kelas
    # berbeda dengan animasi skill yang identik.
    ("fx-energy-smack", "fx", os.path.join(GROTTO, "energy-smack", "*.png")),
    ("player-fireball", "sprites", os.path.join(GROTTO, "fire-ball", "*.png")),
    ("fx-arcane-crescent", "fx", os.path.join(FX, "Warped shooting fx", "crossed", "sprites", "*.png")),
    ("fx-arcane-blast", "fx", os.path.join(FX, "Warped shooting fx", "charged", "sprites", "*.png")),
    ("player-arrow", "sprites", os.path.join(SRC, "Gothicvania", "Misc", "Dagger", "*.png")),
    # Efek benturan per kelas. Sebelumnya SEMUA benturan di game memakai satu
    # sprite yang sama (`fx-hit`), jadi pukulan baja, panah, dan bola api terasa
    # identik saat mengenai musuh.
    ("fx-hit-slash", "fx", os.path.join(FX, "Warped shooting fx", "hits", "Hits-2", "sprites", "*.png")),
    ("fx-hit-pierce", "fx", os.path.join(FX, "Warped shooting fx", "hits", "hits-1", "sprites", "*.png")),
    ("fx-hit-arcane", "fx", os.path.join(FX, "Warped shooting fx", "hits", "Hits-5", "sprites", "*.png")),
    # Ledakan. Varian c/d/e sengaja dilewati: asapnya membubung ke ATAS, yang
    # terbaca sebagai tampak-samping dan salah untuk arena tampak-atas.
    ("fx-explosion-big", "fx", os.path.join(FX, "Explosions pack", "explosion-1-f", "Sprites", "*.png")),
    ("fx-explosion-small", "fx", os.path.join(FX, "Explosions pack", "explosion-1-g", "Sprites", "*.png")),
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
    # Boss wave 5. Satu PNG statis, bukan animasi — di M5 folder `Mechanic` ditolak
    # karena sprite-nya 3-4x lebih besar dari musuh biasa, tapi untuk BOSS justru itu
    # yang dicari. Bayangannya sudah menyatu di sprite dan sudut pandangnya
    # depan-atas, sama seperti sprite top-down lain yang dipakai game ini.
    (
        "boss-sentinel",
        "sprites",
        os.path.join(SRC, "TinyRPG", "Characters", "Battle Sprites", "Mechanic", "Sentinel.png"),
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


# Gambar utuh yang disalin apa adanya, bukan di-pack jadi strip.
#
# Latar parallax layar cerita. Semuanya tampak-SAMPING — jenis aset yang ditolak
# untuk gameplay top-down sejak M2. Layar cerita adalah satu-satunya tempat di
# mana tampak-samping justru benar, karena karakternya memang berdiri menghadap
# kamera dan tidak ada arena yang harus dilihat dari atas.
MIST = os.path.join(SRC, "Gothicvania", "Environments", "mist-forest-background", "layers")

SALIN = [
    ("bg-mist-back", "bg", os.path.join(MIST, "mist-forest-background-back.png")),
    ("bg-mist-trees", "bg", os.path.join(MIST, "mist-forest-background-back-trees.png")),
    ("bg-mist-tree", "bg", os.path.join(MIST, "mist-forest-background-tree.png")),
    ("bg-mist-rocks", "bg", os.path.join(MIST, "mist-forest-background-rocks.png")),
]


# Potongan grid dari satu spritesheet besar.
#
# Permata dipakai sebagai ikon upgrade. Sumbernya satu lembar 848x176 berisi
# animasi berputar untuk 6 warna; yang dibutuhkan hanya frame PERTAMA tiap warna,
# jadi ia dipotong dan disusun ulang jadi strip 6 frame.
GEMS = os.path.join(SRC, "Misc", "gems", "spritesheets", "gems-spritesheet.png")
# (x awal tiap warna, y baris permata polos, ukuran sel)
GEM_X = [64, 192, 320, 448, 576, 704]
GEM_Y = 32
GEM_SIZE = 16


def potong_gems() -> tuple[str, int, int, int] | None:
    if not os.path.exists(GEMS):
        print(f"  ! LEWAT ui-gems: tidak ada\n    {GEMS}")
        return None
    lembar = Image.open(GEMS).convert("RGBA")
    out_im = Image.new("RGBA", (GEM_SIZE * len(GEM_X), GEM_SIZE), (0, 0, 0, 0))
    for i, x in enumerate(GEM_X):
        sel = lembar.crop((x, GEM_Y, x + GEM_SIZE, GEM_Y + GEM_SIZE))
        out_im.paste(sel, (i * GEM_SIZE, 0))

    target_dir = os.path.join(OUT, "ui")
    os.makedirs(target_dir, exist_ok=True)
    out_im.save(os.path.join(target_dir, "ui-gems.png"))
    print(f"  + ui/ui-gems.png  {len(GEM_X)} frame @ {GEM_SIZE}x{GEM_SIZE}")
    return ("ui/ui-gems", GEM_SIZE, GEM_SIZE, len(GEM_X))


def salin(name: str, subdir: str, sumber: str) -> tuple[str, int, int] | None:
    if not os.path.exists(sumber):
        print(f"  ! LEWAT {name}: tidak ada\n    {sumber}")
        return None
    im = Image.open(sumber).convert("RGBA")
    target_dir = os.path.join(OUT, subdir)
    os.makedirs(target_dir, exist_ok=True)
    path = os.path.join(target_dir, f"{name}.png")
    im.save(path)
    print(f"  + {subdir}/{name}.png  {im.width}x{im.height}")
    return (f"{subdir}/{name}", im.width, im.height)


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

    gems = potong_gems()
    if gems:
        results.append(gems)

    print("\nMenyalin gambar utuh...")
    disalin = [r for r in (salin(*job) for job in SALIN) if r]

    print("\nRingkasan untuk src/data/frames.ts:")
    for key, fw, fh, count in results:
        print(f"  {key:<28} frameWidth: {fw:>3}, frameHeight: {fh:>3}, frames: {count}")

    print("\nRingkasan untuk src/data/backgrounds.ts:")
    for key, w, h in disalin:
        print(f"  {key:<28} {w} x {h}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
