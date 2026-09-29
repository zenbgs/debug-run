import Phaser from 'phaser';
import { ultimateFor, type Ultimate } from '../data/overclock';
import { DEPTH } from '../data/depth';
import { SHEETS } from '../data/frames';
import type { Enemy } from '../entities/Enemy';
import { audio } from './Audio';
import { playFx } from './Fx';

/**
 * Pelaksanaan jurus pamungkas Overclock.
 *
 * Meternya sendiri ada di `OverclockMeter.ts` — terpisah karena berkas ini
 * mengimpor Phaser, dan aturan pengisian meter harus bisa diuji tanpa itu.
 */
/** Panah per ketukan hujan. */
const RAIN_PER_TICK = 3;
/** Porsi panah yang diarahkan ke musuh; sisanya jatuh acak sebagai pemandangan. */
const RAIN_TARGETED = 0.75;
/** Sebaran di sekitar musuh yang dibidik, piksel. */
const RAIN_SCATTER = 44;
/** Porsi dorongan selama badai masih berputar; sisanya disimpan untuk hantaman akhir. */
const SPIN_HOLD_KNOCKBACK = 0.18;

export type OverclockContext = {
  aliveEnemies: () => Enemy[];
  /** Dipanggil untuk tiap musuh yang kena, sebelum damage diterapkan. */
  onHit: (enemy: Enemy, damage: number) => void;
  onKill: (enemy: Enemy) => void;
  /** Guncangan/zoom kamera saat jurus meledak. */
  onBurst: () => void;
  /** Batas arena, untuk jurus yang menutupi seluruh layar. */
  bounds: () => Phaser.Geom.Rectangle;
};

/**
 * Menjalankan jurus pamungkas.
 *
 * Semua jurus memakai ulang FX dan sistem yang sudah ada — tidak ada aset baru.
 * Yang membedakannya adalah BENTUK serangannya: berputar di tempat, hujan dari
 * atas, atau satu detonasi.
 */
export class OverclockRunner {
  private aktifSampai = 0;
  private tickBerikut = 0;
  private ultimate?: Ultimate;
  private kenaSekali = new Set<Enemy>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly context: OverclockContext
  ) {}

  get isActive(): boolean {
    return this.scene.time.now < this.aktifSampai;
  }

  /** Mulai jurus milik kelas ini. */
  start(classId: string, x: number, y: number): Ultimate {
    const ult = ultimateFor(classId);
    this.ultimate = ult;
    this.aktifSampai = this.scene.time.now + ult.durationMs;
    this.tickBerikut = 0;
    this.kenaSekali.clear();

    audio.play('bossSpawn');
    this.context.onBurst();
    this.kilatLayar();

    if (ult.kind === 'nova') this.nova(x, y, ult);
    return ult;
  }

  /** Dipanggil tiap frame dari scene selama jurus berjalan. */
  update(x: number, y: number): void {
    const ult = this.ultimate;
    if (!ult || !this.isActive) return;

    const now = this.scene.time.now;
    if (now < this.tickBerikut) return;
    this.tickBerikut = now + (ult.tickMs ?? 9999);

    if (ult.kind === 'spin') this.spinTick(x, y, ult);
    else if (ult.kind === 'rain') this.rainTick(ult);
  }

  /**
   * Warrior: tebasan melingkar berulang di sekeliling pemain.
   *
   * ⚠️ Knockback penuh hanya di ketukan TERAKHIR.
   *
   * Versi pertama mendorong penuh tiap ketukan, dan jurusnya melawan dirinya
   * sendiri: dorongan 260 melempar musuh keluar dari radiusnya sendiri, jadi
   * ketukan berikutnya tidak mengenai apa pun. Terukur 520 damage total melawan
   * 1.200 milik Mage — hanya dua ketukan dari delapan yang benar-benar kena.
   *
   * Sekarang badainya MENAHAN lalu MELEMPAR: dorongan kecil selama berputar,
   * sekali hantam penuh saat selesai. Kebetulan itu juga yang lebih enak
   * dirasakan daripada musuh yang langsung terpental di ketukan pertama.
   */
  private spinTick(x: number, y: number, ult: Ultimate): void {
    playFx(this.scene, ult.fxKey, x, y, { scale: ult.fxScale });

    const sisa = this.aktifSampai - this.scene.time.now;
    const ketukanTerakhir = sisa <= (ult.tickMs ?? 0) * 1.5;
    const dorong = ketukanTerakhir ? ult.knockback : ult.knockback * SPIN_HOLD_KNOCKBACK;

    for (const e of this.context.aliveEnemies()) {
      if (Phaser.Math.Distance.Between(x, y, e.x, e.y) > ult.radius) continue;
      this.lukai(e, ult, x, y, dorong);
    }
  }

  /**
   * Archer: panah berjatuhan membanjiri arena.
   *
   * ⚠️ Sebagian besar titik jatuhnya DIARAHKAN ke musuh, bukan diundi merata.
   *
   * Versi pertama mengundi titik acak seragam di seluruh layar, dan hasilnya
   * terukur menyedihkan: 22 damage total melawan 520 milik Warrior dan 1.200
   * milik Mage — satu kali kena dalam 2,2 detik. Sebabnya sederhana dan tidak
   * akan pernah terlihat dari membaca kodenya: layar kamera ~157.000 px2,
   * sementara satu panah hanya menutupi ~2.100 px2, jadi panah yang jatuh acak
   * hampir selalu mendarat di rumput kosong.
   *
   * Sebagian kecil tetap dibiarkan acak: tanpa itu hujannya terlihat seperti
   * panah pengejar, bukan seperti hujan.
   */
  private rainTick(ult: Ultimate): void {
    const b = this.context.bounds();
    const musuh = this.context.aliveEnemies();

    for (let i = 0; i < RAIN_PER_TICK; i++) {
      let jx: number;
      let jy: number;

      if (musuh.length > 0 && Math.random() < RAIN_TARGETED) {
        const target = musuh[Math.floor(Math.random() * musuh.length)];
        // Sebaran di sekitar musuh: jatuh tepat di atasnya tiap kali membuatnya
        // terasa seperti tembakan otomatis, bukan hujan.
        jx = target.x + (Math.random() - 0.5) * RAIN_SCATTER;
        jy = target.y + (Math.random() - 0.5) * RAIN_SCATTER;
      } else {
        jx = b.x + Math.random() * b.width;
        jy = b.y + Math.random() * b.height;
      }

      playFx(this.scene, ult.fxKey, jx, jy, { scale: ult.fxScale });
      for (const e of musuh) {
        if (Phaser.Math.Distance.Between(jx, jy, e.x, e.y) > ult.radius) continue;
        this.lukai(e, ult, jx, jy);
      }
    }
  }

  /** Mage: satu detonasi besar, tiap musuh kena tepat sekali. */
  private nova(x: number, y: number, ult: Ultimate): void {
    playFx(this.scene, ult.fxKey, x, y, { scale: ult.fxScale });
    playFx(this.scene, SHEETS.FX_EXPLOSION_BIG.key, x, y, { scale: 3 });
    for (const e of this.context.aliveEnemies()) {
      if (Phaser.Math.Distance.Between(x, y, e.x, e.y) > ult.radius) continue;
      this.lukai(e, ult, x, y);
    }
  }

  private lukai(
    e: Enemy,
    ult: Ultimate,
    dariX: number,
    dariY: number,
    knockback = ult.knockback
  ): void {
    const away = new Phaser.Math.Vector2(e.x - dariX, e.y - dariY);
    if (away.lengthSq() < 1) away.set(1, 0);
    away.normalize().scale(knockback);

    this.context.onHit(e, ult.damage);
    if (e.takeDamage(ult.damage, away.x, away.y)) this.context.onKill(e);
  }

  /** Kilat putih sekejap — penanda bahwa sesuatu yang besar baru saja terjadi. */
  private kilatLayar(): void {
    const cam = this.scene.cameras.main;
    const kilat = this.scene.add
      .rectangle(cam.width / 2, cam.height / 2, cam.width, cam.height, 0xffffff, 0.55)
      .setScrollFactor(0)
      .setDepth(DEPTH.HUD - 1);
    this.scene.tweens.add({
      targets: kilat,
      alpha: 0,
      duration: 260,
      onComplete: () => kilat.destroy(),
    });
  }
}
