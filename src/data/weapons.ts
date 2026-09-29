/**
 * Senjata yang terlihat di tangan pemain, beserta cara ia mengayun.
 *
 * Kenapa ini sistem hamparan (overlay) dan bukan dibakar ke spritesheet pemain:
 * dibakar berarti senjatanya ikut membeku. Di sini senjata bisa terangkat saat
 * ancang-ancang lalu mengayun tepat saat hitbox aktif, dan itulah yang membuat
 * "memegang senjata" terasa seperti memegang, bukan seperti stiker.
 *
 * ⚠️ Semua sprite senjata digambar MENGHADAP ATAS (ujung di baris 0). Rotasi di
 * bawah diukur dari sana. Kalau ada senjata baru yang digambar menghadap kanan,
 * putar dulu di `tools/pack_assets.py` — jangan menambal dengan offset di sini,
 * karena ayunannya ikut memakai sudut yang sama.
 */

import type { Facing } from '../entities/Player';

export type WeaponPose = {
  /** Geser dari pusat pemain, dalam piksel logis. */
  x: number;
  y: number;
  /** Senjata di belakang pemain saat ia membelakangi kamera. */
  behind: boolean;
  /** Sprite dicerminkan — dipakai arah kiri supaya pegangannya tetap di tangan. */
  flip: boolean;
};

/** Gaya ayunan dan sudut diam per jenis senjata. */
export type WeaponKind = 'sword' | 'bow' | 'staff';

const DEG = Math.PI / 180;

/**
 * Pose diam per arah hadap: POSISI saja, tanpa sudut.
 *
 * Sudut diamnya milik SENJATA, bukan arah hadap — lihat `REST` di bawah. Versi
 * pertama menaruh rotasi di sini, dan hasilnya ketiga senjata dimiringkan sama
 * jauh: busur dan tongkat ikut terlentang 55 derajat seperti pedang, sehingga
 * pemain terlihat menyodorkan senjatanya alih-alih memegangnya.
 *
 * Angkanya diturunkan dari sprite pemain, bukan dikira-kira: karakter mengisi
 * kotak (8,6)-(24,31) di dalam frame 32x32, jadi tangannya kira-kira 6-7 px dari
 * sumbu tengah dan setinggi pinggang.
 */
export const POSE: Record<Facing, WeaponPose> = {
  down: { x: 7, y: 6, behind: false, flip: false },
  // Membelakangi kamera: senjata DI BELAKANG badan, kalau tidak ia menutupi kepala.
  up: { x: -7, y: 5, behind: true, flip: true },
  right: { x: 6, y: 6, behind: false, flip: false },
  left: { x: -6, y: 6, behind: false, flip: true },
};

/**
 * Sudut diam per jenis senjata, radian. 0 = tegak lurus ke atas.
 *
 * Sengaja kecil. Senjata yang dipegang santai hampir tegak; yang terlentang jauh
 * terbaca sebagai sedang diacungkan, dan itu membuat pose diam tampak seperti
 * pose menyerang yang macet.
 */
export const REST: Record<WeaponKind, number> = {
  // Pedang sedikit condong keluar supaya bilahnya tidak menimpa kepala.
  sword: 22 * DEG,
  // Busur dipegang tegak — busur miring tidak terbaca sebagai busur.
  bow: 4 * DEG,
  staff: 8 * DEG,
};

/**
 * Letak genggaman sepanjang tinggi sprite: 0 = ujung atas, 1 = ujung bawah.
 *
 * Ini juga titik putar ayunannya, jadi ia harus benar-benar di tempat tangan
 * memegang. Versi pertama memakai 1 untuk SEMUA senjata, dan busurnya jadi
 * menggantung di atas tangan seperti balon — busur dipegang di TENGAH, bukan di
 * ujung bawah, dan memutarnya pada ujung bawah membuat ayunannya menyapu lebar
 * seperti pedang.
 */
export const GRIP: Record<WeaponKind, number> = {
  sword: 1, // gagang di pangkal
  bow: 0.5, // dipegang di tengah lengkungan
  staff: 0.72, // tangan di sepertiga bawah batang
};

/**
 * Ayunan: sudut tambahan (relatif pose diam) di tiap tahap.
 *
 * `angkat` dipakai selama ancang-ancang, `ayun` saat hitbox aktif. Nilainya
 * ditandatangani mengikuti arah hadap lewat `arah` supaya ayunan ke kiri tidak
 * terlihat seperti ayunan ke kanan yang diputar.
 */
export type SwingShape = {
  /** Sudut saat ancang-ancang, radian. Berlawanan arah ayunan. */
  angkat: number;
  /** Sudut puncak ayunan, radian. */
  ayun: number;
  /** Seberapa jauh senjata terdorong keluar saat mengayun, piksel. */
  dorong: number;
};

/**
 * ⚠️ `dorong` harus KECIL.
 *
 * Ia menggeser senjata sepanjang sumbunya sendiri, menjauh dari genggaman. Pada
 * 5 px hasilnya terlihat jelas di puncak ayunan: ada celah antara tangan dan
 * gagang, dan pedangnya terbaca seperti terlepas dari tangan alih-alih diayunkan.
 * Beberapa piksel sudah cukup untuk memberi kesan terlempar keluar.
 */
export const SWING: Record<WeaponKind, SwingShape> = {
  // Tebasan lebar — ini satu-satunya senjata yang benar-benar mengenai musuh,
  // jadi ayunannya paling jauh dan paling terbaca.
  sword: { angkat: -50 * DEG, ayun: 115 * DEG, dorong: 1 },
  // Busur tidak menebas: ia ditarik lalu dilepas. Sudutnya kecil, dorongnya
  // negatif — busur ditarik MENDEKAT ke badan, bukan diayunkan keluar.
  bow: { angkat: -12 * DEG, ayun: 18 * DEG, dorong: -2 },
  // Tongkat diketukkan ke depan, bukan ditebaskan ke samping.
  staff: { angkat: -28 * DEG, ayun: 40 * DEG, dorong: 2 },
};

export const WEAPON_TIMING = {
  /** Lama senjata kembali ke pose diam setelah ayunan. */
  PULIH_MS: 150,
  /** Lama gerakan ayunan itu sendiri. */
  AYUN_MS: 90,
} as const;
