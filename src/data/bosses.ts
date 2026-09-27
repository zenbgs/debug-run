/**
 * Definisi boss. (SPEC.md §6)
 *
 * ⚠️ Legacy Collection hanya punya **satu** sprite boss tampak-atas
 * (`Warped/Characters/top-down-boss`, 186x123 px). Rencana awal memakai
 * `Monster Pack Files` untuk boss wave 5, tapi seluruh isinya sprite layar-battle
 * RPG yang digambar dari samping — sama seperti roster musuh yang sudah gugur di M2.
 *
 * Jadi kedua boss memakai sprite yang sama, dibedakan lewat tint, skala, HP, dan
 * susunan pola serangan. Pendekatan yang sama dipakai untuk 7 tipe musuh di M3.
 */

import { ENEMY_TYPES, type EnemyType } from './enemies';
import { SHEETS } from './frames';

export type BossPattern = 'spread' | 'beam' | 'summon' | 'charge';

export type BossType = EnemyType & {
  isBoss: true;
  /** Nama yang tampil di bar HP boss. */
  bossName: string;
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

export const BOSS_TYPES: readonly BossType[] = [
  {
    isBoss: true,
    id: 'boss-stack-overflow',
    name: 'Stack Overflow',
    bossName: 'STACK OVERFLOW',
    texture: CORE.key,
    frames: CORE.frames,
    // SENGAJA tanpa tint. Tint di Phaser adalah perkalian, dan sprite boss aslinya
    // sudah merah gelap — tint warna apa pun (hijau, biru) hanya membuatnya jadi
    // gumpalan gelap yang tidak terbaca. Kedua boss dibedakan lewat ukuran, nama,
    // dan susunan pola, bukan warna.
    scale: 0.42,
    hp: 350,
    speed: 26,
    contactDamage: 20,
    knockbackResist: 0.92,
    behavior: 'chase',
    bodyWidth: 62,
    bodyHeight: 44,
    idleFrameRate: 6,
    score: 400,
    unlockAtSeconds: 0,

    patterns: ['spread', 'summon', 'charge'],
    patternIntervalMs: 2600,
    phase2At: 0.5,
    phase2IntervalScale: 0.65,
    spreadCount: [8, 12],
    boltSpeed: 105,
    boltDamage: 10,
    beamDamage: 18,
    summonTypeIds: ['glitchling', 'glitchling-swift'],
    summonCount: 3,
    chargeSpeed: 190,
  },
  {
    isBoss: true,
    id: 'boss-null-pointer',
    name: 'Null Pointer',
    bossName: 'NULL POINTER',
    texture: CORE.key,
    frames: CORE.frames,
    scale: 0.55,
    hp: 600,
    speed: 22,
    contactDamage: 25,
    knockbackResist: 0.96,
    behavior: 'chase',
    bodyWidth: 80,
    bodyHeight: 58,
    idleFrameRate: 6,
    score: 900,
    unlockAtSeconds: 0,

    patterns: ['spread', 'beam', 'summon', 'charge'],
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

export const BOSS_BY_ID = new Map(BOSS_TYPES.map((boss) => [boss.id, boss]));

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
  /** Umur proyektil sebelum hilang sendiri. */
  BOLT_LIFESPAN_MS: 3200,
  BOLT_SCALE: 1.6,
} as const;
