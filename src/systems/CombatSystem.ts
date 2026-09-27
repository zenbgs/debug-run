import Phaser from 'phaser';
import type { AttackStep } from '../data/combat';
import type { Enemy } from '../entities/Enemy';
import type { Facing } from '../entities/Player';

/** Arah hadap -> vektor satuan. */
export const FACING_VECTOR: Record<Facing, { x: number; y: number }> = {
  right: { x: 1, y: 0 },
  left: { x: -1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};

export type AttackOrigin = { x: number; y: number; facing: Facing };

/** Pengali dari upgrade pemain. Default netral kalau tidak diberikan. */
export type AttackModifiers = {
  damageMultiplier: number;
  rangeMultiplier: number;
};

const NEUTRAL: AttackModifiers = { damageMultiplier: 1, rangeMultiplier: 1 };

export type AttackResult = {
  hits: number;
  damageDealt: number;
};

export class CombatSystem {
  /** Sisa waktu beku, dalam ms. 0 berarti game berjalan normal. */
  private freezeRemaining = 0;

  constructor(private readonly scene: Phaser.Scene) {}

  get isFrozen(): boolean {
    return this.freezeRemaining > 0;
  }

  /**
   * Hitstop: bekukan fisika + animasi sesaat saat pukulan kena.
   * Efek kecil, tapi ini yang paling besar dampaknya ke rasa "nendang". (SPEC.md §5.2)
   */
  freeze(durationMs: number): void {
    // Jangan memperpendek pembekuan yang sedang berjalan (mis. finisher kena banyak musuh).
    if (durationMs <= this.freezeRemaining) return;

    if (!this.isFrozen) {
      this.scene.physics.world.pause();
      this.scene.anims.pauseAll();
    }
    this.freezeRemaining = durationMs;
  }

  /** Dipanggil tiap frame dari GameScene sebelum entity di-update. */
  update(delta: number): void {
    if (!this.isFrozen) return;

    this.freezeRemaining -= delta;
    if (this.freezeRemaining <= 0) {
      this.freezeRemaining = 0;
      this.scene.physics.world.resume();
      this.scene.anims.resumeAll();
    }
  }

  /**
   * Terapkan satu langkah serangan ke daftar musuh.
   * @returns jumlah musuh yang kena dan total damage yang masuk.
   */
  resolveAttack(
    step: AttackStep,
    origin: AttackOrigin,
    enemies: readonly Enemy[],
    modifiers: AttackModifiers = NEUTRAL
  ): AttackResult {
    const dir = FACING_VECTOR[origin.facing];
    const hitbox = this.buildHitbox(step, origin, dir, modifiers.rangeMultiplier);
    const damage = step.damage * modifiers.damageMultiplier;

    let hits = 0;
    let damageDealt = 0;
    for (const enemy of enemies) {
      if (!enemy.isAlive) continue;

      const body = enemy.body as Phaser.Physics.Arcade.Body | null;
      if (!body) continue;

      const enemyRect = new Phaser.Geom.Rectangle(body.x, body.y, body.width, body.height);
      const overlaps =
        hitbox instanceof Phaser.Geom.Circle
          ? Phaser.Geom.Intersects.CircleToRectangle(hitbox, enemyRect)
          : Phaser.Geom.Intersects.RectangleToRectangle(hitbox, enemyRect);
      if (!overlaps) continue;

      // Knockback mengarah menjauhi pemain, bukan sekadar mengikuti arah hadap —
      // supaya finisher AoE mendorong musuh ke luar secara merata.
      const away = new Phaser.Math.Vector2(enemy.x - origin.x, enemy.y - origin.y);
      if (away.lengthSq() < 1) away.set(dir.x, dir.y);
      away.normalize().scale(step.knockback);

      enemy.takeDamage(damage, away.x, away.y);
      damageDealt += damage;
      hits++;
    }

    if (hits > 0) {
      this.freeze(step.hitstopMs);
      this.scene.cameras.main.shake(120, step.shakeIntensity);
    }

    return { hits, damageDealt };
  }

  private buildHitbox(
    step: AttackStep,
    origin: AttackOrigin,
    dir: { x: number; y: number },
    rangeMultiplier: number
  ): Phaser.Geom.Rectangle | Phaser.Geom.Circle {
    if (step.shape.type === 'circle') {
      return new Phaser.Geom.Circle(origin.x, origin.y, step.shape.radius * rangeMultiplier);
    }

    const width = step.shape.width * rangeMultiplier;
    const height = step.shape.height * rangeMultiplier;
    const reach = step.shape.reach * rangeMultiplier;
    // Hitbox memanjang searah hadap: untuk serangan horizontal, sisi panjangnya
    // mengikuti sumbu X; untuk vertikal, mengikuti sumbu Y.
    const horizontal = dir.x !== 0;
    const boxWidth = horizontal ? width : height;
    const boxHeight = horizontal ? height : width;

    const centerX = origin.x + dir.x * reach;
    const centerY = origin.y + dir.y * reach;

    return new Phaser.Geom.Rectangle(
      centerX - boxWidth / 2,
      centerY - boxHeight / 2,
      boxWidth,
      boxHeight
    );
  }

  /** Bentuk hitbox untuk digambar di overlay debug. */
  debugShape(
    step: AttackStep,
    origin: AttackOrigin,
    rangeMultiplier = 1
  ): Phaser.Geom.Rectangle | Phaser.Geom.Circle {
    return this.buildHitbox(step, origin, FACING_VECTOR[origin.facing], rangeMultiplier);
  }
}
