# Game Spec — *Bug Bash Clone* (working title: **DEBUG RUN**)

> Status: **DRAFT v0.1** · Tanggal: 2026-09-27
> Spec ini disusun berdasarkan audit aset nyata di `Legacy Collection/` (ansimuz).
> Semua path aset di dokumen ini sudah diverifikasi ada di disk.

---

## 1. Ringkasan

Game arcade **top-down** berbasis browser. Pemain mengendalikan seorang developer yang
tersedot ke dalam codebase-nya sendiri dan harus membasmi *bug* yang bermunculan
gelombang demi gelombang. Referensi rasa: <https://bug-bash.github.com/>.

**Pilar desain**

1. **Langsung seru dalam 5 detik** — tanpa tutorial, tanpa menu bertingkat. Gerak + pukul.
2. **Combat terasa "nendang"** — knockback, hitstop, screen shake, FX slash yang tebal.
3. **Satu sesi = 5–8 menit** — cocok dimainkan di tab browser saat rehat.

**Non-goal (v1):** multiplayer, save/progress permanen, cerita bercabang, mobile touch control.

---

## 2. Target teknis

| Item | Keputusan |
|---|---|
| Platform | Browser desktop (Chrome/Firefox/Edge/Safari terbaru) |
| Engine | **Phaser 3 + Vite** ✅ dikonfirmasi |
| Bahasa | TypeScript |
| Resolusi logis | **480 × 270** px, integer-scale ke ukuran window |
| Ukuran tile | 16 × 16 px |
| Ukuran sprite pemain | 32 × 32 px |
| Target frame rate | 60 fps |
| Budget ukuran build | < 5 MB total (aset pixel art sangat ringan) |

---

## 3. Core loop

```
Masuk arena → wave bug muncul → basmi semua bug → jeda 3 detik + pilih 1 upgrade
     ↑                                                          │
     └──────────────────────────────────────────────────────────┘
                     (10 wave, boss di wave 5 & 10)

                        mati → layar skor → retry
```

Kondisi menang: selesaikan wave 10. Kondisi kalah: HP pemain habis.

---

## 4. Kontrol

| Aksi | Keyboard | Alternatif |
|---|---|---|
| Gerak | `WASD` | Arrow keys |
| Serang (pukul) | `J` | Left click |
| Skill 1 (berbeda tiap kelas) | `K` | Right click |
| Skill 2 (berbeda tiap kelas) | `L` | `Q` |
| Dash | `Space` | `Shift` |
| Pause | `Esc` | — |

Serangan mengarah ke **arah hadap terakhir**, bukan ke posisi mouse. Ini menjaga kontrol
tetap keyboard-only dan konsisten dengan sprite 3-arah yang kita punya (lihat §7).

---

## 5. Pemain

### 5.1 Stat dasar

Angka di bawah adalah **basis**; tiap kelas mengubahnya (lihat §5.2.1).

| Stat | Nilai basis | Catatan |
|---|---|---|
| HP | 100 | kelas menimpanya: Warrior 130, Archer 85, Mage 75 |
| Kecepatan gerak | 110 px/detik | dikali `speedMultiplier` kelas |
| I-frame setelah kena | **0,75 detik** | sprite berkedip |
| Knockback saat kena | 150 px/detik selama 0,14 detik | — |

### 5.2 Serangan & skill

| Aksi | Damage | Cooldown | Hitbox | FX |
|---|---|---|---|---|
| Pukul 1 | 12 | 0.35 s | kotak 28×24 di depan | `slash-horizontal` (5 frame) |
| Pukul 2 (combo) | 12 | — | kotak 28×24 di depan | `slash-upward` (5 frame) |
| Pukul 3 (finisher) | 22 | 0.6 s | lingkaran r=34 | `slash-circular` (6 frame) |
| **Dash** ✅ | — | 1.2 s | 160 px, i-frame penuh | after-image sprite |

Skill tidak lagi universal — lihat §5.2.2 untuk daftar per kelas.

### 5.2.1 Kelas karakter

Pemain memilih satu dari **3 kelas** sebelum bermain. ⚠️ Legacy Collection hanya punya
**3 sprite karakter tampak-atas**, jadi jumlah kelas dibatasi oleh aset — menambah kelas
ke-4 berarti dua kelas memakai sprite identik, yang membingungkan saat bermain.

| Kelas | Sprite | HP | Serangan dasar | Ciri |
|---|---|---|---|---|
| **Warrior** | Guy | 130 | melee, damage x1,2 | paling tebal, dorongan terkuat |
| **Archer** | PirateGirl | 85 | **panah jarak jauh** (190 px) | tergesit, dash 20% lebih sering |
| **Mage** | Blond_kid | 75 | **bola api jarak pendek** (95 px) | skill 2x lebih sering, damage skill x1,9 |

⚠️ **Pengali damage kelas dipisah antara serangan dasar dan skill.** `damageMultiplier`
hanya untuk pukulan biasa; skill memakai `skillDamageMultiplier`. Kalau keduanya
dikalikan, pukulan lemah Mage ikut menyeret turun skill-nya — terukur Purge Mage 30,9 vs
Cleave Warrior 30, kebalikan dari yang dirancang. Setelah dipisah: 47,5 vs 30.

`stats.damageMultiplier` menampung **bonus upgrade saja**, bukan nilai kelas.

### 5.2.2 Skill per kelas

Setiap kelas punya sepasang skill sendiri; tidak ada yang dipakai bersama. Slot 1 di
tombol `K` (atau klik kanan), slot 2 di `L`/`Q`.

| Kelas | Slot 1 | Slot 2 |
|---|---|---|
| Warrior | **Cleave** - 30 dmg, r=46, knockback 460 (terkuat), cd 5,5 s | **Warcry** - 10 dmg, r=62, **stun 1,4 s**, cd 10 s |
| Archer | **Volley** - 9 panah menyebar, 11 dmg/panah, cd 6 s | **Pin Shot** - 24 dmg, **menembus** + **stun 1 s**, cd 9 s |
| Mage | **Purge** - 25 dmg, r=50, cd 6 s | **Shock** - 18 dmg, garis menembus + **stun 0,8 s**, cd 9 s |

Skill punya dua jenis eksekusi: `hitbox` memakai jalur `CombatSystem.resolveAttack`
yang sama dengan combo, sedangkan `volley` menembakkan panah lewat jalur proyektil.

### 5.2.2b Serangan dasar per kelas

Ketiga kelas menyerang dengan cara yang berbeda, bukan sekadar angka berbeda:

| Kelas | Cara | FX |
|---|---|---|
| Warrior | ayunan melee | `slash-horizontal`, `slash-upward`, `slash-circular` |
| Archer | proyektil panah, jangkauan 190 px, cepat (300 px/d) | panah itu sendiri |
| Mage | proyektil bola api, jangkauan **95 px**, lambat (210 px/d) | kilatan `arcane-crescent`/`arcane-blast` + bola api |

**Proyektil didefinisikan per kelas** lewat `projectile` di `data/classes.ts` (texture,
kecepatan, jangkauan, ukuran body, skala, beranimasi atau tidak). Jangkauan Mage sengaja
dibuat pendek supaya ia tetap harus mendekat — kalau disamakan dengan Archer, tidak ada
alasan memainkan Archer.

`attackFx` adalah **kilatan merapal**, bukan pengganti proyektil: untuk kelas jarak jauh
ia tampil berbarengan dengan proyektilnya. Tiap entri punya `rotates` — bentuk memanjang
diputar mengikuti arah hadap, ledakan radial tidak.

⚠️ Offset body proyektil **wajib** diset eksplisit; `setSize()` tidak memusatkannya
(lihat §5.2.4).

### 5.2.3 Dash

`SPASI` / `SHIFT`: 160 px dalam 180 ms, pendinginan 1,2 detik, **kebal penuh** selama
bergerak, dengan bayangan sisa yang memudar. Kebalnya disengaja — tanpa itu dash hanya
melemparkan pemain ke dalam kerumunan dan justru menambah damage yang diterima.

Dash tetap tunduk pada tabrakan tembok dan rintangan: menabrak pohon di tengah dash akan
memotong jaraknya. Itu perilaku yang diinginkan, bukan bug.

### 5.2.4 Panah — deteksi tumbukan manual

Panah **tidak** memakai `physics.add.overlap`. Pendekatan itu sempat dipakai dan gagal
diam-diam: panahnya hancur tapi damage tidak pernah masuk. Penyebab awalnya terukur —
`body.setSize()` tidak memusatkan body pada sprite panah, sehingga body tertinggal di
pojok frame 32x32 (sprite di (433,303), body di (417,287)) dan tidak pernah bersentuhan
dengan musuh. Offset kini diset eksplisit, dan deteksi kenanya dihitung manual di
`updateArrows()` seperti beam boss — jauh lebih mudah dibuktikan benar.

### 5.2.5 Cerita

Naskah ada di `src/data/story.ts`, terpisah dari logika. Tiga titik: pembuka (setelah
pilih kelas), wave boss 5 dan 10, serta penutup setelah menang. `DialogueBox` memakai
efek ketik; SPASI menuntaskan baris yang sedang diketik, lalu menekan lagi untuk lanjut.

⚠️ Teks naskah **tidak boleh dipenggal manual** dengan karakter baris baru —
`DialogueBox` memakai word-wrap, dan mencampur keduanya menghasilkan baris yatim
satu kata.

---

## 6. Musuh

Semua musuh: muncul dari tepi arena, mengejar pemain, mati dengan FX `enemy-death` (8 frame)
plus drop poin.

> **Roster diganti total di M2.** Rencana awal memakai `Living Pack 1` (Slime, Frog) dan
> `Mechanic` (Drone, Sentinel, dll). Keduanya gugur: itu sprite layar-battle RPG dengan
> ukuran konten **62×80 sampai 118×97 px** — 2 sampai 4 kali besar pemain (32×32), dan
> digambar dari samping, bukan dari atas.
>
> Penggantinya `Warped/Characters/top-down-shooter-enemies`: frame 48×48 dengan konten
> 27–42 px, **benar-benar tampak-atas**, dan wujudnya memang **serangga** — jauh lebih
> nyambung dengan tema bug-bashing daripada slime fantasi.

Hanya ada **3 sprite** yang layak, jadi 8 tipe dibuat sebagai varian statistik: tint warna
berbeda plus HP/kecepatan/perilaku berbeda. Nilai di bawah adalah yang benar-benar
diimplementasi di `src/data/enemies.ts` (terverifikasi di M3).

| # | Nama | Sprite | Tint | HP | Speed | Perilaku | Damage | Buka di |
|---|---|---|---|---|---|---|---|---|
| 1 | **Glitchling** | kumbang | — | 30 | 55 | kejar | 8 | 0 s |
| 2 | **Glitchling Cepat** | kumbang | merah | 18 | 100 | kejar | 8 | 10 s |
| 3 | **Moth** | ngengat | — | 35 | 88* | zigzag | 10 | 20 s |
| 4 | **Crawler** | kumbang mesin | — | 45 | 45 | kejar, tahan knockback 40% | 12 | 32 s |
| 5 | **Moth Biru** | ngengat | biru | 24 | 118* | zigzag | 9 | 45 s |
| 6 | **Spitter** | ngengat | hijau | 28 | 52 | **menjaga jarak & menembak** | 9 (proyektil) | 26 s |
| 6 | **Charger** | kumbang mesin | oranye | 55 | 210 | incar 0,9 s → terjang 0,42 s → pulih 0,7 s | 18 | 60 s |
| 7 | **Crawler Berat** | kumbang mesin | ungu | 80 | 32 | kejar, tahan knockback 80% | 16 | 78 s |
| B1 | **Stack Overflow** (wave 5) | `boss-sentinel`, skala 0.62 | — | 340 | 48 | charge → summon → spread → summon | 18 | M5 |
| B2 | **Null Pointer** (wave 10) | `boss-core`, skala 0.55 | — | 620 | 20 | spread → beam → summon → spread → beam → charge | 25 | M5 |

\* Kecepatan efektif tipe zigzag **22% lebih tinggi** dari angka ini, karena goyangan
ditambahkan sebagai vektor tegak lurus. Moth `speed: 88` terukur bergerak 107 px/detik.

**Kurva spawn (M3, sementara):** jeda mulai 1,7 detik dan memendek 9 ms tiap detik
bertahan, minimum 0,42 detik; maksimum 22 musuh hidup bersamaan; musuh muncul di luar
pandangan kamera. Sistem ini diganti jadwal wave berjadwal di M4.

**Catatan aset:** sprite musuh hanya punya satu orientasi. Flip horizontal mengikuti arah
gerak; tidak ada sprite hadap-atas/hadap-bawah, dan itu diterima karena bentuknya simetris.

### 6.1 Susunan wave

Jadwal 10 wave yang diimplementasi ada di `src/data/waves.ts`. Wave 5 dan 10 adalah wave
boss (`isBossWave: true`); boss selalu dikeluarkan lebih dulu dan tidak dibatasi `maxAlive`
supaya wave boss tidak pernah kehabisan slot spawn.

| Wave | Nama | Isi | Jumlah |
|---|---|---|---|
| 1 | Syntax Error | Glitchling x5 | 5 |
| 2 | Off By One | Glitchling x6, Glitchling Cepat x2 | 8 |
| 3 | Race Condition | Glitchling Cepat x4, Moth x3 | 7 |
| 4 | Memory Leak | Crawler x4, Moth x3 | 7 |
| **5** | Stack Overflow | **BOSS Stack Overflow** + Glitchling x4 | 5 |
| 6 | Infinite Loop | Moth x4, Glitchling Cepat x4 | 8 |
| 7 | Deadlock | Crawler x5, Moth Biru x3 | 8 |
| 8 | Buffer Overrun | Charger x2, Moth Biru x5 | 7 |
| 9 | Heisenbug | Crawler Berat x3, Charger x2, Moth x4 | 9 |
| **10** | Null Pointer | **BOSS Null Pointer** + Moth x3, Crawler x2 | 6 |

Wave bersih -> bonus skor `50 x nomor wave`, lalu pemain memilih 1 dari 3 upgrade.
Setelah wave 10 tidak ada tawaran upgrade — langsung layar menang.

### 6.0b Spitter — musuh penembak

Ketujuh musuh awal semuanya melee-kontak, sehingga strategi optimal selalu sama:
mundur lalu ayun. **Spitter** menjaga jarak 130 px dan menembak, memaksa pemain
bergerak — dan akhirnya membuat gerombolan batu/pohon di arena berfungsi sebagai
penghalang tembakan seperti yang dijanjikan §7.

Ada telegraf 0,45 detik: Spitter berhenti dan memutih sebelum melepas tembakan,
jadi pemain punya waktu berlindung. Proyektilnya memakai jalur `BossAttacks.fireBolt()`
yang sudah menangani tabrakan tembok, kedaluwarsa, dan damage ke pemain — tidak ada
sistem proyektil baru.

**Charger** juga kini memutih selama fase mengincar. Sebelumnya terjangannya datang
tanpa aba-aba yang terbaca dan terasa tidak adil.

### 6.1b Pengali skor dari rantai bunuh

Sebelumnya skor hanya kill + bonus wave, jadi pemain yang menghindar sempurna dan
pemain yang pasrah ditabrak mendapat skor **sama persis**. `COMBO_SCORE` di
`data/waves.ts` membuat bermain rapi terbayar:

| Aturan | Nilai |
|---|---|
| Naik satu tingkat tiap | 4 bunuh beruntun |
| Pengali maksimum | x5 |
| Rantai putus kalau jeda antar bunuh | > 2,5 detik |
| Rantai putus saat pemain kena | ya |

Terukur: bunuh ke-1..3 memberi 10 poin (x1), ke-4..7 memberi 20 (x2), ke-8..10
memberi 30 (x3); kena pukul langsung menjatuhkannya ke x1.

Semua jalur serangan (melee, panah, skill) mencatat bunuh lewat satu fungsi
`registerKill()` supaya pengali tidak pernah terlewat.

### 6.2 Upgrade antar wave

10 upgrade di `src/data/upgrades.ts`, ditawarkan 3 acak tiap wave, dipilih lewat tombol
1/2/3. Semuanya benar-benar terpasang ke stat; yang mudah menumpuk punya batas stack.

**Pengali datar:** Pisau Tajam (+25% damage), Sepatu Ringan (+15% kecepatan), Tangan
Cepat (memukul 15% lebih cepat), Jangkauan (+20% hitbox), Zirah (+25 HP maks), Hotfix
(pulih 45 HP), Vampirik (8% damage jadi HP).

**Mengubah cara main** — ditambahkan karena tujuh upgrade awal semuanya hanya angka,
tidak ada yang mengubah keputusan pemain:

| Upgrade | Efek | Terukur |
|---|---|---|
| **Dash Tajam** | dash melukai musuh yang dilewati | 22 damage per dash, sekali per musuh |
| **Ledakan Akhir** | musuh yang mati melukai tetangganya (r=34) | 14 damage ke tetangga |
| **Duri** | 60% damage kontak dipantulkan ke penabrak | 4,8 dari damage kontak 8 |

Dash Tajam juga menjawab catatan lama bahwa dash murni defensif: ia berubah dari
tombol panik jadi bagian dari irama menyerang.

### 6.3 Angka damage

`systems/DamageNumbers.ts` menampilkan angka melayang saat musuh atau pemain kena.
Tanpa ini pemain tidak punya cara tahu apakah "+25% damage" berpengaruh.

Objek teks **dikumpulkan dalam pool** (18 slot, dipakai berputar): membuat `Text` baru
tiap pukulan berarti membuat texture canvas baru tiap kali — jauh lebih mahal daripada
sprite biasa. Kalau pool penuh, angka tertua diambil alih.

### 6.3 Boss

Tiap boss memakai **sprite sendiri**, dan cara mainnya juga berbeda:

| | B1 — Stack Overflow (wave 5) | B2 — Null Pointer (wave 10) |
|---|---|---|
| Sprite | `Mechanic/Sentinel`, 124x110, teal | `Warped/top-down-boss`, 192x144, merah gelap |
| Siluet | mekanik berkaki empat | gumpalan inti organik |
| Peran | pemburu — mengejar dan menyudutkan | penguasa ruang — menahan dari jauh |
| Kecepatan | 48 px/s, terjang 245 | 20 px/s, terjang 220 |
| Pola | `charge → summon → spread → summon` | `spread → beam → summon → spread → beam → charge` |
| Beam | tidak pernah | dua kali per siklus |

Awalnya keduanya memakai `top-down-boss` yang sama, karena `Monster Pack Files` seluruhnya
sprite layar-battle RPG dari samping — gugur dengan alasan yang sama seperti roster musuh di
M2. Yang terlewat: folder `Mechanic` ditolak di M2 karena sprite-nya 3–4x lebih besar dari
musuh biasa. Alasan itu benar untuk musuh biasa dan **justru salah untuk boss**. `Sentinel`
digambar dari depan-atas dengan bayangan menyatu, persis konvensi sprite top-down lain.

⚠️ **Jangan memberi tint warna ke `boss-core`.** Tint di Phaser adalah perkalian, dan sprite
itu sudah merah gelap — tint hijau/biru hanya menghasilkan gumpalan gelap yang tidak terbaca.
Ini sempat dicoba dan harus dibatalkan. (`boss-sentinel` terang, jadi tint fase 2 aman.)

**Sprite boss satu frame.** `Sentinel` hanya satu PNG, tanpa animasi. `Boss` menggoyang
**sudutnya** (±3,5°, dipercepat di fase 2) — bukan posisi atau skala, supaya badan Arcade
tidak ikut terpengaruh. `Enemy.createAnimations` melewati sheet yang framenya < 2, dan
daftarnya diturunkan dari data agar sprite boss baru tidak diam-diam kehilangan animasi.

**Hitbox tidak selalu di tengah frame.** Sepertiga bawah frame `Sentinel` isinya kaki dan
bayangan, jadi hitbox yang dipusatkan otomatis akan menggantung di bayangannya. `EnemyType`
punya `bodyOffsetY` untuk ini (`Sentinel`: -14 px sebelum skala).

**Pola serangan** (`src/entities/Boss.ts`):

| Pola | Efek | Fase 2 |
|---|---|---|
| `spread` | tembakan melingkar, 6 (B1) / 12 (B2) proyektil | 10 / 18 proyektil |
| `beam` | beam terarah, telegraf 0,65 s lalu aktif 0,42 s | dua beam menyilang |
| `summon` | memanggil 3–4 musuh biasa di sekelilingnya | +1 musuh |
| `charge` | menerjang lurus ke posisi pemain saat itu | — |

Fase 2 aktif di HP < 50%: boss memerah, sedikit membesar, dan jeda antar pola dipersingkat
(x0,62 untuk B1, x0,6 untuk B2). Warna fase 2 dipasang lewat `Boss.baseTint()`, bukan
`setTint()` sekali jalan — versi lama kehilangan warna itu permanen begitu boss kena pukul,
karena `Enemy.flash()` mengembalikan warna dari `config.tint` yang kosong.

**Beam tidak memakai body fisika.** Arcade Physics tidak mendukung body yang dirotasi,
sedangkan beam bisa mengarah ke sudut mana pun. Deteksi kenanya dihitung manual sebagai
jarak titik ke segmen garis di `BossAttacks.update()`.

### 6.4 Musuh tersangkut — wajib diingat

AI mengejar **tidak punya pathfinding**. Musuh mendorong lurus ke pemain dan bisa
tersangkut permanen di balik batu/pohon. Karena wave baru bersih kalau SEMUA musuh mati,
satu musuh nyangkut membuat **permainan deadlock** — ini benar-benar terjadi di M4 dan
menghentikan wave 1 selamanya.

Penanganannya dua lapis di `Enemy.applyUnstick()`: meluncur menyusuri tembok, lalu jaring
pengaman yang mendorong paksa musuh melewati rintangan setelah 1,2 detik tanpa gerak.
**Jangan hapus lapis kedua** — tanpa itu satu musuh nyangkut mengunci seluruh sesi.

---

## 7. Arena & visual

**Tileset utama:** `Overworld 16x16` (ditetapkan di M1 — lihat §11 untuk alasannya).
Lantai, pembatas, dan rintangan diambil per-biome; lihat §7.2.

**Seed arena acak tiap sesi** (`ARENA.RANDOM_SEED`), jadi letak rintangan berbeda
tiap kali main. Set `RANDOM_SEED: false` — atau panggil `buildArena(tile, seed)`
dengan seed eksplisit — saat mengejar bug layout; hasilnya terverifikasi identik
untuk seed yang sama. Seed yang dipakai dikembalikan di `arena.seed`.

Arena tunggal, **ukuran 40 × 30 tile (640 × 480 px)**, dikelilingi tembok setebal 2 tile.
Kamera mengikuti pemain dengan *lerp* 0.1 dan dibatasi (`clamp`) di tepi arena.

Rintangan interior ditaruh sebagai gerombolan batu/pohon dengan titik tengah hard-coded
tapi sebaran acak-berseed, supaya bentuknya bisa di-tune tangan sambil tetap terlihat
natural. Fungsinya memecah garis pandang dan memberi *cover* dari proyektil.

**Arsitektur layer (penting):** arena dirender sebagai **dua layer** — layer tanah
(rumput, opaque penuh) dan layer objek (tembok + prop, `-1` untuk kosong). Layer objek
yang menabrak. Ini wajib, bukan pilihan gaya: banyak tile prop di tileset punya piksel
transparan, dan kalau dipasang satu layer, bagian transparannya tembus ke background
dan terlihat sebagai kotak hitam.

**Palet & rasa:** jangan menambahkan warna di luar palet tileset; efek dan UI ikut
mengambil warna dari sana.


### 7.2 Biome — tiap wave main di tempat berbeda

Sepuluh wave dulunya memakai satu peta rumput yang sama; yang berubah hanya letak
batunya. Sekarang tiap wave punya **biome**: palet lantai, tembok, dan prop sendiri.

| Wave | Biome | Lantai | Tembok | Tint |
|---|---|---|---|---|
| 1–2 | Padang Arsip | rumput | hutan gelap | — |
| 3–4 | Gurun Retak | pasir | batu gelap | — |
| 5 (boss) | Reruntuhan | bata | batu | dingin, meredam oranye |
| 6–7 | Rawa Bangkai | air dalam | hutan rapat | — |
| 8–9 | Padang Malam | rumput | hutan gelap | biru malam |
| 10 (boss) | Kekosongan | bata | batu | ungu |

⚠️ **Hanya ada satu tileset tampak-atas di Legacy Collection.** Gothicvania (rocky,
castle, grunge), Misc/colorful, dan Warped/alien semuanya tileset platformer
tampak-samping — tanah di bawah, langit di atas. Gugur dengan alasan yang sama
seperti roster musuh di M2 dan sprite boss di M5.
`Warped/top-down-space-environment` memang tampak-atas tapi isinya gambar latar
nebula dan sprite asteroid lepas, bukan grid tile. Jadi biome disusun dari palet
berbeda **di dalam** `overworld.png`, yang ternyata memuat pasir, air, dan bata.

⚠️ **`Phaser.Tilemaps.TilemapLayer` tidak punya komponen Tint** — `setTint()` di
sana akan meledak. Tint dipasang per tile lewat `Tile.tint`, yang memang dibaca
renderer (`TilemapLayerWebGLRenderer`).

⚠️ **Tint adalah perkalian, jadi ia tidak bisa menambah warna yang tidak ada.**
Percobaan pertama memakai `0x5a72b8` untuk "malam" dan hasilnya hijau gelap, bukan
biru: rumput punya B=76 melawan G=171, jadi biru hanya menang kalau rasio
`tintG/tintB` di bawah 0,44. Nilai yang dipakai sekarang dihitung, bukan ditebak —
rumput (141,171,76) → (29,44,70). Masalah yang sama berlaku untuk bata dan ungu.

**Peta diganti di tempat, bukan dibuat ulang.** `rebuildArenaForWave()` menimpa tile
lewat `putTilesAt` dan menjalankan ulang `setCollisionByExclusion`. Layer-nya TIDAK
boleh dibuang: collider pemain, musuh, panah, dan proyektil boss semuanya memegang
referensi ke objek layer itu. Membuangnya membuat keempatnya menunjuk layer mati dan
tabrakan berhenti bekerja **tanpa error apa pun**.

Setiap pergantian wave juga memakai seed baru, jadi layout ikut berubah — bukan
sekadar ganti warna. Pemain dipindahkan ke titik spawn (dijamin bebas rintangan)
karena petak tempatnya berdiri bisa saja baru berubah jadi batu, dan proyektil yang
masih melayang dibersihkan karena berasal dari peta lama.

**Verifikasi: `node tools/verify_biomes.mjs [url]`** (butuh dev server jalan dan
`puppeteer` terpasang global). Script ini menjalankan game sungguhan di Chrome
headless dan membuktikan dua hal yang **tidak bisa** dijangkau unit test:

| Yang dibuktikan | Caranya | Hasil terakhir |
|---|---|---|
| Tint benar-benar ter-render | membandingkan **warna piksel** hasil screenshot dengan hasil perkalian yang diharapkan | padang malam: diharapkan (29,44,70), terukur (30,45,70) |
| Tembok masih menabrak setelah dicat ulang | mendorong pemain ke tembok kiri dan mengukur posisi berhentinya | 38 px di keenam biome (tanpa collider: ~6 px, tepi dunia) |

Angka 38 px itu diskriminatornya: arena dalam mulai di x=32 dan body pemain
memberi offset 6 px. Kalau `setCollisionByExclusion` tidak dijalankan ulang setelah
`putTilesAt`, pemain akan menembus tembok dan berhenti di tepi dunia.

---

## 8. UI / HUD

```
┌──────────────────────────────────────────────────────┐
│ ▰▰▰▰▰▰▰▱▱▱  HP          WAVE 3/10        SCORE 1240  │
│                                                      │
│                      [ arena ]                       │
│                                                      │
│ [J] ▰▰▰▰  [K] ▰▱▱▱  [L] ▱▱▱▱        BUGS LEFT: 4     │
└──────────────────────────────────────────────────────┘
```

Yang diimplementasi:

- **HP bar** gambar di kiri atas; berubah merah saat HP <= 30%.
- Baris teks ringkas: HP angka, nomor wave, sisa musuh, skor.
- **Bar HP boss** di tengah **bawah** saat wave boss, berganti merah di fase 2. Dulu di
  atas, dan namanya menimpa baris kedua teks HUD (yang membentang y=14..30).
- Banner "WAVE N" di awal tiap wave, panel upgrade, panel jeda, panel akhir.
- Semua panel berlatar gelap semi-transparan — tanpa itu teks bertumpuk dengan sprite
  dan tidak terbaca (masalah nyata yang terlihat di M3).
- Alur scene: `Title` → `Game`. Kalah/menang ditangani di dalam `Game` + `R` untuk ulang.

**Font:** `Press Start 2P` (OFL), **di-host sendiri** di `public/fonts/` — bukan lewat
Google Fonts CDN, supaya game tetap jalan offline dan tidak ada permintaan pihak ketiga.
Font harus sudah termuat sebelum objek teks Phaser pertama dibuat (`muatFont()` di
`main.ts`); Phaser menggambar teks ke canvas dan tidak akan menggambar ulang ketika font
datang belakangan.

⚠️ Press Start 2P **jauh lebih lebar** daripada monospace bawaan pada ukuran px yang sama.
Saat menggantinya, seluruh panel harus diukur ulang — teks langsung meluber keluar bingkai.

---

## 9. Audio

✅ **Semua audio dibangkitkan saat runtime lewat Web Audio API** (`src/systems/Audio.ts`).

Legacy Collection tidak berisi satu pun file audio. Daripada menambah aset baru yang
lisensinya harus diaudit ulang, semua suara disintesis dari oscillator dan noise.
Konsekuensinya: **nol byte aset audio, nol masalah lisensi**, dan tiap suara bisa
di-tune lewat angka.

| Suara | Kapan | Bentuk |
|---|---|---|
| `swing` | tiap ayunan | semburan noise ter-highpass, 0,09 s |
| `hit` | pukulan kena | square 420→120 Hz + noise |
| `kill` | musuh mati | saw 260→60 Hz + noise |
| `hurt` | pemain kena | square 320→80 Hz |
| `upgrade` | ambil upgrade | arpeggio naik 3 nada |
| `waveStart` / `waveClear` | awal/akhir wave | 2 dan 3 nada |
| `bossSpawn` | wave boss | sweep turun 180→45 Hz |
| `gameOver` / `victory` | akhir sesi | arpeggio turun / naik |

Musik latar: bass + arpeggio pentatonik minor A, dijadwalkan tiap 260 ms, volume rendah.
Tombol `M` menyenyapkan semuanya.

⚠️ **Browser melarang AudioContext berbunyi sebelum ada interaksi pengguna.** Itu salah
satu alasan `TitleScene` ada: tombol "mulai" sekaligus membuka kunci audio. Terverifikasi
`AudioContext.state === "running"` setelah penekanan tombol asli.

---

## 10. Manifest aset (terverifikasi)

Semua path relatif terhadap `Legacy Collection/Assets/`.

| Kegunaan | Path | Format |
|---|---|---|
| Pemain | `TinyRPG/Characters/Top-Down-16-bit-fantasy/Characters pack 1/Guy/aseprite.png` | sheet 128×96, frame **32×32**, grid 4×3 |
| Pemain (alt) | `.../Characters pack 1/Blond_kid/aseprite.png` | sama |
| Pemain (alt) | `.../Characters pack 1/PirateGirl/spritesheet.png` | sama |
| **Tileset arena (aktif)** | `TinyRPG/Environments/Overworld/Overworld 16x16/Tileset/overworld.png` | 464×336, 29×21 tile |
| ~~Tileset sci-fi~~ | ~~`Warped/Environments/top-down-dungeon-sci-fi/...`~~ | ❌ gugur — scene mockup, bukan tileset modular |
| ~~Tileset dungeon~~ | ~~`TinyRPG/Environments/single-dungeon-crawler/...`~~ | ❌ gugur — hanya prop + 2 warna solid |
| Props | `TinyRPG/Environments/single-dungeon-crawler-objects/PNG/dungeon-crawler-objects-transparent.png` | objek lepas |
| FX pukul 1 | `Explosions and Magic/Grotto-escape-2-FX/sprites/slash-horizontal/` | 5 PNG terpisah |
| FX pukul 2 | `.../sprites/slash-upward/` | 5 PNG |
| FX finisher | `.../sprites/slash-circular/` | 6 PNG |
| FX skill Shock | `.../sprites/electro-shock/` | 9 PNG |
| FX proyektil | `.../sprites/fire-ball/` | 3 PNG |
| FX musuh mati | `.../sprites/enemy-death/` | 8 PNG |
| FX kena hit | `Explosions and Magic/Hit/Sprites/` | 3 PNG |
| Musuh organik | `TinyRPG/Characters/Battle Sprites/Living Pack 1/{Slime,Frog}/` | sheet + frame lepas |
| Boss wave 5 | `TinyRPG/Characters/Battle Sprites/Mechanic/Sentinel.png` | 1 PNG — dipakai |
| Boss wave 10 | `Warped/Characters/top-down-boss/PNG/` | frame lepas — dipakai |
| Pickup | `Misc/gems/spritesheets/gems-spritesheet.png` | sheet |

**Format catatan:** spritesheet FX ansimuz punya ukuran tidak rata (mis. `slash-circular.png`
= 312×48, tidak habis dibagi grid). **Gunakan folder `sprites/` yang berisi PNG per-frame**,
lalu kita pack ulang sendiri jadi atlas seragam saat build.

⚠️ **Jebakan tileset (ditemukan di M1):** `overworld.png` punya banyak sel yang
**sepenuhnya kosong** dan tidak bisa dibedakan dari sel berisi hanya dengan melihat
grid render. Index 246 sempat terpakai sebagai tembok dan menghasilkan *dinding tak
terlihat* — tidak tampak, tapi tetap menabrak. **Verifikasi alpha setiap index baru**
sebelum memasukkannya ke `src/data/tiles.ts`:

```bash
python -c "
from PIL import Image
im=Image.open('public/assets/tilesets/overworld.png').convert('RGBA')
idx=246; cols=29; c,r=idx%cols, idx//cols
t=im.crop((c*16,r*16,c*16+16,r*16+16))
print(sum(1 for p in list(t.getdata()) if p[3]>0), '/256 piksel opaque')
"
```

---

## 10.0 Catatan performa & kebersihan (terukur)

Diukur dengan instrumentasi di browser, sebelum dan sesudah perbaikan. FPS tidak
pernah jadi masalah (199-200 sepanjang waktu); ini soal higiene dan ruang tumbuh.

| Temuan | Sebelum | Sesudah |
|---|---|---|
| Listener `shutdown` bocor | **+200** dari ~200 pemutaran FX | **0** pertumbuhan |
| String HUD dibangun ulang | 1308x dalam 1308 frame (99% sia-sia) | **1x dalam 1177 frame** |
| Panggilan getter `aliveEnemies` | 1,23 array baru per frame | 1,04 per frame (di-cache) |
| Emitter partikel baru | 10 dalam 6 detik tempur | **0** (satu emitter dipakai ulang) |

**Kebocoran listener** adalah defect, bukan preferensi: pola
`scene.events.once(SHUTDOWN, () => obj.destroy())` per sprite FX tidak pernah
melepas listener-nya saat sprite mati normal. Helper `destroyWithScene()` di
`systems/Lifecycle.ts` melepasnya saat objek hancur, jadi jumlahnya selalu
sebanding dengan objek yang hidup.

**Cache `aliveEnemies`** dibatalkan sekali per frame di awal `update()`, dan juga
setiap musuh lahir atau mati. Kalau menambah jalur yang mengubah daftar musuh,
panggil `invalidateAliveCache()`.

**HUD** hanya dirakit ulang kalau "tanda tangan" nilainya berubah. Bar HP tetap
digambar tiap frame karena murah.

---

## 10.1 Balancing (terukur di M6)

Diukur dengan bot sederhana: kejar musuh terdekat, pukul terus, **tanpa menghindar**.
Bot ini mewakili pemain di bawah rata-rata.

| Kondisi | Wave tercapai | Durasi | HP hilang di wave 1 |
|---|---|---|---|
| Sebelum tuning | 3 | 29 detik | **56** |
| Sesudah tuning | 4–5 | 37–53 detik | 16–24 |

Akar masalahnya: knockback praktis tidak berefek (~5 px), sehingga pemain selalu menempel
dengan musuh. Tiga angka yang diubah:

| Parameter | Sebelum | Sesudah |
|---|---|---|
| `knockback` pukulan | 90 / 140 | 210 / 300 |
| `ENEMY_DRAG` | 700 | 320 |
| jangkauan hitbox (`reach`) | 14 | 19 |
| radius finisher | 34 | 40 |
| i-frame pemain | 600 ms | 750 ms |

Jarak terdorong musuh naik dari ~5 px ke ~12 px. Perbaikan HP datang dari ketiganya,
bukan knockback saja — jangkauan yang lebih panjang membuat pemain tidak harus menempel.

---

## 11. Keputusan terbuka (butuh jawaban kamu)

| # | Pertanyaan | Default saya kalau tidak dijawab |
|---|---|---|
| ~~1~~ | ~~Engine: Phaser 3 atau canvas murni?~~ | ✅ **DIPUTUSKAN: Phaser 3 + Vite** (2026-09-27) |
| ~~2~~ | ~~Tileset: sci-fi, dungeon, atau overworld?~~ | ✅ **DIPUTUSKAN: Overworld 16x16** (2026-09-27) — lihat catatan di bawah |
| ~~3~~ | ~~Karakter: Guy, Blond_kid, atau PirateGirl?~~ | ✅ **DIPUTUSKAN: Guy** (2026-09-27) |
| 4 | Ada sistem upgrade antar wave, atau stat statis? | **Ada**, 1 pilihan dari 3 tiap wave |
| 5 | Nama final game? | placeholder **DEBUG RUN** |

> **Kenapa tileset berubah dari sci-fi ke Overworld (ditemukan saat M1):**
> `top-down-dungeon-sci-fi` ternyata bukan tileset modular — isinya potongan *scene*
> yang sudah dirakit, dan temboknya hanya punya sisi atas. Tidak mungkin membuat arena
> tertutup 4 sisi darinya. `single-dungeon-crawler` juga gugur: isinya prop dekoratif
> plus dua tile warna solid, bukan tileset. Hanya **Overworld 16x16** yang benar-benar
> modular. Konsekuensinya **tema visual bergeser dari sci-fi/tech ke fantasi hutan.**
> Kalau tema tech tetap diinginkan, aset tileset harus dicari dari luar Legacy Collection.

---

## 12. Lisensi & kepatuhan

- ✅ **Lisensi Legacy Collection: CC0** — terverifikasi 2026-09-27 dengan mengekstrak teks
  `public-license.pdf`. Bebas dipakai, dimodifikasi, dan diredistribusikan untuk keperluan
  personal maupun komersial, tanpa kewajiban atribusi. Blocker rilis ini sudah tertutup.
- ❌ **Jangan pakai sprite, logo, Octocat, atau nama "Bug Bash" dari GitHub.** Itu trademark
  GitHub. Yang kita tiru adalah mekanik dan rasa permainannya, bukan asetnya.
- ✅ Buat `assets/CREDITS.md` sejak commit pertama: sumber, penulis, lisensi, URL per pack.
  Menelusuri ini belakangan sangat menyakitkan.

---

## 13. Milestone

| # | Milestone | Isi | Definisi selesai |
|---|---|---|---|
| **M1** ✅ | Bergerak | Scaffold project, load tileset, pemain jalan 4 arah + collision | ✅ **SELESAI 2026-09-27** — terverifikasi di browser |
| **M2** ✅ | Combat | Pukul + combo 3-hit, hitbox, FX slash, hitstop, knockback | ✅ **SELESAI 2026-09-27** — musuh dummy mati dalam 1,7 detik, terverifikasi di browser |
| **M3** ✅ | Musuh | 7 tipe musuh + AI + spawner + HP/damage | ✅ **SELESAI 2026-09-27** — bertahan 33 detik sambil melawan, 7 tipe terverifikasi |
| **M4** ✅ | Loop | Sistem wave, upgrade, skor, game over, restart | ✅ **SELESAI 2026-09-27** — 10 wave berurutan sampai layar menang, terverifikasi |
| **M5** ✅ | Boss | 2 boss + pola serangan + fase | ✅ **SELESAI 2026-09-27** — wave 5 & 10 tuntas sampai layar menang |
| **M6** ✅ | Poles | Audio, screen shake, partikel, title screen, balancing | ✅ **SELESAI 2026-09-27** — audio prosedural, layar judul, jeda, balancing terukur |

---

## 14. Arsitektur (garis besar)

```
src/
  main.ts                 # bootstrap Phaser
  scenes/
    BootScene.ts          # preload aset
    TitleScene.ts
    GameScene.ts          # arena, kamera, orkestrasi
    HudScene.ts           # overlay, tidak ikut ter-scroll kamera
    GameOverScene.ts
  entities/
    Player.ts
    Enemy.ts              # base class
    enemies/              # Glitchling.ts, Drone.ts, ...
    Projectile.ts
  systems/
    CombatSystem.ts       # hitbox, damage, knockback, hitstop
    WaveManager.ts        # jadwal spawn
    UpgradeSystem.ts
    FxPool.ts             # object pool untuk slash/ledakan
  data/
    enemies.ts            # tabel stat (§6) sebagai data, bukan hardcode
    waves.ts              # tabel wave (§6.1)
    upgrades.ts
```

**Prinsip:** semua angka balancing di `src/data/` sebagai objek biasa. Tuning game
harusnya mengubah data, bukan logika.
