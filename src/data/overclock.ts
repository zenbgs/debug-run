/**
 * OVERCLOCK — jurus pamungkas per kelas.
 *
 * Kenapa ada: sistem rantai bunuh sudah lama mengalikan skor hingga x5, tapi
 * hasilnya cuma angka yang naik lebih cepat. Bermain rapi tidak pernah punya
 * MOMEN. Overclock mengubah rantai jadi sesuatu yang ditunggu-tunggu — meter
 * terisi tiap membunuh, dan pemain memilih sendiri kapan meledakkannya.
 *
 * Tiap kelas dapat jurus yang bentuknya berbeda, bukan cuma angka berbeda,
 * dengan alasan yang sama seperti skill dan FX benturan: kalau ketiganya
 * mengeluarkan ledakan bundar yang sama, memilih kelas tidak berarti apa-apa.
 */

import { SHEETS } from './frames';

/** Bentuk jurus. Tiap bentuk dieksekusi berbeda di `OverclockRunner`. */
export type UltimateKind = 'spin' | 'rain' | 'nova';

export type Ultimate = {
  kind: UltimateKind;
  name: string;
  /** Satu baris untuk layar pilih kelas dan HUD. */
  blurb: string;
  /** Lama jurus berjalan. */
  durationMs: number;
  /** FX utama yang diputar. */
  fxKey: string;
  fxScale: number;
  /** Damage per ketukan (spin/rain) atau sekali (nova). */
  damage: number;
  /** Jangkauan efek, piksel. */
  radius: number;
  /** Jeda antar ketukan untuk jurus berulang. */
  tickMs?: number;
  knockback: number;
};

export const ULTIMATES: Record<string, Ultimate> = {
  // Berputar di tempat: Warrior memang kelas yang berdiri di tengah kerumunan,
  // jadi pamungkasnya menghadiahi posisi itu alih-alih menyuruhnya mundur.
  warrior: {
    kind: 'spin',
    name: 'Badai Baja',
    blurb: 'Berputar menebas semua di sekeliling',
    durationMs: 1500,
    fxKey: SHEETS.FX_SLASH_CIRCULAR.key,
    fxScale: 1.6,
    damage: 26,
    radius: 78,
    tickMs: 180,
    knockback: 260,
  },
  // Hujan dari atas layar: Archer bertarung dengan menguasai RUANG, jadi
  // pamungkasnya menutup ruang, bukan memukul satu titik.
  archer: {
    kind: 'rain',
    name: 'Hujan Panah',
    blurb: 'Panah turun membanjiri seluruh arena',
    durationMs: 2200,
    fxKey: SHEETS.FX_HIT_PIERCE.key,
    fxScale: 1,
    damage: 22,
    radius: 26,
    tickMs: 90,
    knockback: 80,
  },
  // Satu detonasi besar: Mage adalah kelas ledakan, dan satu pukulan raksasa
  // terasa sangat berbeda dari dua jurus lain yang berulang.
  mage: {
    kind: 'nova',
    name: 'Nova Arkana',
    blurb: 'Satu detonasi raksasa mengguncang arena',
    durationMs: 900,
    fxKey: SHEETS.FX_ARCANE_BLAST.key,
    fxScale: 4.2,
    damage: 120,
    radius: 150,
    knockback: 340,
  },
};

export const OVERCLOCK = {
  /** Meter penuh pada nilai ini. */
  MAX: 100,
  /** Tambahan tiap membunuh musuh biasa. */
  PER_KILL: 4,
  /** Tambahan tiap membunuh elite. */
  PER_ELITE: 12,
  /** Tambahan tiap membunuh boss. */
  PER_BOSS: 40,
  /**
   * Meter TIDAK diisi ulang antar wave dan tidak berkurang sendiri.
   *
   * Meter yang meluruh memaksa pemain memakainya buru-buru, dan itu justru
   * menghapus keputusan yang membuatnya menarik: menyimpannya untuk saat genting.
   */
  KEEP_BETWEEN_WAVES: true,
} as const;

export function ultimateFor(classId: string): Ultimate {
  return ULTIMATES[classId] ?? ULTIMATES.warrior;
}
