import Phaser from 'phaser';
import { DEPTH } from '../data/depth';

/**
 * Penanda bahaya di tanah yang berkedip sebelum sesuatu terjadi.
 *
 * Kenapa perlu: serangan yang datang tanpa aba-aba tidak bisa dihindari, dan
 * yang tidak bisa dihindari terasa tidak adil — bukan sulit. Game ini sudah
 * memakai prinsip yang sama untuk telegraf tembakan Spitter dan beam boss;
 * ini menjadikannya satu sistem yang bisa dipakai ulang.
 *
 * Gambarnya di `DEPTH.PICKUP`, yaitu DI ATAS peta tapi DI BAWAH musuh dan
 * pemain: penanda yang menimpa musuh justru menyembunyikan hal yang sedang
 * berusaha membunuhmu.
 */
export class Telegraph {
  private readonly aktif = new Set<Phaser.GameObjects.Arc>();

  constructor(private readonly scene: Phaser.Scene) {}

  /** Jumlah penanda yang sedang tampil — dipakai alat ukur. */
  get count(): number {
    return this.aktif.size;
  }

  /**
   * Lingkaran bahaya yang berkedip lalu memanggil `onFire`.
   *
   * @param delayMs lama aba-aba. Ini yang menentukan adil atau tidaknya: terlalu
   *   pendek dan pemain tidak sempat bereaksi, terlalu panjang dan bahayanya
   *   berhenti terasa mendesak.
   */
  circle(
    x: number,
    y: number,
    radius: number,
    delayMs: number,
    onFire: (x: number, y: number) => void,
    warna = 0xff5c5c
  ): void {
    const ring = this.scene.add
      .circle(x, y, radius, warna, 0.14)
      .setStrokeStyle(1.5, warna, 0.9)
      .setDepth(DEPTH.PICKUP);
    this.aktif.add(ring);

    // Mengerut ke dalam: pemain bisa membaca SISA WAKTU dari ukurannya, bukan
    // cuma tahu "ada bahaya di sini". Kedipan saja tidak memberi tahu kapan.
    this.scene.tweens.add({
      targets: ring,
      scale: { from: 1, to: 0.45 },
      alpha: { from: 0.55, to: 1 },
      duration: delayMs,
      ease: 'Sine.easeIn',
      onComplete: () => {
        this.aktif.delete(ring);
        ring.destroy();
        onFire(x, y);
      },
    });
  }

  /**
   * Penanda kecil tempat sesuatu akan MUNCUL, bukan tempat sesuatu akan meledak.
   *
   * Warnanya berbeda dari lingkaran bahaya dengan sengaja: pemain harus bisa
   * membedakan "menjauh dari sini" dan "sesuatu akan keluar dari sini".
   */
  rift(x: number, y: number, delayMs: number, onFire: (x: number, y: number) => void): void {
    this.circle(x, y, 14, delayMs, onFire, 0x9d7bff);
  }

  /** Dibersihkan saat wave berganti atau permainan berakhir. */
  clear(): void {
    for (const ring of this.aktif) ring.destroy();
    this.aktif.clear();
  }
}
