/**
 * Angka combat. Semua nilai mengacu SPEC.md §5.2 — ubah balancing di sini.
 * Satuan: damage = poin, durasi = milidetik, jarak = piksel, kecepatan = px/detik.
 */

import { SHEETS } from './frames';

export type HitShape =
  | { type: 'rect'; width: number; height: number; reach: number }
  | { type: 'circle'; radius: number };

export type AttackStep = {
  name: string;
  damage: number;
  shape: HitShape;
  /** Sprite FX yang dimainkan, dan seberapa jauh dari pemain ia muncul. */
  fxKey: string;
  fxOffset: number;
  fxScale: number;
  /** Jeda sebelum serangan berikutnya boleh keluar. */
  recoveryMs: number;
  /** Delay dari tombol ditekan sampai hitbox aktif — ruang untuk animasi ancang-ancang. */
  windupMs: number;
  knockback: number;
  /** Lama game dibekukan saat pukulan kena. Ini yang bikin pukulan terasa "nendang". */
  hitstopMs: number;
  /** Getaran kamera saat kena. */
  shakeIntensity: number;
};

/**
 * Combo 3 pukulan. Pukulan ke-3 adalah finisher: AoE lingkaran, damage besar,
 * hitstop paling lama.
 */
export const COMBO: readonly AttackStep[] = [
  {
    name: 'pukul-1',
    damage: 12,
    shape: { type: 'rect', width: 32, height: 26, reach: 19 },
    fxKey: SHEETS.FX_SLASH_HORIZONTAL.key,
    fxOffset: 18,
    fxScale: 0.55,
    recoveryMs: 350,
    windupMs: 40,
    knockback: 210,
    hitstopMs: 60,
    shakeIntensity: 0.002,
  },
  {
    name: 'pukul-2',
    damage: 12,
    shape: { type: 'rect', width: 32, height: 26, reach: 19 },
    fxKey: SHEETS.FX_SLASH_UPWARD.key,
    fxOffset: 18,
    fxScale: 0.55,
    recoveryMs: 350,
    windupMs: 40,
    knockback: 210,
    hitstopMs: 60,
    shakeIntensity: 0.002,
  },
  {
    name: 'finisher',
    damage: 22,
    shape: { type: 'circle', radius: 40 },
    fxKey: SHEETS.FX_SLASH_CIRCULAR.key,
    fxOffset: 0,
    fxScale: 0.9,
    recoveryMs: 600,
    windupMs: 60,
    knockback: 300,
    hitstopMs: 110,
    shakeIntensity: 0.005,
  },
];

export const COMBAT = {
  /** Kalau tidak menyerang lagi dalam rentang ini, combo balik ke pukulan 1. */
  COMBO_WINDOW_MS: 600,
  /**
   * Pemain menyodok maju sedikit saat menyerang. Ini pengganti animasi serang yang
   * tidak ada di spritesheet — gabungan sodokan + FX slash terbaca sebagai animasi
   * serang penuh. (SPEC.md §5.3)
   */
  LUNGE_SPEED: 130,
  LUNGE_MS: 120,
  /** Pemain melambat selama masa pemulihan serangan, bukan diam total. */
  ATTACK_MOVE_MULTIPLIER: 0.45,
  /**
   * Lama knockback musuh didorong, dan redaman setelahnya.
   *
   * Nilai awal (90 px/detik, drag 700) menghasilkan dorongan hanya ~5 px — praktis
   * tidak terasa, sehingga pemain selalu menempel dengan musuh dan kehilangan 56 HP
   * hanya di wave 1. Diukur ulang di M6 dan dinaikkan drastis.
   */
  KNOCKBACK_MS: 220,
  /** Redaman musuh setelah terdorong. Makin kecil, makin jauh terlemparnya. */
  ENEMY_DRAG: 320,
  /** Lama musuh berkedip putih setelah kena. */
  HIT_FLASH_MS: 90,
} as const;

export const ENEMY_DUMMY = {
  HP: 60,
  /** Hitbox musuh, lebih kecil dari frame 48x48 supaya terasa adil. */
  BODY_WIDTH: 22,
  BODY_HEIGHT: 18,
  IDLE_FRAME_RATE: 6,
} as const;
