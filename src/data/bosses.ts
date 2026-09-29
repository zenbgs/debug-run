/**
 * Definisi boss. (SPEC.md §6)
 *
 * Kedua boss memakai **sprite yang berbeda**, bukan sekadar beda angka.
 *
 * Awalnya keduanya memakai `top-down-boss` yang sama karena itu satu-satunya
 * sprite boss tampak-atas yang jelas, dan `Monster Pack Files` seluruhnya sprite
 * layar-battle RPG dari samping. Yang terlewat: folder `Mechanic` ditolak di M2
 * dengan alasan sprite-nya 3-4x lebih besar dari musuh biasa — alasan yang benar
 * untuk musuh biasa, tapi justru salah untuk boss. `Sentinel` digambar dari
 * depan-atas dengan bayangan menyatu, persis konvensi sprite top-down lainnya.
 *
 * Hasilnya dua boss yang berbeda siluet, warna, DAN cara mainnya:
 *  - wave 5  Stack Overflow — mekanik laba-laba teal, gesit, memanggil salinan
 *  - wave 10 Null Pointer   — inti merah gelap, lamban, menguasai ruang dari jauh
 */

import { ENEMY_TYPES, type EnemyType } from './enemies';
import { SHEETS } from './frames';

export type BossPattern = 'spread' | 'beam' | 'summon' | 'charge' | 'slam';

export type BossType = EnemyType & {
  isBoss: true;
  /** Nama yang tampil di bar HP boss. */
  bossName: string;
  /**
   * Skala wajah boss di kotak dialog. Per boss, karena ukuran frame tiap sprite
   * boss berbeda jauh (192x144 vs 124x110) — satu angka tetap membuat yang satu
   * meluber keluar bingkai dan yang lain jadi titik kecil.
   */
  portraitScale: number;
  /** Urutan pola yang diputar berulang. */
  patterns: readonly BossPattern[];
  /** Jeda antar pola, ms. */
  patternIntervalMs: number;
  /** Ambang fase 2, sebagai rasio HP. */
  phase2At: number;
  /** Pengali jeda pola saat fase 2. < 1 berarti lebih agresif. */
  phase2IntervalScale: number;
  /** Jumlah proyektil pola `spread`: [fase 1, fase 2]. */
  spreadCount: readonly [number, number];
  boltSpeed: number;
  boltDamage: number;
  beamDamage: number;
  /** Tipe musuh yang dipanggil pola `summon`. */
  summonTypeIds: readonly string[];
  summonCount: number;
  /** Kecepatan saat pola `charge`. */
  chargeSpeed: number;
};

const CORE = SHEETS.BOSS_CORE;
const SENTINEL = SHEETS.BOSS_SENTINEL;

export const BOSS_TYPES: readonly BossType[] = [
  {
    isBoss: true,
    id: 'boss-stack-overflow',
    name: 'Stack Overflow',
    bossName: 'STACK OVERFLOW',
    texture: SENTINEL.key,
    frames: SENTINEL.frames,
    // Tanpa tint: sprite ini sudah teal terang, kontras penuh dengan inti merah
    // gelap di wave 10. Justru warna aslinya yang jadi pembedanya.
    scale: 0.62,
    hp: 340,
    // Jauh lebih gesit dari boss terakhir. Ini pembeda utamanya saat dimainkan:
    // Stack Overflow mengejar dan menyudutkan, Null Pointer menunggu dan menembak.
    speed: 48,
    contactDamage: 18,
    knockbackResist: 0.9,
    behavior: 'chase',
    bodyWidth: 54,
    bodyHeight: 48,
    // Sepertiga bawah frame isinya kaki dan bayangan. Tanpa geseran ini, pukulan
    // yang jelas mengenai badan akan meleset karena hitbox-nya ada di bayangan.
    bodyOffsetY: -14,
    idleFrameRate: 6,
    score: 400,
    unlockAtSeconds: 0,
    portraitScale: 0.34,

    // Temanya rekursi: ia memanggil salinan dirinya. Dua kali `summon` per siklus
    // dan tanpa `beam` sama sekali — beam disimpan sebagai eskalasi untuk wave 10.
    patterns: ['charge', 'summon', 'slam', 'spread', 'summon'],
    patternIntervalMs: 2200,
    phase2At: 0.5,
    phase2IntervalScale: 0.62,
    spreadCount: [6, 10],
    boltSpeed: 105,
    boltDamage: 10,
    beamDamage: 0,
    summonTypeIds: ['glitchling', 'glitchling-swift', 'crawler'],
    summonCount: 3,
    chargeSpeed: 245,
  },
  {
    isBoss: true,
    id: 'boss-null-pointer',
    name: 'Null Pointer',
    bossName: 'NULL POINTER',
    texture: CORE.key,
    frames: CORE.frames,
    // SENGAJA tanpa tint. Tint di Phaser adalah perkalian, dan sprite ini sudah
    // merah gelap — tint warna apa pun hanya membuatnya jadi gumpalan gelap yang
    // tidak terbaca. Pembedanya sprite, bukan warna.
    scale: 0.55,
    hp: 620,
    speed: 20,
    contactDamage: 25,
    knockbackResist: 0.96,
    behavior: 'chase',
    bodyWidth: 80,
    bodyHeight: 58,
    idleFrameRate: 6,
    score: 900,
    unlockAtSeconds: 0,
    portraitScale: 0.22,

    // Penguasa ruang: dua beam per siklus, tembakan menyebar yang rapat, dan
    // terjangan hanya sebagai hukuman kalau pemain terlalu lama menempel.
    patterns: ['spread', 'beam', 'slam', 'summon', 'spread', 'beam', 'charge'],
    patternIntervalMs: 2300,
    phase2At: 0.5,
    phase2IntervalScale: 0.6,
    spreadCount: [12, 18],
    boltSpeed: 120,
    boltDamage: 12,
    beamDamage: 22,
    summonTypeIds: ['moth', 'crawler', 'moth-swift'],
    summonCount: 4,
    chargeSpeed: 220,
  },
];

export function isBossType(type: EnemyType): type is BossType {
  return (type as BossType).isBoss === true;
}

/** Lookup gabungan musuh biasa + boss, dipakai WaveManager. */
export const SPAWNABLE_BY_ID = new Map<string, EnemyType>([
  ...ENEMY_TYPES.map((t) => [t.id, t] as const),
  ...BOSS_TYPES.map((t) => [t.id, t as EnemyType] as const),
]);

/** Parameter pola serangan yang sama untuk semua boss. */
export const BOSS_ATTACK = {
  /** Telegraf sebelum beam menyakiti — pemain harus punya waktu menghindar. */
  BEAM_TELEGRAPH_MS: 650,
  BEAM_ACTIVE_MS: 420,
  BEAM_LENGTH: 210,
  BEAM_WIDTH: 26,
  /** Lama pola `charge` berlangsung. */
  CHARGE_MS: 700,

  /**
   * Hantaman tanah: beberapa lingkaran bahaya berkedip lalu meledak.
   *
   * Aba-abanya paling panjang di antara semua pola boss, dan itu disengaja —
   * serangan ini menutup banyak ruang sekaligus, jadi ia harus benar-benar bisa
   * dihindari. Yang dituju bukan damage, tapi memaksa pemain BERGERAK.
   */
  SLAM_TELEGRAPH_MS: 850,
  SLAM_COUNT: 3,
  SLAM_RADIUS: 34,
  SLAM_DAMAGE: 16,
  /** Sebaran titik hantaman di sekitar pemain. */
  SLAM_SPREAD: 60,

  /** Aba-aba retakan sebelum musuh panggilan keluar. */
  SUMMON_TELEGRAPH_MS: 420,
  /** Umur proyektil sebelum hilang sendiri. */
  BOLT_LIFESPAN_MS: 3200,
  BOLT_SCALE: 1.6,
} as const;
