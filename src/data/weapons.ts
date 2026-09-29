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

/** Gaya ayunan, genggaman, dan urutan gambar per jenis senjata. */
export type WeaponKind = 'sword' | 'bow' | 'staff';

const DEG = Math.PI / 180;

export type WeaponPose = {
  /** Letak GENGGAMAN relatif pusat pemain, piksel logis. */
  x: number;
  y: number;
  /** Sudut diam, radian. 0 = ujung menghadap atas. */
  rotation: number;
  /** Sprite dicerminkan. */
  flip: boolean;
};

export type ClassAnchor = {
  down: WeaponPose;
  /** Dipakai untuk hadap KANAN; hadap kiri adalah cerminannya. */
  side: WeaponPose;
  up: WeaponPose;
};

/**
 * Titik genggam per kelas dan arah hadap — **diukur dari piksel spritesheet**,
 * bukan diturunkan dari kotak pembatas.
 *
 * Versi pertama memakai satu tabel untuk semua kelas dengan angka hasil hitungan
 * kasar (`x = ±6..7`, `y = 6`). Hasilnya senjata mengambang di udara di samping
 * karakter, dan itulah keluhan yang dilaporkan. Penyebabnya baru ketahuan setelah
 * piksel warna kulit di tiap frame benar-benar dicari:
 *
 * | sprite | hadap bawah | hadap samping |
 * |---|---|---|
 * | guy (Warrior) | tangan di (+6, +9) | tangan di (**-2**, +9) |
 * | pirategirl (Archer) | (+4, +6) | (**-1**, +6) |
 * | blondkid (Mage) | (+5, +9) | (**+2**, +9) |
 *
 * Yang paling meleset adalah arah SAMPING: tangan yang terlihat ada di dekat
 * sumbu badan, bukan 6 px di luarnya. Selisih 6-8 px itulah celah yang terbaca
 * sebagai senjata melayang.
 *
 * Arah KIRI diturunkan dengan mencerminkan `side`, jadi tidak ada entri kembar
 * yang bisa lepas sinkron.
 */
export const HAND: Record<string, ClassAnchor> = {
  warrior: {
    down: { x: 6, y: 9, rotation: 40 * DEG, flip: false },
    side: { x: -2, y: 9, rotation: 65 * DEG, flip: false },
    // Sudutnya NEGATIF, bukan sekadar x yang dicerminkan. Dengan +40 bilahnya
    // condong ke arah badan dan pedangnya hilang sepenuhnya di balik punggung.
    up: { x: -6, y: 9, rotation: -40 * DEG, flip: false },
  },
  archer: {
    // Busur digeser sedikit ke luar dari tangan (+7 vs tangan di +4). Ia digambar
    // DI BELAKANG badan, jadi yang menjadikannya terbaca sebagai "dipegang"
    // adalah sisi dalam yang tertutup badan — kalau ditaruh tepat di tangan, yang
    // tersisa di luar siluet hanya lengkungan setipis satu piksel.
    down: { x: 7, y: 6, rotation: 0, flip: false },
    side: { x: 5, y: 6, rotation: 20 * DEG, flip: false },
    up: { x: -7, y: 6, rotation: 0, flip: true },
  },
  mage: {
    down: { x: 5, y: 9, rotation: 20 * DEG, flip: false },
    side: { x: 2, y: 9, rotation: 30 * DEG, flip: false },
    up: { x: -6, y: 9, rotation: -20 * DEG, flip: false },
  },
};

/** Pose untuk satu arah hadap, dengan arah kiri diturunkan dari `side`. */
export function poseFor(classId: string, facing: Facing): WeaponPose {
  const anchor = HAND[classId] ?? HAND.warrior;
  if (facing === 'down') return anchor.down;
  if (facing === 'up') return anchor.up;
  if (facing === 'right') return anchor.side;
  const s = anchor.side;
  return { x: -s.x, y: s.y, rotation: -s.rotation, flip: !s.flip };
}

/**
 * Digambar di belakang badan bahkan saat menghadap kamera.
 *
 * Ini bukan soal rapi-rapian — ini yang membuat senjata terbaca MENEMPEL.
 * Busur digenggam di tengah, jadi ia selalu membentang melintasi badan; digambar
 * di depan, ia terlihat seperti ditempelkan di atas karakternya. Di belakang,
 * badan menutupi sisi dalamnya dan sisanya terbaca sebagai busur yang dipegang di
 * samping — tumpang tindih itulah yang memberi kesan menyatu.
 *
 * Pedang dan tongkat digenggam di PANGKAL, jadi gagangnya jatuh tepat di tangan
 * dan tidak melintasi badan. Keduanya justru lebih baik di depan: gagangnya
 * terlihat bersentuhan dengan tangan.
 */
export const BEHIND: Record<WeaponKind, boolean> = {
  sword: false,
  bow: true,
  staff: false,
};

/** Senjata juga selalu di belakang badan saat pemain membelakangi kamera. */
export function behindFor(kind: WeaponKind, facing: Facing): boolean {
  return facing === 'up' || BEHIND[kind];
}

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
 * ditandatangani mengikuti arah hadap supaya ayunan ke kiri tidak terlihat
 * seperti ayunan ke kanan yang diputar.
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
