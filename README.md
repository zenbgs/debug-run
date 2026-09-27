# DEBUG RUN

Game arcade **top-down** di browser: kamu seorang developer yang tersedot ke dalam
codebase-nya sendiri dan harus membasmi bug gelombang demi gelombang.

Terinspirasi [Bug Bash](https://bug-bash.github.com/) milik GitHub — mekaniknya, bukan asetnya.

Dibuat dengan **Phaser 3 + TypeScript + Vite**. Aset pixel art dari
[Legacy Collection](https://ansimuz.itch.io/) karya ansimuz (CC0).

---

## Main

```bash
npm install
npm run dev      # buka http://localhost:5173
```

```bash
npm run build    # typecheck + build produksi ke dist/
npm run preview  # cek hasil build
```

Tidak butuh backend, tidak butuh konfigurasi. Cukup buka di browser desktop.

## Kontrol

| Aksi | Tombol |
|---|---|
| Gerak | `WASD` atau panah |
| Pukul (combo 3 langkah) | `J` atau klik kiri |
| Skill Purge — AoE melingkar | `K` atau klik kanan |
| Skill Shock — garis menembus + stun | `L` atau `Q` |
| Dash (kebal selama bergerak) | `Spasi` atau `Shift` |
| Pilih upgrade antar wave | `1` / `2` / `3` |
| Jeda | `Esc` |
| Senyapkan audio | `M` |
| Ulang setelah kalah/menang | `R` |
| Hitbox debug | `F1` |

## Isi permainan

- **10 wave** dengan kurva kesulitan menanjak, plus **2 boss** di wave 5 dan 10
- **7 tipe musuh** dengan 3 perilaku berbeda: mengejar, zigzag, dan menerjang
- **Combo 3 pukulan** dengan hitstop, knockback, dan screen shake
- **2 skill berpendingin**: Purge (AoE melingkar, 25 damage) dan Shock (garis menembus,
  18 damage + membuat musuh terpaku 0,8 detik)
- **Dash** 160 px dengan kebal penuh dan bayangan sisa, pendinginan 1,2 detik
- **7 upgrade**, dipilih 1 dari 3 setiap kali wave bersih
- Boss punya 4 pola serangan (tembakan melingkar, beam bertelegraf, memanggil musuh,
  menerjang) dan **fase kedua** di bawah 50% HP

## Catatan teknis

**Audio dibangkitkan saat runtime.** Tidak ada satu pun file audio di repo ini — semua
SFX dan musik disintesis lewat Web Audio API dari oscillator dan noise
(`src/systems/Audio.ts`). Browser baru mengizinkan bunyi setelah interaksi pengguna,
jadi audio terbuka saat menekan SPASI di layar judul.

**Total aset ~140 KB.** Tujuh spritesheet, satu tileset, delapan FX (di-pack dari frame
per-PNG oleh `tools/pack_assets.py`), plus font pixel 29 KB yang di-host sendiri — bukan
dari CDN, jadi game tetap jalan offline.

**Angka balancing ada di `src/data/`,** terpisah dari logika. Menyetel permainan berarti
mengubah data, bukan kode.

## Struktur

```
src/
  data/       angka tuning: combat, skill, musuh, boss, wave, upgrade, tile
  entities/   Player, Enemy, Boss
  scenes/     BootScene (preload), TitleScene, GameScene
  systems/    ArenaBuilder, CombatSystem, WaveManager, BossAttacks,
              Audio, Particles, Ui, UpgradePanel
public/assets/  sprite, tileset, FX  (lihat CREDITS.md)
public/fonts/   Press Start 2P (OFL) + teks lisensinya
tools/          pack_assets.py — generator spritesheet
```

Desain lengkap beserta alasan tiap keputusan ada di [SPEC.md](./SPEC.md).

## Membangun ulang aset

Spritesheet di `public/assets/` sudah ikut ter-commit, jadi langkah ini opsional.
Diperlukan hanya kalau kamu ingin mengubah aset sumbernya:

```bash
# butuh folder "Legacy Collection/" dari ansimuz + Pillow
python tools/pack_assets.py
```

Folder `Legacy Collection/` sengaja **tidak** di-commit — ukurannya besar dan hanya
sebagian kecil yang dipakai. Unduh dari [ansimuz.itch.io](https://ansimuz.itch.io/)
kalau butuh.

## Catatan development

- Handle game tersedia di `window.__game` saat mode dev, untuk inspeksi lewat devtools.
- Arena dibangun dari seed tetap (`ARENA.SEED`), jadi layout selalu sama saat development.
- **Saat menguji lewat devtools, pastikan tab-nya di depan.** Chrome men-throttle
  `requestAnimationFrame` ke ~1 fps di tab background, sehingga game loop praktis
  berhenti dan input terlihat "tidak berfungsi" padahal kodenya benar.
- HMR meninggalkan state input basi. Kalau perilaku terasa aneh setelah edit,
  reload penuh dulu sebelum menyimpulkan ada bug.
- Tileset `overworld.png` punya sel yang **sepenuhnya kosong** dan tidak bisa dibedakan
  dari sel berisi hanya dengan melihat grid. Selalu verifikasi alpha sebelum menambah
  index baru ke `src/data/tiles.ts` — index kosong yang terpasang sebagai tembok
  menghasilkan dinding tak terlihat.

## Progres

Semua milestone selesai.

| Milestone | Isi | Status |
|---|---|---|
| M1 | Gerak 4 arah + collision + arena | ✅ |
| M2 | Combat: combo, hitstop, knockback, FX | ✅ |
| M3 | 7 tipe musuh + AI + damage dua arah | ✅ |
| M4 | 10 wave, upgrade, skor, game over | ✅ |
| M5 | 2 boss + pola serangan + fase | ✅ |
| M6 | Audio, partikel, layar judul, balancing | ✅ |
| + | Skill Purge & Shock, dash, font pixel | ✅ |

Seluruh isi SPEC §4-§5.2 sudah terimplementasi.

## Lisensi

Kode: **MIT** (lihat [LICENSE](./LICENSE)).

Aset pixel art: **CC0** dari [Legacy Collection](https://ansimuz.itch.io/) karya
Luis Zuno (ansimuz) — bebas dipakai tanpa kewajiban atribusi, tapi tetap dikreditkan
di [CREDITS.md](./CREDITS.md).

Font [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P) karya CodeMan38:
**SIL Open Font License 1.1** — teks lisensinya disertakan di `public/fonts/OFL.txt`.

Nama "Bug Bash", Octocat, dan aset milik GitHub **tidak** dipakai di project ini.
