/**
 * Semua angka tuning ada di folder `data/`.
 * Ubah balancing di sini, bukan di logika. (SPEC.md §14)
 */

export const VIEW = {
  /** Resolusi logis; di-scale integer ke ukuran window. (SPEC.md §2) */
  WIDTH: 480,
  HEIGHT: 270,
} as const;

export const TILE = 16;

export const ARENA = {
  /** Ukuran arena dalam tile. 40x30 tile = 640x480 px. (SPEC.md §7) */
  COLS: 40,
  ROWS: 30,
  /** Tebal tembok pembatas, dalam tile. */
  BORDER: 2,
  /** Seed tetap supaya layout arena identik tiap run selama development. */
  SEED: 20260927,
} as const;

export const PLAYER = {
  MAX_HP: 100,
  /** Kebal sesaat setelah kena, supaya tidak habis dalam sekejap saat dikerumuni. */
  INVULNERABLE_MS: 750,
  /** Dorongan mundur saat pemain kena. */
  HURT_KNOCKBACK: 150,
  HURT_KNOCKBACK_MS: 140,
  SPEED: 110,
  /** Hitbox fisik di kaki, lebih kecil dari frame 32x32 supaya gerak terasa enak. */
  BODY_WIDTH: 12,
  BODY_HEIGHT: 10,
  BODY_OFFSET_X: 10,
  BODY_OFFSET_Y: 20,
  WALK_FRAME_RATE: 8,
} as const;

export const CAMERA = {
  LERP: 0.1,
} as const;
