# Credits — Aset Pihak Ketiga

Berkas ini wajib diperbarui **setiap kali** ada aset baru masuk ke `public/assets/`.
Menelusuri asal aset belakangan sangat menyakitkan. (SPEC.md §12)

---

## Legacy Collection — ansimuz

Sumber lokal: `Legacy Collection/` (di luar folder build).
Penulis: **ansimuz** — <https://ansimuz.itch.io/>

✅ **Lisensi: CC0 (Creative Commons Zero) — terverifikasi 2026-09-27.**

Dikutip dari `public-license.pdf` yang disertakan dalam paket:

> All assets included in this package are licensed under the Creative Commons Zero (CC0)
> license, which means you can use them freely in any project, whether personal or
> commercial, without the need for attribution. There are no restrictions on use,
> modification, or redistribution of these assets.
> — Luis Zuno aka Ansimuz

Atribusi tidak diwajibkan, tapi tetap dicantumkan di sini sebagai penghargaan kepada
penulisnya. Dukung karyanya di <https://ansimuz.itch.io/>.

### Berkas yang dipakai

| Berkas di project | Asal di Legacy Collection | Dipakai untuk |
|---|---|---|
| `public/assets/sprites/player-guy.png` | `Assets/TinyRPG/Characters/Top-Down-16-bit-fantasy/Characters pack 1/Guy/aseprite.png` | Sprite pemain (aktif) |
| `public/assets/sprites/player-blondkid.png` | `.../Characters pack 1/Blond_kid/aseprite.png` | Sprite pemain (cadangan) |
| `public/assets/sprites/player-pirategirl.png` | `.../Characters pack 1/PirateGirl/spritesheet.png` | Sprite pemain (cadangan) |
| `public/assets/tilesets/overworld.png` | `Assets/TinyRPG/Environments/Overworld/Overworld 16x16/Tileset/overworld.png` | Tileset arena |
| `public/assets/sprites/enemy-beetle.png` | `Assets/Warped/Characters/top-down-shooter-enemies/sprites/enemy-01/` | Musuh kumbang (aktif) |
| `public/assets/sprites/enemy-crawler.png` | `.../top-down-shooter-enemies/sprites/enemy-02/` | Musuh kumbang mesin |
| `public/assets/sprites/enemy-moth.png` | `.../top-down-shooter-enemies/sprites/enemy-03/` | Musuh ngengat |
| `public/assets/fx/fx-slash-horizontal.png` | `Assets/Explosions and Magic/Grotto-escape-2-FX/sprites/slash-horizontal/` | FX pukulan 1 |
| `public/assets/fx/fx-slash-upward.png` | `.../Grotto-escape-2-FX/sprites/slash-upward/` | FX pukulan 2 |
| `public/assets/fx/fx-slash-circular.png` | `.../Grotto-escape-2-FX/sprites/slash-circular/` | FX finisher |
| `public/assets/fx/fx-enemy-death.png` | `.../Grotto-escape-2-FX/sprites/enemy-death/` | FX musuh mati |
| `public/assets/fx/fx-hit.png` | `Assets/Explosions and Magic/Hit/Sprites/` | FX kena pukul |
| `public/assets/sprites/boss-core.png` | `Assets/Warped/Characters/top-down-boss/PNG/sprites/boss/` | Sprite kedua boss |
| `public/assets/fx/boss-bolt.png` | `.../top-down-boss/PNG/sprites/bolt/` | Proyektil boss |
| `public/assets/fx/boss-rays.png` | `.../top-down-boss/PNG/sprites/rays/` | Beam boss |

Berkas di `public/assets/fx/` dan `enemy-*.png` dihasilkan oleh `tools/pack_assets.py`
(frame per-PNG di-pack jadi strip horizontal seragam). Jalankan ulang script itu kalau
sumbernya berubah — jangan edit hasilnya manual.

---

## Belum dipakai / masih dibutuhkan

| Kebutuhan | Status |
|---|---|
| SFX | ✅ **tidak butuh aset** — disintesis runtime lewat Web Audio (`src/systems/Audio.ts`) |
| Musik latar | ✅ **tidak butuh aset** — arpeggio prosedural, sumber yang sama |
| Tekstur partikel | ✅ **tidak butuh aset** — dibuat runtime (`src/systems/Particles.ts`) |
| Font `Press Start 2P` | ⬜ opsional; sekarang memakai monospace bawaan sistem |

Artinya **seluruh aset pihak ketiga di project ini hanya berasal dari Legacy Collection**
(4 sprite + 1 tileset + 5 FX). Tidak ada aset audio atau font eksternal yang perlu diaudit.

---

## Yang TIDAK boleh dipakai

- Sprite, logo, Octocat, atau nama **"Bug Bash"** milik GitHub. Itu trademark
  GitHub. Yang ditiru adalah mekanik permainannya, bukan asetnya.
