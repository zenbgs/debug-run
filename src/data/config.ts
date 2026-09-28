/**
 * Semua angka tuning ada di folder `data/`.
 * Ubah balancing di sini, bukan di logika. (SPEC.md §14)
 */

export const VIEW = {
  /**
   * Lebar logis **dasar**. Lebar sebenarnya dihitung saat boot dari rasio layar
   * perangkat (`hitungUkuranLogis` di `main.ts`) supaya kanvas mengisi layar
   * penuh tanpa bilah hitam — ponsel modern rasionya 19,5:9 atau 20:9, jauh lebih
   * lebar dari 16:9, dan `Scale.FIT` pada ukuran tetap menyisakan bilah di kiri
   * dan kanan.
   */
  WIDTH: 480,
  /**
   * Tinggi logis **tetap**, dan sengaja tidak ikut berubah: ini yang menjaga
   * ukuran sprite terasa sama di semua perangkat. Hanya lebarnya yang melar.
   */
  HEIGHT: 270,
  /** Batas lebar logis. Maksimum = lebar arena, jadi tepi arena tidak pernah tembus. */
  MIN_WIDTH: 420,
  MAX_WIDTH: 640,
} as const;

export const TILE = 16;

/**
 * Font pixel yang di-host sendiri (`public/fonts/`), bukan lewat CDN — supaya game
 * tetap jalan offline dan tidak ada permintaan pihak ketiga. Fallback ke monospace
 * kalau font gagal dimuat.
 */
export const FONT_FAMILY = '"Press Start 2P", monospace';

export const ARENA = {
  /** Ukuran arena dalam tile. 40x30 tile = 640x480 px. (SPEC.md §7) */
  COLS: 40,
  ROWS: 30,
  /** Tebal tembok pembatas, dalam tile. */
  BORDER: 2,
  /**
   * Seed dasar. Dipakai apa adanya kalau `RANDOM_SEED` false.
   *
   * Seed tetap enak saat development (layout selalu sama, bug mudah diulang),
   * tapi membuat tiap sesi terasa identik — rintangannya persis di tempat yang
   * sama setiap kali main. Default-nya kini acak.
   */
  SEED: 20260927,
  /** Set false saat mengejar bug supaya layout arena bisa diulang. */
  RANDOM_SEED: true,
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

/**
 * Dash: gerak cepat menembus kerumunan dengan kebal penuh. (SPEC.md §5.2)
 *
 * Kebalnya disengaja dan penting: tanpa itu dash hanya akan melemparkan pemain
 * ke dalam musuh dan justru menambah damage yang diterima.
 */
export const DASH = {
  DISTANCE: 160,
  DURATION_MS: 180,
  COOLDOWN_MS: 1200,
  /** Jeda antar bayangan sisa. */
  AFTERIMAGE_EVERY_MS: 30,
  AFTERIMAGE_FADE_MS: 220,
} as const;

export const CAMERA = {
  LERP: 0.1,
} as const;
