import { OVERCLOCK } from '../data/overclock';

/**
 * Muatan meter Overclock — murni angka, TANPA Phaser.
 *
 * Dipisah dari `Overclock.ts` yang berisi pelaksanaan jurusnya karena berkas itu
 * mengimpor Phaser, dan vitest berjalan di Node: berkas tes yang menariknya gagal
 * dengan "window is not defined". Kegagalan itu muncul sebagai *suite* yang gagal
 * DIKUMPULKAN, bukan sebagai tes yang gagal — ringkasannya tetap menulis
 * "180 lolos" sementara satu berkas tidak pernah dijalankan sama sekali.
 * Pemisahan yang sama sudah dipakai `VirtualInput.ts` dan `Navigation.ts`.
 */
export class OverclockMeter {
  private nilai = 0;

  get value(): number {
    return this.nilai;
  }

  get ratio(): number {
    return clamp(this.nilai / OVERCLOCK.MAX, 0, 1);
  }

  get isReady(): boolean {
    return this.nilai >= OVERCLOCK.MAX;
  }

  /** Menambah muatan, dibatasi di MAX supaya kelebihannya tidak menumpuk. */
  add(amount: number): void {
    this.nilai = clamp(this.nilai + amount, 0, OVERCLOCK.MAX);
  }

  /** Pakai seluruh meter. `false` kalau belum penuh — dan tidak mengurangi apa pun. */
  consume(): boolean {
    if (!this.isReady) return false;
    this.nilai = 0;
    return true;
  }

  reset(): void {
    this.nilai = 0;
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
