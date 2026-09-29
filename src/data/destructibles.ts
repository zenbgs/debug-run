/**
 * Rintangan yang bisa dihancurkan.
 *
 * Sebelum ini arena sepenuhnya statis: batu dan pohon murni tembok yang tidak
 * bisa diapa-apakan. Sekarang rintangan DALAM bisa pecah, jadi arena ikut jadi
 * bagian permainan — kamu bisa membuka jalan pintas, dan jalan buntu yang bikin
 * musuh mondar-mandir bisa diledakkan.
 *
 * ⚠️ **Hanya PROP yang boleh hancur, TIDAK PERNAH WALL.**
 *
 * `ArenaBuilder` memakai `WALL.*` untuk tepi arena dan `PROP.*` untuk rintangan
 * interior. Kalau tile tepi ikut bisa dihancurkan, pemain dan musuh bisa keluar
 * dari arena dan seluruh permainan bocor. Batas itu dikunci tes.
 */

import { PROP } from './tiles';

export type DestructibleSpec = {
  /** Pukulan yang dibutuhkan (dalam satuan damage). */
  hp: number;
  /** Peluang menjatuhkan permata saat pecah. */
  dropChance: number;
};

/**
 * HP per jenis rintangan. Index tile -> sifat.
 *
 * Nilainya sengaja rendah: menghancurkan rintangan adalah manuver taktis di
 * tengah pertarungan, bukan pekerjaan menambang. Kalau butuh sepuluh pukulan,
 * tidak akan ada yang melakukannya saat sedang dikejar.
 */
export const DESTRUCTIBLES: Record<number, DestructibleSpec> = {
  // Tumbuhan: paling gampang, sekali dua kali tebas.
  [PROP.BUSH]: { hp: 20, dropChance: 0.18 },
  [PROP.REED]: { hp: 16, dropChance: 0.18 },
  // Batu: sedang.
  [PROP.ROCK]: { hp: 45, dropChance: 0.3 },
  [PROP.CRAG]: { hp: 45, dropChance: 0.3 },
  // Pohon lebih tebal daripada semak.
  [PROP.TREE]: { hp: 60, dropChance: 0.25 },
  // Bongkahan padat: paling keras, tapi tetap bisa dibuka kalau benar-benar
  // menghalangi. Rintangan yang mustahil dihancurkan mengembalikan masalah
  // jalan buntu yang justru ingin dihilangkan.
  [PROP.BOULDER]: { hp: 90, dropChance: 0.4 },
};

export const DESTRUCTIBLE = {
  /** Goyangan tile saat kena, supaya terbaca sedang rusak — bukan kebal. */
  SHAKE_PX: 1.5,
  /** Lama goyangan. */
  SHAKE_MS: 90,
  /**
   * Damage dari serangan pemain yang diteruskan ke rintangan.
   *
   * Tidak 1:1 dengan damage ke musuh. Rintangan bukan target utama, dan kalau
   * pukulan biasa merobohkan pohon sekali ayun, seluruh arena rata sebelum
   * wave 3 dan rintangannya berhenti berarti.
   */
  ATTACK_RATIO: 0.6,
} as const;

/** Apakah index tile ini bisa dihancurkan? */
export function isDestructible(tileIndex: number): boolean {
  return tileIndex in DESTRUCTIBLES;
}

export function specFor(tileIndex: number): DestructibleSpec | undefined {
  return DESTRUCTIBLES[tileIndex];
}
