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
| Skill 1 (berbeda tiap kelas) | `K` atau klik kanan |
| Skill 2 (berbeda tiap kelas) | `L` atau `Q` |
| Dash (kebal selama bergerak) | `Spasi` atau `Shift` |
| Pilih upgrade antar wave | `1` / `2` / `3` |
| Jeda | `Esc` |
| Senyapkan audio | `M` |
| Ulang setelah kalah/menang | `R` |
| Hitbox debug | `F1` |

## Isi permainan

- **10 wave** dengan kurva kesulitan menanjak, plus **2 boss** di wave 5 dan 10
- **8 tipe musuh** dengan 4 perilaku: mengejar, zigzag, menerjang, dan **menembak
  dari jarak jauh** — yang terakhir memaksa kamu bergerak dan memakai rintangan
  arena sebagai perlindungan
- **Combo 3 pukulan** dengan hitstop, knockback, dan screen shake
- **3 kelas karakter** dengan cara main berbeda, dipilih sebelum mulai:
  Warrior (tebal, ayunan melee), Archer (panah jarak jauh 190 px, tergesit),
  Mage (bola api jarak pendek 95 px, skill dua kali lebih sering dan jauh lebih keras)
- **6 skill — dua milik tiap kelas**, tidak ada yang dipakai bersama:
  Cleave/Warcry, Volley/Pin Shot, Purge/Shock
- **Cara menyerang berbeda tiap kelas**, bukan sekadar angka: Warrior mengayun baja,
  Archer melesatkan panah jauh, Mage melempar bola api jarak pendek
- **Cerita bergaya RPG** dengan kotak dialog berefek ketik di pembuka,
  kedua wave boss, dan penutup
- **Dash** 160 px dengan kebal penuh dan bayangan sisa, pendinginan 1,2 detik
- **10 upgrade**, dipilih 1 dari 3 setiap kali wave bersih — tiga di antaranya
  mengubah cara main: dash yang melukai, musuh yang meledak saat mati, dan duri
  yang memantulkan damage kontak
- **Angka damage melayang**, jadi efek upgrade benar-benar terasa
- **Pengali skor dari rantai bunuh** hingga x5 — putus kalau kamu kena pukul,
  jadi bermain rapi benar-benar terbayar
- **Layout arena acak tiap sesi**, bisa dikunci ke seed tetap saat debugging
- Boss punya 4 pola serangan (tembakan melingkar, beam bertelegraf, memanggil musuh,
  menerjang) dan **fase kedua** di bawah 50% HP

## Catatan teknis

**Audio dibangkitkan saat runtime.** Tidak ada satu pun file audio di repo ini — semua
SFX dan musik disintesis lewat Web Audio API dari oscillator dan noise
(`src/systems/Audio.ts`). Browser baru mengizinkan bunyi setelah interaksi pengguna,
jadi audio terbuka saat menekan SPASI di layar judul.

**Total aset ~160 KB.** Delapan spritesheet, satu tileset, sebelas FX (di-pack dari frame
per-PNG oleh `tools/pack_assets.py`), plus font pixel 29 KB yang di-host sendiri — bukan
dari CDN, jadi game tetap jalan offline.

**Angka balancing ada di `src/data/`,** terpisah dari logika. Menyetel permainan berarti
mengubah data, bukan kode.

**Objek yang berumur pendek dibersihkan lewat `systems/Lifecycle.ts`.** Pola
`scene.events.once(SHUTDOWN, ...)` per sprite pernah membocorkan 200 listener hanya
dari ~200 pemutaran FX; helper itu melepas listener begitu objeknya hancur.

## Struktur

```
src/
  data/       angka tuning: kelas, skill, combat, musuh, boss, wave, upgrade, tile
              plus naskah cerita (story.ts)
  entities/   Player, Enemy, Boss
  scenes/     BootScene (preload), TitleScene, CharacterSelectScene, GameScene
  systems/    ArenaBuilder, CombatSystem, WaveManager, BossAttacks,
              Audio, Particles, Ui, UpgradePanel, DialogueBox
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
- Arena memakai seed acak tiap sesi. Set `ARENA.RANDOM_SEED: false` kalau butuh
  layout yang bisa diulang saat mengejar bug.
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
| + | Skill, dash, font pixel | ✅ |
| + | Pilih kelas, skill per kelas, cerita | ✅ |

Seluruh isi SPEC §4-§5.2 sudah terimplementasi.

## Lisensi

Kode: **MIT** (lihat [LICENSE](./LICENSE)).

Aset pixel art: **CC0** dari [Legacy Collection](https://ansimuz.itch.io/) karya
Luis Zuno (ansimuz) — bebas dipakai tanpa kewajiban atribusi, tapi tetap dikreditkan
di [CREDITS.md](./CREDITS.md).

Font [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P) karya CodeMan38:
**SIL Open Font License 1.1** — teks lisensinya disertakan di `public/fonts/OFL.txt`.

Nama "Bug Bash", Octocat, dan aset milik GitHub **tidak** dipakai di project ini.
