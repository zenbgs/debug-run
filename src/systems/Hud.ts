import Phaser from 'phaser';
import { FONT_FAMILY } from '../data/config';
import { DEPTH } from '../data/depth';
import type { Boss } from '../entities/Boss';

/**
 * Bar HP boss, diukur dari tepi BAWAH layar.
 *
 * Dulu bar ini di atas (y=31) dengan namanya di y=22 — dan keduanya menimpa baris
 * kedua teks HUD, yang membentang y=14 sampai y=30. Nama boss jadi tertumpuk
 * "sisa N / skor N" tepat ketika boss muncul. Di bawah tidak ada yang ditabrak:
 * kotak dialog memang di sana, tapi cerita boss selesai sebelum boss keluar.
 */
const BOSS_BAR = {
  BOTTOM_MARGIN: 14,
  LABEL_MARGIN: 24,
  WIDTH: 180,
  HEIGHT: 5,
} as const;

/** Angka dan status yang ditampilkan HUD. Dirakit scene tiap frame. */
export type HudState = {
  hp: number;
  maxHp: number;
  wave: number;
  /** 0 berarti mode tanpa batas — penyebutnya disembunyikan. */
  totalWaves: number;
  sisaMusuh: number;
  score: number;
  multiplier: number;
  /** Baris kedua: status skill dan dash yang sudah dirakit scene. */
  barisAksi: string;
};

/**
 * HUD permainan: bar HP pemain, baris angka, dan bar HP boss.
 *
 * Dipecah keluar dari `GameScene`. Teks HUD sengaja hanya dirakit ulang kalau
 * isinya berubah — lihat catatan di `update()`.
 */
export class Hud {
  private readonly bar: Phaser.GameObjects.Graphics;
  private readonly teks: Phaser.GameObjects.Text;

  private bossBar?: Phaser.GameObjects.Graphics;
  private bossLabel?: Phaser.GameObjects.Text;

  /** Isi teks terakhir, supaya string tidak dibangun ulang tiap frame. */
  private sidikJari = '';

  constructor(private readonly scene: Phaser.Scene) {
    this.bar = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH.HUD);
    this.teks = scene.add
      .text(4, 14, '', { fontFamily: FONT_FAMILY, fontSize: '8px', color: '#c9c4d8' })
      .setScrollFactor(0)
      .setDepth(DEPTH.HUD);
  }

  /**
   * Gambar ulang HUD.
   *
   * Bar digambar tiap frame (murah), tapi teksnya tidak. Sebelumnya string HUD
   * dibangun ulang 1308 kali dalam 1308 frame padahal isinya hanya berubah 13
   * kali — 99% terbuang. Sekarang string hanya dirakit kalau sidik jarinya
   * berubah; pendinginan ditampilkan 1 desimal jadi tetap terasa hidup.
   */
  update(s: HudState): void {
    const ratio = s.maxHp > 0 ? Phaser.Math.Clamp(s.hp / s.maxHp, 0, 1) : 0;
    const width = 92;
    const height = 6;

    this.bar.clear();
    this.bar.fillStyle(0x0d0b14, 0.8).fillRect(3, 3, width + 2, height + 2);
    this.bar.fillStyle(0x4a4458, 1).fillRect(4, 4, width, height);
    // Merah saat kritis supaya terbaca tanpa harus membaca angka.
    this.bar
      .fillStyle(ratio <= 0.3 ? 0xff6b6b : 0x8fd35d, 1)
      .fillRect(4, 4, Math.max(0, width * ratio), height);

    const hp = Math.ceil(s.hp);
    const sidik = `${hp}|${s.maxHp}|${s.wave}|${s.sisaMusuh}|${s.score}|${s.multiplier}|${s.barisAksi}`;
    if (sidik === this.sidikJari) return;
    this.sidikJari = sidik;

    // `totalWaves: 0` berarti tanpa batas; "WAVE 13/10" jelas salah.
    const wave = s.totalWaves ? `WAVE ${s.wave}/${s.totalWaves}` : `WAVE ${s.wave} ~`;
    const pengali = s.multiplier > 1 ? `  x${s.multiplier}` : '';

    this.teks.setText(
      `${hp}/${s.maxHp}   ${wave}   sisa ${s.sisaMusuh}   skor ${s.score}${pengali}\n${s.barisAksi}`
    );
  }

  // ------------------------------------------------------------- bar boss

  showBoss(name: string): void {
    this.hideBoss();
    this.bossBar = this.scene.add.graphics().setScrollFactor(0).setDepth(DEPTH.HUD);
    this.bossLabel = this.scene.add
      .text(this.scene.scale.width / 2, this.scene.scale.height - BOSS_BAR.LABEL_MARGIN, name, {
        fontFamily: FONT_FAMILY,
        fontSize: '8px',
        color: '#ff8a7a',
      })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.HUD);
  }

  hideBoss(): void {
    this.bossBar?.destroy();
    this.bossLabel?.destroy();
    this.bossBar = undefined;
    this.bossLabel = undefined;
  }

  get bossVisible(): boolean {
    return this.bossBar !== undefined;
  }

  /** @returns false kalau boss sudah tiada dan barnya baru saja dilepas. */
  updateBoss(boss: Boss | undefined): boolean {
    if (!this.bossBar) return false;

    if (!boss || !boss.isAlive) {
      this.hideBoss();
      return false;
    }

    const { WIDTH: width, HEIGHT: height } = BOSS_BAR;
    const x = (this.scene.scale.width - width) / 2;
    const y = this.scene.scale.height - BOSS_BAR.BOTTOM_MARGIN;

    this.bossBar.clear();
    this.bossBar.fillStyle(0x0d0b14, 0.85).fillRect(x - 1, y - 1, width + 2, height + 2);
    this.bossBar.fillStyle(0x4a4458, 1).fillRect(x, y, width, height);
    this.bossBar
      .fillStyle(boss.currentPhase === 2 ? 0xff6b6b : 0xffe066, 1)
      .fillRect(x, y, width * boss.healthRatio, height);
    return true;
  }
}
