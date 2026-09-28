import Phaser from 'phaser';
import { FONT_FAMILY } from '../data/config';
import { TOUCH } from '../data/touch';
import { stickVector, type VirtualInput } from './VirtualInput';

type Tombol = {
  id: string;
  lingkaran: Phaser.GameObjects.Arc;
  teks: Phaser.GameObjects.Text;
  x: number;
  y: number;
  radius: number;
  ditekan: boolean;
};

/**
 * Stik analog + tombol aksi di layar.
 *
 * Status tombol dibaca dengan **memindai semua pointer aktif tiap frame**, bukan
 * lewat `setInteractive()` per objek. Alasannya multi-sentuh: dengan handler
 * per-objek, jempol kedua yang menekan tombol saat jempol pertama masih menahan
 * stik sering tidak terdeteksi, dan melepas jari di luar tombol meninggalkan
 * tombol dalam keadaan "tertekan" selamanya.
 */
export class TouchControls implements VirtualInput {
  moveX = 0;
  moveY = 0;
  attack = false;
  skill1 = false;
  skill2 = false;
  dash = false;

  private readonly stickBase: Phaser.GameObjects.Arc;
  private readonly stickKnob: Phaser.GameObjects.Arc;
  private readonly tombol: Tombol[] = [];
  private readonly pauseBtn: Phaser.GameObjects.Arc;
  private readonly pauseIcon: Phaser.GameObjects.Text;

  /** Pointer yang sedang memegang stik. -1 = tidak ada. */
  private stickPointerId = -1;
  private stickCx = 0;
  private stickCy = 0;
  private pauseX = 0;
  private pauseY = 0;
  private pauseSebelumnya = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly onPause: () => void
  ) {
    // Phaser default cuma melacak 2 pointer; stik + serang + dash sudah tiga jari.
    scene.input.addPointer(TOUCH.MAX_POINTERS);

    this.stickBase = scene.add
      .circle(0, 0, TOUCH.STICK.RADIUS, TOUCH.COLOR_BASE, 0.55)
      .setStrokeStyle(2, TOUCH.COLOR_EDGE, 1)
      .setAlpha(TOUCH.ALPHA_ACTIVE)
      .setScrollFactor(0)
      .setDepth(TOUCH.DEPTH)
      .setVisible(false);
    this.stickKnob = scene.add
      .circle(0, 0, TOUCH.STICK.KNOB_RADIUS, TOUCH.COLOR_KNOB, 0.85)
      .setScrollFactor(0)
      .setDepth(TOUCH.DEPTH)
      .setVisible(false);

    const lebar = scene.scale.width;
    const tinggi = scene.scale.height;

    for (const spec of TOUCH.BUTTONS) {
      // Ditempelkan ke tepi kanan/bawah; lebar logis berbeda tiap perangkat.
      const bx = lebar - spec.right;
      const by = tinggi - spec.bottom;

      const lingkaran = scene.add
        .circle(bx, by, spec.radius, TOUCH.COLOR_BASE, 1)
        .setStrokeStyle(2, TOUCH.COLOR_EDGE, 1)
        .setScrollFactor(0)
        .setDepth(TOUCH.DEPTH)
        .setAlpha(TOUCH.ALPHA_IDLE);
      const teks = scene.add
        .text(bx, by, spec.label, {
          fontFamily: FONT_FAMILY,
          fontSize: spec.radius >= 24 ? '10px' : '7px',
          color: TOUCH.COLOR_LABEL,
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(TOUCH.DEPTH)
        .setAlpha(TOUCH.ALPHA_IDLE);

      this.tombol.push({
        id: spec.id,
        lingkaran,
        teks,
        x: bx,
        y: by,
        radius: spec.radius,
        ditekan: false,
      });
    }

    this.pauseX = lebar - TOUCH.PAUSE.right;
    this.pauseY = TOUCH.PAUSE.top;
    this.pauseBtn = scene.add
      .circle(this.pauseX, this.pauseY, TOUCH.PAUSE.radius, TOUCH.COLOR_BASE, 1)
      .setStrokeStyle(1, TOUCH.COLOR_EDGE, 1)
      .setScrollFactor(0)
      .setDepth(TOUCH.DEPTH)
      .setAlpha(TOUCH.ALPHA_IDLE);
    this.pauseIcon = scene.add
      .text(this.pauseX, this.pauseY, '||', {
        fontFamily: FONT_FAMILY,
        fontSize: '7px',
        color: TOUCH.COLOR_LABEL,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(TOUCH.DEPTH)
      .setAlpha(TOUCH.ALPHA_IDLE);
  }

  /**
   * Posisi tombol di layar, dalam piksel logis.
   *
   * Ada demi harness verifikasi (`tools/verify_touch.mjs`): posisinya dihitung
   * dari tepi layar dan berbeda tiap perangkat, jadi skrip yang menebak koordinat
   * akan menyentuh ruang kosong dan melaporkan kegagalan palsu.
   */
  buttonPosition(id: string): { x: number; y: number } | undefined {
    const t = this.tombol.find((b) => b.id === id);
    return t ? { x: t.x, y: t.y } : undefined;
  }

  get pausePosition(): { x: number; y: number } {
    return { x: this.pauseX, y: this.pauseY };
  }

  /** Sembunyikan saat dialog, panel upgrade, jeda, atau layar akhir sedang tampil. */
  setVisible(tampil: boolean): void {
    for (const t of this.tombol) {
      t.lingkaran.setVisible(tampil);
      t.teks.setVisible(tampil);
    }
    this.pauseBtn.setVisible(tampil);
    this.pauseIcon.setVisible(tampil);
    if (!tampil) {
      this.stickBase.setVisible(false);
      this.stickKnob.setVisible(false);
      this.lepasSemua();
    }
  }

  private lepasSemua(): void {
    // WAJIB direset. Saat jeda, `update()` keluar lebih awal sehingga status
    // tombol jeda membeku di `true`; begitu permainan lanjut, frame pertama
    // membaca transisi true->false dan langsung menjeda lagi — permainan
    // terkunci di panel jeda dan tidak bisa dilanjutkan sama sekali.
    this.pauseSebelumnya = false;
    this.stickPointerId = -1;
    this.moveX = 0;
    this.moveY = 0;
    this.attack = false;
    this.skill1 = false;
    this.skill2 = false;
    this.dash = false;
    for (const t of this.tombol) t.ditekan = false;
  }

  /** Dipanggil tiap frame oleh scene pemilik, sebelum `player.update()`. */
  update(): void {
    if (!this.pauseBtn.visible) return;

    const pointers = this.pointerAktif();

    for (const t of this.tombol) t.ditekan = false;
    let pauseDitekan = false;

    // --- Stik: pointer pertama yang menyentuh separuh kiri layar memegangnya ---
    const batasZona = this.scene.scale.width * TOUCH.STICK.ZONE_RATIO;
    let stickMasihDitekan = false;

    for (const p of pointers) {
      if (p.id === this.stickPointerId) {
        stickMasihDitekan = true;
        continue;
      }
      if (this.stickPointerId !== -1) continue;
      // Jempol yang mendarat di tombol tidak boleh ikut membuka stik.
      if (p.x >= batasZona || this.tombolDi(p.x, p.y)) continue;

      this.stickPointerId = p.id;
      this.stickCx = Phaser.Math.Clamp(
        p.x,
        TOUCH.STICK.EDGE_MARGIN,
        batasZona - TOUCH.STICK.EDGE_MARGIN / 2
      );
      this.stickCy = Phaser.Math.Clamp(
        p.y,
        TOUCH.STICK.EDGE_MARGIN,
        this.scene.scale.height - TOUCH.STICK.EDGE_MARGIN
      );
      this.stickBase.setPosition(this.stickCx, this.stickCy).setVisible(true);
      this.stickKnob.setPosition(this.stickCx, this.stickCy).setVisible(true);
      stickMasihDitekan = true;
    }

    if (stickMasihDitekan) {
      const p = pointers.find((q) => q.id === this.stickPointerId);
      if (p) {
        const v = stickVector(
          p.x - this.stickCx,
          p.y - this.stickCy,
          TOUCH.STICK.RADIUS,
          TOUCH.STICK.DEADZONE
        );
        this.moveX = v.x;
        this.moveY = v.y;
        this.stickKnob.setPosition(
          this.stickCx + v.x * TOUCH.STICK.RADIUS,
          this.stickCy + v.y * TOUCH.STICK.RADIUS
        );
      }
    } else {
      this.stickPointerId = -1;
      this.moveX = 0;
      this.moveY = 0;
      this.stickBase.setVisible(false);
      this.stickKnob.setVisible(false);
    }

    // --- Tombol aksi ---
    for (const p of pointers) {
      if (p.id === this.stickPointerId) continue;
      for (const t of this.tombol) {
        if (Phaser.Math.Distance.Between(p.x, p.y, t.x, t.y) <= t.radius) t.ditekan = true;
      }
      if (
        Phaser.Math.Distance.Between(p.x, p.y, this.pauseX, this.pauseY) <=
        TOUCH.PAUSE.radius
      ) {
        pauseDitekan = true;
      }
    }

    for (const t of this.tombol) {
      const a = t.ditekan ? TOUCH.ALPHA_ACTIVE : TOUCH.ALPHA_IDLE;
      t.lingkaran.setAlpha(a);
      t.teks.setAlpha(a);
    }
    this.attack = this.cari('attack');
    this.skill1 = this.cari('skill1');
    this.skill2 = this.cari('skill2');
    this.dash = this.cari('dash');

    // Jeda dipicu saat jari DILEPAS, bukan saat menyentuh — kalau tidak, satu
    // sentuhan akan membuka lalu menutup jeda berkali-kali selama jari menempel.
    this.pauseBtn.setAlpha(pauseDitekan ? TOUCH.ALPHA_ACTIVE : TOUCH.ALPHA_IDLE);
    this.pauseIcon.setAlpha(pauseDitekan ? TOUCH.ALPHA_ACTIVE : TOUCH.ALPHA_IDLE);
    if (this.pauseSebelumnya && !pauseDitekan) this.onPause();
    this.pauseSebelumnya = pauseDitekan;
  }

  private cari(id: string): boolean {
    return this.tombol.some((t) => t.id === id && t.ditekan);
  }

  private tombolDi(x: number, y: number): boolean {
    return this.tombol.some(
      (t) => Phaser.Math.Distance.Between(x, y, t.x, t.y) <= t.radius
    );
  }

  private pointerAktif(): Phaser.Input.Pointer[] {
    const input = this.scene.input;
    const semua = [
      input.pointer1,
      input.pointer2,
      input.pointer3,
      input.pointer4,
      input.mousePointer,
    ];
    return semua.filter((p): p is Phaser.Input.Pointer => p !== undefined && p.isDown);
  }

  destroy(): void {
    this.stickBase.destroy();
    this.stickKnob.destroy();
    this.pauseBtn.destroy();
    this.pauseIcon.destroy();
    for (const t of this.tombol) {
      t.lingkaran.destroy();
      t.teks.destroy();
    }
  }
}
