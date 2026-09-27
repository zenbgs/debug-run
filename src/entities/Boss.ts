import Phaser from 'phaser';
import { BOSS_ATTACK, type BossType } from '../data/bosses';
import { Enemy } from './Enemy';

/**
 * Konteks yang disediakan GameScene: boss tidak tahu apa-apa soal scene,
 * ia hanya memanggil callback ini.
 */
export type BossContext = {
  fireBolt: (x: number, y: number, angle: number, speed: number, damage: number) => void;
  fireBeam: (x: number, y: number, angle: number, damage: number) => void;
  summon: (typeId: string, x: number, y: number) => void;
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
    // Penanda visual fase 2: memerah dan sedikit membesar.
    this.setTint(0xff6b6b);
    this.setScale(this.bossConfig.scale * 1.08);
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

  private patternCharge(target: Phaser.Math.Vector2): void {
    this.chargeDirection.set(target.x - this.x, target.y - this.y).normalize();
    this.chargeRemaining = BOSS_ATTACK.CHARGE_MS;
  }
}
