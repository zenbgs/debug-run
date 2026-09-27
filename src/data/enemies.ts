/**
 * Definisi tipe musuh. Semua balancing musuh ada di sini. (SPEC.md §6)
 *
 * Catatan penting: Legacy Collection hanya menyediakan **3 sprite musuh tampak-atas**
 * yang skalanya cocok. Untuk mencapai 7 tipe, sisanya dibuat sebagai *varian statistik*
 * dari sprite yang sama — tint warna berbeda plus HP/kecepatan/perilaku berbeda.
 * Ini pola umum di game arena dan tidak butuh aset baru.
 */

import { SHEETS } from './frames';

export type EnemyBehavior = 'chase' | 'zigzag' | 'charger';

export type EnemyType = {
  id: string;
  name: string;
  /** Key spritesheet + jumlah frame animasi idle. */
  texture: string;
  frames: number;
  /** Tint untuk membedakan varian. `undefined` = warna asli sprite. */
  tint?: number;
  scale: number;
  hp: number;
  /** Kecepatan jelajah, px/detik. Untuk `charger` ini kecepatan saat menerjang. */
  speed: number;
  contactDamage: number;
  /** 0 = terdorong penuh, 1 = kebal knockback. */
  knockbackResist: number;
  behavior: EnemyBehavior;
  bodyWidth: number;
  bodyHeight: number;
  idleFrameRate: number;
  /** Poin yang didapat saat musuh ini dibasmi. */
  score: number;
  /**
   * Detik ke berapa tipe ini mulai boleh muncul.
   * Jadwal sengaja rapat: sesi bertahan-hidup biasanya 30-90 detik, jadi unlock
   * yang lebih lambat dari itu berarti tipe tersebut tidak pernah terlihat.
   */
  unlockAtSeconds: number;
};

const BEETLE = SHEETS.ENEMY_BEETLE;
const CRAWLER = SHEETS.ENEMY_CRAWLER;
const MOTH = SHEETS.ENEMY_MOTH;

export const ENEMY_TYPES: readonly EnemyType[] = [
  {
    id: 'glitchling',
    name: 'Glitchling',
    texture: BEETLE.key,
    frames: BEETLE.frames,
    scale: 0.8,
    hp: 30,
    speed: 55,
    contactDamage: 8,
    knockbackResist: 0,
    behavior: 'chase',
    bodyWidth: 22,
    bodyHeight: 18,
    idleFrameRate: 6,
    score: 10,
    unlockAtSeconds: 0,
  },
  {
    id: 'glitchling-swift',
    name: 'Glitchling Cepat',
    texture: BEETLE.key,
    frames: BEETLE.frames,
    tint: 0xff8a7a,
    scale: 0.68,
    hp: 18,
    speed: 100,
    contactDamage: 8,
    knockbackResist: 0,
    behavior: 'chase',
    bodyWidth: 18,
    bodyHeight: 15,
    idleFrameRate: 10,
    score: 12,
    unlockAtSeconds: 10,
  },
  {
    id: 'moth',
    name: 'Moth',
    texture: MOTH.key,
    frames: MOTH.frames,
    scale: 0.8,
    hp: 35,
    speed: 88,
    contactDamage: 10,
    knockbackResist: 0.1,
    behavior: 'zigzag',
    bodyWidth: 26,
    bodyHeight: 18,
    idleFrameRate: 9,
    score: 15,
    unlockAtSeconds: 20,
  },
  {
    id: 'crawler',
    name: 'Crawler',
    texture: CRAWLER.key,
    frames: CRAWLER.frames,
    scale: 0.85,
    hp: 45,
    speed: 45,
    contactDamage: 12,
    knockbackResist: 0.4,
    behavior: 'chase',
    bodyWidth: 26,
    bodyHeight: 20,
    idleFrameRate: 6,
    score: 20,
    unlockAtSeconds: 32,
  },
  {
    id: 'moth-swift',
    name: 'Moth Biru',
    texture: MOTH.key,
    frames: MOTH.frames,
    tint: 0x8ad0ff,
    scale: 0.68,
    hp: 24,
    speed: 118,
    contactDamage: 9,
    knockbackResist: 0,
    behavior: 'zigzag',
    bodyWidth: 22,
    bodyHeight: 16,
    idleFrameRate: 12,
    score: 18,
    unlockAtSeconds: 45,
  },
  {
    id: 'charger',
    name: 'Charger',
    texture: CRAWLER.key,
    frames: CRAWLER.frames,
    tint: 0xffd08a,
    scale: 0.9,
    hp: 55,
    speed: 210,
    contactDamage: 18,
    knockbackResist: 0.5,
    behavior: 'charger',
    bodyWidth: 26,
    bodyHeight: 20,
    idleFrameRate: 8,
    score: 30,
    unlockAtSeconds: 60,
  },
  {
    id: 'crawler-heavy',
    name: 'Crawler Berat',
    texture: CRAWLER.key,
    frames: CRAWLER.frames,
    tint: 0xb894ff,
    scale: 1.05,
    hp: 80,
    speed: 32,
    contactDamage: 16,
    knockbackResist: 0.8,
    behavior: 'chase',
    bodyWidth: 30,
    bodyHeight: 24,
    idleFrameRate: 5,
    score: 35,
    unlockAtSeconds: 78,
  },
];

export const ENEMY_BY_ID = new Map(ENEMY_TYPES.map((type) => [type.id, type]));

/**
 * Perilaku `zigzag`: goyangan menyamping saat mengejar.
 *
 * ⚠️ Goyangan ini ditambahkan sebagai vektor tegak lurus, jadi kecepatan sebenarnya
 * menjadi `speed * sqrt(1 + AMPLITUDE^2)` — dengan amplitudo 0,7 itu **22% lebih cepat**
 * dari angka `speed` di tabel tipe. Terukur di M3: Moth `speed: 88` bergerak 107 px/detik.
 * Ingat ini saat menyetel balancing; `speed` untuk tipe zigzag bukan kecepatan akhir.
 */
export const ZIGZAG = {
  /** Amplitudo goyangan, sebagai rasio terhadap kecepatan. */
  AMPLITUDE: 0.7,
  /** Kecepatan osilasi, radian/detik. */
  FREQUENCY: 4.5,
} as const;

/** Perilaku `charger`: diam mengincar, lalu menerjang lurus. */
export const CHARGER = {
  AIM_MS: 900,
  DASH_MS: 420,
  RECOVER_MS: 700,
  /** Kecepatan saat mengincar (merayap pelan). */
  AIM_SPEED: 18,
} as const;

export const SPAWNER = {
  /** Jeda antar spawn di awal, dan batas terendahnya. */
  START_INTERVAL_MS: 1700,
  MIN_INTERVAL_MS: 420,
  /** Jeda berkurang sebanyak ini tiap detik bertahan. */
  INTERVAL_DECAY_PER_SECOND: 9,
  /** Batas musuh hidup bersamaan — menjaga frame rate dan layar tetap terbaca. */
  MAX_ALIVE: 22,
  /** Musuh muncul di luar layar, sejauh ini dari tepi kamera. */
  OFFSCREEN_MARGIN: 28,
} as const;
