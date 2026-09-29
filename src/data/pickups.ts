/**
 * Permata yang dijatuhkan musuh.
 *
 * Sebelum ini, membunuh musuh hanya menambah angka skor — tidak ada apa pun yang
 * muncul di lapangan. Permata mengubah tiap detik permainan jadi KEPUTUSAN:
 * berani masuk ke kerumunan untuk mengambilnya, atau mundur aman?
 *
 * Umurnya sengaja pendek. Permata yang menunggu selamanya berubah dari keputusan
 * jadi tugas memunguti, dan pemain akan menyapu lapangan setiap wave.
 *
 * Sprite-nya memakai `ui-gems` yang SUDAH ada untuk ikon panel upgrade — enam
 * warna, 16x16. Tidak ada aset baru yang perlu dibuat.
 */

import { SHEETS } from './frames';

export type PickupKind = 'heal' | 'charge' | 'score';

export type PickupSpec = {
  /** Indeks frame di `ui-gems`. */
  gem: number;
  /** Warna jejak partikel saat diambil. */
  tint: number;
  /** HP yang dipulihkan. */
  heal?: number;
  /** Isi meter Overclock, dalam satuan persen meter. */
  charge?: number;
  /** Skor langsung. */
  score?: number;
};

/**
 * Indeks permata mengikuti `KATEGORI_GEM` di `upgrades.ts` supaya artinya
 * konsisten: hijau bertahan hidup, biru tenaga, kuning serba-guna.
 */
export const PICKUPS: Record<PickupKind, PickupSpec> = {
  heal: { gem: 0, tint: 0x6ef08a, heal: 14 },
  charge: { gem: 5, tint: 0x6dd9f2, charge: 12 },
  score: { gem: 3, tint: 0xffe066, score: 40 },
};

export const PICKUP = {
  key: SHEETS.UI_GEMS.key,
  /** Lama permata bertahan sebelum hilang. */
  LIFETIME_MS: 7000,
  /** Mulai berkedip sebagai peringatan sisa waktu. */
  BLINK_AFTER_MS: 4800,
  /**
   * Radius tarik. Di dalam ini permata meluncur ke pemain.
   *
   * Ada supaya pemain tidak perlu menginjak tepat di atasnya — memburu piksel
   * bukan keahlian yang menarik. Tapi sengaja tidak besar, supaya mendekat tetap
   * jadi keputusan.
   */
  MAGNET_RADIUS: 46,
  MAGNET_SPEED: 210,
  /** Radius ambil. */
  PICK_RADIUS: 12,
  /** Dorongan acak saat permata terlempar keluar dari musuh yang mati. */
  BURST_SPEED: 70,
  BURST_DRAG: 260,
  SCALE: 0.85,
} as const;

/**
 * Peluang jatuh per jenis, diundi sekali per musuh mati.
 *
 * Totalnya sengaja di bawah 1: sebagian besar musuh TIDAK menjatuhkan apa pun.
 * Kalau semuanya menjatuhkan sesuatu, lapangan jadi penuh dan permata berhenti
 * terasa seperti temuan.
 */
export const DROP_CHANCE: Record<PickupKind, number> = {
  charge: 0.22,
  score: 0.14,
  // Paling jarang: penyembuhan yang mudah didapat menghapus tekanan seluruh run.
  heal: 0.07,
};

/** Elite selalu menjatuhkan sesuatu — ia lebih sulit, jadi harus terasa berbayar. */
export const ELITE_DROPS: readonly PickupKind[] = ['charge', 'charge', 'score', 'heal'];
