import Phaser from 'phaser';
import { BOSS_ATTACK, type BossType } from '../data/bosses';
import { Enemy } from './Enemy';

/**
 * Konteks yang disediakan GameScene: boss tidak tahu apa-apa soal scene,
 * ia hanya memanggil callback ini.
 */
/** Warna penanda fase 2. Terbaca di kedua sprite boss: teal terang dan merah gelap. */
const PHASE2_TINT = 0xff6b6b;

export type BossContext = {
  fireBolt: (x: number, y: number, angle: number, speed: number, damage: number) => void;
  fireBeam: (x: number, y: number, angle: number, damage: number) => void;
  /**
   * Munculkan musuh SETELAH aba-aba di titik itu. Scene yang menggambar
   * penandanya — boss tidak tahu apa-apa soal tampilan, sama seperti ia tidak
   * tahu soal sistem proyektil.
   */
  summon: (typeId: string, x: number, y: number) => void;
  /** Hantaman tanah bertelegraf di satu titik. */
  slam: (x: number, y: number) => void;
};

/**
 * Boss: musuh besar dengan siklus pola serangan dan fase kedua.
 *
 * Mewarisi `Enemy` supaya damage, flash, kematian, dan integrasi grup/collider
 * persis sama dengan musuh biasa — termasuk syarat wave bersih (WaveManager
 * menunggu SEMUA musuh mati, jadi boss otomatis ikut terhitung).
 */
export class Boss extends Enemy {
  readonly bossConfig: BossType;

  private patternIndex = 0;
  private patternTimer: number;
  private phase = 1;
  private chargeRemaining = 0;
  private chargeDirection = new Phaser.Math.Vector2(0, 0);
  private sway?: Phaser.Tweens.Tween;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    type: BossType,
    private readonly context: BossContext
  ) {
    super(scene, x, y, type);
    this.bossConfig = type;
    this.patternTimer = type.patternIntervalMs;
    this.setDepth(9);

    if (type.frames < 2) this.startIdleSway();
  }

  /**
   * Goyangan untuk sprite boss yang hanya punya satu frame.
   *
   * Tanpa ini Sentinel tampak seperti stiker yang ditempel di tengah pertarungan,
   * padahal boss lain bernapas. Yang digoyang adalah **sudut**, bukan posisi atau
   * skala: badan Arcade tidak ikut berputar, jadi hitbox sama sekali tidak
   * terpengaruh — kalau posisi yang digeser, ia akan berkelahi dengan fisika.
   */
  private startIdleSway(): void {
    this.sway = this.scene.tweens.add({
      targets: this,
      angle: { from: -3.5, to: 3.5 },
      duration: 950,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
    this.once(Phaser.GameObjects.Events.DESTROY, () => this.sway?.remove());
  }

  /** Fase 2 memerah; tanpa override ini warnanya hilang tiap kali boss kena pukul. */
  protected override baseTint(): number | undefined {
    return this.phase === 2 ? PHASE2_TINT : super.baseTint();
  }

  get currentPhase(): number {
    return this.phase;
  }

  get patternsRun(): number {
    return this.patternIndex;
  }

  override tick(target: Phaser.Math.Vector2, now: number, deltaSeconds: number): void {
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    if (!body) return;

    this.updatePhase();

    const deltaMs = deltaSeconds * 1000;

    // Pola `charge` mengambil alih gerak sampai selesai.
    if (this.chargeRemaining > 0) {
      this.chargeRemaining -= deltaMs;
      body.setVelocity(
        this.chargeDirection.x * this.bossConfig.chargeSpeed,
        this.chargeDirection.y * this.bossConfig.chargeSpeed
      );
      return;
    }

    this.patternTimer -= deltaMs;
    if (this.patternTimer <= 0) {
      this.runNextPattern(target);
      this.patternTimer = this.currentInterval();
    }

    // Di luar pola, boss merayap pelan ke arah pemain.
    super.tick(target, now, deltaSeconds);
  }

  private currentInterval(): number {
    const base = this.bossConfig.patternIntervalMs;
    return this.phase === 2 ? base * this.bossConfig.phase2IntervalScale : base;
  }

  private updatePhase(): void {
    if (this.phase === 2) return;
    if (this.healthRatio > this.bossConfig.phase2At) return;

    this.phase = 2;
    // Penanda visual fase 2: memerah, sedikit membesar, dan goyangannya memburu.
    this.setTint(PHASE2_TINT);
    this.setScale(this.bossConfig.scale * 1.08);
    if (this.sway) this.sway.timeScale = 1.9;
    this.scene.cameras.main.shake(260, 0.008);
  }

  private runNextPattern(target: Phaser.Math.Vector2): void {
    const patterns = this.bossConfig.patterns;
    const pattern = patterns[this.patternIndex % patterns.length];
    this.patternIndex++;

    switch (pattern) {
      case 'spread':
        this.patternSpread();
        break;
      case 'beam':
        this.patternBeam(target);
        break;
      case 'summon':
        this.patternSummon();
        break;
      case 'charge':
        this.patternCharge(target);
        break;
      case 'slam':
        this.patternSlam(target);
        break;
    }
  }

  private patternSpread(): void {
    const [phase1, phase2] = this.bossConfig.spreadCount;
    const count = this.phase === 2 ? phase2 : phase1;
    // Offset supaya tembakan berturut-turut tidak selalu di sudut yang sama.
    const offset = (this.patternIndex * 0.37) % (Math.PI * 2);

    for (let i = 0; i < count; i++) {
      const angle = offset + (i / count) * Math.PI * 2;
      this.context.fireBolt(
        this.x,
        this.y,
        angle,
        this.bossConfig.boltSpeed,
        this.bossConfig.boltDamage
      );
    }
  }

  private patternBeam(target: Phaser.Math.Vector2): void {
    const angle = Math.atan2(target.y - this.y, target.x - this.x);
    this.context.fireBeam(this.x, this.y, angle, this.bossConfig.beamDamage);

    // Fase 2 menembakkan dua beam menyilang.
    if (this.phase === 2) {
      this.context.fireBeam(this.x, this.y, angle + Math.PI / 2, this.bossConfig.beamDamage);
    }
  }

  private patternSummon(): void {
    const ids = this.bossConfig.summonTypeIds;
    if (ids.length === 0) return;

    const count = this.phase === 2 ? this.bossConfig.summonCount + 1 : this.bossConfig.summonCount;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const distance = 58;
      this.context.summon(
        ids[i % ids.length],
        this.x + Math.cos(angle) * distance,
        this.y + Math.sin(angle) * distance
      );
    }
  }

  /**
   * Hantaman tanah di sekitar PEMAIN, bukan di sekitar boss.
   *
   * Kalau dipusatkan di boss, pemain yang bertarung jarak jauh tidak pernah
   * tersentuh dan polanya jadi hiasan. Dipusatkan di pemain, ia memaksa bergerak
   * — dan itulah gunanya.
   */
  private patternSlam(target: Phaser.Math.Vector2): void {
    const n = this.phase === 2 ? BOSS_ATTACK.SLAM_COUNT + 1 : BOSS_ATTACK.SLAM_COUNT;
    for (let i = 0; i < n; i++) {
      // Titik pertama tepat di pemain; sisanya menyebar, jadi berdiri diam
      // selalu salah tapi arah larinya masih bisa dipilih.
      const sebar = i === 0 ? 0 : BOSS_ATTACK.SLAM_SPREAD;
      this.context.slam(
        target.x + (Math.random() - 0.5) * 2 * sebar,
        target.y + (Math.random() - 0.5) * 2 * sebar
      );
    }
  }

  private patternCharge(target: Phaser.Math.Vector2): void {
    this.chargeDirection.set(target.x - this.x, target.y - this.y).normalize();
    this.chargeRemaining = BOSS_ATTACK.CHARGE_MS;
  }
}
