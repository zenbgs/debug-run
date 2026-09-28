/**
 * Jadwal 10 wave. (SPEC.md §6.1)
 *
 * Wave 5 dan 10 adalah wave boss (ditambahkan di M5), ditandai `isBossWave`.
 * Boss selalu dikeluarkan lebih dulu sebelum musuh pengiringnya.
 */

export type WaveEntry = {
  /** Harus cocok dengan `id` di `ENEMY_TYPES`. Divalidasi saat runtime. */
  typeId: string;
  count: number;
};

export type Wave = {
  number: number;
  label: string;
  entries: readonly WaveEntry[];
  /** Jeda antar spawn dalam wave ini, ms. */
  spawnIntervalMs: number;
  /** Batas musuh hidup bersamaan di wave ini. */
  maxAlive: number;
  /** Wave yang memuat boss. Dipakai banner dan bar HP boss. */
  isBossWave?: boolean;
  /**
   * Pengali stat musuh wave ini (HP, damage kontak, dan skor). 1 = normal.
   *
   * Hanya dipakai mode tanpa batas: wave bernaskah menaikkan kesulitan lewat
   * komposisi musuh, bukan lewat angka. Diterapkan `WaveManager.spawnOne()`.
   */
  statScale?: number;
};

export const WAVES: readonly Wave[] = [
  {
    number: 1,
    label: 'Syntax Error',
    entries: [{ typeId: 'glitchling', count: 5 }],
    spawnIntervalMs: 900,
    maxAlive: 6,
  },
  {
    number: 2,
    label: 'Off By One',
    entries: [
      { typeId: 'glitchling', count: 6 },
      { typeId: 'glitchling-swift', count: 2 },
    ],
    spawnIntervalMs: 800,
    maxAlive: 8,
  },
  {
    number: 3,
    label: 'Race Condition',
    entries: [
      { typeId: 'glitchling-swift', count: 4 },
      { typeId: 'moth', count: 3 },
    ],
    spawnIntervalMs: 750,
    maxAlive: 8,
  },
  {
    number: 4,
    label: 'Memory Leak',
    entries: [
      { typeId: 'crawler', count: 4 },
      { typeId: 'moth', count: 2 },
      // Penembak pertama: memaksa pemain bergerak dan memakai rintangan
      // sebagai perlindungan, bukan sekadar mundur lalu mengayun.
      { typeId: 'spitter', count: 1 },
    ],
    spawnIntervalMs: 700,
    maxAlive: 9,
  },
  {
    number: 5,
    label: 'Stack Overflow',
    entries: [
      { typeId: 'boss-stack-overflow', count: 1 },
      { typeId: 'glitchling', count: 4 },
    ],
    spawnIntervalMs: 1100,
    maxAlive: 8,
    isBossWave: true,
  },
  {
    number: 6,
    label: 'Infinite Loop',
    entries: [
      { typeId: 'moth', count: 4 },
      { typeId: 'glitchling-swift', count: 4 },
    ],
    spawnIntervalMs: 650,
    maxAlive: 10,
  },
  {
    number: 7,
    label: 'Deadlock',
    entries: [
      { typeId: 'crawler', count: 4 },
      { typeId: 'moth-swift', count: 3 },
      { typeId: 'spitter', count: 2 },
    ],
    spawnIntervalMs: 600,
    maxAlive: 10,
  },
  {
    number: 8,
    label: 'Buffer Overrun',
    entries: [
      { typeId: 'charger', count: 2 },
      { typeId: 'moth-swift', count: 5 },
    ],
    spawnIntervalMs: 600,
    maxAlive: 11,
  },
  {
    number: 9,
    label: 'Heisenbug',
    entries: [
      { typeId: 'crawler-heavy', count: 3 },
      { typeId: 'charger', count: 2 },
      { typeId: 'moth', count: 3 },
      { typeId: 'spitter', count: 3 },
    ],
    spawnIntervalMs: 550,
    maxAlive: 12,
  },
  {
    number: 10,
    label: 'Null Pointer',
    entries: [
      { typeId: 'boss-null-pointer', count: 1 },
      { typeId: 'moth', count: 3 },
      { typeId: 'crawler', count: 2 },
    ],
    spawnIntervalMs: 1100,
    maxAlive: 9,
    isBossWave: true,
  },
];

export const WAVE_TIMING = {
  /** Lama banner "WAVE N" ditampilkan sebelum musuh mulai muncul. */
  INTRO_MS: 1600,
  /** Jeda setelah wave bersih, sebelum layar upgrade muncul. */
  CLEAR_DELAY_MS: 700,
} as const;

/**
 * Pengali skor dari rantai pembunuhan.
 *
 * Sebelumnya skor cuma kill + bonus wave, jadi pemain yang menghindar sempurna
 * dan pemain yang pasrah ditabrak mendapat skor sama persis. Pengali ini membuat
 * bermain rapi terbayar: bunuh beruntun menaikkannya, kena pukul menjatuhkannya.
 */
export const COMBO_SCORE = {
  /** Jeda maksimum antar bunuh supaya rantai tetap hidup. */
  WINDOW_MS: 3000,
  /** Berapa bunuh beruntun untuk naik satu tingkat pengali. */
  KILLS_PER_STEP: 3,
  MAX_MULTIPLIER: 5,
  /**
   * Kena pukul menurunkan rantai **satu tingkat**, bukan menghapusnya.
   *
   * Versi awal mereset ke nol. Terukur: dalam sesi dengan 22 musuh dibasmi,
   * pengali tidak pernah naik di atas 1 — pemain biasa terlalu sering kena,
   * jadi fiturnya tidak pernah terasa ada.
   */
  DROP_ON_HIT: true,
} as const;

/** Bonus skor saat menyelesaikan satu wave. */
export function waveClearBonus(waveNumber: number): number {
  return 50 * waveNumber;
}
