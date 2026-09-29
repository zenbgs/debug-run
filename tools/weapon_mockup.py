#!/usr/bin/env python3
"""
Coba-coba posisi senjata TANPA menjalankan game.

Menyetel senjata lewat browser butuh puluhan detik per putaran; di sini satu
lembar berisi belasan kandidat jadi dalam sekejap. Dipakai untuk menemukan angka
di `HAND` (src/data/weapons.ts), lalu hasilnya tetap dibuktikan di game sungguhan
lewat `tools/verify_weapons.mjs`.

Ia juga yang dipakai untuk MENGUKUR letak tangan: `tangan()` mencari piksel warna
kulit di bagian bawah tiap frame. Versi pertama `HAND` diisi hasil hitungan kasar
dari kotak pembatas, dan senjatanya mengambang di udara — arah samping meleset
6-8 px karena tangan yang terlihat justru ada di dekat sumbu badan.

Jalankan:  python tools/weapon_mockup.py
"""

from __future__ import annotations

import os
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Butuh Pillow:  pip install Pillow")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "tools", "verify-out")

# Warna kulit TinyRPG, dipakai mendeteksi tangan.
KULIT = {(0xF9, 0xC1, 0x82), (0xCC, 0x88, 0x64)}
ROW = {"down": 0, "side": 1, "up": 2}


def muat(nama: str) -> Image.Image:
    return Image.open(os.path.join(ROOT, "public/assets/weapons", f"weapon-{nama}.png")).convert("RGBA")


def frame(kelas: str, arah: str, idx: int = 0) -> Image.Image:
    im = Image.open(os.path.join(ROOT, "public/assets/sprites", f"player-{kelas}.png")).convert("RGBA")
    r = ROW[arah]
    return im.crop((idx * 32, r * 32, idx * 32 + 32, r * 32 + 32))


def tangan(kelas: str, arah: str) -> tuple[int, int] | None:
    """Titik tengah piksel kulit di bagian bawah frame, relatif pusat (16,16)."""
    f = frame(kelas, arah)
    kulit = [
        (x, y)
        for y in range(32)
        for x in range(32)
        if f.getpixel((x, y))[3] > 0 and f.getpixel((x, y))[:3] in KULIT
    ]
    if not kulit:
        return None
    ys = [y for _, y in kulit]
    batas = min(ys) + (max(ys) - min(ys)) * 0.55  # bawah 45% = tangan, atas = wajah
    bawah = [(x, y) for x, y in kulit if y > batas]
    if not bawah:
        return None
    xs = [x for x, _ in bawah]
    return (max(xs) - 16, sum(y for _, y in bawah) // len(bawah) - 16)


def taruh(
    base: Image.Image,
    w: Image.Image,
    x: float,
    y: float,
    deg: float,
    grip: float,
    belakang: bool = False,
    flip: bool = False,
) -> Image.Image:
    """
    x,y: letak GENGGAMAN relatif pusat frame 32x32.
    deg: 0 = ujung senjata menghadap atas, positif = searah jarum jam.
    grip: 0..1 sepanjang tinggi sprite senjata (0=ujung atas, 1=ujung bawah).

    Rotasi dilakukan pada kanvas berbantal yang genggamannya tepat di PUSAT
    kanvas, lalu diputar tanpa expand. Memakai rotate(center=..., expand=True)
    sekaligus memberi hasil salah — senjatanya menyusut lalu hilang di sudut
    besar, dan itu sempat terbaca sebagai "sudut 80 derajat tidak terpakai".
    """
    im = w.transpose(Image.FLIP_LEFT_RIGHT) if flip else w
    R = int(max(im.size) * 2) + 4
    kanvas = Image.new("RGBA", (R * 2, R * 2), (0, 0, 0, 0))
    gx, gy = im.width / 2, im.height * grip
    kanvas.alpha_composite(im, (int(round(R - gx)), int(round(R - gy))))
    kanvas = kanvas.rotate(-deg, resample=Image.NEAREST)

    lapis = Image.new("RGBA", base.size, (0, 0, 0, 0))
    lapis.alpha_composite(kanvas, (int(round(16 + x - R)), int(round(16 + y - R))))

    if belakang:
        out = lapis.copy()
        out.alpha_composite(base)
        return out
    out = base.copy()
    out.alpha_composite(lapis)
    return out


def lembar(kasus: list[tuple[str, Image.Image]], path: str, skala: int = 9) -> None:
    out = Image.new("RGBA", (32 * skala * len(kasus), 32 * skala), (24, 28, 38, 255))
    for i, (_, im) in enumerate(kasus):
        bg = Image.new("RGBA", (32 * skala, 32 * skala), (58, 86, 42, 255))
        bg.alpha_composite(im.resize((32 * skala, 32 * skala), Image.NEAREST))
        out.alpha_composite(bg, (i * 32 * skala, 0))
    os.makedirs(OUT, exist_ok=True)
    out.save(path)
    print(f"  + {path}  [{', '.join(k for k, _ in kasus)}]")


# Harus sama dengan HAND/GRIP/BEHIND di src/data/weapons.ts.
SENJATA = {"warrior": ("guy", "sword", 1.0, False),
           "archer": ("pirategirl", "bow", 0.5, True),
           "mage": ("blondkid", "staff", 0.72, False)}
HAND = {
    "warrior": {"down": (6, 9, 40), "side": (-2, 9, 65), "up": (-6, 9, -40)},
    "archer": {"down": (7, 6, 0), "side": (5, 6, 20), "up": (-7, 6, 0)},
    "mage": {"down": (5, 9, 20), "side": (2, 9, 30), "up": (-6, 9, -20)},
}


def main() -> int:
    print("Letak tangan terukur (relatif pusat sprite):")
    for kelas, (spr, *_rest) in SENJATA.items():
        baris = "  ".join(
            f"{a}={tangan(spr, a)}" for a in ("down", "side", "up") if tangan(spr, a)
        )
        print(f"  {kelas:8} {baris}")

    print("\nLembar pose sekarang:")
    for kelas, (spr, jenis, grip, blk) in SENJATA.items():
        w = muat(jenis)
        kasus = []
        for arah in ("down", "side", "up"):
            x, y, d = HAND[kelas][arah]
            kasus.append((arah, taruh(frame(spr, arah), w, x, y, d, grip, belakang=blk or arah == "up")))
        lembar(kasus, os.path.join(OUT, f"mockup-{kelas}.png"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
