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

/** Tile tanah — opaque penuh, aman dipakai di layer paling bawah. */
export const FLOOR = {
  GRASS: 0,
  GRASS_ALT: 1,
  GRASS_PLANT: 9,
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
} as const;

/** Prop bertransparansi — wajib di layer objek. */
export const PROP = {
  ROCK: 300,
  TREE: 302,
  BUSH: 297,
} as const;

/** Penanda "tidak ada tile" untuk layer objek. */
export const EMPTY = -1;

/** Variasi lantai + bobot. Mayoritas rumput polos supaya arena tidak ramai. */
export const FLOOR_WEIGHTS: ReadonlyArray<readonly [number, number]> = [
  [FLOOR.GRASS, 82],
  [FLOOR.GRASS_ALT, 14],
  [FLOOR.GRASS_PLANT, 4],
];

/**
 * Tembok pakai SATU tile saja. 275 dan 217 sama-sama valid, tapi tone-nya beda jauh
 * sehingga kalau dicampur acak tepi arena terlihat belang. Uniform lebih terbaca
 * sebagai "tidak bisa dilewati".
 */
export const WALL_VARIANTS: readonly number[] = [WALL.FOREST_DARK];
