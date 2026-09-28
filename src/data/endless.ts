/**
 * Wave mode tanpa batas — dibangkitkan, bukan ditulis tangan. (SPEC.md §6.2)
 *
 * Kampanye berhenti di wave 10, jadi skor tertinggi yang mungkin dicapai
 * ditentukan oleh naskah, bukan oleh keterampilan pemain. Untuk game skor arena
 * itu memotong loop-nya. Setelah wave 10, wave dibangkitkan terus dengan
 * kesulitan menanjak sampai pemain mati.
 *
 * Kurvanya sengaja **monoton** — jumlah musuh dan `maxAlive` tidak pernah turun,
 * jeda spawn tidak pernah naik. Kesulitan yang naik-turun membuat pemain merasa
 * dicurangi saat run bagus tiba-tiba berakhir di wave yang lebih mudah.
 */

import { BOSS_TYPES } from './bosses';
import { ENEMY_TYPES } from './enemies';
import { WAVES, type Wave, type WaveEntry } from './waves';

/** Kurva kesulitan. Semua batas ada di sini supaya bisa disetel di satu tempat. */
export const ENDLESS = {
  /** Jumlah musuh dasar di wave tanpa batas pertama. */
  BASE_COUNT: 8,
  COUNT_PER_LEVEL: 1.6,
  MAX_COUNT: 26,

  BASE_MAX_ALIVE: 12,
  MAX_ALIVE_CAP: 18,

  BASE_SPAWN_MS: 550,
  SPAWN_MS_PER_LEVEL: 15,
  /** Batas bawah jeda spawn. Di bawah ini musuh keluar lebih cepat dari yang bisa dibunuh. */
  MIN_SPAWN_MS: 260,

  /** Pertambahan pengali stat musuh per tingkat. */
  STAT_SCALE_PER_LEVEL: 0.06,

  /** Boss muncul tiap kelipatan nomor wave ini (15, 20, 25, ...). */
  BOSS_EVERY: 5,
  /** Jeda spawn khusus wave boss — sama seperti wave boss bernaskah. */
  BOSS_SPAWN_MS: 1100,
  BOSS_MAX_ALIVE: 10,
} as const;

/**
 * Nama wave, diputar. Angka tingkatnya ditempel di belakang supaya pemain tetap
 * bisa membedakan wave 13 dari wave 19 meski namanya sama.
 */
const LABEL = [
  'Regresi',
  'Korupsi Data',
  'Kebocoran Berantai',
  'Rekursi Liar',
  'Panik Kernel',
  'Sampah Tak Terkumpul',
] as const;

/** Musuh yang boleh keluar di mode tanpa batas, diurutkan dari paling ringan. */
const RINGAN = ['glitchling', 'glitchling-swift', 'moth'] as const;
const BERAT = ['crawler', 'moth-swift', 'spitter', 'charger', 'crawler-heavy'] as const;

const ID_MUSUH = new Set(ENEMY_TYPES.map((t) => t.id));

/** Tingkat kesulitan wave tanpa batas: 1 untuk wave pertama setelah kampanye. */
export function endlessLevel(nomor: number): number {
  return nomor - WAVES.length;
}

export function isEndlessWaveNumber(nomor: number): boolean {
  return nomor > WAVES.length;
}

function batas(nilai: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, nilai));
}

/**
 * Bagi `total` musuh antara daftar ringan dan berat.
 * Porsi berat naik seiring tingkat, dari ~20% ke maksimum 70%.
 */
function susunEntri(total: number, tingkat: number): WaveEntry[] {
  const porsiBerat = batas(0.2 + tingkat * 0.04, 0.2, 0.7);
  const jumlahBerat = Math.round(total * porsiBerat);
  const jumlahRingan = total - jumlahBerat;

  // Tipe berat yang tersedia melebar seiring tingkat, jadi musuh baru masuk
  // bertahap alih-alih semuanya sekaligus di wave pertama.
  const beratTersedia = BERAT.slice(0, batas(1 + Math.floor(tingkat / 2), 1, BERAT.length));

  const entri: WaveEntry[] = [];
  const bagikan = (ids: readonly string[], jumlah: number) => {
    if (jumlah <= 0 || ids.length === 0) return;
    const per = Math.floor(jumlah / ids.length);
    let sisa = jumlah - per * ids.length;
    for (const id of ids) {
      const n = per + (sisa > 0 ? 1 : 0);
      if (sisa > 0) sisa--;
      if (n > 0 && ID_MUSUH.has(id)) entri.push({ typeId: id, count: n });
    }
  };

  bagikan(RINGAN, jumlahRingan);
  bagikan(beratTersedia, jumlahBerat);
  return entri;
}

/**
 * Bangun wave tanpa batas ke-`nomor` (11, 12, ...).
 *
 * Deterministik: nomor yang sama selalu menghasilkan wave yang sama. Ini penting
 * karena `WaveManager` menyimpan hasilnya, dan tes membandingkan kurvanya.
 */
export function buildEndlessWave(nomor: number): Wave {
  const tingkat = Math.max(1, endlessLevel(nomor));
  const statScale = 1 + tingkat * ENDLESS.STAT_SCALE_PER_LEVEL;
  const waveBoss = nomor % ENDLESS.BOSS_EVERY === 0;

  const total = Math.min(
    ENDLESS.MAX_COUNT,
    ENDLESS.BASE_COUNT + Math.floor(tingkat * ENDLESS.COUNT_PER_LEVEL)
  );

  const entri = susunEntri(waveBoss ? Math.max(4, Math.round(total * 0.6)) : total, tingkat);

  if (waveBoss) {
    // Dua boss bergantian, supaya pola serangannya tidak monoton.
    const indeks = Math.floor(nomor / ENDLESS.BOSS_EVERY) % BOSS_TYPES.length;
    entri.unshift({ typeId: BOSS_TYPES[indeks].id, count: 1 });
  }

  const label = LABEL[(tingkat - 1) % LABEL.length];

  return {
    number: nomor,
    label: `${label} ${tingkat}`,
    entries: entri,
    spawnIntervalMs: waveBoss
      ? ENDLESS.BOSS_SPAWN_MS
      : Math.max(
          ENDLESS.MIN_SPAWN_MS,
          ENDLESS.BASE_SPAWN_MS - tingkat * ENDLESS.SPAWN_MS_PER_LEVEL
        ),
    maxAlive: waveBoss
      ? ENDLESS.BOSS_MAX_ALIVE
      : Math.min(ENDLESS.MAX_ALIVE_CAP, ENDLESS.BASE_MAX_ALIVE + Math.floor(tingkat / 2)),
    isBossWave: waveBoss || undefined,
    statScale,
  };
}
