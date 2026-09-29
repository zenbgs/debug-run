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
| `public/assets/sprites/player-guy.png` | `Assets/TinyRPG/Characters/Top-Down-16-bit-fantasy/Characters pack 1/Guy/aseprite.png` | Sprite kelas Warrior |
| `public/assets/sprites/player-blondkid.png` | `.../Characters pack 1/Blond_kid/aseprite.png` | Sprite kelas Mage |
| `public/assets/sprites/player-pirategirl.png` | `.../Characters pack 1/PirateGirl/spritesheet.png` | Sprite kelas Archer |
| `public/assets/tilesets/overworld.png` | `Assets/TinyRPG/Environments/Overworld/Overworld 16x16/Tileset/overworld.png` | Tileset arena |
| `public/assets/sprites/enemy-beetle.png` | `Assets/Warped/Characters/top-down-shooter-enemies/sprites/enemy-01/` | Musuh kumbang (aktif) |
| `public/assets/sprites/enemy-crawler.png` | `.../top-down-shooter-enemies/sprites/enemy-02/` | Musuh kumbang mesin |
| `public/assets/sprites/enemy-moth.png` | `.../top-down-shooter-enemies/sprites/enemy-03/` | Musuh ngengat |
| `public/assets/fx/fx-slash-horizontal.png` | `Assets/Explosions and Magic/Grotto-escape-2-FX/sprites/slash-horizontal/` | FX pukulan 1 |
| `public/assets/fx/fx-slash-upward.png` | `.../Grotto-escape-2-FX/sprites/slash-upward/` | FX pukulan 2 |
| `public/assets/fx/fx-slash-circular.png` | `.../Grotto-escape-2-FX/sprites/slash-circular/` | FX finisher |
| `public/assets/fx/fx-enemy-death.png` | `.../Grotto-escape-2-FX/sprites/enemy-death/` | FX musuh mati |
| `public/assets/fx/fx-hit.png` | `Assets/Explosions and Magic/Hit/Sprites/` | FX kena pukul |
| `public/assets/fx/fx-electro-shock.png` | `.../Grotto-escape-2-FX/sprites/electro-shock/` | FX skill Shock |
| `public/assets/fx/fx-energy-field.png` | `.../Grotto-escape-2-FX/sprites/energy-field/` | FX skill Warcry |
| `public/assets/fx/fx-energy-smack.png` | `.../Grotto-escape-2-FX/sprites/energy-smack/` | FX skill Purge (Mage) |
| `public/assets/fx/fx-arcane-crescent.png` | `Assets/Explosions and Magic/Warped shooting fx/crossed/` | FX pukulan Mage |
| `public/assets/fx/fx-arcane-blast.png` | `.../Warped shooting fx/charged/` | FX finisher Mage |
| `public/assets/fx/fx-hit-slash.png` | `.../Warped shooting fx/hits/Hits-2/sprites/` | FX benturan Warrior |
| `public/assets/fx/fx-hit-pierce.png` | `.../Warped shooting fx/hits/hits-1/sprites/` | FX benturan Archer |
| `public/assets/fx/fx-hit-arcane.png` | `.../Warped shooting fx/hits/Hits-5/sprites/` | FX benturan Mage |
| `public/assets/fx/fx-explosion-big.png` | `Assets/Explosions and Magic/Explosions pack/explosion-1-f/Sprites/` | Ledakan elite Peledak |
| `public/assets/fx/fx-explosion-small.png` | `.../Explosions pack/explosion-1-g/Sprites/` | Upgrade "Ledakan Akhir" |
| `public/assets/ui/ui-gems.png` | `Assets/Misc/gems/spritesheets/gems-spritesheet.png` | Ikon kategori panel upgrade |
| `public/assets/weapons/weapon-sword.png` | `Assets/Gothicvania/Misc/fantasy weapons set/PNG/1.png` | Pedang di tangan Warrior |
| `public/assets/sprites/player-arrow.png` | `Assets/Gothicvania/Misc/Dagger/` | Panah Archer |
| `public/assets/sprites/player-fireball.png` | `.../Grotto-escape-2-FX/sprites/fire-ball/` | Bola api Mage |
| `public/assets/sprites/boss-core.png` | `Assets/Warped/Characters/top-down-boss/PNG/sprites/boss/` | Boss wave 10 (Null Pointer) |
| `public/assets/sprites/boss-sentinel.png` | `Assets/TinyRPG/Characters/Battle Sprites/Mechanic/Sentinel.png` | Boss wave 5 (Stack Overflow) |
| `public/assets/fx/boss-bolt.png` | `.../top-down-boss/PNG/sprites/bolt/` | Proyektil boss |
| `public/assets/fx/boss-rays.png` | `.../top-down-boss/PNG/sprites/rays/` | Beam boss |
| `public/assets/bg/bg-mist-*.png` | `Assets/Gothicvania/Environments/mist-forest-background/layers/` | Latar parallax layar cerita |

Berkas di `public/assets/bg/` **disalin apa adanya** oleh `tools/pack_assets.py`
(bagian `SALIN`), bukan di-pack jadi strip — semuanya gambar utuh tampak-samping
yang hanya dipakai layar cerita.

Berkas di `public/assets/fx/` dan `enemy-*.png` dihasilkan oleh `tools/pack_assets.py`
(frame per-PNG di-pack jadi strip horizontal seragam). Jalankan ulang script itu kalau
sumbernya berubah — jangan edit hasilnya manual.

`public/assets/ui/ui-gems.png` juga dihasilkan script yang sama, tapi lewat jalur
berbeda (`potong_gems`): sumbernya satu lembar besar berisi animasi berputar untuk
enam warna, dan yang diambil hanya frame pertama tiap warna — permata diam, bukan
berputar, supaya tidak menarik mata dari teks upgrade di sebelahnya.

Varian ledakan `explosion-1-c/d/e` sengaja **tidak** dipakai: asapnya membubung ke
atas, yang terbaca sebagai tampak-samping dan salah untuk arena tampak-atas.

---

## Aset gambar sendiri — busur & tongkat

| Berkas | Asal |
|---|---|
| `public/assets/weapons/weapon-bow.png` | **digambar sendiri** — `tools/pack_assets.py`, konstanta `BUSUR` |
| `public/assets/weapons/weapon-staff.png` | **digambar sendiri** — `tools/pack_assets.py`, konstanta `TONGKAT` |

Keduanya bukan aset pihak ketiga dan tidak butuh atribusi. Alasannya dicatat di
sini supaya jelas asalnya saat ditelusuri belakangan: **seluruh Legacy Collection
tidak punya satu pun busur atau tongkat** — `fantasy weapons set` isinya hanya
sepuluh bilah dan tombak. Tanpa keduanya, Archer dan Mage akan bertangan kosong
sementara Warrior memegang pedang.

Gambarnya ditulis sebagai seni ASCII di `tools/pack_assets.py` (satu huruf = satu
piksel, lihat `PALET`), jadi bisa disunting langsung di situ dan dihasilkan ulang
bersama aset lain. Paletnya diambil dari sprite pemain TinyRPG dan gagang pedang
Gothicvania, bukan dikarang — warna yang meleset akan langsung terbaca sebagai
tempelan dari game lain.

Pedang Warrior memakai `1.png` (scimitar), bukan `2.png` (pedang lurus). Keduanya
dibandingkan pada ukuran jadinya: bilah lurus tipis menyusut jadi garis selebar
1–2 px yang terbaca sebagai tongkat, sementara bilah melengkung tetap punya badan
dan gagang emasnya tetap terlihat. Varian 4, 5, 9, dan 10 gugur karena hal yang
sama, dan kapak serta halberd karena berubah jadi bercak tak terbaca pada 16 px.

---

## Belum dipakai / masih dibutuhkan

| Kebutuhan | Status |
|---|---|
| SFX | ✅ **tidak butuh aset** — disintesis runtime lewat Web Audio (`src/systems/Audio.ts`) |
| Musik latar | ✅ **tidak butuh aset** — arpeggio prosedural, sumber yang sama |
| Tekstur partikel | ✅ **tidak butuh aset** — dibuat runtime (`src/systems/Particles.ts`) |
| Font `Press Start 2P` | ✅ dipasang — lihat bagian di bawah |

---

## Press Start 2P — CodeMan38

Berkas: `public/fonts/PressStart2P.woff2` (29 KB)
Penulis: **Cody Boisclair (CodeMan38)** — <https://fonts.google.com/specimen/Press+Start+2P>

**Lisensi: SIL Open Font License 1.1.** Teks lisensi lengkap disertakan di
`public/fonts/OFL.txt` sebagaimana diwajibkan OFL.

Font di-**host sendiri**, bukan dimuat dari Google Fonts CDN. Alasannya: game tetap
jalan offline, tidak ada permintaan ke pihak ketiga saat dimainkan, dan versinya
terkunci. Berkas TTF asli (115 KB) dikonversi ke woff2 (29 KB).

---

## Yang TIDAK boleh dipakai

- Sprite, logo, Octocat, atau nama **"Bug Bash"** milik GitHub. Itu trademark
  GitHub. Yang ditiru adalah mekanik permainannya, bukan asetnya.
