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

**Non-goal (v1):** multiplayer, save/progress permanen, cerita bercabang.

---

## 2. Target teknis

| Item | Keputusan |
|---|---|
| Platform | Browser desktop + **ponsel/tablet** (Chrome/Firefox/Edge/Safari terbaru) |
| Engine | **Phaser 3 + Vite** ✅ dikonfirmasi |
| Bahasa | TypeScript |
| Resolusi logis | tinggi **tetap 270** px; lebar mengikuti rasio layar (420–640) |
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

| Aksi | Keyboard | Alternatif | Sentuh |
|---|---|---|---|
| Gerak | `WASD` | Arrow keys | stik analog kiri |
| Serang (pukul) | `J` | Left click | tombol `J` |
| Skill 1 (berbeda tiap kelas) | `K` | Right click | tombol `K` |
| Skill 2 (berbeda tiap kelas) | `L` | `Q` | tombol `L` |
| Dash | `Space` | `Shift` | tombol `>>` |
| Pause | `Esc` | — | tombol `||` kanan atas |

Kontrol sentuh hanya muncul kalau jari adalah alat tunjuk utama — lihat §8.1.

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

### 5.2.1b Keseimbangan kelas — DIUKUR

`node tools/balance_run.mjs [url] [runPerKelas] [batasDetik]`. Bot memainkan game
sungguhan lewat `Player.setVirtualInput()` — jalur input yang sama persis dengan
stik analog di ponsel. Ia tidak boleh memanggil fungsi internal untuk bergerak
atau menyerang; kalau boleh, yang terukur adalah kelihaian bot, bukan kekuatan
kelas. Kebijakannya satu untuk semua kelas; hanya jaraknya diturunkan dari data
kelas itu sendiri.

Hasil 5-6 run per kelas, semua berakhir karena MATI (mode tanpa batas menyala):

| Kelas | wave (sebelum → sesudah) | skor | detik bertahan |
|---|---|---|---|
| Warrior | 4,0 → 4,3 | 710 → 751 | 85,8 → 57,4 |
| Archer | 3,4 → 3,2 | 483 → 408 | 68,5 → 43,5 |
| Mage | **2,4 → 3,0** | **206 → 368** | **31,1 → 40,6** |

Sebaran wave turun 1,67x → **1,43x**; jurang skor Mage vs Warrior 3,45x → **2,04x**.

**Temuan paling penting: waktu bertahan berbanding LURUS dengan HP.** Terukur
82/130 = 0,63 dan 31,2/49,4 = 0,63. Penyebabnya arah hadap mengikuti arah gerak,
jadi kiting mustahil — musuh selalu berhasil menempel, dan jangkauan tidak
melindungi apa pun. Percobaan menaikkan jangkauan Mage 95 → 125 nyaris tidak
berpengaruh (206 → 213); yang akhirnya berhasil adalah menaikkan HP dan kecepatan
membunuh.

⚠️ **Run yang macet WAJIB dibuang, bukan dirata-ratakan.** Bot tidak punya
pathfinding dan kadang tersangkut di balik batu. Tiga dari 15 run sempat berakhir
di wave 1-2 setelah 200 detik dan membuat dua sesi pengukuran tak berarti — ia
menyeret waktu bertahan naik sambil menahan wave dan skor di bawah. Harness kini
mendeteksi skor yang tidak bergerak 40 detik dan MENGULANG run itu.

**Yang masih terbuka:** Warrior tetap unggul ~1,4x pada wave dan ~2x pada skor.
Pola HP-berbanding-lurus menunjuk satu tuas tunggal kalau mau ditutup — `maxHp`
Warrior (130) yang jauh di atas Archer 85 dan Mage 95.

### 5.2.2 Skill per kelas

Setiap kelas punya sepasang skill sendiri; tidak ada yang dipakai bersama. Slot 1 di
tombol `K` (atau klik kanan), slot 2 di `L`/`Q`.

| Kelas | Slot 1 | Slot 2 |
|---|---|---|
| Warrior | **Cleave** - 30 dmg, r=46, knockback 460 (terkuat), cd 5,5 s | **Warcry** - 10 dmg, r=62, **stun 1,4 s**, cd 10 s |
| Archer | **Volley** - 9 panah menyebar, 11 dmg/panah, cd 6 s | **Pin Shot** - 24 dmg, **menembus** + **stun 1 s**, cd 9 s |
| Mage | **Purge** - 25 dmg, r=50, cd 6 s | **Shock** - 18 dmg, garis menembus + **stun 0,8 s**, cd 9 s |

⚠️ **Tidak boleh ada dua skill dengan animasi yang sama.** Cleave milik Warrior
dan Purge milik Mage dulu memakai sprite yang SAMA PERSIS (`slash-circular`)
dengan bentuk sama dan radius nyaris sama (46 vs 50) — saat dimainkan keduanya
tidak bisa dibedakan, dan nama berbeda saja tidak menolong. Purge kini memakai
`energy-smack` (ledakan sihir radial) dan dibedakan juga secara mekanik: Cleave
melempar musuh sejauh 460 untuk membuka ruang, Purge nyaris tidak mendorong (90)
tapi memukul lebih keras dan lebih luas.

Dikunci dua tes: tidak ada `fxKey` yang dipakai ulang, dan tidak ada dua skill
lingkaran yang mirip di radius, dorongan, DAN damage sekaligus. Ketiganya harus
bersamaan — versi pertama tes itu tanpa damage langsung menuduh Warcry dan Purge
kembar hanya karena radiusnya sama, padahal yang satu 10 damage berstun 1,4 detik
dan yang lain 34 damage tanpa stun.

Skill punya dua jenis eksekusi: `hitbox` memakai jalur `CombatSystem.resolveAttack`
yang sama dengan combo, sedangkan `volley` menembakkan panah lewat jalur proyektil.

### 5.2.2b Serangan dasar per kelas

Ketiga kelas menyerang dengan cara yang berbeda, bukan sekadar angka berbeda:

| Kelas | Cara | FX merapal | FX benturan |
|---|---|---|---|
| Warrior | ayunan melee | `slash-horizontal`, `slash-upward`, `slash-circular` | `fx-hit-slash` |
| Archer | proyektil panah, jangkauan 190 px, cepat (300 px/d) | panah itu sendiri | `fx-hit-pierce` |
| Mage | proyektil bola api, jangkauan **125 px**, sedang (265 px/d) | kilatan `arcane-crescent`/`arcane-blast` + bola api | `fx-hit-arcane` |

**Proyektil didefinisikan per kelas** lewat `projectile` di `data/classes.ts` (texture,
kecepatan, jangkauan, ukuran body, skala, beranimasi atau tidak). Jangkauan Mage sengaja
dibuat lebih pendek daripada Archer supaya ia tetap harus mendekat — kalau disamakan,
tidak ada alasan memainkan Archer. (Angkanya naik dari 95 setelah pengukuran di §5.2.1b.)

**FX benturan berbeda per kelas.** Sebelumnya *semua* benturan di game memakai satu
sprite yang sama (`fx-hit`), jadi pukulan baja, panah, dan bola api terasa identik tepat
di momen yang paling penting — saat serangan mengenai. Bentuknya sengaja dipilih supaya
siluetnya terbaca berbeda dalam 3–4 frame:

| Kelas | Bentuk |
|---|---|
| Warrior | bintang 4 sudut yang pecah jadi bilah-bilah melesat — sebuah tebasan |
| Archer | cincin yang mengembang lalu larut — gelombang tusukan |
| Mage | semburan berduri jadi cincin sepusat, lalu retakan — sihir |

Jalurnya: `PlayerClass.hitFx` → `AttackModifiers.hitFx` (melee) atau
`peluru.setData('hitFx')` (proyektil) → parameter keempat `Enemy.takeDamage()`. Proyektil
harus membawanya sendiri karena `PlayerProjectiles.update()` tidak tahu kelas penembaknya.

### 5.2.2c Senjata yang terlihat di tangan

Ketiga kelas **memegang senjata**, dan senjatanya **ikut mengayun saat menyerang**.

| Kelas | Senjata | Asal | Rentang ayunan |
|---|---|---|---|
| Warrior | scimitar | `fantasy weapons set/1.png`, diperkecil ke 16 px | 165° |
| Archer | busur (7x11) | **digambar sendiri** di `tools/pack_assets.py` | 30° |
| Mage | tongkat berpermata | **digambar sendiri** | 68° |

Busur dan tongkat digambar sendiri karena **seluruh koleksi tidak punya satu pun
busur atau tongkat** — isinya hanya bilah dan tombak. Detailnya di `CREDITS.md`.

**Hamparan, bukan dibakar ke spritesheet.** `src/systems/WeaponVisual.ts` memegang satu
sprite yang mengikuti pemain. Dibakar berarti senjatanya ikut membeku; di sini ia bisa
terangkat saat ancang-ancang lalu mengayun tepat saat hitbox menyala. Sistem ini **tidak
tahu apa-apa soal damage** — hitbox tetap milik `CombatSystem`, jadi ayunan bisa diubah
tanpa menyentuh keseimbangan.

Ayunannya dipicu `PLAYER_WINDUP_EVENT`, event baru yang menyala saat ancang-ancang
**mulai**. `PLAYER_ATTACK_EVENT` menyala setelah windup habis — terlalu telat untuk
mengangkat senjata. Muatannya membawa lama windup, jadi keduanya tidak pernah lepas
sinkron kalau angka combat diubah.

Hal yang diukur dan harus tetap begitu (dikunci `tools/verify_weapons.mjs`):

| Aturan | Kenapa |
|---|---|
| Posisi disetel di **POST_UPDATE**, bukan `scene.update()` | Arcade menyalin posisi badan ke sprite pada POST_UPDATE. Dari `scene.update()` yang terbaca posisi frame sebelumnya — terukur senjata tertinggal 1,7 px saat berjalan, terlihat seperti menyeret. |
| Titik genggam **diukur dari piksel**, per kelas (`HAND`) | Lihat §5.2.2d. Angka hasil hitungan kotak pembatas meleset 6-8 px di arah samping, dan itulah "senjata mengambang". |
| Titik putar di **genggaman**, beda per jenis (`GRIP`) | Pedang dipegang di pangkal, busur di **tengah**. Memutar busur pada pangkalnya membuatnya menyapu lebar seperti pedang dan ia berhenti terbaca sebagai busur. |
| `dorong` ayunan **kecil** (≤ 4 px) | Pada 5 px ada celah antara tangan dan gagang di puncak ayunan: pedangnya terbaca seperti terlepas dari tangan. |
| Hadap atas: sudut bertanda **berlawanan** dari hadap bawah | Dengan tanda yang sama, bilahnya condong ke arah badan dan senjatanya hilang sepenuhnya di balik punggung. |

### 5.2.2d "Senjata mengambang" — sebabnya dan obatnya

Versi pertama menaruh senjata memakai satu tabel pose untuk ketiga kelas, dengan angka
yang diturunkan dari kotak pembatas sprite (`x = ±6..7`, `y = 6`). Hasilnya dilaporkan
sebagai senjata yang mengambang di udara, tidak seperti dipegang.

Sebabnya baru ketahuan setelah **piksel warna kulit di tiap frame benar-benar dicari**
(`tools/weapon_mockup.py`, fungsi `tangan()`):

| sprite | hadap bawah | hadap samping |
|---|---|---|
| guy (Warrior) | (+6, +9) | (**−2**, +9) |
| pirategirl (Archer) | (+4, +6) | (**−1**, +6) |
| blondkid (Mage) | (+5, +9) | (**+2**, +9) |

Arah samping-lah yang paling meleset: tangan yang terlihat ada di **dekat sumbu badan**,
bukan 6 px di luarnya. Selisih 6–8 px itu persis lebar celah yang terbaca sebagai melayang.

Tiga perbaikan, masing-masing menjawab hal berbeda:

1. **Titik genggam per kelas dan per arah** (`HAND` di `weapons.ts`), diukur, bukan
   dihitung. Arah kiri diturunkan dengan mencerminkan `side` supaya tidak ada entri
   kembar yang bisa lepas sinkron.
2. **Busur digambar DI BELAKANG badan** (`BEHIND`). Busur digenggam di tengah sehingga
   selalu membentang melintasi badan; di depan ia terlihat seperti ditempelkan di atas
   karakter. Di belakang, badan menutupi sisi dalamnya — **tumpang tindih itulah yang
   memberi kesan menyatu**. Pedang dan tongkat digenggam di pangkal sehingga gagangnya
   jatuh tepat di tangan, jadi keduanya justru lebih baik di depan.
3. **Busur diperkecil** 15 → 11 px. Pada 15 px ia membentang dari dada sampai lutut dan
   menutupi seluruh badan Archer.

⚠️ Keterlihatan diukur dengan **memotret layar dua kali**, sekali dengan senjata dan
sekali setelah disembunyikan; kalau identik, tidak ada satu piksel pun yang sampai ke
layar. Perbandingan geometri tidak cukup — kotak fisika pemain hanya sebatas badan,
sehingga pedang yang tertutup KEPALA tetap terhitung "di luar kotak" dan lolos. Scene
wajib dijeda dulu, karena `sync()` menyetel ulang `visible` tiap POST_UPDATE.

⚠️ Semua sprite senjata digambar **menghadap atas**; rotasi di `POSE`/`SWING` diukur dari
sana. Senjata baru yang digambar menghadap kanan harus diputar di `pack_assets.py`, bukan
ditambal dengan offset — ayunannya memakai sumbu yang sama.

Sudut diamnya ikut `HAND`, per kelas dan per arah. Versi paling awal memakai satu sudut
untuk semua arah, dan ketiganya jadi terlentang 55° sama rata: busur dan tongkat ikut
teracung seperti pedang, sehingga pemain terlihat menyodorkan senjatanya.

Saat pemain membelakangi kamera, senjata pindah ke `DEPTH.PLAYER - 1` — di belakang badan.
Tanpa itu bilahnya menutupi kepala dan pemain terlihat seperti tertusuk.

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

**Panggung cerita** (`src/systems/StoryStage.ts`). Cerita pembuka dulunya latar
hitam pekat dengan satu sprite berdiri tegak — tidak ada kedalaman, tidak ada
gerak. Sekarang hutan berkabut berlapis yang bergeser dengan **parallax**: lapisan
jauh merayap 3 px/detik, lapisan tengah 7. Itu satu-satunya hal yang menciptakan
kesan ruang pada gambar diam. Ditambah bintik cahaya melayang, sorotan lembut,
dan gerak napas 2 px pada karakternya.

Karakter **menyala saat dialah yang bicara dan meredup saat bukan**
(`sorotKarakter`), jadi adegannya terasa dipentaskan, bukan gambar diam dengan
teks berganti.

**Ketiga babak cerita memakai panggung yang sama** — pembuka (pilih kelas), boss
wave 5 dan 10, serta penutup. Di wave boss, panggung dibuka sebagai **lapisan di
atas permainan** dan boss tampil besar di tengahnya, bukan sebagai potret kecil
di atas arena yang membeku.

⚠️ **Depth panggung harus berada di jendela sempit: 150.** Di atas HUD (100)
supaya bar HP dan bar boss tertutup, tapi di BAWAH panel UI (200) dan kotak
dialog (300) supaya teksnya tetap terbaca. Percobaan pertama memakai 400 dan
panggungnya menutupi kotak dialognya sendiri — seluruh naskah tidak terlihat.

⚠️ **Panggung WAJIB dibongkar lewat `destroy()`** kalau dipakai sebagai lapisan:
scene-nya tidak berakhir, jadi objeknya tidak dibersihkan sendiri dan akan
menutupi arena selamanya.

Skala tokoh dihitung dari **tinggi target**, bukan angka tetap: sprite pemain
32 px dan sprite boss 144 px, jadi satu skala tetap akan membuat salah satunya
sebesar kuku atau memenuhi layar.

Tint panggung mengikuti biome wave berjalan, **kecuali penutup** yang sengaja
dipaksa ke warna asli: naskahnya berbunyi "ruang kosong itu menutup, rak-rak
kembali terlihat", dan memainkannya dalam ungu kekosongan wave 10 membantah
teksnya sendiri.

⚠️ Latar parallax ini **tampak-samping** — jenis aset yang ditolak untuk gameplay
sejak M2. Layar cerita satu-satunya tempat di mana itu justru benar: karakternya
memang berdiri menghadap kamera dan tidak ada arena yang harus dibaca dari atas.

⚠️ **Karakter memakai origin di KAKI (0.5, 1), bukan di tengah.** Dengan origin
tengah, posisi kakinya bergantung pada skala — versi pertama menaruh kaki di
y=195 sementara tepi atas kotak dialog ada di 174, dan setengah badannya tertutup
panel.

⚠️ **Lapisan latar tidak mencapai dasar layar** karena ditambatkan pada garis
tanah. Terukur kosong dari y=192 ke bawah; di layar 480 px celah itu tersembunyi
di balik kotak dialog, di 640 px ia terlihat sebagai pita hitam melintang. Ditutup
isian berwarna dasar kabut (#457277) — hanya di bawah garis tanah, bukan selayar
penuh, karena isian penuh menurunkan fps 54 -> 47 di render perangkat lunak.

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

20 upgrade di `src/data/upgrades.ts`, ditawarkan 3 acak tiap wave, dipilih lewat tombol
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
| **Percik Rantai** | musuh mati menyambar musuh terdekat (r=78) | 16 damage ke satu tetangga |
| **Duri** | 60% damage kontak dipantulkan ke penabrak | 4,8 dari damage kontak 8 |

Dash Tajam juga menjawab catatan lama bahwa dash murni defensif: ia berubah dari
tombol panik jadi bagian dari irama menyerang.

**Kelompok SKALA tanpa batas stack** (Tempa Ulang, Urat Baja, Asah Tepi) ada khusus
untuk mode tanpa batas — lihat §6.2 Mode tanpa batas. Tanpa kelompok itu, kolam
kehabisan variasi sekitar wave 33 dan layar upgrade menawarkan tiga kartu yang sama
selamanya. Dikunci oleh tes di `src/data/upgrades.test.ts`.

### 6.2b Ikon panel upgrade — permata per kategori

Panel upgrade adalah tiga baris teks polos, dan pemain harus membaca ketiganya untuk
tahu jenis tawarannya. Tiap upgrade sekarang punya `kategori`, dan tiap kategori punya
satu warna permata dari `public/assets/ui/ui-gems.png`:

| Kategori | Warna | Frame | Arti |
|---|---|---|---|
| `tahan` | hijau | 0 | bertahan hidup — HP, penyembuhan, lifesteal |
| `jauh` | oranye | 1 | khusus kelas jarak jauh |
| `serang` | merah | 2 | damage, kecepatan pukul, jangkauan |
| `utilitas` | kuning | 3 | campuran |
| `khas` | merah muda | 4 | mengubah cara main |
| `gerak` | biru | 5 | kecepatan gerak, dash |

Ikon dipetakan per **kategori**, bukan per upgrade. Dua puluh gambar kecil yang berbeda
hanya jadi dua puluh gambar kecil; enam warna yang konsisten bisa dibaca sekali lihat.

Sumbernya satu lembar 848×176 berisi animasi berputar untuk enam warna. `potong_gems()`
di `tools/pack_assets.py` mengambil **hanya frame pertama** tiap warna (x = 64, 192, 320,
448, 576, 704 pada y = 32, sel 16×16) — permata diam, karena ikon berputar menarik mata
menjauh dari teks yang justru harus dibaca.

Dikunci oleh tes: tiap upgrade punya kategori yang punya ikon, tiap indeks ada di dalam
lembar, tidak ada dua kategori yang berbagi warna, dan tidak ada kategori yatim.

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

Penanganannya sudah tiga kali ditulis ulang, dan **dua di antaranya memperkenalkan
bug yang lebih buruk daripada yang diperbaiki**. Riwayatnya disimpan di sini karena
setiap versi gagal dengan cara yang tidak terlihat dari kode.

Diukur pada 6 arena ber-seed tetap, 14 musuh, **semua perilaku**, dua skenario
(pemain diam dan pemain berjalan memutar) — `tools/verify_stuck.mjs`:

| | v1 (dua lapis) | v2 (menyusur) | sekarang |
|---|---|---|---|
| sangkutan rintangan terlama | **11.526 ms** | 0 ms | **~1.100 ms** |
| `charger` sampai ke pemain | 50% | **0%** | **92-100%** |
| `crawler` sampai ke pemain | 89% | 39% | **89-100%** |
| musuh di dalam tembok | 0 | 0 | 0-4 sampel |

**v1 — ambang macet mutlak.** `moved > 0,4 px per frame` dianggap "bergerak", jadi
musuh yang menggerus menyusuri pohon me-reset penghitung macetnya tiap frame dan
jaring pengaman tidak pernah menyala. Terlihat sebagai musuh menempel di pohon
sambil bergetar.

**v2 — manuver dipicu "bergerak lebih lambat dari yang diinginkan".** Sangkutan
rintangan hilang, tapi ini salah besar: perlambatan juga terjadi karena berdesakan
sesama musuh, karena drag, dan karena `charger` memang merayap pelan saat mengincar.
Akibatnya charger masuk mode menyusur sepanjang fase incarnya lalu bergerak
**tegak lurus** arah kejar — terukur **0% charger sampai ke pemain**, menetap di
sekitar 204 px. Yang dilaporkan pemain: *"monsternya jadi berlarian menjauhi
karakter saya"*. Arah susurnya pun tegak lurus MURNI, karena tie-break-nya memakai
hasil kali titik antara calon dan arah kejar — dan dua vektor tegak lurus selalu
menghasilkan nol, jadi ia tidak pernah memilih apa pun.

**Sekarang** — tiga hal dipisahkan tegas, karena ketiganya butuh jawaban berbeda:

| Penyebab | Penanganan |
|---|---|
| **Tile rintangan di depan** | Menyusur ke sisi lowong (dirabakan ke tilemap, tie-break lewat rabaan serong-maju), arah dipegang 420 ms. Arahnya **dicampur 0,45 bagian arah kejar** supaya musuh memutari rintangan sambil tetap mendekat. |
| **Berdesakan sesama musuh** | Dorongan menyamping kecil yang **ditambahkan** ke arah kejar, tanpa komitmen waktu. Hanya untuk `chase`/`zigzag`; `charger` dan `shooter` mengatur sendiri kapan diam, mengincar, dan menerjang. |
| **Benar-benar terjepit** | Dipindahkan ke titik bebas terdekat. |

⚠️ **Jaring pengaman memakai perpindahan MUSUH SENDIRI + ada tile menempel.**
Dua alternatif yang lebih alami keduanya punya lubang:

- *Berbasis kecepatan* gagal pada `charger`: ia bergantian menerjang (terhalang
  tembok) dan memulihkan diri (kecepatan nol), dan fase nol itu me-reset
  penghitungnya — jaring pengaman tidak pernah menyala.
- *Berbasis jarak ke pemain* gagal lebih halus: jaraknya ikut berubah ketika
  **pemain** yang bergerak. Pemain yang berjalan mendekat memberi "kemajuan" gratis
  ke musuh yang sebenarnya terjepit; terukur ada sangkutan 3.237 ms yang tidak
  pernah ditolong.

⚠️ **Titik pendaratan diperiksa dengan LEBAR BADAN, bukan titik pusatnya.** Pusatnya
bisa lowong sementara badannya tetap menumpuk tile di sebelahnya: terukur 158 sampel
musuh berada di dalam tembok ketika hanya pusat yang diperiksa. Dan kalau tidak ada
satu pun titik yang muat, musuh **tidak dipindahkan sama sekali** — mendorong buta ke
arah pemain menukar satu bug dengan bug "musuh menembus pohon".

`shooter` dikecualikan dari semuanya: ia memang menjaga jarak dan menembak (§6.0b).
Harness juga mengecualikannya dari syarat "harus sampai", karena memaksanya mendekat
menghapus seluruh gunanya.

⚠️ **Harness wajib menguji SEMUA perilaku dan pemain yang BERGERAK.** Versi
pertamanya hanya memakai tiga tipe pengejar dengan pemain diam, dan karena itu
melaporkan LOLOS pada v2 — versi yang chargernya tidak pernah sampai sama sekali.
Ukuran "tidak tersangkut" saja tidak cukup; yang menentukan adalah **persentase musuh
yang benar-benar sampai ke pemain**.

### 6.2 Mode tanpa batas

Kampanye berhenti di wave 10, jadi skor tertinggi yang mungkin dicapai ditentukan
oleh naskah, bukan oleh keterampilan. Setelah cerita penutup, pemain memilih:

- **SUDAHI** — rekor disimpan, layar skor seperti biasa
- **LANJUT** — wave dibangkitkan terus sampai pemain mati

Ditanyakan, bukan digelindingkan otomatis: kalau permainan langsung lanjut ke
wave 11, tamatnya kehilangan arti.

Kurvanya di `src/data/endless.ts`, dan **monoton** — jumlah musuh dan `maxAlive`
tidak pernah turun, jeda spawn tidak pernah naik. Kesulitan yang naik-turun
membuat pemain merasa dicurangi saat run bagus berakhir di wave yang lebih mudah.

| Parameter | Rumus | Batas |
|---|---|---|
| jumlah musuh | `8 + floor(d * 1.6)` | 26 |
| `maxAlive` | `12 + floor(d / 2)` | 18 |
| `spawnIntervalMs` | `550 - d * 15` | min 260 |
| `statScale` | `1 + d * 0.06` | — |
| boss | tiap kelipatan 5 | 2 boss bergantian |

`d` = tingkat, 1 untuk wave 11. Upgrade **tetap ditawarkan** antar wave tanpa
batas; tanpa itu pemain berhenti berkembang tepat saat musuh mulai menebal.

⚠️ **`WaveManager.currentWave` dibaca tiap frame.** Wave bangkitan disimpan di
field, bukan dihitung di getter — kalau tidak, `buildEndlessWave()` berjalan 60
kali per detik dan membuang objek wave sebanyak itu juga.

⚠️ **`statScale` diterapkan dengan meng-klon `EnemyType`, bukan mengubahnya di
tempat.** `SPAWNABLE_BY_ID` dipakai bersama seluruh game; menaikkan HP-nya
langsung akan merembet ke wave berikutnya dan bertahan sampai setelah restart.
Klonnya dimemo berkunci `${id}:${scale}` supaya tidak mengalokasi tiap spawn.

Biome ikut berputar untuk wave > 10 (`biomeForWave`). Sebelumnya jatuh ke
`BIOMES[0]`, yang berarti seluruh mode tanpa batas — bagian terpanjang dari
sebuah run — dimainkan di padang rumput yang sama.

Terukur di Chrome headless (`node tools/verify_endless.mjs`): HP glitchling
32 → 34 → 37 → 39 → 48 di wave 11 → 20, cocok persis dengan `30 x statScale`.

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


### 8.1 Kontrol sentuh (mobile)

Stik analog mengambang di separuh kiri layar, empat tombol aksi di kanan, dan
tombol jeda di pojok kanan atas. Semuanya di `src/data/touch.ts` (tata letak) dan
`src/systems/TouchControls.ts` (perilaku); matematika murninya di
`src/systems/VirtualInput.ts` supaya bisa diuji tanpa browser.

**Stiknya benar-benar analog**, bukan empat tombol arah yang disamarkan. Terukur
di Chrome yang diemulasikan sebagai ponsel: dorongan penuh → 105 px/d, dorongan
setengah → 52 px/d, serong 30° → vektor (90, 52) dengan laju tetap 105.

⚠️ **Deteksi perangkat memakai `(pointer: coarse)`, bukan `ontouchstart`.**
Pertanyaannya bukan "bisa disentuh?" tapi "apakah jari alat tunjuk utamanya?".
`'ontouchstart' in window` bernilai **true di Chrome desktop Windows** — versi
pertama memakai itu dan terukur memasang joystick di layar desktop 1280x720.

⚠️ **Phaser melaporkan sentuhan sebagai `leftButtonDown()`.** `Player.onPointerDown`
menyerang saat klik kiri, jadi tanpa penjagaan `pointer.wasTouch`, setiap jempol
yang mendarat — termasuk yang memegang stik — memicu serangan. Terukur: laju turun
dari 105 ke 47 karena pemain terus dalam masa pemulihan serangan.

⚠️ **Transparansi Phaser berlipat.** `add.circle(..., 0.55)` lalu `setAlpha(0.34)`
menghasilkan 0,19 — tombolnya nyaris tak terlihat di atas rumput. Bentuknya kini
dibuat dengan alpha 1 dan `ALPHA_IDLE` jadi satu-satunya pengatur.

⚠️ **Status tombol dibaca dengan memindai semua pointer tiap frame**, bukan
`setInteractive()` per objek: dengan handler per-objek, jempol kedua sering tidak
terdeteksi dan melepas jari di luar tombol meninggalkannya "tertekan" selamanya.
`input.addPointer(4)` wajib — default Phaser cuma 2.

Keyboard selalu menang kalau ditekan, jadi laptop layar sentuh tidak berebut.
Panel upgrade, layar akhir, dan panel jeda semuanya bisa diketuk (`addTapZone`) —
di ponsel tidak ada tombol 1/2/3 atau R, dan tanpa itu permainan buntu di sana.

`index.html` mematikan pinch-zoom, zoom ketuk-ganda, pull-to-refresh, dan
`touch-action` — tanpa yang terakhir, menggeser stik ikut men-scroll halaman dan
stiknya patah di tengah gerakan. Layar tegak menampilkan ajakan memutar perangkat.

**Layar penuh tanpa bilah hitam.** Ponsel modern rasionya 19,5:9 atau 20:9, jauh
lebih lebar dari 16:9 — `Scale.FIT` pada ukuran logis tetap menyisakan bilah di
kiri dan kanan. Karena itu **hanya tingginya yang dikunci** (270 px, supaya ukuran
sprite terasa sama di semua perangkat); lebarnya dihitung saat boot dari rasio
layar dan dibatasi 420–640 px. Batas atas 640 = lebar arena, jadi tepi arena tidak
pernah tembus. Terukur di layar 844x390: logis 584x270, kanvas mengisi 99,9% x 100%.

⚠️ **Ukuran logis dihitung ulang setiap area terlihat berubah, bukan sekali saat
boot.** Di ponsel, bilah alamat menyembunyikan diri saat bermain dan tinggi
viewport bertambah — rasio layar berubah di tengah permainan. Terukur: layar
844x390 menjadi 844x434, kanvas tetap 844x390 dan hanya mengisi **89,9% tinggi**.
Penyesuaian dijeda 150 ms karena ponsel memuntahkan puluhan event `resize` selama
animasi bilah alamat. Ukuran dibaca dari `visualViewport`, bukan `innerHeight` —
`innerHeight` tidak ikut berubah saat bilah alamat bergerak.

Karena ukuran logis bisa berubah kapan saja, **`TouchControls` menata ulang
posisinya** lewat `Phaser.Scale.Events.RESIZE`. Tanpa itu tombol yang ditempelkan
ke tepi kanan menggantung di tengah layar setelah rasio berubah.

⚠️ `height: 100%` dan `100vh` **tidak** mengikuti area terlihat di ponsel; CSS
memakai `100dvh`. `#game` juga dipaku `position: fixed; inset: 0` — sebagai flex
item ia berukuran mengikuti kanvas sementara kanvas mengikuti induknya, dan
lingkaran itu tidak pernah menghasilkan layar penuh.

⚠️ Rasio dihitung sebagai **mendatar** (`maks/min`), bukan dari orientasi saat itu.
Pemain hampir selalu membuka tautannya sambil memegang ponsel tegak; menghitung
dari orientasi saat itu mengunci game di rasio tegak dan tetap ter-letterbox
setelah perangkatnya diputar.

Konsekuensinya **tata letak tidak boleh memakai koordinat mutlak**. Tombol sentuh
ditulis sebagai jarak dari tepi kanan/bawah, dan kotak dialog dibatasi lebar layar.

**Verifikasi: `node tools/verify_touch.mjs [url]`** — mengirim sentuhan sungguhan
lewat CDP `Input.dispatchTouchEvent`, bukan memanggil fungsi internal. Skripnya
membaca posisi tombol dari `TouchControls.buttonPosition()`, bukan menebak
koordinat; menebak membuatnya menyentuh ruang kosong dan melaporkan kegagalan
palsu begitu tata letaknya berubah.

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


### 8.4 Layar pilih kelas

Lebar kartu dan panel **dihitung dari lebar layar**, bukan konstanta — lebar logis
berubah 420-640 mengikuti rasio perangkat, dan angka tetap (kartu 144, panel 452)
meluber di layar tersempit.

Tinggi panel detail mengikuti **teks terpanjang di antara semua kelas**, bukan
kelas yang kebetulan terpilih: panel yang tumbuh-menyusut saat pemain berpindah
kartu terlihat goyah. Panel ditambatkan dari tepi bawah supaya pertumbuhannya
tidak menabrak kartu di atasnya.

⚠️ **Panel detail wajib punya `wordWrap`, dan deskripsi kelas tidak boleh
dipenggal manual** — aturan yang sama seperti naskah di `story.ts`. Dulu Warrior
dan Archer dipenggal manual sementara Mage tidak, dan panelnya tidak punya
word-wrap sama sekali: deskripsi Mage terukur melebar **756 px di layar 480 px**,
meluber keluar di kedua sisi. Dikunci tes.

⚠️ **Teks biasa lahir di depth 0, panel UI di `UI_DEPTH.PANEL` (200).** Baris
kontrol dan petunjuk sempat tertimbun sepenuhnya di balik panel detail; keduanya
kini memakai `UI_DEPTH.TEXT` secara eksplisit.

Teks kartu dibatasi 19 karakter oleh tes: di lebar logis tersempit kartunya hanya
~126 px, dan teks lebih panjang akan membungkus lalu menembus dasar kartu.

### 6.2c Sentry — musuh berperisai & sprite per arah

Sebelumnya **8 tipe musuh hanya memakai 3 texture**; sisanya dibedakan tint dan angka.
Yang dirasakan: *"setiap map bentuknya sama semua"*. Sekarang **11 tipe dengan 6
siluet** — `enemy-lizard` dan `enemy-wasp` dari Warped, `enemy-robot` dari TinyRPG.

**Sentry adalah satu-satunya musuh yang menuntut POSISI**, bukan sekadar angka lebih
besar: perisainya menahan **80% damage dari busur 60°** di arah hadapnya, jadi pemain
harus memutar ke sisi atau belakangnya. Dash yang sudah punya i-frame jadi punya guna
kedua. Ia sengaja **lambat (34 px/d)** supaya memutarinya benar-benar mungkin.

| | Nilai |
|---|---|
| `shieldReduction` | 0,8 |
| `shieldArc` | π/3 (60° ke kiri-kanan dari arah hadap) |
| Terukur, damage 20 | depan **4**, samping **20**, belakang **20** |

⚠️ **Perisai hanya boleh dipasang ke musuh yang `directional`** — dikunci oleh tes.
Kalau arah hadapnya tidak terlihat, perisainya cuma terbaca sebagai damage yang hilang
entah ke mana, dan pemain tidak pernah belajar harus memutar. Sprite dan mekaniknya
saling menjelaskan; itu sebabnya `enemy-robot` dipilih meski frame-nya paling kecil
(20×16) dan perlu skala 1,8.

**Arah serangan diturunkan dari vektor knockback**, yang selalu mengarah MENJAUH dari
penyerang — jadi kebalikannya adalah posisi penyerang. Dengan begitu tidak ada tanda
tangan fungsi yang perlu diubah di seluruh jalur serangan (melee, proyektil, skill).

Konsekuensinya disengaja: **damage area menembus perisai**, karena ledakan elite,
percik rantai, dan duri memanggil `takeDamage` dengan knockback nol. Ledakan tidak
datang dari satu arah, dan memaksa pemain memutar untuk ledakan terasa mengada-ada.

Damage yang tertahan **wajib terbaca sebagai tertahan**: ada kilat biru dan bunyi
`block` (dering logam pendek, bukan derau `hit`). Tanpa itu pemain hanya merasa
pukulannya lemah.

#### Sprite per arah

`enemy-robot` di-pack dari tiga folder sekaligus jadi **satu texture 12 frame**:
0-3 hadap bawah, 4-7 samping, 8-11 hadap atas — konvensi yang sama dengan sprite
pemain. `Enemy.perbaruiArahHadap()` memilih animasinya dari arah gerak.

⚠️ Texture `directional` **wajib dipisahkan** di `createAnimations()`. Membuat satu
animasi idle dari 12 frame-nya akan memutar ketiga arah berurutan, dan musuhnya
terlihat berputar-putar di tempat. Jumlah frame wajib habis dibagi 3 — dikunci tes.

Verifikasi: `node tools/verify_enemies.mjs`.

### 6.2d OVERCLOCK & permata jatuhan

Dua sistem, satu lingkaran: **bunuh → permata biru → meter → pamungkas → bunuh lagi.**

**Kenapa ada.** Rantai bunuh sudah lama mengalikan skor hingga x5, tapi hasilnya cuma
angka yang naik lebih cepat — bermain rapi tidak pernah punya MOMEN. Dan sebelum ini
membunuh musuh tidak menjatuhkan apa pun; tidak ada satu benda pun di lapangan.

| Permata | Warna | Isi |
|---|---|---|
| `heal` | hijau | +14 HP |
| `charge` | biru | +12 meter |
| `score` | kuning | +40 skor |

Spritenya memakai `ui-gems` yang **sudah ada** untuk ikon panel upgrade — tanpa aset
baru. Umurnya 7 detik dengan kedipan peringatan: permata yang menunggu selamanya
berubah dari keputusan jadi tugas memunguti. Total peluang jatuh **di bawah 1** dan
diundi SEKALI per musuh, jadi sebagian besar musuh tidak menjatuhkan apa-apa; dengan
undian terpisah per jenis, seekor musuh bisa menjatuhkan tiga sekaligus dan lapangan
cepat penuh. Elite selalu menjatuhkan sesuatu.

**Jurus pamungkas berbeda BENTUK, bukan cuma angka** — alasan yang sama seperti skill
dan FX benturan:

| Kelas | Bentuk | Terukur (10 musuh) |
|---|---|---|
| Warrior | berputar menahan, lalu melempar | 1.300 |
| Archer | hujan panah membanjiri arena | 1.870 |
| Mage | satu nova raksasa seketika | 1.200 |

⚠️ **Dua jurus sempat praktis tidak berguna, dan keduanya lolos semua pemeriksaan
lain.** Ini pelajaran terpenting di bagian ini:

- **Archer 22 damage.** Hujannya mengundi titik acak seragam di seluruh layar. Layar
  kamera ~157.000 px², satu panah menutupi ~2.100 px² — panah acak hampir selalu
  mendarat di rumput kosong. Sekarang **75% panah diarahkan ke musuh** dengan sebaran
  44 px; sisanya tetap acak supaya terlihat seperti hujan, bukan tembakan otomatis.
- **Warrior 520.** Jurusnya melawan dirinya sendiri: dorongan 260 tiap ketukan
  melempar musuh keluar dari radius putarannya sendiri, jadi enam dari delapan ketukan
  tidak mengenai apa pun. Sekarang badainya **menahan lalu melempar** — dorongan 18%
  selama berputar, penuh hanya di ketukan terakhir.

`tools/verify_overclock.mjs` menjaga **rasio terkuat:terlemah ≤ 2x**. Tanpa penjaga itu
sebuah jurus bisa kembali jadi pajangan tanpa satu tes pun gagal.

⚠️ `OverclockMeter` ada di berkasnya **sendiri**, terpisah dari `Overclock.ts` yang
mengimpor Phaser. Berkas tes yang menarik Phaser gagal dengan "window is not defined",
dan kegagalan itu muncul sebagai *suite gagal dikumpulkan* — ringkasannya tetap menulis
"180 lolos" sementara satu berkas tidak pernah dijalankan. Pemisahan yang sama dipakai
`VirtualInput.ts` dan `Navigation.ts`.

Overclock memakai **tekan sekali**, bukan tahan — di keyboard lewat `JustDown`, di layar
sentuh lewat perbandingan keadaan frame sebelumnya. Dengan `held`, jempol yang menempel
menghabiskan meter seketika setelah terisi lagi.

### 6.3 Musuh elite

Ada delapan tipe musuh tapi hanya **empat perilaku**, dan empat di antaranya
`chase` polos yang bedanya cuma tint dan angka. Di run panjang pemain melawan hal
yang sama berjam-jam.

Elite tidak menambah sprite: ia mengubah musuh yang ada dengan satu sifat
menonjol (`src/data/elites.ts`) dan **selalu** memasang cincin berwarna.

| Elite | HP | Kecepatan | Skor | Cincin |
|---|---|---|---|---|
| Tebal | x2,6 | x0,85 | x2,5 | oranye |
| Gesit | x0,8 | x1,7 | x2 | biru |
| Peledak | x1,4 | x1 | x2,5 | merah |

Peluangnya nol sampai wave 4, lalu naik ke batas 30%. Wave awal harus mengajarkan
musuh biasa dulu; elite di wave 1 hanya terbaca sebagai "kenapa yang ini tidak
mati". Batas atas ada supaya penandanya tetap berarti.

⚠️ **Cincin memakai depth TETAP (`DEPTH.ENEMY - 1`), bukan `this.depth - 1`.**
`applyElite()` dipanggil sebelum scene menyetel depth musuh, jadi `this.depth`
masih 0 dan cincinnya mendarat di -1 — di bawah layer tanah, tidak pernah terlihat
sama sekali. Ketahuan hanya dari tangkapan layar, bukan dari tes.

Elite "Gesit" sengaja ber-HP di bawah normal: yang cepat harus tetap bisa
dijatuhkan cepat, kalau tidak ia melelahkan tanpa menambah ketegangan.

### 6.3b Ledakan khusus

Elite Peledak dan upgrade "Ledakan Akhir" dulu sama-sama memakai `fx-enemy-death` —
sprite yang juga dipakai setiap musuh biasa saat mati. Akibatnya ledakan yang
seharusnya jadi kejadian besar tampil persis seperti kematian rutin, dan pemain
tidak punya isyarat visual bahwa ada damage area yang baru saja terjadi.

| Pemicu | Sprite | Ukuran |
|---|---|---|
| Elite Peledak mati | `fx-explosion-big` | 8 frame, 48×48 |
| Upgrade "Ledakan Akhir" | `fx-explosion-small` | 7 frame, 48×48 |

⚠️ Varian `explosion-1-c/d/e` **tidak** dipakai meski tersedia: asapnya membubung
ke atas layar, yang terbaca sebagai tampak-samping. Di arena tampak-atas, "atas"
adalah arah utara di lantai, bukan langit — alasan yang sama dengan penolakan
sprite battle RPG di M2. Hanya varian `f` dan `g` yang mengembang radial.

### 8.2 Rekor tersimpan

`src/systems/Records.ts`. Skor, wave terjauh, rantai terbaik, dan jumlah kill
terbaik **per kelas**, bertahan antar sesi lewat `localStorage`. Tampil di layar
judul (kelas yang belum dimainkan dilewati) dan sebagai pembanding di layar akhir.

Logika penggabungan murni dan terpisah dari penyimpanan, seperti `ScoreStreak.ts`.
Tiap medan diambil **maksimumnya sendiri-sendiri**: run yang mencapai wave 14
dengan skor rendah tetap berhak atas "wave terjauh 14". `pecahRekor` hanya dari
**skor** — mengumumkan rekor baru karena jumlah kill naik satu membuat labelnya
tidak berarti.

⚠️ **Data tersimpan tidak boleh sanggup mematikan game.** Kunci ber-versi
(`debug-run:records:v1`); JSON rusak, versi lain, entri setengah jadi, atau
`localStorage` yang melempar (Safari mode privat) semuanya menghasilkan rekor
kosong, bukan lemparan. Dikunci tes.

Disimpan **di akhir run saja** — saat mati atau saat memilih SUDAHI. Refresh di
tengah permainan tidak meninggalkan jejak skor separuh jalan.


### 8.3 Layar judul

Latarnya **arena sungguhan** — tilemap yang sama persis dengan yang dipakai saat
bermain, biome acak tiap kunjungan, kamera menggeser menyilang perlahan. Enam
musuh berkeliaran di belakang, dan ketiga kelas berjalan di tempat di depan.

Versi sebelumnya berupa panel gelap di ruang hitam berisi **tujuh baris daftar
kontrol**. Itu manual, bukan ajakan bermain, dan tidak memperlihatkan satu pun
aset game. Daftar kontrol kini pindah ke layar pilih kelas, tempat pemain memang
sudah berhenti untuk membaca.

**Logo ber-glitch.** Tiga salinan teks: bayangan merah dan biru (blend ADD) plus
satu utama, dengan pemisahan tipis yang selalu ada dan hentakan tiap ~2,6 detik
disertai garis sobek. Judulnya "DEBUG RUN" dan lawannya bug, jadi logo yang
sesekali rusak menyampaikan tema game dalam satu pandangan.

Musuh latar sengaja **bukan** `Enemy` dan tanpa fisika — mereka hiasan, tidak
boleh menabrak apa pun, dan tidak perlu AI. Sprite polos plus hanyutan sinus
lebih murah dan tidak bisa membuat layar judul macet.

Peredup gelap 0,62 wajib: tanpa itu teks hijau bertumpuk dengan rumput dan tidak
terbaca. Terukur 60 fps di Chrome headless.

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
| ~~FX kena hit~~ | ~~`Explosions and Magic/Hit/Sprites/`~~ | 3 PNG — diganti tiga set per kelas di bawah |
| FX benturan Warrior | `Explosions and Magic/Warped shooting fx/hits/Hits-2/sprites/` | 7 PNG, 32×32 |
| FX benturan Archer | `.../Warped shooting fx/hits/hits-1/sprites/` | 5 PNG, 32×32 |
| FX benturan Mage | `.../Warped shooting fx/hits/Hits-5/sprites/` | 7 PNG, 32×32 |
| Ledakan besar | `Explosions and Magic/Explosions pack/explosion-1-f/Sprites/` | 8 PNG, 48×48 |
| Ledakan kecil | `.../Explosions pack/explosion-1-g/Sprites/` | 7 PNG, 48×48 |
| Musuh organik | `TinyRPG/Characters/Battle Sprites/Living Pack 1/{Slime,Frog}/` | sheet + frame lepas |
| Boss wave 5 | `TinyRPG/Characters/Battle Sprites/Mechanic/Sentinel.png` | 1 PNG — dipakai |
| Boss wave 10 | `Warped/Characters/top-down-boss/PNG/` | frame lepas — dipakai |
| Ikon upgrade | `Misc/gems/spritesheets/gems-spritesheet.png` | sheet 848×176 — dipotong, lihat §6.2b |

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
