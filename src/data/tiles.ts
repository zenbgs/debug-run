/**
 * Index tile untuk `public/assets/tilesets/overworld.png` (29 kolom x 21 baris, 16x16 px).
 * Semua index sudah diverifikasi dengan me-render tileset + overlay grid.
 *
 * PENTING: tileset ini mode palet dengan transparansi. Sebagian tile adalah
 * *prop* (punya piksel transparan) dan HARUS dipasang di layer objek di atas
 * layer tanah — kalau dipasang sendirian, bagian transparannya tembus ke
 * background scene dan terlihat seperti kotak hitam.
 */

export const TILESET_COLS = 29;

/**
 * Tile tanah — opaque penuh, aman dipakai di layer paling bawah.
 *
 * Semua index di bawah sudah diukur: 256/256 piksel opaque. Cara memverifikasi
 * index baru ada di SPEC §10; jangan menambah tanpa mengukur.
 */
export const FLOOR = {
  GRASS: 0,
  GRASS_ALT: 1,
  GRASS_PLANT: 9,
  /** Satu-satunya pasir murni di tileset. Sisanya (99/127/129/157) bertepi rumput. */
  SAND: 128,
  /** Lantai bata reruntuhan — tiga baris susun yang berbeda. */
  BRICK_A: 504,
  BRICK_B: 505,
  BRICK_C: 506,
  /** Air dalam. 261 paling bersih; 323 punya tepi pantai di sisi kiri. */
  WATER: 261,
  WATER_ALT: 323,
} as const;

/**
 * Tile hutan rapat — opaque penuh. Dipakai sebagai tembok pembatas arena.
 *
 * JANGAN pakai index 246: tile itu KOSONG (0/256 piksel opaque). Karena collider
 * dipasang lewat `setCollisionByExclusion([EMPTY])`, tile kosong yang ikut terpasang
 * tetap menabrak — hasilnya dinding tak terlihat. Verifikasi alpha dulu sebelum
 * menambah index baru ke sini.
 */
export const WALL = {
  FOREST_DARK: 275,
  FOREST_LIGHT: 217,
  /** Hutan paling rapat — dipakai sebagai tepi rawa. */
  FOREST_DENSE: 331,
  /** Batu abu gelap. Tepi gurun dan reruntuhan. */
  STONE_DARK: 113,
  STONE_DARKER: 171,
} as const;

/** Prop bertransparansi — wajib di layer objek. */
export const PROP = {
  ROCK: 300,
  TREE: 302,
  BUSH: 297,
  /** Bongkahan batu padat; dipakai di biome tanpa tumbuhan. */
  BOULDER: 241,
  /** Puncak batu berpasir — cocok untuk gurun dan reruntuhan. */
  CRAG: 212,
  /** Serumpun ilalang/alang-alang, bagus di rawa. */
  REED: 299,
} as const;

/** Penanda "tidak ada tile" untuk layer objek. */
export const EMPTY = -1;

/**
 * Susunan lantai dan tembok sekarang ada di `biomes.ts`, satu set per biome.
 * Berkas ini tinggal jadi registri index mentah yang sudah diverifikasi.
 *
 * Catatan yang masih berlaku: **tembok pakai satu tile saja per biome.** 275 dan
 * 217 sama-sama valid, tapi tone-nya beda jauh sehingga kalau dicampur acak tepi
 * arena terlihat belang dan tidak lagi terbaca sebagai "tidak bisa dilewati".
 */
